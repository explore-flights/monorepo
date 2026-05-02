package model

import (
	"maps"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

type FlightSchedules struct {
	FlightNumber         FlightNumber                   `json:"flightNumber"`
	RelatedFlightNumbers []FlightNumber                 `json:"relatedFlightNumbers"`
	Items                []FlightScheduleItem           `json:"items"`
	Variants             map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines             map[string]Airline             `json:"airlines"`
	Airports             map[string]Airport             `json:"airports"`
	Aircraft             map[string]Aircraft            `json:"aircraft"`
}

type FlightScheduleItem struct {
	DepartureDateLocal       xtime.LocalDate `json:"departureDateLocal"`
	DepartureAirportIataCode string          `json:"departureAirportId"`
	FlightVariantId          *UUID           `json:"flightVariantId,omitempty"`
	Version                  time.Time       `json:"version"`
	VersionCount             int             `json:"versionCount"`
}

func FlightScheduleItemFromDb(item db.FlightScheduleItem) FlightScheduleItem {
	var flightVariantId *UUID
	if item.FlightVariantId.Valid {
		id := UUID(item.FlightVariantId.V)
		flightVariantId = &id
	}

	return FlightScheduleItem{
		DepartureDateLocal:       item.DepartureDateLocal,
		DepartureAirportIataCode: item.DepartureAirportIataCode,
		FlightVariantId:          flightVariantId,
		Version:                  item.Version,
		VersionCount:             item.VersionCount,
	}
}

type FlightScheduleVariant struct {
	Id                           UUID             `json:"id"`
	OperatedAs                   FlightNumber     `json:"operatedAs"`
	DepartureTimeLocal           xtime.LocalTime  `json:"departureTimeLocal"`
	DepartureUtcOffsetSeconds    int64            `json:"departureUtcOffsetSeconds"`
	DurationSeconds              int64            `json:"durationSeconds"`
	ArrivalAirportIataCode       string           `json:"arrivalAirportId"`
	ArrivalUtcOffsetSeconds      int64            `json:"arrivalUtcOffsetSeconds"`
	ServiceType                  string           `json:"serviceType"`
	AircraftOwner                string           `json:"aircraftOwner"`
	AircraftIataCode             string           `json:"aircraftId"`
	AircraftConfigurationVersion string           `json:"aircraftConfigurationVersion"`
	CodeShares                   []FlightNumber   `json:"codeShares"`
	DataElements                 map[int64]string `json:"dataElements"`
}

func FlightScheduleVariantFromDb(variant db.FlightScheduleVariant) FlightScheduleVariant {
	fsv := FlightScheduleVariant{
		Id:                           UUID(variant.Id),
		OperatedAs:                   FlightNumberFromDb(variant.OperatedAs),
		DepartureTimeLocal:           variant.DepartureTimeLocal,
		DepartureUtcOffsetSeconds:    variant.DepartureUtcOffsetSeconds,
		DurationSeconds:              variant.DurationSeconds,
		ArrivalAirportIataCode:       variant.ArrivalAirportIataCode,
		ArrivalUtcOffsetSeconds:      variant.ArrivalUtcOffsetSeconds,
		ServiceType:                  variant.ServiceType,
		AircraftOwner:                variant.AircraftOwner,
		AircraftIataCode:             variant.AircraftIataCode,
		AircraftConfigurationVersion: variant.AircraftConfigurationVersion,
		CodeShares:                   make([]FlightNumber, 0, len(variant.CodeShares)),
		DataElements:                 maps.Clone(variant.DataElements),
	}

	for cs := range variant.CodeShares {
		fsv.CodeShares = append(fsv.CodeShares, FlightNumberFromDb(cs))
	}

	return fsv
}

type FlightScheduleVersions struct {
	FlightNumber             FlightNumber                   `json:"flightNumber"`
	DepartureDateLocal       xtime.LocalDate                `json:"departureDateLocal"`
	DepartureAirportIataCode string                         `json:"departureAirportId"`
	Versions                 []FlightScheduleVersion        `json:"versions"`
	Variants                 map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines                 map[string]Airline             `json:"airlines"`
	Airports                 map[string]Airport             `json:"airports"`
	Aircraft                 map[string]Aircraft            `json:"aircraft"`
}

type FlightScheduleVersion struct {
	Version         time.Time `json:"version"`
	FlightVariantId *UUID     `json:"flightVariantId,omitempty"`
}
