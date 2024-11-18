package web

import (
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
	"time"
)

func NewQueryFlightSchedulesEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		options := []data.QueryScheduleOption{
			data.WithServiceType("J"),
			data.WithIgnoreCodeShares(),
		}

		highFrequencyFilters := 0
		for k, values := range c.QueryParams() {
			if len(values) < 1 {
				continue
			}

			subOpts := make([]data.QueryScheduleOption, 0, len(values))
			isHighFrequency := false

			switch k {
			case "airline":
				isHighFrequency = true

				for _, value := range values {
					subOpts = append(subOpts, data.WithAirlines(common.AirlineIdentifier(value)))
				}

			case "aircraftType":
				for _, value := range values {
					subOpts = append(subOpts, data.WithAircraftType(value))
				}

			case "aircraftConfigurationVersion":
				for _, value := range values {
					subOpts = append(subOpts, data.WithAircraftConfigurationVersion(value))
				}

			case "aircraft":
				for _, value := range values {
					if aircraftType, aircraftConfigurationVersion, ok := strings.Cut(value, "-"); ok {
						subOpts = append(subOpts, data.WithAll(
							data.WithAircraftType(aircraftType),
							data.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
						))
					}
				}

			case "departureAirport":
				for _, value := range values {
					subOpts = append(subOpts, data.WithDepartureAirport(value))
				}

			case "arrivalAirport":
				for _, value := range values {
					subOpts = append(subOpts, data.WithArrivalAirport(value))
				}

			case "route":
				for _, value := range values {
					if departureAirport, arrivalAirport, ok := strings.Cut(value, "-"); ok {
						subOpts = append(subOpts, data.WithAll(
							data.WithDepartureAirport(departureAirport),
							data.WithArrivalAirport(arrivalAirport),
						))
					}
				}

			case "minDepartureTime":
				isHighFrequency = true

				minDepartureTime, err := time.Parse(time.RFC3339, values[0])
				if err != nil {
					return echo.NewHTTPError(http.StatusBadRequest, err.Error())
				}

				subOpts = append(subOpts, data.WithMinDepartureTime(minDepartureTime))

			case "maxDepartureTime":
				isHighFrequency = true

				maxDepartureTime, err := time.Parse(time.RFC3339, values[0])
				if err != nil {
					return echo.NewHTTPError(http.StatusBadRequest, err.Error())
				}

				subOpts = append(subOpts, data.WithMaxDepartureTime(maxDepartureTime))
			}

			if len(subOpts) > 0 {
				options = append(options, data.WithAny(subOpts...))

				if isHighFrequency {
					highFrequencyFilters++
				}
			}
		}

		if (len(options) - highFrequencyFilters) < 3 {
			return echo.NewHTTPError(http.StatusBadRequest, "too few filters")
		}

		result, err := dh.QuerySchedules(c.Request().Context(), options...)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "")
		}

		return c.JSON(http.StatusOK, result)
	}
}
