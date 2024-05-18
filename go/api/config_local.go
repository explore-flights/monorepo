//go:build !lambda

package main

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/api/local"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web"
	"os"
	"path/filepath"
)

func echoPort() int {
	return 8080
}

func s3Client(ctx context.Context) (*local.S3Client, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	return local.NewS3Client(filepath.Join(home, "Downloads", "local_s3")), nil
}

func dataBucket() (string, error) {
	return "flights_data_bucket", nil
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
