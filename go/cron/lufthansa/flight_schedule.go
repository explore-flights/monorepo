package lufthansa

import (
	"encoding/json"
	"time"
)

type UTCDate time.Time

func (d *UTCDate) UnmarshalJSON(bytes []byte) error {
	var v string
	if err := json.Unmarshal(bytes, &v); err != nil {
		return err
	}

	t, err := time.ParseInLocation("02Jan06", v, time.UTC)
	if err != nil {
		return err
	}

	*d = UTCDate(t)
	return nil
}

type DaysOfOperation []time.Weekday

func (d *DaysOfOperation) UnmarshalJSON(bytes []byte) error {
	var v string
	if err := json.Unmarshal(bytes, &v); err != nil {
		return err
	}

	for _, r := range []rune(v) {
		switch r {
		case '1':
			*d = append(*d, time.Monday)
		case '2':
			*d = append(*d, time.Tuesday)
		case '3':
			*d = append(*d, time.Wednesday)
		case '4':
			*d = append(*d, time.Thursday)
		case '5':
			*d = append(*d, time.Friday)
		case '6':
			*d = append(*d, time.Saturday)
		case '7':
			*d = append(*d, time.Sunday)
		}
	}

	return nil
}

type DataElement struct {
	StartLegSequenceNumber int    `json:"startLegSequenceNumber"`
	EndLegSequenceNumber   int    `json:"endLegSequenceNumber"`
	Id                     int    `json:"id"`
	Value                  string `json:"value"`
}

type Leg struct {
	SequenceNumber                   int    `json:"sequenceNumber"`
	Origin                           string `json:"origin"`
	Destination                      string `json:"destination"`
	ServiceType                      string `json:"serviceType"`
	AircraftOwner                    string `json:"aircraftOwner"`
	AircraftType                     string `json:"aircraftType"`
	AircraftConfigurationVersion     string `json:"aircraftConfigurationVersion"`
	Registration                     string `json:"registration"`
	Op                               bool   `json:"op"`
	AircraftDepartureTimeUTC         int    `json:"aircraftDepartureTimeUTC"`
	AircraftDepartureTimeDateDiffUTC int    `json:"aircraftDepartureTimeDateDiffUTC"`
	AircraftDepartureTimeVariation   int    `json:"aircraftDepartureTimeVariation"`
	AircraftArrivalTimeUTC           int    `json:"aircraftArrivalTimeUTC"`
	AircraftArrivalTimeDateDiffUTC   int    `json:"aircraftArrivalTimeDateDiffUTC"`
	AircraftArrivalTimeVariation     int    `json:"aircraftArrivalTimeVariation"`
}

func (l Leg) DepartureTime(flightStartDate UTCDate) time.Time {
	t := time.Time(flightStartDate)
	t = t.AddDate(0, 0, l.AircraftDepartureTimeDateDiffUTC)
	t = t.Add(time.Duration(l.AircraftDepartureTimeUTC) * time.Minute)
	t = t.In(time.FixedZone("", l.AircraftDepartureTimeVariation*60))

	return t
}

func (l Leg) ArrivalTime(flightStartDate UTCDate) time.Time {
	t := time.Time(flightStartDate)
	t = t.AddDate(0, 0, l.AircraftArrivalTimeDateDiffUTC)
	t = t.Add(time.Duration(l.AircraftArrivalTimeUTC) * time.Minute)
	t = t.In(time.FixedZone("", l.AircraftArrivalTimeVariation*60))

	return t
}

type PeriodOfOperation struct {
	StartDate       UTCDate         `json:"startDate"`
	EndDate         UTCDate         `json:"endDate"`
	DaysOfOperation DaysOfOperation `json:"daysOfOperation"`
}

type FlightSchedule struct {
	Airline              string            `json:"airline"`
	FlightNumber         int               `json:"flightNumber"`
	Suffix               string            `json:"suffix"`
	PeriodOfOperationUTC PeriodOfOperation `json:"periodOfOperationUTC"`
	Legs                 []Leg             `json:"legs"`
	DataElements         []DataElement     `json:"dataElements"`
}

func (fs FlightSchedule) DataElementsForSequence(sequenceNumber int) map[int]string {
	values := make(map[int]string)
	for _, de := range fs.DataElements {
		if sequenceNumber >= de.StartLegSequenceNumber && sequenceNumber <= de.EndLegSequenceNumber {
			values[de.Id] = de.Value
		}
	}

	return values
}
