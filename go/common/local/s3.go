//go:build !lambda

package local

import (
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"io"
	"io/fs"
	"iter"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type dirWalker struct {
	err error
}

func (d *dirWalker) Files(dir string) iter.Seq2[string, time.Time] {
	entries, err := os.ReadDir(dir)
	if err != nil {
		d.err = err
		return func(yield func(string, time.Time) bool) {}
	}

	return func(yield func(string, time.Time) bool) {
		for _, entry := range entries {
			if entry.Name() == ".DS_Store" {
				continue
			}

			fpath := filepath.Join(dir, entry.Name())

			if entry.IsDir() {
				for f, mtime := range d.Files(fpath) {
					if !yield(f, mtime) {
						return
					}
				}
			} else {
				var finfo fs.FileInfo
				finfo, err = entry.Info()
				if err != nil {
					d.err = err
					return
				}

				if !yield(fpath, finfo.ModTime()) {
					return
				}
			}
		}
	}
}

func (d *dirWalker) Err() error {
	return d.err
}

type S3Client struct {
	basePath string
}

func NewS3Client(basePath string) *S3Client {
	return &S3Client{basePath}
}

func (s3c *S3Client) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	f, err := os.Open(filepath.Join(s3c.basePath, *params.Bucket, filepath.FromSlash(*params.Key)))
	if err != nil {
		return nil, err
	}

	return &s3.GetObjectOutput{Body: f}, nil
}

func (s3c *S3Client) PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	fpath := filepath.Join(s3c.basePath, *params.Bucket, filepath.FromSlash(*params.Key))

	if err := os.MkdirAll(filepath.Dir(fpath), 0750); err != nil {
		return nil, err
	}

	f, err := os.Create(fpath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	_, err = io.Copy(f, params.Body)
	return nil, err
}

func (s3c *S3Client) ListObjectsV2(ctx context.Context, params *s3.ListObjectsV2Input, optFns ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	if params.Delimiter != nil {
		return nil, errors.New("delimiter not yet supported")
	}

	maxKeys := 1000
	if params.MaxKeys != nil {
		maxKeys = int(min(*params.MaxKeys, 1000))
	}

	s3Prefix := ""
	if params.Prefix != nil {
		s3Prefix = *params.Prefix
	}

	dir, prefix := filepath.Split(filepath.Join(s3c.basePath, *params.Bucket, filepath.FromSlash(s3Prefix)))

	var w dirWalker
	contents := make([]types.Object, 0)
	for fpath, mtime := range w.Files(dir) {
		key := filepath.ToSlash(strings.TrimPrefix(fpath, dir))
		if suffix, ok := strings.CutPrefix(key, prefix); ok {
			obj := types.Object{
				LastModified: aws.Time(mtime),
			}

			if strings.HasSuffix(s3Prefix, "/") {
				obj.Key = aws.String(filepath.ToSlash(filepath.Join(s3Prefix, suffix)))
			} else {
				obj.Key = aws.String(s3Prefix + suffix)
			}

			contents = append(contents, obj)
		}
	}

	if err := w.Err(); err != nil {
		return nil, err
	}

	slices.SortFunc(contents, func(a, b types.Object) int {
		return strings.Compare(*a.Key, *b.Key)
	})

	startAfter := ""
	if params.ContinuationToken != nil {
		startAfter = *params.ContinuationToken
	} else if params.StartAfter != nil {
		startAfter = *params.StartAfter
	}

	result := make([]types.Object, 0, len(contents))
	for _, obj := range contents {
		if len(result) >= maxKeys {
			break
		}

		if strings.Compare(*obj.Key, startAfter) > 0 {
			result = append(result, obj)
		}
	}

	var nextContinuationToken *string
	if len(result) >= maxKeys {
		nextContinuationToken = result[len(result)-1].Key
	}

	return &s3.ListObjectsV2Output{
		Contents:              result,
		ContinuationToken:     params.ContinuationToken,
		Delimiter:             params.Delimiter,
		IsTruncated:           aws.Bool(nextContinuationToken != nil),
		KeyCount:              aws.Int32(int32(len(result))),
		MaxKeys:               aws.Int32(int32(maxKeys)),
		NextContinuationToken: nextContinuationToken,
		Prefix:                params.Prefix,
	}, nil
}

var _ interface {
	adapt.S3Getter
	adapt.S3Putter
	adapt.S3Lister
} = (*S3Client)(nil)
