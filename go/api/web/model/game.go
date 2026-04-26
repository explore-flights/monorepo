package model

type ConnectionGameChallenge struct {
	Seed                     string `json:"seed"`
	DepartureAirportIataCode string `json:"departureAirportId"`
	ArrivalAirportIataCode   string `json:"arrivalAirportId"`
}
