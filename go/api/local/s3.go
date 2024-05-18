//go:build !lambda

package local

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/adapt"
	"io"
	"os"
	"path/filepath"
)

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

var _ interface {
	adapt.S3Getter
	adapt.S3Putter
} = (*S3Client)(nil)
