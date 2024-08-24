package common

import (
	"maps"
)

type FlightScheduleData struct {
	DepartureTime                OffsetTime        `json:"departureTime"`
	DepartureAirport             string            `json:"departureAirport"`
	ArrivalTime                  OffsetTime        `json:"arrivalTime"`
	ArrivalAirport               string            `json:"arrivalAirport"`
	ServiceType                  string            `json:"serviceType"`
	AircraftOwner                AirlineIdentifier `json:"aircraftOwner"`
	AircraftType                 string            `json:"aircraftType"`
	AircraftConfigurationVersion string            `json:"aircraftConfigurationVersion"`
	Registration                 string            `json:"registration"`
	DataElements                 map[int]string    `json:"dataElements"`
	CodeShares                   []FlightNumber    `json:"codeShares"`
}

func (fsd FlightScheduleData) Equal(other FlightScheduleData) bool {
	return fsd.DepartureTime == other.DepartureTime &&
		fsd.DepartureAirport == other.DepartureAirport &&
		fsd.ArrivalTime == other.ArrivalTime &&
		fsd.ArrivalAirport == other.ArrivalAirport &&
		fsd.ServiceType == other.ServiceType &&
		fsd.AircraftOwner == other.AircraftOwner &&
		fsd.AircraftType == other.AircraftType &&
		fsd.AircraftConfigurationVersion == other.AircraftConfigurationVersion &&
		fsd.Registration == other.Registration &&
		maps.Equal(fsd.DataElements, other.DataElements) &&
		SliceEqualContent(fsd.CodeShares, other.CodeShares)
}

type FlightScheduleVariant struct {
	Ranges []LocalDateRange   `json:"ranges"`
	Data   FlightScheduleData `json:"data"`
}

func (fsv *FlightScheduleVariant) Expand(d LocalDate) {

}

type FlightSchedule struct {
	Airline      AirlineIdentifier        `json:"airline"`
	FlightNumber int                      `json:"flightNumber"`
	Suffix       string                   `json:"suffix"`
	Variants     []*FlightScheduleVariant `json:"variants"`
}

func (fs *FlightSchedule) DataVariant(fsd FlightScheduleData) *FlightScheduleVariant {
	for _, variant := range fs.Variants {
		if variant.Data.Equal(fsd) {
			return variant
		}
	}

	return nil
}
