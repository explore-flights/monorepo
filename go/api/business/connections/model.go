package connections

import (
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

type Departure struct {
	AirportIataCode string
	Date            xtime.LocalDate
}

type Flight struct {
	db.Flight
}

func (f *Flight) DepartureLocal() Departure {
	return Departure{
		AirportIataCode: f.DepartureAirportIataCode,
		Date:            xtime.NewLocalDate(f.DepartureTime),
	}
}

func (f *Flight) DepartureUTC() Departure {
	return Departure{
		AirportIataCode: f.DepartureAirportIataCode,
		Date:            xtime.NewLocalDate(f.DepartureTime.UTC()),
	}
}

func (f *Flight) Duration() time.Duration {
	return f.ArrivalTime.Sub(f.DepartureTime)
}
