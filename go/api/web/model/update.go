package model

import (
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
)

type FlightScheduleUpdates struct {
	Updates  []FlightScheduleUpdate `json:"updates"`
	Airlines map[UUID]Airline       `json:"airlines"`
	Airports map[UUID]Airport       `json:"airports"`
}

func FlightScheduleUpdatesFromDb(items []db.FlightScheduleUpdate, airlines map[uuid.UUID]db.Airline, airports map[uuid.UUID]db.Airport) FlightScheduleUpdates {
	updates := FlightScheduleUpdates{
		Updates:  make([]FlightScheduleUpdate, 0, len(items)),
		Airlines: make(map[UUID]Airline),
		Airports: make(map[UUID]Airport),
	}
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])

	for _, item := range items {
		updates.Updates = append(updates.Updates, FlightScheduleUpdateFromDb(item))
		referencedAirlines.Add(item.AirlineId)
		referencedAirports.Add(item.DepartureAirportId)
	}

	for airlineId := range referencedAirlines {
		updates.Airlines[UUID(airlineId)] = AirlineFromDb(airlines[airlineId])
	}

	for airportId := range referencedAirports {
		updates.Airports[UUID(airportId)] = AirportFromDb(airports[airportId])
	}

	return updates
}

type FlightScheduleUpdate struct {
	FlightNumber       FlightNumber    `json:"flightNumber"`
	DepartureDateLocal xtime.LocalDate `json:"departureDateLocal"`
	DepartureAirportId UUID            `json:"departureAirportId"`
	IsRemoved          bool            `json:"isRemoved"`
}

func FlightScheduleUpdateFromDb(item db.FlightScheduleUpdate) FlightScheduleUpdate {
	return FlightScheduleUpdate{
		FlightNumber:       FlightNumberFromDb(item.FlightNumber),
		DepartureDateLocal: item.DepartureDateLocal,
		DepartureAirportId: UUID(item.DepartureAirportId),
		IsRemoved:          !item.FlightVariantId.Valid,
	}
}
