//go:build lambda

package main

import (
	"cmp"
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/search"
	"os"
	"strconv"
)

func echoPort() int {
	port, _ := strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	return cmp.Or(port, 8080)
}

func flightRepo(ctx context.Context) (*search.FlightRepo, error) {
	dataBucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if dataBucket == "" {
		return nil, errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}

	return search.NewFlightRepo(s3.NewFromConfig(cfg), dataBucket), nil
}
