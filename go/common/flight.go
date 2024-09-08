package common

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var flightNumberRgx = regexp.MustCompile("^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$")

type Departure struct {
	Airport string          `json:"airport"`
	Date    xtime.LocalDate `json:"date"`
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

func (f *FlightNumber) UnmarshalText(text []byte) error {
	var err error
	*f, err = ParseFlightNumber(string(text))
	return err
}

func (f FlightNumber) MarshalText() ([]byte, error) {
	return []byte(f.String()), nil
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

func (f FlightId) String() string {
	return fmt.Sprintf("%v@%v@%v", f.Number, f.Departure.Airport, f.Departure.Date)
}

func (f *FlightId) UnmarshalText(text []byte) error {
	values := strings.SplitN(string(text), "@", 3)
	if len(values) != 3 {
		return fmt.Errorf("invalid FlightId: %v", string(text))
	}

	fn, err := ParseFlightNumber(values[0])
	if err != nil {
		return err
	}

	d, err := xtime.ParseLocalDate(values[2])
	if err != nil {
		return err
	}

	*f = FlightId{
		Number: fn,
		Departure: Departure{
			Airport: values[1],
			Date:    d,
		},
	}

	return err
}

func (f FlightId) MarshalText() ([]byte, error) {
	return []byte(f.String()), nil
}

type Flight struct {
	Airline                      AirlineIdentifier          `json:"airline"`
	FlightNumber                 int                        `json:"flightNumber"`
	Suffix                       string                     `json:"suffix"`
	DepartureTime                time.Time                  `json:"departureTime"`
	DepartureAirport             string                     `json:"departureAirport"`
	ArrivalTime                  time.Time                  `json:"arrivalTime"`
	ArrivalAirport               string                     `json:"arrivalAirport"`
	ServiceType                  string                     `json:"serviceType"`
	AircraftOwner                AirlineIdentifier          `json:"aircraftOwner"`
	AircraftType                 string                     `json:"aircraftType"`
	AircraftConfigurationVersion string                     `json:"aircraftConfigurationVersion"`
	Registration                 string                     `json:"registration"`
	DataElements                 map[int]string             `json:"dataElements"`
	CodeShares                   map[FlightNumber]CodeShare `json:"codeShares"`
	Metadata                     FlightMetadata             `json:"metadata"`
}

type CodeShare struct {
	DataElements map[int]string `json:"dataElements"`
	Metadata     FlightMetadata `json:"metadata"`
}

type FlightMetadata struct {
	QueryDate    xtime.LocalDate `json:"queryDate"`
	CreationTime time.Time       `json:"creationTime"`
	UpdateTime   time.Time       `json:"updateTime"`
}

func (f *Flight) DepartureDate() xtime.LocalDate {
	return xtime.NewLocalDate(f.DepartureTime)
}

func (f *Flight) DepartureDateUTC() xtime.LocalDate {
	return xtime.NewLocalDate(f.DepartureTime.UTC())
}

func (f *Flight) Departure() Departure {
	return Departure{
		Airport: f.DepartureAirport,
		Date:    f.DepartureDate(),
	}
}

func (f *Flight) DepartureUTC() Departure {
	return Departure{
		Airport: f.DepartureAirport,
		Date:    f.DepartureDateUTC(),
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
