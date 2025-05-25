package web

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
	"time"
)

func NewQueryFlightSchedulesEndpoint(fr *db.FlightRepo, dh *data.Handler) echo.HandlerFunc {
	ensureAirline := func(ctx context.Context, airlines *map[uuid.UUID]db.Airline, raw string) (common.AirlineIdentifier, error) {
		if airlines == nil || *airlines == nil {
			var err error
			if *airlines, err = fr.Airlines(ctx); err != nil {
				return "", err
			}
		}

		var u model.UUID
		if err := u.FromString(raw); err != nil {
			return "", NewHTTPError(http.StatusBadRequest, WithCause(err))
		}

		if airline, ok := (*airlines)[uuid.UUID(u)]; ok && airline.IataCode.Valid {
			return common.AirlineIdentifier(airline.IataCode.String), nil
		}

		return "", NewHTTPError(http.StatusBadRequest)
	}

	ensureAirport := func(ctx context.Context, airports *map[uuid.UUID]db.Airport, raw string) (string, error) {
		if airports == nil || *airports == nil {
			var err error
			if *airports, err = fr.Airports(ctx); err != nil {
				return "", err
			}
		}

		var u model.UUID
		if err := u.FromString(raw); err != nil {
			return "", NewHTTPError(http.StatusBadRequest, WithCause(err))
		}

		if airport, ok := (*airports)[uuid.UUID(u)]; ok && airport.IataCode.Valid {
			return airport.IataCode.String, nil
		}

		return "", NewHTTPError(http.StatusBadRequest)
	}

	ensureAircraft := func(ctx context.Context, aircraft *map[uuid.UUID]db.Aircraft, raw string) (string, error) {
		if aircraft == nil || *aircraft == nil {
			var err error
			if *aircraft, err = fr.Aircraft(ctx); err != nil {
				return "", err
			}
		}

		var u model.UUID
		if err := u.FromString(raw); err != nil {
			return "", NewHTTPError(http.StatusBadRequest, WithCause(err))
		}

		if ac, ok := (*aircraft)[uuid.UUID(u)]; ok && ac.IataCode.Valid {
			return ac.IataCode.String, nil
		}

		return "", NewHTTPError(http.StatusBadRequest)
	}

	return func(c echo.Context) error {
		var airlines map[uuid.UUID]db.Airline
		var airports map[uuid.UUID]db.Airport
		var aircraft map[uuid.UUID]db.Aircraft

		ctx := c.Request().Context()
		options := []data.QueryScheduleOption{
			data.WithAny(
				data.WithServiceType("J"),
				data.WithServiceType("U"),
			),
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
			case "airlineId":
				for _, value := range values {
					aid, err := ensureAirline(ctx, &airlines, value)
					if err != nil {
						return err
					}

					isHighFrequency = true
					subOpts = append(subOpts, data.WithAirlines(aid))
				}

			case "aircraftId":
				for _, value := range values {
					aircraftType, err := ensureAircraft(ctx, &aircraft, value)
					if err != nil {
						return err
					}

					subOpts = append(subOpts, data.WithAircraftType(aircraftType))
				}

			case "aircraftConfigurationVersion":
				for _, value := range values {
					subOpts = append(subOpts, data.WithAircraftConfigurationVersion(value))
				}

			case "aircraft":
				for _, value := range values {
					if aircraftIdRaw, aircraftConfigurationVersion, ok := strings.Cut(value, "-"); ok {
						aircraftType, err := ensureAircraft(ctx, &aircraft, aircraftIdRaw)
						if err != nil {
							return err
						}

						subOpts = append(subOpts, data.WithAll(
							data.WithAircraftType(aircraftType),
							data.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
						))
					}
				}

			case "departureAirport":
				for _, value := range values {
					airportIata, err := ensureAirport(ctx, &airports, value)
					if err != nil {
						return err
					}

					subOpts = append(subOpts, data.WithDepartureAirport(airportIata))
				}

			case "arrivalAirport":
				for _, value := range values {
					airportIata, err := ensureAirport(ctx, &airports, value)
					if err != nil {
						return err
					}

					subOpts = append(subOpts, data.WithArrivalAirport(airportIata))
				}

			case "route":
				for _, value := range values {
					if departureAirport, arrivalAirport, ok := strings.Cut(value, "-"); ok {
						departureAirport, err := ensureAirport(ctx, &airports, departureAirport)
						if err != nil {
							return err
						}

						arrivalAirport, err := ensureAirport(ctx, &airports, arrivalAirport)
						if err != nil {
							return err
						}

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
					return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
				}

				subOpts = append(subOpts, data.WithMinDepartureTime(minDepartureTime))

			case "maxDepartureTime":
				isHighFrequency = true

				maxDepartureTime, err := time.Parse(time.RFC3339, values[0])
				if err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
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
			return NewHTTPError(http.StatusBadRequest, WithMessage("too few filters"))
		}

		result, err := dh.QuerySchedules(c.Request().Context(), options...)
		if err != nil {
			return err
		}

		return c.JSON(http.StatusOK, result)
	}
}
