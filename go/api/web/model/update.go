package model

import (
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

type FlightScheduleUpdates struct {
	Updates  []FlightScheduleUpdate `json:"updates"`
	Airlines map[string]Airline     `json:"airlines"`
	Airports map[string]Airport     `json:"airports"`
}

func FlightScheduleUpdatesFromDb(items []db.FlightScheduleUpdate, airlines map[string]db.Airline, airports map[string]db.Airport) FlightScheduleUpdates {
	updates := FlightScheduleUpdates{
		Updates:  make([]FlightScheduleUpdate, 0, len(items)),
		Airlines: make(map[string]Airline),
		Airports: make(map[string]Airport),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := make(common.Set[string])

	for _, item := range items {
		updates.Updates = append(updates.Updates, FlightScheduleUpdateFromDb(item))
		referencedAirlines.Add(item.AirlineIataCode)
		referencedAirports.Add(item.DepartureAirportIataCode)
	}

	for airlineIataCode := range referencedAirlines {
		updates.Airlines[airlineIataCode] = AirlineFromDb(airlines[airlineIataCode])
	}

	for airportIataCode := range referencedAirports {
		updates.Airports[airportIataCode] = AirportFromDb(airports[airportIataCode])
	}

	return updates
}

type FlightScheduleUpdate struct {
	FlightNumber             FlightNumber    `json:"flightNumber"`
	DepartureDateLocal       xtime.LocalDate `json:"departureDateLocal"`
	DepartureAirportIataCode string          `json:"departureAirportId"`
	IsRemoved                bool            `json:"isRemoved"`
}

func FlightScheduleUpdateFromDb(item db.FlightScheduleUpdate) FlightScheduleUpdate {
	return FlightScheduleUpdate{
		FlightNumber:             FlightNumberFromDb(item.FlightNumber),
		DepartureDateLocal:       item.DepartureDateLocal,
		DepartureAirportIataCode: item.DepartureAirportIataCode,
		IsRemoved:                !item.FlightVariantId.Valid,
	}
}
