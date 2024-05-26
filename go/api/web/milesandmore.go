package web

import (
	"context"
	"github.com/labstack/echo/v4"
	"io"
	"net/http"
	"strings"
	"time"
)

func NewMilesAndMoreHandler() echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		ctx, cancel := context.WithTimeout(req.Context(), time.Second*15)
		defer cancel()

		if req.Body != nil {
			defer req.Body.Close()
		}

		outurl := "https://api.miles-and-more.com"
		outurl += strings.TrimPrefix(req.URL.EscapedPath(), "/api/milesandmore")
		if req.URL.RawQuery != "" {
			outurl += "?"
			outurl += req.URL.RawQuery
		}

		outreq, err := http.NewRequestWithContext(ctx, req.Method, outurl, req.Body)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		for k, v := range req.Header {
			if strings.EqualFold(k, "user-agent") || strings.EqualFold(k, echo.HeaderAccept) || strings.EqualFold(k, "x-api-key") {
				outreq.Header[k] = v
			}
		}

		outreq.Header.Set(echo.HeaderOrigin, "https://www.miles-and-more.com")
		outreq.Header.Set("Referer", "https://www.miles-and-more.com/")

		proxyresp, err := http.DefaultClient.Do(outreq)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, err)
		}

		defer proxyresp.Body.Close()

		resp := c.Response()

		if contentType := proxyresp.Header.Get(echo.HeaderContentType); contentType != "" {
			resp.Header().Set(echo.HeaderContentType, contentType)
		}

		resp.WriteHeader(proxyresp.StatusCode)
		_, _ = io.Copy(resp, proxyresp.Body)

		return nil
	}
}
