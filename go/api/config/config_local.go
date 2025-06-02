//go:build !lambda

package config

import (
	"cmp"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web"
	"github.com/explore-flights/monorepo/go/common/local"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/time/rate"
	"os"
	"path/filepath"
	"time"
)

var Config = accessor{}

type accessor struct{}

func (accessor) EchoPort() int {
	return 8080
}

func (accessor) S3Client(ctx context.Context) (S3Client, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	return local.NewS3Client(filepath.Join(home, "Downloads", "local_s3")), nil
}

func (accessor) DataBucket() (string, error) {
	return cmp.Or(os.Getenv("FLIGHTS_DATA_BUCKET"), "flights_data_bucket"), nil
}

func (accessor) ParquetBucket() (string, error) {
	return cmp.Or(os.Getenv("FLIGHTS_PARQUET_BUCKET"), "flights_parquet_bucket"), nil
}

func (a accessor) AuthorizationHandler(ctx context.Context) (*web.AuthorizationHandler, error) {
	s3c, err := a.S3Client(ctx)
	if err != nil {
		return nil, err
	}

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

func (accessor) LufthansaClient() (*lufthansa.Client, error) {
	return lufthansa.NewClient(
		os.Getenv("FLIGHTS_LUFTHANSA_CLIENT_ID"),
		os.Getenv("FLIGHTS_LUFTHANSA_CLIENT_SECRET"),
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(time.Hour)*490, 1)),
	), nil
}

func (a accessor) Database() (*db.Database, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	dataBucketFolder, err := a.DataBucket()
	if err != nil {
		return nil, err
	}

	parquetBucketFolder, err := a.ParquetBucket()
	if err != nil {
		return nil, err
	}

	localS3BasePath := filepath.Join(home, "Downloads", "local_s3")
	return db.NewDatabase(
		filepath.Join(localS3BasePath, dataBucketFolder, "processed", "basedata.db"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "variants.parquet"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "report.parquet"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "history"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "latest"),
	), nil
}

func (accessor) VersionTxtPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	return filepath.Join(home, "Downloads", "data", "version.txt")
}
