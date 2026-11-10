//go:build lambda

package config

import (
	"cmp"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"

	"github.com/explore-flights/monorepo/go/api/db"
	lwamw "github.com/its-felix/aws-lwa-go-middleware"
	"github.com/labstack/echo/v5"
)

var (
	Config          = accessor{}
	_      Accessor = Config
)

type accessor struct{}

func (accessor) EchoPort() int {
	port, _ := strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	return cmp.Or(port, 8080)
}

func (accessor) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			req, cancel, err := lwamw.DecorateRequest(c.Request(), func(headers http.Header, name string) {
				headers.Del(name)
			})
			defer cancel()
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, "")
			}
			c.SetRequest(req)
			return next(c)
		}
	}
}

func (a accessor) Database() (*db.Database, error) {
	version, err := a.Version()
	if err != nil {
		return nil, err
	}

	parquetBucketName := os.Getenv("FLIGHTS_PARQUET_BUCKET")
	if parquetBucketName == "" {
		return nil, errors.New("env variable FLIGHTS_PARQUET_BUCKET required")
	}

	return db.NewDatabase(
		"/opt/data/basedata.db",
		"/opt/data/variants.parquet",
		"/opt/data/connections.parquet",
		"/opt/data/airport_statistics.parquet",
		fmt.Sprintf("s3://%s/%s/history", parquetBucketName, version),
		fmt.Sprintf("s3://%s/%s/latest", parquetBucketName, version),
		fmt.Sprintf("s3://%s/%s/updates_report", parquetBucketName, version),
	), nil
}

func (accessor) Version() (string, error) {
	f, err := os.Open("/opt/data/version.txt")
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
