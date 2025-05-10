package search

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"time"
)

type Departure struct {
	AirportId uuid.UUID
	Date      xtime.LocalDate
}

type Flight struct {
	db.Flight
	airlines map[uuid.UUID]db.Airline
	airports map[uuid.UUID]db.Airport
	aircraft map[uuid.UUID]db.Aircraft
}

func (f *Flight) IataAirline() (string, bool) {
	airline, ok := f.airlines[f.AirlineId]
	if !ok && !airline.IataCode.Valid {
		return "", false
	}

	return airline.IataCode.String, true
}

func (f *Flight) IataNumber() (string, bool) {
	iataAirline, ok := f.IataAirline()
	if !ok {
		return "", false
	}

	return fmt.Sprintf("%s%d%s", iataAirline, f.Number, f.Suffix), true
}

func (f *Flight) IataDepartureAirport() (string, bool) {
	airport, ok := f.airports[f.DepartureAirportId]
	if !ok && !airport.IataCode.Valid {
		return "", false
	}

	return airport.IataCode.String, true
}

func (f *Flight) IataArrivalAirport() (string, bool) {
	airport, ok := f.airports[f.ArrivalAirportId]
	if !ok && !airport.IataCode.Valid {
		return "", false
	}

	return airport.IataCode.String, true
}

func (f *Flight) IataAircraftType() (string, bool) {
	ac, ok := f.aircraft[f.AircraftId]
	if !ok && !ac.IataCode.Valid {
		return "", false
	}

	return ac.IataCode.String, true
}

func (f *Flight) DepartureUTC() Departure {
	return Departure{
		AirportId: f.DepartureAirportId,
		Date:      xtime.NewLocalDate(f.DepartureTime.UTC()),
	}
}

func (f *Flight) Duration() time.Duration {
	return f.ArrivalTime.Sub(f.DepartureTime)
}
