package connections

import (
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
}

func (f *Flight) DepartureLocal() Departure {
	return Departure{
		AirportId: f.DepartureAirportId,
		Date:      xtime.NewLocalDate(f.DepartureTime),
	}
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
