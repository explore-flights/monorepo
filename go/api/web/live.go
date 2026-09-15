package web

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
)

type liveHandlerRepo interface {
	LiveFlights(context.Context, time.Time) ([]db.LiveFlight, *time.Time, error)
	Airports(context.Context) (map[string]db.Airport, error)
}

type LiveHandler struct{ repo liveHandlerRepo }

func NewLiveHandler(repo liveHandlerRepo) *LiveHandler { return &LiveHandler{repo: repo} }

func (h *LiveHandler) Flights(c echo.Context) error {
	timestamp, err := time.Parse(time.RFC3339Nano, c.QueryParam("timestamp"))
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithMessage("timestamp must be an ISO 8601 timestamp with a timezone"))
	}
	var flights []db.LiveFlight
	var next *time.Time
	var airports map[string]db.Airport
	g, ctx := errgroup.WithContext(c.Request().Context())
	g.Go(func() error {
		var err error
		flights, next, err = h.repo.LiveFlights(ctx, timestamp)
		return err
	})
	g.Go(func() error {
		var err error
		airports, err = h.repo.Airports(ctx)
		return err
	})
	if err := g.Wait(); err != nil {
		return err
	}
	response := model.LiveFlightsResponse{Timestamp: timestamp.UTC(), NextDepartureTime: next, Flights: make([]model.LiveFlight, 0, len(flights)), Airports: make(map[string]model.Airport)}
	for _, flight := range flights {
		departure, departureOK := airports[flight.DepartureAirportIataCode]
		arrival, arrivalOK := airports[flight.ArrivalAirportIataCode]
		if !departureOK || !arrivalOK {
			return fmt.Errorf("missing airport for live flight %s", flight.FlightNumber.String())
		}
		response.Airports[departure.IataCode] = model.AirportFromDb(departure)
		response.Airports[arrival.IataCode] = model.AirportFromDb(arrival)
		response.Flights = append(response.Flights, model.LiveFlight{
			ID:                       fmt.Sprintf("%s/%s/%s", flight.FlightNumber.String(), flight.DepartureAirportIataCode, flight.DepartureTime.Format(time.RFC3339Nano)),
			FlightNumber:             model.FlightNumberFromDb(flight.FlightNumber),
			DepartureAirportIataCode: flight.DepartureAirportIataCode, ArrivalAirportIataCode: flight.ArrivalAirportIataCode,
			DepartureTime: flight.DepartureTime, ArrivalTime: flight.ArrivalTime,
		})
	}
	c.Response().Header().Set("Cache-Control", "no-store")
	return c.JSON(http.StatusOK, response)
}
