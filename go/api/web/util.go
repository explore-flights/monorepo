package web

import (
	"fmt"
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
