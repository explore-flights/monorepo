package model

import (
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
	CodeShares         []FlightNumber  `json:"codeShares"`
	FlightVariantId    *UUID           `json:"flightVariantId,omitempty"`
	Version            time.Time       `json:"version"`
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
}
