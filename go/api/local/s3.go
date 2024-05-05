//go:build !lambda

package local

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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
	f, err := os.Open(filepath.Join(s3c.basePath, *params.Bucket, *params.Key))
	if err != nil {
		return nil, err
	}

	return &s3.GetObjectOutput{Body: f}, nil
}
