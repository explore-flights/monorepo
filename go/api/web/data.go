package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
	"net/http"
	"time"
)

func NewAirportsEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		airports, err := dh.Airports(c.Request().Context())
		return jsonResponse(c, airports, err, func(v data.AirportsResponse) bool { return false })
	}
}

func NewAircraftEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		aircraft, err := dh.Aircraft(c.Request().Context())
		return jsonResponse(c, aircraft, err, func(v []data.Aircraft) bool { return false })
	}
}

func NewFlightNumberEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		addExpirationHeaders(c, time.Now(), time.Hour)

		fnRaw := c.Param("fn")

		fn, err := common.ParseFlightNumber(fnRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		fs, err := dh.FlightSchedule(c.Request().Context(), fn)
		return jsonResponse(c, fs, err, func(v *common.FlightSchedule) bool { return v == nil })
	}
}

func jsonResponse[T any](c echo.Context, v T, err error, isEmpty func(T) bool) error {
	if err != nil {
		noCache(c)

		if errors.Is(err, context.DeadlineExceeded) {
			return echo.NewHTTPError(http.StatusRequestTimeout, err)
		}

		return echo.NewHTTPError(http.StatusInternalServerError)
	}

	if isEmpty(v) {
		return echo.NewHTTPError(http.StatusNotFound)
	}

	return c.JSON(http.StatusOK, v)
}
