package model

import "time"

type LiveFlightsResponse struct {
	Timestamp         time.Time          `json:"timestamp"`
	NextDepartureTime *time.Time         `json:"nextDepartureTime"`
	Flights           []LiveFlight       `json:"flights"`
	Airports          map[string]Airport `json:"airports"`
}

type LiveFlight struct {
	ID                       string       `json:"id"`
	FlightNumber             FlightNumber `json:"flightNumber"`
	DepartureAirportIataCode string       `json:"departureAirportId"`
	ArrivalAirportIataCode   string       `json:"arrivalAirportId"`
	DepartureTime            time.Time    `json:"departureTime"`
	ArrivalTime              time.Time    `json:"arrivalTime"`
}
