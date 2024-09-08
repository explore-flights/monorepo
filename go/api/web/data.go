package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/labstack/echo/v4"
	"net/http"
)

func noCache(c echo.Context) {
	c.Response().Header().Set(echo.HeaderCacheControl, "private, no-cache, no-store, max-age=0, must-revalidate")
}

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
		fn := c.Param("fn")
		airport := c.Param("airport")
		dateRaw := c.Param("date")

		if airport != "" && dateRaw != "" {
			d, err := xtime.ParseLocalDate(dateRaw)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, err)
			}

			flight, err := dh.FlightNumber(c.Request().Context(), fn, airport, d)
			return jsonResponse(c, flight, err, func(v *common.Flight) bool { return v == nil })
		} else {
			fs, err := dh.FlightSchedule(c.Request().Context(), fn)
			return jsonResponse(c, fs, err, func(v *common.FlightSchedule) bool { return v == nil })
		}
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
