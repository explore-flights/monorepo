package web

import (
	"github.com/labstack/echo/v4"
)

func NoCacheOnErrorMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := next(c)
			if err != nil {
				noCache(c)
			}

			return err
		}
	}
}

func DefaultNoCacheMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			noCache(c)
			return next(c)
		}
	}
}

func NeverCacheMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			noCache(c)
			err := next(c)
			noCache(c)
			return err
		}
	}
}
