//go:build lambda

package main

import (
	"cmp"
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/search"
	"os"
	"strconv"
)

func echoPort() int {
	port, _ := strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	return cmp.Or(port, 8080)
}

func s3Client(ctx context.Context) (*s3.Client, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}

	return s3.NewFromConfig(cfg), nil
}

func dataRepo(ctx context.Context, s3c data.MinimalS3Client) (*data.Repo, error) {
	dataBucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if dataBucket == "" {
		return nil, errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	return data.NewRepo(s3c, dataBucket), nil
}

func flightRepo(ctx context.Context, s3c search.MinimalS3Client) (*search.FlightRepo, error) {
	dataBucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if dataBucket == "" {
		return nil, errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	return search.NewFlightRepo(s3c, dataBucket), nil
}
