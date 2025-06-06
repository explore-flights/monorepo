package util

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"io"
	"os"
	"path/filepath"
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

func DownloadAndUpackGzippedTar(ctx context.Context, s3c adapt.S3Getter, bucket, key, dstDir string) error {
	resp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	gzR, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gzR.Close()

	tarR := tar.NewReader(gzR)
	for {
		header, err := tarR.Next()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}

			return err
		}

		path := filepath.Join(dstDir, header.Name)
		if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
			return fmt.Errorf("error creating directory for file %q: %w", path, err)
		}

		if err := func() error {
			f, err := os.Create(path)
			if err != nil {
				return err
			}
			defer f.Close()

			_, err = io.Copy(f, tarR)
			return err
		}(); err != nil {
			return err
		}
	}

	return gzR.Close()
}
