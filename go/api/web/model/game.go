package model

type ConnectionGameChallenge struct {
	Seed               string `json:"seed"`
	Offset             int    `json:"offset"`
	DepartureAirportId UUID   `json:"departureAirportId"`
	ArrivalAirportId   UUID   `json:"arrivalAirportId"`
}
