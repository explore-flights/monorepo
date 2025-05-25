package web

import (
	"errors"
	"fmt"
	"github.com/labstack/echo/v4"
	"log"
	"net/http"
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
