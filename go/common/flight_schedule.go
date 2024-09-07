package common

import (
	"slices"
	"time"
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
		SliceEqualContent(fsd.CodeShares, other.CodeShares)
}

type FlightScheduleAlias struct {
	FlightNumber     FlightNumber `json:"flightNumber"`
	DepartureTime    OffsetTime   `json:"departureTime"`
	DepartureAirport string       `json:"departureAirport"`
}

type FlightScheduleVariant struct {
	Ranges LocalDateRanges      `json:"ranges"`
	Data   *FlightScheduleData  `json:"data,omitempty"`
	Alias  *FlightScheduleAlias `json:"alias,omitempty"`
}

func (fsv *FlightScheduleVariant) DepartureTime() OffsetTime {
	if fsv.Data != nil {
		return fsv.Data.DepartureTime
	}

	return fsv.Alias.DepartureTime
}

type FlightSchedule struct {
	Airline      AirlineIdentifier        `json:"airline"`
	FlightNumber int                      `json:"flightNumber"`
	Suffix       string                   `json:"suffix"`
	Variants     []*FlightScheduleVariant `json:"variants"`
}

func (fs *FlightSchedule) RemoveVariants(start, end time.Time) {
	fs.Variants = slices.DeleteFunc(fs.Variants, func(variant *FlightScheduleVariant) bool {
		for d := range variant.Ranges.Iter() {
			t := variant.DepartureTime().Time(d)
			if t.Compare(start) >= 0 && t.Compare(end) <= 0 {
				variant.Ranges = variant.Ranges.Remove(d)
			}
		}

		return len(variant.Ranges) < 1
	})
}

func (fs *FlightSchedule) DataVariant(fsd FlightScheduleData) (*FlightScheduleVariant, bool) {
	for _, variant := range fs.Variants {
		if variant.Data != nil && variant.Data.Equal(fsd) {
			return variant, true
		}
	}

	return nil, false
}

func (fs *FlightSchedule) AliasVariant(fsa FlightScheduleAlias) (*FlightScheduleVariant, bool) {
	for _, variant := range fs.Variants {
		if variant.Alias != nil && *variant.Alias == fsa {
			return variant, true
		}
	}

	return nil, false
}
