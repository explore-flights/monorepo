package business

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/database/db"
	"github.com/explore-flights/monorepo/go/database/util"
)

type s3GetAndList interface {
	adapt.S3Getter
	adapt.S3Lister
}

type Fresh struct {
	Updater     *Updater
	S3CBaseData adapt.S3Getter
	S3CHistory  s3GetAndList
	S3CFinal    adapt.S3Putter
}

func (f *Fresh) GenerateFreshDatabase(ctx context.Context, startAt time.Time, baseDataBucket, baseDataKey, historyBucket, historyPrefix, finalBucket, finalKey string) error {
	return f.updateDatabase(
		ctx,
		baseDataBucket,
		baseDataKey,
		finalBucket,
		finalKey,
		func(ctx context.Context, conn *sql.Conn, historyPath string) error {
			return f.runUpdates(ctx, conn, startAt, historyBucket, historyPrefix, historyPath)
		},
	)
}

func (f *Fresh) UpdateDatabase(ctx context.Context, initialDataBucket, initialDataKey string, t time.Time, historyBucket, historyFileKey, finalBucket, finalKey string) error {
	return f.updateDatabase(
		ctx,
		initialDataBucket,
		initialDataKey,
		finalBucket,
		finalKey,
		func(ctx context.Context, conn *sql.Conn, historyPath string) error {
			return f.runUpdate(ctx, conn, t, historyBucket, historyFileKey, historyPath)
		},
	)
}

func (f *Fresh) updateDatabase(ctx context.Context, initialDataBucket, initialDataKey, finalBucket, finalKey string, updateFn func(ctx context.Context, conn *sql.Conn, historyPath string) error) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	if err := util.WithTempDir(func(tmpDir string) error {
		ddbHomePath := filepath.Join(tmpDir, "duckdb-home")
		historyPath := filepath.Join(tmpDir, "history")
		tmpDbPath := filepath.Join(tmpDir, "tmp.db")
		dstDbPath := filepath.Join(tmpDir, "dst.db")

		if err := os.Mkdir(ddbHomePath, 0750); err != nil {
			return err
		}

		if err := util.RunTimed("download initial data", func() error {
			return util.DownloadS3File(ctx, f.S3CBaseData, initialDataBucket, initialDataKey, tmpDbPath)
		}); err != nil {
			return err
		}

		if err := util.WithDatabase(ctx, ddbHomePath, tmpDbPath, "tmp_db", 16, func(conn *sql.Conn) error {
			if err := util.RunTimed("run updates", func() error {
				return updateFn(ctx, conn, historyPath)
			}); err != nil {
				return err
			}

			if err := util.RunTimed("export database", func() error {
				_, err := util.ExportDatabase(ctx, conn, "tmp_db", dstDbPath, true, true, 16)
				return err
			}); err != nil {
				return err
			}

			return nil
		}); err != nil {
			return err
		}

		if err := util.RunTimed("upload final db file", func() error {
			return util.UploadS3File(ctx, f.S3CFinal, finalBucket, finalKey, dstDbPath)
		}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (f *Fresh) runUpdates(ctx context.Context, conn *sql.Conn, startAt time.Time, historyBucket, historyPrefix, historyPath string) error {
	if err := (util.UpdateScript{Name: "Init Schema", Script: db.Schema}.Run(ctx, conn, nil)); err != nil {
		return fmt.Errorf("failed to init schema: %w", err)
	}

	var elements []common.Tuple[time.Time, string]
	{
		var startAfter *string
		for {
			resp, err := f.S3CHistory.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
				Bucket:     aws.String(historyBucket),
				Prefix:     aws.String(historyPrefix),
				StartAfter: startAfter,
			})
			if err != nil {
				return err
			}

			for _, obj := range resp.Contents {
				key := *obj.Key
				timestamp := strings.TrimSuffix(strings.TrimPrefix(key, historyPrefix), ".tar.gz")
				t, err := time.Parse(time.RFC3339, timestamp)
				if err != nil {
					return fmt.Errorf("error parsing timestamp for key %q: %w", key, err)
				}

				if t.Equal(startAt) || t.After(startAt) {
					elements = append(elements, common.Tuple[time.Time, string]{V1: t, V2: key})
				}
			}

			startAfter = resp.NextContinuationToken
			if startAfter == nil {
				break
			}
		}
	}

	slices.SortFunc(elements, func(a, b common.Tuple[time.Time, string]) int {
		return a.V1.Compare(b.V1)
	})

	for i, element := range elements {
		if err := util.RunTimed(fmt.Sprintf("running update for %q (%s) (%d/%d)", element.V2, element.V1, i+1, len(elements)), func() error {
			return f.runUpdate(ctx, conn, element.V1, historyBucket, element.V2, historyPath)
		}); err != nil {
			return fmt.Errorf("failed to run update for key %q (%v): %w", element.V2, element.V2, err)
		}
	}

	return nil
}

func (f *Fresh) runUpdate(ctx context.Context, conn *sql.Conn, t time.Time, historyBucket, historyKey, historyPath string) error {
	defer os.RemoveAll(historyPath)

	if err := f.downloadHistory(ctx, historyBucket, historyKey, historyPath); err != nil {
		return fmt.Errorf("failed to download history: %w", err)
	}

	_, err := f.Updater.RunUpdateSequence(ctx, conn, t, historyPath+"/**/*.json")
	return err
}

func (f *Fresh) downloadHistory(ctx context.Context, historyBucket, historyKey, historyPath string) error {
	return util.DownloadAndUpackGzippedTar(ctx, f.S3CHistory, historyBucket, historyKey, historyPath)
}
