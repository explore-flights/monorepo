package web

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

type yearRequestContextKey struct{}

func YearMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			yearRaw := c.Param("year")
			if len(yearRaw) != 4 {
				return NewHTTPError(http.StatusBadRequest, WithMessage("Invalid year format"))
			}

			year, err := strconv.Atoi(yearRaw)
			if err != nil || year < 1 || year > 9999 {
				return NewHTTPError(http.StatusBadRequest, WithMessage("Invalid year format"), WithCause(err))
			}

			req := c.Request()
			c.SetRequest(req.WithContext(context.WithValue(req.Context(), yearRequestContextKey{}, year)))
			return next(c)
		}
	}
}

func requestContextYear(ctx context.Context) (int, bool) {
	year, ok := ctx.Value(yearRequestContextKey{}).(int)
	return year, ok
}

func VersionHeaderMiddleware(version string) echo.MiddlewareFunc {
	readVersion := sync.OnceValues(func() (time.Time, error) {
		t, err := time.Parse(time.RFC3339, version)
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

func RecoverMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) (outErr error) {
			defer func() {
				if r := recover(); r != nil {
					err, ok := r.(error)
					if ok {
						outErr = fmt.Errorf("panic: %w", err)
					} else {
						outErr = fmt.Errorf("panic: %v", r)
					}
				}
			}()

			outErr = next(c)
			return outErr
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
