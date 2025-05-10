package model

type FlightNumber struct {
	AirlineId UUID   `json:"airlineId"`
	Number    int    `json:"number"`
	Suffix    string `json:"suffix,omitempty"`
}

type Airline struct {
	Id       UUID   `json:"id"`
	Name     string `json:"name"`
	IataCode string `json:"iataCode,omitempty"`
	IcaoCode string `json:"icaoCode,omitempty"`
}
