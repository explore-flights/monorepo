//go:build vps

package config

import (
	"cmp"
	"io"
	"os"
	"path/filepath"
	"strconv"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/labstack/echo/v4"
)

const vpsDataDirectory = "/opt/data"

var (
	Config          = accessor{}
	_      Accessor = Config
)

type accessor struct{}

func (accessor) EchoPort() int {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	return cmp.Or(port, 8080)
}

func (accessor) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return next
	}
}

func (accessor) Database() (*db.Database, error) {
	return db.NewDatabase(
		filepath.Join(vpsDataDirectory, "basedata.db"),
		filepath.Join(vpsDataDirectory, "variants.parquet"),
		filepath.Join(vpsDataDirectory, "connections.parquet"),
		filepath.Join(vpsDataDirectory, "airport_statistics.parquet"),
		filepath.Join(vpsDataDirectory, "history"),
		filepath.Join(vpsDataDirectory, "latest"),
		filepath.Join(vpsDataDirectory, "updates_report"),
	), nil
}

func (accessor) Version() (string, error) {
	f, err := os.Open(filepath.Join(vpsDataDirectory, "version.txt"))
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
