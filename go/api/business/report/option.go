package report

import (
	"github.com/explore-flights/monorepo/go/api/db"
)

type Condition struct {
	cond db.Condition
}

func WithDepartureAirportIataCode(airportIataCode string) Condition {
	return Condition{db.BaseCondition{
		Filter: "departure_airport_iata_code = ?",
		Params: []any{airportIataCode},
	}}
}

func WithArrivalAirportIataCode(airportIataCode string) Condition {
	return Condition{db.BaseCondition{
		Filter: "arrival_airport_iata_code = ?",
		Params: []any{airportIataCode},
	}}
}

func WithIsOperating() Condition {
	return Condition{db.BaseCondition{
		Filter: "is_operating",
	}}
}

func WithSummerSchedule() Condition {
	return Condition{db.BaseCondition{
		Filter: "is_summer_schedule",
	}}
}

func WithWinterSchedule() Condition {
	return Condition{db.BaseCondition{
		Filter: "( NOT is_summer_schedule )",
	}}
}

func WithYear(year int) Condition {
	return Condition{db.BaseCondition{
		Filter: "year_local = ?",
		Params: []any{year},
	}}
}

func WithScheduleYear(year int) Condition {
	return Condition{db.BaseCondition{
		Filter: "schedule_year = ?",
		Params: []any{year},
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
