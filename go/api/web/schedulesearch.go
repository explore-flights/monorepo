package web

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/business/schedulesearch"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"net/http"
	"strings"
	"time"
)

type scheduleSearchHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
}

type ScheduleSearchHandler struct {
	repo   scheduleSearchHandlerRepo
	search *schedulesearch.Search
}

func NewScheduleSearchHandler(repo scheduleSearchHandlerRepo, search *schedulesearch.Search) *ScheduleSearchHandler {
	return &ScheduleSearchHandler{
		repo:   repo,
		search: search,
	}
}

func (h *ScheduleSearchHandler) Query(c echo.Context) error {
	ctx := c.Request().Context()
	conditions := make([]schedulesearch.Condition, 0)

	for k, values := range c.QueryParams() {
		if len(values) < 1 {
			continue
		}

		subConditions := make([]schedulesearch.Condition, 0, len(values))
		switch k {
		case "airlineId":
			for _, value := range values {
				var airlineId model.UUID
				if err := airlineId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithAirlines(uuid.UUID(airlineId)))
			}

		case "aircraftId":
			for _, value := range values {
				var aircraftId model.UUID
				if err := aircraftId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithAircraftId(uuid.UUID(aircraftId)))
			}

		case "aircraftConfigurationVersion":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithAircraftConfigurationVersion(value))
			}

		case "aircraft":
			for _, value := range values {
				if aircraftIdRaw, aircraftConfigurationVersion, ok := strings.Cut(value, "-"); ok {
					var aircraftId model.UUID
					if err := aircraftId.FromString(aircraftIdRaw); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithAircraftId(uuid.UUID(aircraftId)),
						schedulesearch.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
					))
				}
			}

		case "departureAirportId":
			for _, value := range values {
				var airportId model.UUID
				if err := airportId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithDepartureAirportId(uuid.UUID(airportId)))
			}

		case "arrivalAirportId":
			for _, value := range values {
				var airportId model.UUID
				if err := airportId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithArrivalAirportId(uuid.UUID(airportId)))
			}

		case "route":
			for _, value := range values {
				if departureAirport, arrivalAirport, ok := strings.Cut(value, "-"); ok {
					var departureAirportId model.UUID
					if err := departureAirportId.FromString(departureAirport); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					var arrivalAirportId model.UUID
					if err := arrivalAirportId.FromString(arrivalAirport); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithDepartureAirportId(uuid.UUID(departureAirportId)),
						schedulesearch.WithArrivalAirportId(uuid.UUID(arrivalAirportId)),
					))
				}
			}

		case "minDepartureTime":
			minDepartureTime, err := time.Parse(time.RFC3339, values[0])
			if err != nil {
				return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
			}

			subConditions = append(subConditions, schedulesearch.WithMinDepartureTime(minDepartureTime))

		case "maxDepartureTime":
			maxDepartureTime, err := time.Parse(time.RFC3339, values[0])
			if err != nil {
				return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
			}

			subConditions = append(subConditions, schedulesearch.WithMaxDepartureTime(maxDepartureTime))
		}

		if len(subConditions) > 0 {
			conditions = append(conditions, schedulesearch.WithAny(subConditions...))
		}
	}

	if len(conditions) < 2 {
		return NewHTTPError(http.StatusBadRequest, WithMessage("too few filters"))
	}

	result, err := h.queryInternal(ctx, schedulesearch.WithAll(conditions...))
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) Allegris(c echo.Context) error {
	ctx := c.Request().Context()

	var lhAirlineId uuid.UUID
	var a350900AircraftId uuid.UUID
	{
		airlines, err := h.repo.Airlines(ctx)
		if err != nil {
			return err
		}

		for _, airline := range airlines {
			if airline.IataCode.Valid && airline.IataCode.String == "LH" {
				lhAirlineId = airline.Id
				break
			}
		}

		aircraft, err := h.repo.Aircraft(ctx)
		if err != nil {
			return err
		}

		for _, ac := range aircraft {
			if ac.IataCode.Valid && ac.IataCode.String == "359" {
				a350900AircraftId = ac.Id
				break
			}
		}
	}

	if lhAirlineId.IsNil() || a350900AircraftId.IsNil() {
		return NewHTTPError(http.StatusInternalServerError)
	}

	result, err := h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines(lhAirlineId),
			schedulesearch.WithAircraftId(a350900AircraftId),
			schedulesearch.WithAny(
				schedulesearch.WithAircraftConfigurationVersion("C38E24M201"),
				schedulesearch.WithAircraftConfigurationVersion("F4C38E24M201"),
			),
		),
	)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) queryInternal(ctx context.Context, condition schedulesearch.Condition) (model.FlightSchedulesMany, error) {
	var dbResult db.FlightSchedulesMany
	var airlines map[uuid.UUID]db.Airline
	var airports map[uuid.UUID]db.Airport
	var aircraft map[uuid.UUID]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			dbResult, err = h.search.QuerySchedules(
				ctx,
				schedulesearch.WithAll(
					schedulesearch.WithAny(
						schedulesearch.WithServiceType("J"),
						schedulesearch.WithServiceType("U"),
					),
					schedulesearch.WithIgnoreCodeShares(),
					condition,
				),
			)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = h.repo.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = h.repo.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = h.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return model.FlightSchedulesMany{}, err
		}
	}

	fs := model.FlightSchedulesMany{
		Schedules: make([]model.FlightScheduleNumberAndItems, 0, len(dbResult.Schedules)),
		Variants:  make(map[model.UUID]model.FlightScheduleVariant, len(dbResult.Variants)),
		Airlines:  make(map[model.UUID]model.Airline),
		Airports:  make(map[model.UUID]model.Airport),
		Aircraft:  make(map[model.UUID]model.Aircraft),
	}
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])
	referencedAircraft := make(common.Set[uuid.UUID])

	for fn, items := range dbResult.Schedules {
		fsNumberAndItems := model.FlightScheduleNumberAndItems{
			FlightNumber: model.FlightNumberFromDb(fn),
			Items:        make([]model.FlightScheduleItem, 0, len(items)),
		}

		referencedAirlines.Add(fn.AirlineId)

		for _, item := range items {
			fsNumberAndItems.Items = append(fsNumberAndItems.Items, model.FlightScheduleItemFromDb(item))
			referencedAirports.Add(item.DepartureAirportId)
		}

		fs.Schedules = append(fs.Schedules, fsNumberAndItems)
	}

	for variantId, variant := range dbResult.Variants {
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineId)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineId)
		referencedAirports.Add(variant.ArrivalAirportId)
		referencedAircraft.Add(variant.AircraftId)
	}

	for airlineId := range referencedAirlines {
		fs.Airlines[model.UUID(airlineId)] = model.AirlineFromDb(airlines[airlineId])
	}

	for airportId := range referencedAirports {
		fs.Airports[model.UUID(airportId)] = model.AirportFromDb(airports[airportId])
	}

	for aircraftId := range referencedAircraft {
		fs.Aircraft[model.UUID(aircraftId)] = model.AircraftFromDb(aircraft[aircraftId])
	}

	return fs, nil
}
