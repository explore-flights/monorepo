package connections

import (
	"context"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
)

type Airport struct {
	db.Airport
}

type Flight struct {
	db.Flight
}

type Connection []*Flight

type AirportFilter interface {
	Apply(ctx context.Context, a *Airport) (bool, error)
}

type ConnectionEvaluator interface {
	Evaluate(ctx context.Context, c Connection) (ConnectionEvaluation, error)
}

type ConnectionEvaluation struct {
	Yield bool
	Next  *LayoverWindow
}

type LayoverWindow struct {
	MinLayover time.Duration
	MaxLayover *time.Duration
}

type Query struct {
	MinDeparture           time.Time
	MaxDeparture           time.Time
	DepartureAirportFilter AirportFilter
	ConnectionEvaluator    ConnectionEvaluator
}

// Continuation identifies the first-flight timestamp group and consumed journeys.
// Encoding it for transport belongs to the caller.
type Continuation struct {
	Departure time.Time
	Consumed  uint32
}
