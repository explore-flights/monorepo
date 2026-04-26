package model

import (
	"maps"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
)

type FlightSchedulesMany struct {
	Schedules []FlightScheduleNumberAndItems `json:"schedules"`
	Variants  map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines  map[string]Airline             `json:"airlines"`
	Airports  map[string]Airport             `json:"airports"`
	Aircraft  map[string]Aircraft            `json:"aircraft"`
}

func FlightSchedulesManyFromDb(dbResult db.FlightSchedulesMany, airlines map[string]db.Airline, airports map[string]db.Airport, aircraft map[string]db.Aircraft) FlightSchedulesMany {
	fs := FlightSchedulesMany{
		Schedules: make([]FlightScheduleNumberAndItems, 0, len(dbResult.Schedules)),
		Variants:  make(map[UUID]FlightScheduleVariant, len(dbResult.Variants)),
		Airlines:  make(map[string]Airline),
		Airports:  make(map[string]Airport),
		Aircraft:  make(map[string]Aircraft),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := make(common.Set[string])
	referencedAircraft := make(common.Set[string])

	for fn, items := range dbResult.Schedules {
		fsNumberAndItems := FlightScheduleNumberAndItems{
			FlightNumber: FlightNumberFromDb(fn),
			Items:        make([]FlightScheduleItem, 0, len(items)),
		}

		referencedAirlines.Add(fn.AirlineIataCode)

		for _, item := range items {
			fsNumberAndItems.Items = append(fsNumberAndItems.Items, FlightScheduleItemFromDb(item))
			referencedAirports.Add(item.DepartureAirportIataCode)
		}

		fs.Schedules = append(fs.Schedules, fsNumberAndItems)
	}

	for variantId, variant := range dbResult.Variants {
		fs.Variants[UUID(variantId)] = FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineIataCode)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineIataCode)
		referencedAirports.Add(variant.ArrivalAirportIataCode)
		referencedAircraft.Add(variant.AircraftIataCode)
	}

	for airlineIataCode := range referencedAirlines {
		fs.Airlines[airlineIataCode] = AirlineFromDb(airlines[airlineIataCode])
	}

	for airportIataCode := range referencedAirports {
		fs.Airports[airportIataCode] = AirportFromDb(airports[airportIataCode])
	}

	AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, fs.Aircraft)

	return fs
}

type FlightScheduleNumberAndItems struct {
	FlightNumber FlightNumber         `json:"flightNumber"`
	Items        []FlightScheduleItem `json:"items"`
}
