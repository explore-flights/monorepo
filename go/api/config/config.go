package config

import (
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/labstack/echo/v4"
)

type Accessor interface {
	EchoPort() int
	Middleware() echo.MiddlewareFunc
	Database() (*db.Database, error)
	Version() (string, error)
}
