//go:build lambda

package config

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	lwamw "github.com/its-felix/aws-lwa-go-middleware"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLambdaMiddlewarePropagatesContextAndRemovesHeaders(t *testing.T) {
	e := echo.New()
	e.Use(Config.Middleware())
	deadline := time.Now().Add(time.Minute).Truncate(time.Millisecond)
	var requestContext context.Context
	e.GET("/test", func(c *echo.Context) error {
		requestContext = c.Request().Context()
		lc, ok := lwamw.LambdaContext(requestContext)
		require.True(t, ok)
		assert.Equal(t, "request-123", lc.RequestID)
		actualDeadline, ok := requestContext.Deadline()
		assert.True(t, ok)
		assert.Equal(t, deadline, actualDeadline)
		raw, ok := lwamw.RawRequestContext(requestContext)
		assert.True(t, ok)
		assert.JSONEq(t, `{"requestId":"gateway-123"}`, string(raw))
		assert.Empty(t, c.Request().Header.Get(lwamw.LambdaContextHeaderName))
		assert.Empty(t, c.Request().Header.Get(lwamw.RequestContextHeaderName))
		return c.NoContent(http.StatusNoContent)
	})
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(lwamw.LambdaContextHeaderName, fmt.Sprintf(`{"request_id":"request-123","deadline":%d}`, deadline.UnixMilli()))
	req.Header.Set(lwamw.RequestContextHeaderName, `{"requestId":"gateway-123"}`)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, req)
	assert.Equal(t, http.StatusNoContent, recorder.Code)
	require.NotNil(t, requestContext)
	assert.ErrorIs(t, requestContext.Err(), context.Canceled)
}

func TestLambdaMiddlewareHandlesMissingAndMalformedContext(t *testing.T) {
	for _, malformed := range []bool{false, true} {
		t.Run(fmt.Sprint(malformed), func(t *testing.T) {
			e := echo.New()
			e.Use(Config.Middleware())
			called := false
			e.GET("/test", func(c *echo.Context) error {
				called = true
				return c.NoContent(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if malformed {
				req.Header.Set(lwamw.LambdaContextHeaderName, "invalid-secret-context")
			}
			recorder := httptest.NewRecorder()
			e.ServeHTTP(recorder, req)
			assert.Equal(t, !malformed, called)
			if malformed {
				assert.Equal(t, http.StatusInternalServerError, recorder.Code)
				assert.JSONEq(t, `{"message":"Internal Server Error"}`, recorder.Body.String())
			} else {
				assert.Equal(t, http.StatusNoContent, recorder.Code)
			}
		})
	}
}
