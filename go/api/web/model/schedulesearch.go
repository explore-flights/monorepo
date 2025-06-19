package model

import (
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
	"maps"
)

type FlightSchedulesMany struct {
	Schedules []FlightScheduleNumberAndItems `json:"schedules"`
	Variants  map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines  map[UUID]Airline               `json:"airlines"`
	Airports  map[UUID]Airport               `json:"airports"`
	Aircraft  map[UUID]Aircraft              `json:"aircraft"`
}

func FlightSchedulesManyFromDb(dbResult db.FlightSchedulesMany, airlines map[uuid.UUID]db.Airline, airports map[uuid.UUID]db.Airport, aircraft map[uuid.UUID]db.Aircraft) FlightSchedulesMany {
	fs := FlightSchedulesMany{
		Schedules: make([]FlightScheduleNumberAndItems, 0, len(dbResult.Schedules)),
		Variants:  make(map[UUID]FlightScheduleVariant, len(dbResult.Variants)),
		Airlines:  make(map[UUID]Airline),
		Airports:  make(map[UUID]Airport),
		Aircraft:  make(map[UUID]Aircraft),
	}
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])
	referencedAircraft := make(common.Set[uuid.UUID])

	for fn, items := range dbResult.Schedules {
		fsNumberAndItems := FlightScheduleNumberAndItems{
			FlightNumber: FlightNumberFromDb(fn),
			Items:        make([]FlightScheduleItem, 0, len(items)),
		}

		referencedAirlines.Add(fn.AirlineId)

		for _, item := range items {
			fsNumberAndItems.Items = append(fsNumberAndItems.Items, FlightScheduleItemFromDb(item))
			referencedAirports.Add(item.DepartureAirportId)
		}

		fs.Schedules = append(fs.Schedules, fsNumberAndItems)
	}

	for variantId, variant := range dbResult.Variants {
		fs.Variants[UUID(variantId)] = FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineId)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineId)
		referencedAirports.Add(variant.ArrivalAirportId)
		referencedAircraft.Add(variant.AircraftId)
	}

	for airlineId := range referencedAirlines {
		fs.Airlines[UUID(airlineId)] = AirlineFromDb(airlines[airlineId])
	}

	for airportId := range referencedAirports {
		fs.Airports[UUID(airportId)] = AirportFromDb(airports[airportId])
	}

	AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, fs.Aircraft)

	return fs
}

type FlightScheduleNumberAndItems struct {
	FlightNumber FlightNumber         `json:"flightNumber"`
	Items        []FlightScheduleItem `json:"items"`
}
