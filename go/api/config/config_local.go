//go:build !lambda && !vps

package config

import (
	"cmp"
	"io"
	"os"
	"path/filepath"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/labstack/echo/v4"
)

var (
	Config          = accessor{}
	_      Accessor = Config
)

type accessor struct{}

func (accessor) EchoPort() int {
	return 8080
}

func (accessor) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return next
	}
}

func (accessor) Database() (*db.Database, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	dataBucketFolder := cmp.Or(os.Getenv("FLIGHTS_DATA_BUCKET"), "flights_data_bucket")
	parquetBucketFolder := cmp.Or(os.Getenv("FLIGHTS_PARQUET_BUCKET"), "flights_parquet_bucket")

	localS3BasePath := filepath.Join(home, "Downloads", "local_s3")
	return db.NewDatabase(
		filepath.Join(localS3BasePath, dataBucketFolder, "processed", "basedata.db"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "variants.parquet"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "connections.parquet"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "airport_statistics.parquet"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "history"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "latest"),
		filepath.Join(localS3BasePath, parquetBucketFolder, "updates_report"),
	), nil
}

func (accessor) Version() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	versionTxtPath := filepath.Join(home, "Downloads", "local_s3", "version.txt")
	f, err := os.Open(versionTxtPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	b, err := io.ReadAll(f)
	if err != nil {
		return "", err
	}

	return string(b), nil
}
