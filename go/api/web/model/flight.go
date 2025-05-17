package model

import (
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"time"
)

type FlightSchedules struct {
	FlightNumber FlightNumber                   `json:"flightNumber"`
	Items        []FlightScheduleItem           `json:"items"`
	Variants     map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines     map[UUID]Airline               `json:"airlines"`
	Airports     map[UUID]Airport               `json:"airports"`
	Aircraft     map[UUID]Aircraft              `json:"aircraft"`
}

type FlightScheduleItem struct {
	DepartureDateLocal xtime.LocalDate `json:"departureDateLocal"`
	DepartureAirportId UUID            `json:"departureAirportId"`
	FlightVariantId    *UUID           `json:"flightVariantId,omitempty"`
	Version            time.Time       `json:"version"`
	VersionCount       int             `json:"versionCount"`
}

type FlightScheduleVariant struct {
	Id                           UUID            `json:"id"`
	OperatedAs                   FlightNumber    `json:"operatedAs"`
	DepartureTimeLocal           xtime.LocalTime `json:"departureTimeLocal"`
	DepartureUtcOffsetSeconds    int64           `json:"departureUtcOffsetSeconds"`
	DurationSeconds              int64           `json:"durationSeconds"`
	ArrivalAirportId             UUID            `json:"arrivalAirportId"`
	ArrivalUtcOffsetSeconds      int64           `json:"arrivalUtcOffsetSeconds"`
	ServiceType                  string          `json:"serviceType"`
	AircraftOwner                string          `json:"aircraftOwner"`
	AircraftId                   UUID            `json:"aircraftId"`
	AircraftConfigurationVersion string          `json:"aircraftConfigurationVersion"`
	CodeShares                   []FlightNumber  `json:"codeShares"`
}

func FlightScheduleVariantFromDb(variant db.FlightScheduleVariant) FlightScheduleVariant {
	fsv := FlightScheduleVariant{
		Id:                           UUID(variant.Id),
		OperatedAs:                   FlightNumberFromDb(variant.OperatedAs),
		DepartureTimeLocal:           variant.DepartureTimeLocal,
		DepartureUtcOffsetSeconds:    variant.DepartureUtcOffsetSeconds,
		DurationSeconds:              variant.DurationSeconds,
		ArrivalAirportId:             UUID(variant.ArrivalAirportId),
		ArrivalUtcOffsetSeconds:      variant.ArrivalUtcOffsetSeconds,
		ServiceType:                  variant.ServiceType,
		AircraftOwner:                variant.AircraftOwner,
		AircraftId:                   UUID(variant.AircraftId),
		AircraftConfigurationVersion: variant.AircraftConfigurationVersion,
		CodeShares:                   make([]FlightNumber, 0, len(variant.CodeShares)),
	}

	for cs := range variant.CodeShares {
		fsv.CodeShares = append(fsv.CodeShares, FlightNumberFromDb(cs))
	}

	return fsv
}

type FlightScheduleVersions struct {
	FlightNumber       FlightNumber                   `json:"flightNumber"`
	DepartureDateLocal xtime.LocalDate                `json:"departureDateLocal"`
	DepartureAirportId UUID                           `json:"departureAirportId"`
	Versions           []FlightScheduleVersion        `json:"versions"`
	Variants           map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines           map[UUID]Airline               `json:"airlines"`
	Airports           map[UUID]Airport               `json:"airports"`
	Aircraft           map[UUID]Aircraft              `json:"aircraft"`
}

type FlightScheduleVersion struct {
	Version         time.Time `json:"version"`
	FlightVariantId *UUID     `json:"flightVariantId,omitempty"`
}
