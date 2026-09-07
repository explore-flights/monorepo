package web

import (
	"bytes"
	"errors"
	"log"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestYearMiddleware(t *testing.T) {
	e := echo.New()
	c := e.NewContext(httptest.NewRequest("GET", "/data/2026/flight/LH400", nil), nil)
	c.SetParamNames("year")
	c.SetParamValues("2026")

	called := false
	err := YearMiddleware()(func(c echo.Context) error {
		called = true
		year, ok := requestContextYear(c.Request().Context())
		assert.True(t, ok)
		assert.Equal(t, 2026, year)
		return nil
	})(c)

	require.NoError(t, err)
	assert.True(t, called)
}

func TestYearMiddlewareRejectsInvalidYears(t *testing.T) {
	for _, year := range []string{"", "26", "20260", "20x6", "0000"} {
		t.Run(year, func(t *testing.T) {
			e := echo.New()
			c := e.NewContext(httptest.NewRequest("GET", "/data/"+year+"/flight/LH400", nil), nil)
			c.SetParamNames("year")
			c.SetParamValues(year)

			called := false
			err := YearMiddleware()(func(c echo.Context) error {
				called = true
				return nil
			})(c)

			var httpErr *HTTPError
			require.ErrorAs(t, err, &httpErr)
			assert.Equal(t, 400, httpErr.code)
			assert.False(t, called)
		})
	}
}

func TestRecoveredPanicLogIncludesCauseLocation(t *testing.T) {
	for _, panicValue := range []any{errors.New("test error"), "test value"} {
		t.Run("panic", func(t *testing.T) {
			var logOutput bytes.Buffer
			logger := log.New(&logOutput, "", 0)
			e := echo.New()
			c := e.NewContext(httptest.NewRequest("GET", "/test", nil), nil)

			handler := ErrorLogAndMaskMiddleware(logger)(RecoverMiddleware()(func(echo.Context) error {
				panic(panicValue)
			}))

			err := handler(c)

			var httpErr *echo.HTTPError
			require.ErrorAs(t, err, &httpErr)
			assert.Equal(t, 500, httpErr.Code)
			assert.Contains(t, logOutput.String(), "Error handling request GET /test: panic: test")
			assert.Contains(t, logOutput.String(), "middleware_test.go:")
		})
	}
}
