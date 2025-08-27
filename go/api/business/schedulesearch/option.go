package schedulesearch

import (
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
)

type Condition struct {
	cond db.Condition
}

func WithAirlines(airlineIds ...uuid.UUID) Condition {
	c := make(db.OrCondition, 0, len(airlineIds))
	set := make(common.Set[uuid.UUID], len(airlineIds))

	for _, airlineId := range airlineIds {
		if set.Add(airlineId) {
			c = append(c, db.BaseCondition{
				Filter: "fvh.airline_id = ?",
				Params: []any{airlineId},
			})
		}
	}

	return Condition{c}
}

func WithFlightNumber(fn db.FlightNumber) Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.airline_id = ? AND fvh.number = ? AND fvh.suffix = ? AND fvh.number_mod_10 = ?",
		Params: []any{
			fn.AirlineId,
			fn.Number,
			fn.Suffix,
			fn.Number % 10,
		},
	}}
}

func WithServiceType(serviceType string) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.service_type = ?",
		Params: []any{serviceType},
	}}
}

func WithAircraftId(aircraftId uuid.UUID) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.aircraft_id = ?",
		Params: []any{aircraftId},
	}}
}

func WithAircraftConfigurationVersion(aircraftConfigurationVersion string) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.aircraft_configuration_version = ?",
		Params: []any{aircraftConfigurationVersion},
	}}
}

func WithTotalSeats(seats int) Condition {
	return Condition{db.BaseCondition{
		Filter: `
(
	IF(fv.seats_first = 999, 0, fv.seats_first)
	+ IF(fv.seats_business = 999, 0, fv.seats_business)
	+ IF(fv.seats_premium = 999, 0, fv.seats_premium)
	+ IF(fv.seats_economy = 999, 0, fv.seats_economy)
) = ?
`,
		Params: []any{seats},
	}}
}

func WithSeatsFirst(seats int) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.seats_first = ?",
		Params: []any{seats},
	}}
}

func WithSeatsBusiness(seats int) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.seats_business = ?",
		Params: []any{seats},
	}}
}

func WithSeatsPremium(seats int) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.seats_premium = ?",
		Params: []any{seats},
	}}
}

func WithSeatsEconomy(seats int) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.seats_economy = ?",
		Params: []any{seats},
	}}
}

func WithDepartureAirportId(airportId uuid.UUID) Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.departure_airport_id = ?",
		Params: []any{airportId},
	}}
}

func WithArrivalAirportId(airportId uuid.UUID) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.arrival_airport_id = ?",
		Params: []any{airportId},
	}}
}

func WithIgnoreCodeShares() Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix",
		Params: []any{},
	}}
}

func WithMinDepartureTime(minDepartureTime time.Time) Condition {
	return Condition{db.BaseCondition{
		Filter: "(fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) >= CAST(? AS TIMESTAMPTZ)",
		Params: []any{minDepartureTime.UTC().Format(time.RFC3339)},
	}}
}

func WithMaxDepartureTime(maxDepartureTime time.Time) Condition {
	return Condition{db.BaseCondition{
		Filter: "(fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) <= CAST(? AS TIMESTAMPTZ)",
		Params: []any{maxDepartureTime.UTC().Format(time.RFC3339)},
	}}
}

func WithAll(opts ...Condition) Condition {
	if len(opts) == 1 {
		return opts[0]
	}

	c := make(db.AndCondition, len(opts))
	for i, o := range opts {
		c[i] = o.cond
	}

	return Condition{c}
}

func WithAny(opts ...Condition) Condition {
	if len(opts) == 1 {
		return opts[0]
	}

	c := make(db.OrCondition, len(opts))
	for i, o := range opts {
		c[i] = o.cond
	}

	return Condition{c}
}
