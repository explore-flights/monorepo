package data

import (
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
)

type MinimalS3Client interface {
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}

type Repo struct {
	s3c    MinimalS3Client
	bucket string
}

func NewRepo(s3c MinimalS3Client, bucket string) *Repo {
	return &Repo{
		s3c:    s3c,
		bucket: bucket,
	}
}

func (r *Repo) Airports(ctx context.Context) ([]lufthansa.Airport, error) {
	return loadJson[[]lufthansa.Airport](ctx, r.s3c, r.bucket, "raw/LH_Public_Data/airports.json")
}

func (r *Repo) Cities(ctx context.Context) ([]lufthansa.City, error) {
	return loadJson[[]lufthansa.City](ctx, r.s3c, r.bucket, "raw/LH_Public_Data/cities.json")
}

func (r *Repo) Countries(ctx context.Context) ([]lufthansa.Country, error) {
	return loadJson[[]lufthansa.Country](ctx, r.s3c, r.bucket, "raw/LH_Public_Data/countries.json")
}

func loadJson[T any](ctx context.Context, s3c MinimalS3Client, bucket, key string) (T, error) {
	resp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		var r T
		return r, err
	}

	defer resp.Body.Close()

	var r T
	return r, json.NewDecoder(resp.Body).Decode(&r)
}
