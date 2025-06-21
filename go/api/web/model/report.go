package model

type AircraftReport struct {
	Aircraft           Aircraft `json:"aircraft"`
	FlightsAndDuration [][2]int `json:"flightsAndDuration"`
}

type DestinationReport struct {
	Airport            Airport `json:"airport"`
	MinDurationSeconds int     `json:"minDurationSeconds"`
}
