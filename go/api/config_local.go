//go:build !lambda

package main

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/local"
	"github.com/explore-flights/monorepo/go/api/search"
	"os"
	"path/filepath"
)

func echoPort() int {
	return 8080
}

func flightRepo(ctx context.Context) (*search.FlightRepo, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	return search.NewFlightRepo(
		local.NewS3Client(filepath.Join(home, "Downloads", "local_s3")),
		"flights_data_bucket",
	), nil
}
