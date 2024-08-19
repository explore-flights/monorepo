package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
	"net/http"
)

func noCache(c echo.Context) {
	c.Response().Header().Set(echo.HeaderCacheControl, "private, no-cache, no-store, max-age=0, must-revalidate")
}

func NewAirportsHandler(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		airports, err := dh.Airports(c.Request().Context())
		if err != nil {
			noCache(c)

			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		return c.JSON(http.StatusOK, airports)
	}
}

func NewAircraftHandler(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		aircraft, err := dh.Aircraft(c.Request().Context())
		if err != nil {
			noCache(c)

			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		return c.JSON(http.StatusOK, aircraft)
	}
}

func NewFlightNumberHandler(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		fn := c.Param("fn")
		airport := c.Param("airport")
		d, err := common.ParseLocalDate(c.Param("date"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		flight, err := dh.FlightNumber(c.Request().Context(), fn, airport, d)
		if err != nil {
			noCache(c)

			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		return c.JSON(http.StatusOK, flight)
	}
}
