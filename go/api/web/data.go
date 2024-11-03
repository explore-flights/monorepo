package web

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
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

func NewSeatMapEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		fnRaw := c.Param("fn")
		departureAirport := strings.ToUpper(c.Param("departure"))
		arrivalAirport := strings.ToUpper(c.Param("arrival"))
		departureDateRaw := c.Param("date")
		aircraft := c.Param("aircraft")

		fn, err := common.ParseFlightNumber(fnRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		if len(departureAirport) != 3 || len(arrivalAirport) != 3 {
			return echo.NewHTTPError(http.StatusBadRequest)
		}

		departureDate, err := xtime.ParseLocalDate(departureDateRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		fs, err := dh.FlightSchedule(c.Request().Context(), fn)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		} else if fs == nil {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		fsd, ok := fs.Find(departureDate, departureAirport, arrivalAirport)
		if !ok {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		if fmt.Sprintf("%s-%s", fsd.Data.AircraftType, fsd.Data.AircraftConfigurationVersion) != aircraft {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		cabinClasses := []lufthansa.RequestCabinClass{
			lufthansa.RequestCabinClassEco,
			lufthansa.RequestCabinClassPremiumEco,
			lufthansa.RequestCabinClassBusiness,
			lufthansa.RequestCabinClassFirst,
		}
		rawSeatMaps := make(map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability)

		for _, cabinClass := range cabinClasses {
			sm, err := dh.SeatMap(
				c.Request().Context(),
				fn,
				departureAirport,
				arrivalAirport,
				departureDate,
				cabinClass,
			)

			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}

			if sm != nil {
				rawSeatMaps[cabinClass] = *sm
			}
		}

		sm := normalizeSeatMaps(rawSeatMaps)

		addExpirationHeaders(c, time.Now(), time.Hour*24*3)
		return c.JSON(http.StatusOK, sm)
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
