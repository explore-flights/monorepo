package web

import (
	"fmt"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/connections"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
)

const maximumConnectionsPageSize = 500

// connectionQuery translates wire contracts to native business filters.
func connectionQuery(req model.ConnectionsSearchRequest, airlines map[string]db.Airline, airports map[string]db.Airport, aircraft map[string]db.Aircraft) (connections.Query, uint, error) {
	if req.V2 == nil {
		return connections.Query{
			MinDeparture:           req.MinDeparture,
			MaxDeparture:           req.MaxDeparture,
			DepartureAirportFilter: connections.LegacyAirportFilter{Origins: req.Origins},
			ConnectionEvaluator: connections.LegacyConnectionEvaluator{
				ExcludeAirport:      req.ExcludeAirport,
				ExcludeFlightNumber: req.ExcludeFlightNumber,
				ExcludeAircraft:     req.ExcludeAircraft,
				Destinations:        req.Destinations,
				MaxFlights:          req.MaxFlights,
				CountMultiLeg:       req.CountMultiLeg,
				MinLayover:          time.Duration(req.MinLayoverMS) * time.Millisecond,
				MaxLayover:          time.Duration(req.MaxLayoverMS) * time.Millisecond,
				MaxDuration:         time.Duration(req.MaxDurationMS) * time.Millisecond,
				IncludeAirport:      req.IncludeAirport,
				IncludeFlightNumber: req.IncludeFlightNumber,
				IncludeAircraft:     req.IncludeAircraft,
				Airlines:            airlines, Airports: airports, Aircraft: aircraft,
			},
		}, maximumConnectionsPageSize, nil
	}
	q := req.V2.Query
	if q == nil || q.MinDeparture == nil {
		return connections.Query{}, 0, fmt.Errorf("v2.query.minDeparture is required")
	}
	if err := q.MinDeparture.CheckValid(); err != nil {
		return connections.Query{}, 0, err
	}
	if q.MaxDeparture == nil {
		return connections.Query{}, 0, fmt.Errorf("v2.query.maxDeparture is required")
	}
	if err := q.MaxDeparture.CheckValid(); err != nil {
		return connections.Query{}, 0, err
	}
	if q.MaxDeparture.AsTime().Before(q.MinDeparture.AsTime()) {
		return connections.Query{}, 0, fmt.Errorf("maxDeparture must not be before minDeparture")
	}
	if q.Expressions == nil {
		return connections.Query{}, 0, fmt.Errorf("v2.query.expressions is required")
	}
	size := req.V2.GetPage().GetSize()
	if size > maximumConnectionsPageSize {
		return connections.Query{}, 0, fmt.Errorf("page.size must be <= %d", maximumConnectionsPageSize)
	}
	if size == 0 {
		size = 50
	}
	origins, err := connections.NewCelAirportFilter(q.Expressions.DepartureAirportFilter)
	if err != nil {
		return connections.Query{}, 0, err
	}
	journeys, err := connections.NewCelConnectionEvaluator(q.Expressions.ConnectionEvaluation, airlines, airports, aircraft)
	if err != nil {
		return connections.Query{}, 0, err
	}
	return connections.Query{
		MinDeparture:           q.MinDeparture.AsTime(),
		MaxDeparture:           q.MaxDeparture.AsTime(),
		DepartureAirportFilter: origins,
		ConnectionEvaluator:    journeys,
	}, uint(size), nil
}

func connectionContinuation(token string, minDeparture, maxDeparture time.Time) (*connections.Continuation, error) {
	if token == "" {
		return nil, nil
	}
	var value model.ConnectionsContinuation
	if err := value.FromString(token); err != nil {
		return nil, err
	}
	if value.Departure.Before(minDeparture) {
		return nil, fmt.Errorf("continuation departure is before minDeparture")
	}
	if value.Departure.After(maxDeparture) {
		return nil, fmt.Errorf("continuation departure is after maxDeparture")
	}
	return &connections.Continuation{Departure: value.Departure, Consumed: value.Consumed}, nil
}
