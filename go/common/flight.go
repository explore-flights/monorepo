package common

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

var flightNumberRgx = regexp.MustCompile("^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$")

type Departure struct {
	Airport string    `json:"airport"`
	Date    LocalDate `json:"date"`
}

type FlightNumber struct {
	Airline AirlineIdentifier `json:"airline"`
	Number  int               `json:"number"`
	Suffix  string            `json:"suffix"`
}

func ParseFlightNumber(v string) (FlightNumber, error) {
	groups := flightNumberRgx.FindStringSubmatch(v)
	if groups == nil {
		return FlightNumber{}, fmt.Errorf("invalid FlightNumber: %v", v)
	}

	number, err := strconv.Atoi(groups[2])
	if err != nil {
		return FlightNumber{}, err
	}

	return FlightNumber{
		Airline: AirlineIdentifier(groups[1]),
		Number:  number,
		Suffix:  groups[3],
	}, nil
}

func (f FlightNumber) String() string {
	return fmt.Sprintf("%v%d%v", f.Airline, f.Number, f.Suffix)
}

func (f FlightNumber) Id(dep Departure) FlightId {
	return FlightId{
		Number:    f,
		Departure: dep,
	}
}

type FlightId struct {
	Number    FlightNumber `json:"number"`
	Departure Departure    `json:"departure"`
}

type Flight struct {
	Airline                      AirlineIdentifier `json:"airline"`
	FlightNumber                 int               `json:"flightNumber"`
	Suffix                       string            `json:"suffix"`
	DepartureTime                time.Time         `json:"departureTime"`
	DepartureAirport             string            `json:"departureAirport"`
	ArrivalTime                  time.Time         `json:"arrivalTime"`
	ArrivalAirport               string            `json:"arrivalAirport"`
	ServiceType                  string            `json:"serviceType"`
	AircraftOwner                AirlineIdentifier `json:"aircraftOwner"`
	AircraftType                 string            `json:"aircraftType"`
	AircraftConfigurationVersion string            `json:"aircraftConfigurationVersion"`
	Registration                 string            `json:"registration"`
	DataElements                 map[int]string    `json:"dataElements"`
	CodeShares                   []FlightNumber    `json:"codeShares"`
}

func (f *Flight) DepartureDate() LocalDate {
	return NewLocalDate(f.DepartureTime.UTC())
}

func (f *Flight) Departure() Departure {
	return Departure{
		Airport: f.DepartureAirport,
		Date:    f.DepartureDate(),
	}
}

func (f *Flight) Number() FlightNumber {
	return FlightNumber{
		Airline: f.Airline,
		Number:  f.FlightNumber,
		Suffix:  f.Suffix,
	}
}

func (f *Flight) Id() FlightId {
	return FlightId{
		Number:    f.Number(),
		Departure: f.Departure(),
	}
}

func (f *Flight) Duration() time.Duration {
	return f.ArrivalTime.Sub(f.DepartureTime)
}
