package model

type FlightSchedulesMany struct {
	Schedules []FlightScheduleNumberAndItems `json:"schedules"`
	Variants  map[UUID]FlightScheduleVariant `json:"variants"`
	Airlines  map[UUID]Airline               `json:"airlines"`
	Airports  map[UUID]Airport               `json:"airports"`
	Aircraft  map[UUID]Aircraft              `json:"aircraft"`
}

type FlightScheduleNumberAndItems struct {
	FlightNumber FlightNumber         `json:"flightNumber"`
	Items        []FlightScheduleItem `json:"items"`
}
