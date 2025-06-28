package model

type ConnectionGameChallenge struct {
	Seed               string `json:"seed"`
	DepartureAirportId UUID   `json:"departureAirportId"`
	ArrivalAirportId   UUID   `json:"arrivalAirportId"`
}
