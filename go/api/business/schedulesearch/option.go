package schedulesearch

import (
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
)

type Condition struct {
	cond db.Condition
}

func WithAirlines(airlineIataCodes ...string) Condition {
	c := make(db.OrCondition, 0, len(airlineIataCodes))
	set := make(common.Set[string], len(airlineIataCodes))

	for _, airlineIataCode := range airlineIataCodes {
		if set.Add(airlineIataCode) {
			c = append(c, db.BaseCondition{
				Filter: "fvh.airline_iata_code = ?",
				Params: []any{airlineIataCode},
			})
		}
	}

	return Condition{c}
}

func WithFlightNumber(fn db.FlightNumber) Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.airline_iata_code = ? AND fvh.number = ? AND fvh.suffix = ? AND fvh.number_mod_10 = ?",
		Params: []any{
			fn.AirlineIataCode,
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

func WithAircraftIataCode(aircraftIataCode string) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.aircraft_iata_code = ?",
		Params: []any{aircraftIataCode},
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

func WithDepartureAirportIataCode(airportIataCode string) Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.departure_airport_iata_code = ?",
		Params: []any{airportIataCode},
	}}
}

func WithArrivalAirportIataCode(airportIataCode string) Condition {
	return Condition{db.BaseCondition{
		Filter: "fv.arrival_airport_iata_code = ?",
		Params: []any{airportIataCode},
	}}
}

func WithIgnoreCodeShares() Condition {
	return Condition{db.BaseCondition{
		Filter: "fvh.airline_iata_code = fv.operating_airline_iata_code AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix",
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
