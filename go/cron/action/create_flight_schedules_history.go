package action

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"io"
	"os"
	"path/filepath"
	"time"
)

type CreateFlightSchedulesHistoryParams struct {
	Time         time.Time             `json:"time"`
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   xtime.LocalDateRanges `json:"dateRanges"`
}

type CreateFlightSchedulesHistoryOutput struct {
}

type cfshAction struct {
	s3c MinimalS3Client
}

func CreateFlightSchedulesHistoryAction(s3c MinimalS3Client) Action[CreateFlightSchedulesHistoryParams, CreateFlightSchedulesHistoryOutput] {
	return &cfshAction{s3c}
}

func (a *cfshAction) Handle(ctx context.Context, params CreateFlightSchedulesHistoryParams) (CreateFlightSchedulesHistoryOutput, error) {
	err := func() error {
		dir, err := os.MkdirTemp("", "flight_schedules_history_*")
		if err != nil {
			return fmt.Errorf("failed to create temporary directory: %w", err)
		}
		defer os.RemoveAll(dir)

		tempArchivePath := filepath.Join(dir, "flight_schedules_history.tar.gz")
		if err = a.createArchive(ctx, params.InputBucket, params.InputPrefix, tempArchivePath, params.DateRanges); err != nil {
			return fmt.Errorf("failed to create archive: %w", err)
		}

		if err = a.uploadArchive(ctx, params.OutputBucket, params.OutputPrefix+params.Time.Format(time.RFC3339)+".tar.gz", tempArchivePath); err != nil {
			return fmt.Errorf("failed to upload archive: %w", err)
		}

		return nil
	}()

	return CreateFlightSchedulesHistoryOutput{}, err
}

func (a *cfshAction) uploadArchive(ctx context.Context, bucket, key, archivePath string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("failed to open archive: %w", err)
	}
	defer f.Close()

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:          aws.String(bucket),
		Key:             aws.String(key),
		ContentType:     aws.String("application/tar"),
		ContentEncoding: aws.String("gzip"),
		Body:            f,
	})

	if err != nil {
		return fmt.Errorf("failed to file %q: %w", archivePath, err)
	}

	return nil
}

func (a *cfshAction) createArchive(ctx context.Context, inputBucket, inputPrefix, archivePath string, dateRanges xtime.LocalDateRanges) error {
	f, err := os.Create(archivePath)
	if err != nil {
		return fmt.Errorf("failed to create archive file %q: %w", archivePath, err)
	}
	defer f.Close()

	gzipWriter, err := gzip.NewWriterLevel(f, gzip.BestCompression)
	if err != nil {
		return fmt.Errorf("failed to init gzip writer: %w", err)
	}

	tarWriter := tar.NewWriter(gzipWriter)

	if err = a.writeArchive(ctx, inputBucket, inputPrefix, tarWriter, dateRanges); err != nil {
		_ = tarWriter.Close()
		_ = gzipWriter.Close()
		return fmt.Errorf("failed to write archive: %w", err)
	}

	if err = tarWriter.Close(); err != nil {
		return fmt.Errorf("failed to close tar writer: %w", err)
	}

	if err = gzipWriter.Close(); err != nil {
		return fmt.Errorf("failed to close gzip writer: %w", err)
	}

	return nil
}

func (a *cfshAction) writeArchive(ctx context.Context, bucket, prefix string, w *tar.Writer, dateRanges xtime.LocalDateRanges) error {
	for d := range dateRanges.Iter {
		fileName := d.Time(nil).Format("2006/01/02") + ".json"
		key := prefix + fileName
		if err := a.addFileToArchive(ctx, bucket, key, fileName, w); err != nil {
			return fmt.Errorf("failed to add file %q to archive: %w", key, err)
		}
	}

	return nil
}

func (a *cfshAction) addFileToArchive(ctx context.Context, bucket, key, fileName string, w *tar.Writer) error {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to get object: %w", err)
	}
	defer resp.Body.Close()

	if err = w.WriteHeader(&tar.Header{
		Name:    fileName,
		Size:    *resp.ContentLength,
		Mode:    0644,
		ModTime: *resp.LastModified,
	}); err != nil {
		return fmt.Errorf("failed to write tar header: %w", err)
	}

	if _, err = io.Copy(w, resp.Body); err != nil {
		return fmt.Errorf("failed to write tar body: %w", err)
	}

	return nil
}
