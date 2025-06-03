package schedulesearch

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
	"strings"
	"time"
)

type Condition interface {
	Apply() (string, []any)
}

type baseCondition struct {
	filter string
	params []any
}

func (c baseCondition) Apply() (string, []any) {
	return c.filter, c.params
}

type andCondition []Condition

func (c andCondition) Apply() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Apply()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " AND ")), params
}

type orCondition []Condition

func (c orCondition) Apply() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Apply()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " OR ")), params
}

func WithAirlines(airlineIds ...uuid.UUID) Condition {
	c := make(orCondition, 0, len(airlineIds))
	set := make(common.Set[uuid.UUID], len(airlineIds))

	for _, airlineId := range airlineIds {
		if set.Add(airlineId) {
			c = append(c, baseCondition{
				filter: "fvh.airline_id = ?",
				params: []any{airlineId},
			})
		}
	}

	return c
}

func WithFlightNumber(fn db.FlightNumber) Condition {
	return baseCondition{
		filter: "fvh.airline_id = ? AND fvh.number = ? AND fvh.suffix = ? AND fvh.number_mod_10 = ?",
		params: []any{
			fn.AirlineId,
			fn.Number,
			fn.Suffix,
			fn.Number % 10,
		},
	}
}

func WithServiceType(serviceType string) Condition {
	return baseCondition{
		filter: "fv.service_type = ?",
		params: []any{serviceType},
	}
}

func WithAircraftId(aircraftId uuid.UUID) Condition {
	return baseCondition{
		filter: "fv.aircraft_id = ?",
		params: []any{aircraftId},
	}
}

func WithAircraftConfigurationVersion(aircraftConfigurationVersion string) Condition {
	return baseCondition{
		filter: "fv.aircraft_configuration_version = ?",
		params: []any{aircraftConfigurationVersion},
	}
}

func WithDepartureAirportId(airportId uuid.UUID) Condition {
	return baseCondition{
		filter: "fvh.departure_airport_id = ?",
		params: []any{airportId},
	}
}

func WithArrivalAirportId(airportId uuid.UUID) Condition {
	return baseCondition{
		filter: "fv.arrival_airport_id = ?",
		params: []any{airportId},
	}
}

func WithIgnoreCodeShares() Condition {
	return baseCondition{
		filter: "fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix",
		params: []any{},
	}
}

func WithMinDepartureTime(minDepartureTime time.Time) Condition {
	return baseCondition{
		filter: "(fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) >= CAST(? AS TIMESTAMPTZ)",
		params: []any{minDepartureTime.UTC().Format(time.RFC3339)},
	}
}

func WithMaxDepartureTime(maxDepartureTime time.Time) Condition {
	return baseCondition{
		filter: "(fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) <= CAST(? AS TIMESTAMPTZ)",
		params: []any{maxDepartureTime.UTC().Format(time.RFC3339)},
	}
}

func WithAll(opts ...Condition) Condition {
	if len(opts) == 1 {
		return opts[0]
	}

	c := make(andCondition, 0, len(opts))
	c = append(c, opts...)
	return c
}

func WithAny(opts ...Condition) Condition {
	if len(opts) == 1 {
		return opts[0]
	}

	c := make(orCondition, 0, len(opts))
	c = append(c, opts...)
	return c
}
