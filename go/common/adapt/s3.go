package adapt

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
)

type S3Getter interface {
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}

type S3Putter interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

type S3Lister interface {
	ListObjectsV2(ctx context.Context, params *s3.ListObjectsV2Input, optFns ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
}

func S3GetJson(ctx context.Context, s3c S3Getter, bucket, key string, v any) error {
	return S3Get(ctx, s3c, bucket, key, readJson(v))
}

func S3GetRaw(ctx context.Context, s3c S3Getter, bucket, key string) ([]byte, error) {
	var b []byte
	return b, S3Get(ctx, s3c, bucket, key, readRaw(&b))
}

func S3Get(ctx context.Context, s3c S3Getter, bucket, key string, fn func(r io.Reader) error) error {
	resp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		return err
	}

	defer resp.Body.Close()
	return fn(resp.Body)
}

func S3PutJson(ctx context.Context, s3c S3Putter, bucket, key string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}

	return S3PutRaw(ctx, s3c, bucket, key, b)
}

func S3PutRaw(ctx context.Context, s3c S3Putter, bucket, key string, b []byte) error {
	_, err := s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(b),
	})

	return err
}

func readJson(v any) func(r io.Reader) error {
	return func(r io.Reader) error {
		return json.NewDecoder(r).Decode(v)
	}
}

func readRaw(b *[]byte) func(r io.Reader) error {
	return func(r io.Reader) error {
		var err error
		*b, err = io.ReadAll(r)
		return err
	}
}
