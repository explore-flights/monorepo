package model

type SearchResponse struct {
	Airlines      []Airline      `json:"airlines"`
	FlightNumbers []FlightNumber `json:"flightNumbers"`
}
