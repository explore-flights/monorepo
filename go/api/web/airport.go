package web

import (
	"context"
	"maps"
	"net/http"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
)

type airportHandlerRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	Airports(ctx context.Context) (map[string]db.Airport, error)
	Aircraft(ctx context.Context) (map[string]db.Aircraft, error)
	AirportStatistics(ctx context.Context, airportIataCode string, year int) ([]db.AirportStatistics, error)
	AirportMovements(ctx context.Context, airportIataCode string, dateLocal xtime.LocalDate, direction db.AirportMovementDirection) ([]db.Flight, error)
}

type AirportHandler struct {
	repo airportHandlerRepo
}

func NewAirportHandler(repo airportHandlerRepo) *AirportHandler {
	return &AirportHandler{repo: repo}
}

func (ah *AirportHandler) Statistics(c echo.Context) error {
	ctx := c.Request().Context()
	airportIataCode, err := util{}.parseAirport(ctx, c.Param("airport"), ah.repo.Airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}
	year, _ := requestContextYear(ctx)

	var statistics []db.AirportStatistics
	var airlines map[string]db.Airline
	var airports map[string]db.Airport
	var aircraft map[string]db.Aircraft
	{
		g, ctx := errgroup.WithContext(ctx)
		g.Go(func() error {
			var err error
			statistics, err = ah.repo.AirportStatistics(ctx, airportIataCode, year)
			return err
		})
		g.Go(func() error {
			var err error
			airlines, err = ah.repo.Airlines(ctx)
			return err
		})
		g.Go(func() error {
			var err error
			airports, err = ah.repo.Airports(ctx)
			return err
		})
		g.Go(func() error {
			var err error
			aircraft, err = ah.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return err
		}
	}

	response := model.AirportStatisticsResponse{
		AirportIataCode: airportIataCode,
		YearLocal:       year,
		Directions:      make([]model.AirportDirectionStatistics, 0, len(statistics)),
		Airlines:        make(map[string]model.Airline),
		Airports:        make(map[string]model.Airport),
		Aircraft:        make(map[string]model.Aircraft),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := common.Set[string]{airportIataCode: {}}
	referencedAircraft := make(common.Set[string])

	for _, direction := range statistics {
		response.Directions = append(response.Directions, model.AirportDirectionStatisticsFromDb(direction))
		for _, route := range direction.RouteStatistics {
			referencedAirlines.Add(route.OperatingAirlineIataCode)
			referencedAirports.Add(route.OtherAirportIataCode)
			referencedAircraft.Add(route.AircraftIataCode)
		}
	}

	addReferencedAirlines(referencedAirlines, airlines, response.Airlines)
	addReferencedAirports(referencedAirports, airports, response.Airports)
	model.AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, response.Aircraft)

	addExpirationHeaders(c, time.Now(), time.Hour)
	return c.JSON(http.StatusOK, response)
}

func (ah *AirportHandler) Departures(c echo.Context) error {
	return ah.timetable(c, db.AirportMovementDirectionDeparture)
}

func (ah *AirportHandler) Arrivals(c echo.Context) error {
	return ah.timetable(c, db.AirportMovementDirectionArrival)
}

func (ah *AirportHandler) timetable(c echo.Context, direction db.AirportMovementDirection) error {
	ctx := c.Request().Context()
	airportIataCode, err := util{}.parseAirport(ctx, c.Param("airport"), ah.repo.Airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}
	dateLocal, err := xtime.ParseLocalDate(c.Param("date"))
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithMessage("Invalid date format"), WithCause(err))
	}

	var movements []db.Flight
	var airlines map[string]db.Airline
	var airports map[string]db.Airport
	var aircraft map[string]db.Aircraft
	{
		g, ctx := errgroup.WithContext(ctx)
		g.Go(func() error {
			var err error
			movements, err = ah.repo.AirportMovements(ctx, airportIataCode, dateLocal, direction)
			return err
		})
		g.Go(func() error {
			var err error
			airlines, err = ah.repo.Airlines(ctx)
			return err
		})
		g.Go(func() error {
			var err error
			airports, err = ah.repo.Airports(ctx)
			return err
		})
		g.Go(func() error {
			var err error
			aircraft, err = ah.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return err
		}
	}

	response := model.AirportTimetableResponse{
		AirportIataCode: airportIataCode,
		DateLocal:       dateLocal,
		Direction:       direction,
		Movements:       make([]model.AirportMovement, 0, len(movements)),
		Airlines:        make(map[string]model.Airline),
		Airports:        make(map[string]model.Airport),
		Aircraft:        make(map[string]model.Aircraft),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := common.Set[string]{airportIataCode: {}}
	referencedAircraft := make(common.Set[string])

	for _, movement := range movements {
		response.Movements = append(response.Movements, model.AirportMovementFromDb(movement))
		referencedAirlines.Add(movement.AirlineIataCode)
		referencedAirports.Add(movement.DepartureAirportIataCode)
		referencedAirports.Add(movement.ArrivalAirportIataCode)
		referencedAircraft.Add(movement.AircraftIataCode)

		for codeShare := range movement.CodeShares {
			referencedAirlines.Add(codeShare.AirlineIataCode)
		}
	}

	addReferencedAirlines(referencedAirlines, airlines, response.Airlines)
	addReferencedAirports(referencedAirports, airports, response.Airports)
	model.AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, response.Aircraft)

	addExpirationHeaders(c, time.Now(), time.Hour)
	return c.JSON(http.StatusOK, response)
}

func addReferencedAirlines(referenced common.Set[string], airlines map[string]db.Airline, destination map[string]model.Airline) {
	for iataCode := range referenced {
		if airline, ok := airlines[iataCode]; ok {
			destination[iataCode] = model.AirlineFromDb(airline)
		}
	}
}

func addReferencedAirports(referenced common.Set[string], airports map[string]db.Airport, destination map[string]model.Airport) {
	for iataCode := range referenced {
		if airport, ok := airports[iataCode]; ok {
			destination[iataCode] = model.AirportFromDb(airport)
		}
	}
}
