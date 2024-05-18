package web

import (
	"github.com/labstack/echo/v4"
	"strings"
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
