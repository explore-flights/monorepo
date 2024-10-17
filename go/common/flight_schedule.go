package common

import (
	"github.com/explore-flights/monorepo/go/common/xtime"
	"iter"
	"maps"
	"slices"
	"time"
)

type FlightScheduleData struct {
	OperatedAs                   FlightNumber      `json:"operatedAs"`
	DepartureTime                xtime.LocalTime   `json:"departureTime"`
	DepartureAirport             string            `json:"departureAirport"`
	DepartureUTCOffset           int               `json:"departureUTCOffset"`
	DurationSeconds              int64             `json:"durationSeconds"`
	ArrivalAirport               string            `json:"arrivalAirport"`
	ArrivalUTCOffset             int               `json:"arrivalUTCOffset"`
	ServiceType                  string            `json:"serviceType"`
	AircraftOwner                AirlineIdentifier `json:"aircraftOwner"`
	AircraftType                 string            `json:"aircraftType"`
	AircraftConfigurationVersion string            `json:"aircraftConfigurationVersion"`
	CodeShares                   Set[FlightNumber] `json:"codeShares"`
}

func (fsd FlightScheduleData) Equal(other FlightScheduleData) bool {
	return fsd.OperatedAs == other.OperatedAs &&
		fsd.DepartureTime == other.DepartureTime &&
		fsd.DepartureAirport == other.DepartureAirport &&
		fsd.DepartureUTCOffset == other.DepartureUTCOffset &&
		fsd.DurationSeconds == other.DurationSeconds &&
		fsd.ArrivalAirport == other.ArrivalAirport &&
		fsd.ArrivalUTCOffset == other.ArrivalUTCOffset &&
		fsd.ServiceType == other.ServiceType &&
		fsd.AircraftOwner == other.AircraftOwner &&
		fsd.AircraftType == other.AircraftType &&
		fsd.AircraftConfigurationVersion == other.AircraftConfigurationVersion &&
		maps.Equal(fsd.CodeShares, other.CodeShares)
}

type FlightScheduleVariant struct {
	Ranges xtime.LocalDateRanges `json:"ranges"`
	Data   FlightScheduleData    `json:"data"`
}

func (fsv *FlightScheduleVariant) DepartureTime(d xtime.LocalDate) time.Time {
	return fsv.Data.DepartureTime.Time(d, time.FixedZone("", fsv.Data.DepartureUTCOffset))
}

func (fsv *FlightScheduleVariant) DepartureDateLocal(d xtime.LocalDate) xtime.LocalDate {
	return xtime.NewLocalDate(fsv.DepartureTime(d))
}

func (fsv *FlightScheduleVariant) DepartureDateUTC(d xtime.LocalDate) xtime.LocalDate {
	return xtime.NewLocalDate(fsv.DepartureTime(d).UTC())
}

func (fsv *FlightScheduleVariant) ArrivalTime(d xtime.LocalDate) time.Time {
	return fsv.DepartureTime(d).Add(time.Duration(fsv.Data.DurationSeconds) * time.Second).In(time.FixedZone("", fsv.Data.ArrivalUTCOffset))
}

type FlightSchedule struct {
	Airline      AirlineIdentifier        `json:"airline"`
	FlightNumber int                      `json:"flightNumber"`
	Suffix       string                   `json:"suffix"`
	Variants     []*FlightScheduleVariant `json:"variants"`
}

func (fs *FlightSchedule) Number() FlightNumber {
	return FlightNumber{
		Airline: fs.Airline,
		Number:  fs.FlightNumber,
		Suffix:  fs.Suffix,
	}
}

func (fs *FlightSchedule) DeleteAll(fn func(*FlightScheduleVariant, xtime.LocalDate) bool) {
	fs.Variants = slices.DeleteFunc(fs.Variants, func(fsv *FlightScheduleVariant) bool {
		fsv.Ranges = fsv.Ranges.RemoveAll(func(d xtime.LocalDate) bool {
			return fn(fsv, d)
		})

		return len(fsv.Ranges) < 1
	})
}

func (fs *FlightSchedule) Variant(fsd FlightScheduleData) (*FlightScheduleVariant, bool) {
	for _, fsv := range fs.Variants {
		if fsv.Data.Equal(fsd) {
			return fsv, true
		}
	}

	return nil, false
}

func (fs *FlightSchedule) List(start, end time.Time) iter.Seq2[xtime.LocalDate, *FlightScheduleVariant] {
	return func(yield func(xtime.LocalDate, *FlightScheduleVariant) bool) {
		for _, fsv := range fs.Variants {
			for d := range fsv.Ranges.Iter() {
				t := fsv.DepartureTime(d)
				if t.Compare(start) >= 0 && t.Compare(end) <= 0 {
					if !yield(d, fsv) {
						return
					}
				}
			}
		}
	}
}
