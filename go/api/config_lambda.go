//go:build lambda

package main

import (
	"cmp"
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web"
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

func dataBucket() (string, error) {
	bucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if bucket == "" {
		return "", errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	return bucket, nil
}

func flightRepo(ctx context.Context, s3c search.MinimalS3Client, bucket string) (*search.FlightRepo, error) {
	return search.NewFlightRepo(s3c, bucket), nil
}

func authorizationHandler(ctx context.Context, s3c auth.MinimalS3Client) (*web.AuthorizationHandler, error) {
	return web.NewAuthorizationHandler(
		"",
		"",
		auth.NewRepo(s3c, ""),
		auth.NewSessionJwtConverter("", nil, nil),
	)
}
