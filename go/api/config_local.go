//go:build !lambda

package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web"
	"github.com/explore-flights/monorepo/go/common/local"
	"github.com/gofrs/uuid/v5"
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
	kid, err := uuid.NewV4()
	if err != nil {
		return nil, err
	}

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}

	return web.NewAuthorizationHandler(
		os.Getenv("FLIGHTS_GOOGLE_CLIENT_ID"),
		os.Getenv("FLIGHTS_GOOGLE_CLIENT_SECRET"),
		auth.NewRepo(s3c, "flights_auth_bucket"),
		auth.NewSessionJwtConverter(kid.String(), priv, &priv.PublicKey),
	)
}
