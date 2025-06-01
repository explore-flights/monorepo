package util

import (
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"io"
	"os"
)

func UploadS3File(ctx context.Context, s3c adapt.S3Putter, bucket, key, filePath string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   f,
	})
	return err
}

func DownloadS3File(ctx context.Context, s3c adapt.S3Getter, bucket, key, dstFilePath string) error {
	f, err := os.Create(dstFilePath)
	if err != nil {
		return fmt.Errorf("failed to create dst file %q: %w", dstFilePath, err)
	}
	defer f.Close()

	return CopyS3FileTo(ctx, s3c, bucket, key, f)
}

func CopyS3FileTo(ctx context.Context, s3c adapt.S3Getter, bucket, key string, w io.Writer) error {
	resp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed GetObject for key %q: %w", key, err)
	}
	defer resp.Body.Close()

	if _, err = io.Copy(w, resp.Body); err != nil {
		return fmt.Errorf("failed to download file from s3: %w", err)
	}

	return nil
}
