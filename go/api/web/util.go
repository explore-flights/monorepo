package web

import (
	"context"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
	"time"
)

func baseUrl(c echo.Context) string {
	scheme, host := contextSchemeAndHost(c)
	return scheme + "://" + host
}

func contextSchemeAndHost(c echo.Context) (string, string) {
	req := c.Request()
	if forwarded := req.Header.Get("Forwarded"); forwarded != "" {
		var host string
		var proto string

		for _, value := range strings.Split(forwarded, ";") {
			if value, ok := strings.CutPrefix(value, "host="); ok {
				host = value
			} else if value, ok := strings.CutPrefix(value, "proto="); ok {
				proto = value
			}
		}

		if host != "" && proto != "" {
			return proto, host
		}
	}

	if host := req.Header.Get("X-Forwarded-Host"); host != "" {
		if proto := req.Header.Get(echo.HeaderXForwardedProto); proto != "" {
			return proto, host
		}
	}

	return c.Scheme(), req.Host
}

func addExpirationHeaders(c echo.Context, now time.Time, expiration time.Duration) {
	now = now.UTC()
	expiresAt := now.Add(expiration)

	res := c.Response()
	res.Header().Set("Date", now.Format(http.TimeFormat))
	res.Header().Set("Expires", expiresAt.Format(http.TimeFormat))
	res.Header().Set(echo.HeaderCacheControl, fmt.Sprintf("public, max-age=%d, must-revalidate", int(expiration.Seconds())))
}

func noCache(c echo.Context) {
	res := c.Response()
	res.Header().Del("Expires")
	res.Header().Set(echo.HeaderCacheControl, "private, no-cache, no-store, max-age=0, must-revalidate")
}

type util struct{}

func (util) parseAirport(ctx context.Context, raw string, airportsFn func(context.Context) (map[uuid.UUID]db.Airport, error)) (uuid.UUID, error) {
	if len(raw) <= 4 {
		airports, err := airportsFn(ctx)
		if err != nil {
			return uuid.Nil, err
		}

		for _, airport := range airports {
			if airport.IataCode == raw || (airport.IcaoCode.Valid && airport.IcaoCode.String == raw) {
				return airport.Id, nil
			}
		}
	}

	var airportId model.UUID
	if err := airportId.FromString(raw); err != nil {
		return uuid.Nil, err
	}

	return uuid.UUID(airportId), nil
}

type HTTPErrorOption func(e *HTTPError)

type HTTPError struct {
	code        int
	message     string
	cause       error
	unmaskCause bool
}

func (e *HTTPError) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%d %s: %s", e.code, e.message, e.cause)
	}

	return fmt.Sprintf("%d %s", e.code, e.message)
}

func WithMessage(message string) HTTPErrorOption {
	return func(e *HTTPError) {
		e.message = message
	}
}

func WithCause(cause error) HTTPErrorOption {
	return func(e *HTTPError) {
		e.cause = cause
	}
}

func WithUnmaskedCause() HTTPErrorOption {
	return func(e *HTTPError) {
		e.unmaskCause = true
	}
}

func NewHTTPError(code int, opts ...HTTPErrorOption) *HTTPError {
	err := new(HTTPError)
	err.code = code

	for _, opt := range opts {
		opt(err)
	}

	return err
}
