package model

type AircraftReport struct {
	Aircraft           Aircraft `json:"aircraft"`
	FlightsAndDuration [][2]int `json:"flightsAndDuration"`
}
