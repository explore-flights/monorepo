//go:build !lambda

package main

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/local"
	"github.com/explore-flights/monorepo/go/api/search"
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

func dataRepo(ctx context.Context, s3c data.MinimalS3Client) (*data.Repo, error) {
	return data.NewRepo(s3c, "flights_data_bucket"), nil
}

func flightRepo(ctx context.Context, s3c search.MinimalS3Client) (*search.FlightRepo, error) {
	return search.NewFlightRepo(s3c, "flights_data_bucket"), nil
}
