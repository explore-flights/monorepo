package web

import (
	"errors"
	"fmt"
	"github.com/labstack/echo/v4"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

func VersionHeaderMiddleware(versionTxtPath string) echo.MiddlewareFunc {
	readVersion := sync.OnceValues(func() (time.Time, error) {
		f, err := os.Open(versionTxtPath)
		if err != nil {
			return time.Time{}, err
		}
		defer f.Close()

		b, err := io.ReadAll(f)
		if err != nil {
			return time.Time{}, err
		}

		t, err := time.Parse(time.RFC3339, string(b))
		if err != nil {
			return time.Time{}, err
		}

		return t, nil
	})

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			version, err := readVersion()
			if err == nil {
				c.Response().Header().Add("Ef-Data-Version", version.Format(time.RFC3339))
			}

			return next(c)
		}
	}
}

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

func ErrorLogAndMaskMiddleware(logger *log.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := next(c)
			if err != nil {
				req := c.Request()
				logger.Printf("Error handling request %s %s: %v\n", req.Method, req.URL.Path, err)

				var httpErr *HTTPError
				if errors.As(err, &httpErr) {
					msg := httpErr.message
					if httpErr.cause != nil && httpErr.unmaskCause {
						if msg != "" {
							msg += fmt.Sprintf(": %s", httpErr.cause.Error())
						} else {
							msg = httpErr.cause.Error()
						}
					}

					if msg != "" {
						return echo.NewHTTPError(httpErr.code, msg)
					} else {
						return echo.NewHTTPError(httpErr.code)
					}
				}

				var echoHttpError *echo.HTTPError
				if errors.As(err, &echoHttpError) {
					return echoHttpError
				}

				return echo.NewHTTPError(http.StatusInternalServerError)
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
