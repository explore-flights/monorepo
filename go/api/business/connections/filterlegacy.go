package connections

import (
	"context"
	"fmt"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
)

// LegacyAirportFilter selects the explicit IATA origins from the legacy request.
type LegacyAirportFilter struct {
	Origins []string
}

// LegacyConnectionEvaluator uses native times and durations, leaving wire conversion
// and request validation to the API boundary. Bounds are inclusive and required,
// as in the legacy request; zero does not mean unlimited.
type LegacyConnectionEvaluator struct {
	ExcludeAirport      []string
	ExcludeFlightNumber []string
	ExcludeAircraft     []string
	Destinations        []string
	MaxFlights          uint32
	CountMultiLeg       bool
	MinLayover          time.Duration
	MaxLayover          time.Duration
	MaxDuration         time.Duration
	IncludeAirport      []string
	IncludeFlightNumber []string
	IncludeAircraft     []string
	Airlines            map[string]db.Airline
	Airports            map[string]db.Airport
	Aircraft            map[string]db.Aircraft
}

func (filter LegacyAirportFilter) Apply(ctx context.Context, airport *Airport) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	return slices.Contains(filter.Origins, airport.IataCode), nil
}

func (filter LegacyConnectionEvaluator) allowsFlight(flight *Flight) bool {
	if flight.ServiceType != "J" && flight.ServiceType != "U" {
		return false
	}
	matcher := legacyMatcher{filter.Airlines, filter.Airports, filter.Aircraft}
	return !slices.ContainsFunc(filter.ExcludeAirport, func(pattern string) bool {
		return matcher.airport(flight, pattern)
	}) && !slices.ContainsFunc(filter.ExcludeFlightNumber, func(pattern string) bool {
		return matcher.flightNumber(flight, pattern)
	}) && !slices.ContainsFunc(filter.ExcludeAircraft, func(pattern string) bool {
		return matcher.aircraft(flight, pattern)
	})
}

func (filter LegacyConnectionEvaluator) Evaluate(ctx context.Context, connection Connection) (ConnectionEvaluation, error) {
	if err := ctx.Err(); err != nil {
		return ConnectionEvaluation{}, err
	}
	if len(connection) == 0 || filter.MaxDuration < 1 {
		return ConnectionEvaluation{}, nil
	}
	for _, flight := range connection {
		if !filter.allowsFlight(flight) {
			return ConnectionEvaluation{}, nil
		}
	}
	first, last := connection[0], connection[len(connection)-1]
	if last.ArrivalTime.Sub(first.DepartureTime) > filter.MaxDuration {
		return ConnectionEvaluation{}, nil
	}

	flightCount := uint32(1)
	for index := 1; index < len(connection); index++ {
		incoming, outgoing := connection[index-1], connection[index]
		sameNumber := incoming.FlightNumber == outgoing.FlightNumber
		layover := outgoing.DepartureTime.Sub(incoming.ArrivalTime)
		if layover > filter.MaxLayover || (!sameNumber && layover < filter.MinLayover) {
			return ConnectionEvaluation{}, nil
		}
		if filter.CountMultiLeg || !sameNumber {
			flightCount++
		}
	}
	if flightCount > filter.MaxFlights {
		return ConnectionEvaluation{}, nil
	}
	matcher := legacyMatcher{filter.Airlines, filter.Airports, filter.Aircraft}
	if slices.Contains(filter.Destinations, last.ArrivalAirportIataCode) &&
		legacyIncludes(connection, filter.IncludeAirport, matcher.airport) &&
		legacyIncludes(connection, filter.IncludeFlightNumber, matcher.flightNumber) &&
		legacyIncludes(connection, filter.IncludeAircraft, matcher.aircraft) {
		return ConnectionEvaluation{Yield: true}, nil
	}
	if filter.CountMultiLeg && flightCount == filter.MaxFlights {
		return ConnectionEvaluation{}, nil
	}
	remaining := filter.MaxDuration - last.ArrivalTime.Sub(first.DepartureTime)
	if remaining <= 0 {
		return ConnectionEvaluation{}, nil
	}
	maxLayover := min(filter.MaxLayover, remaining)
	// Keep the lower bound at zero: a same-number next leg bypasses MinLayover.
	// The evaluator checks the actual layover once the next flight is known.
	return ConnectionEvaluation{Next: &LayoverWindow{MaxLayover: &maxLayover}}, nil
}

// Values within a category are alternatives; all nonempty categories must match.
func legacyIncludes(connection Connection, patterns []string, match func(*Flight, string) bool) bool {
	if len(patterns) == 0 {
		return true
	}
	for _, pattern := range patterns {
		if slices.ContainsFunc(connection, func(flight *Flight) bool { return match(flight, pattern) }) {
			return true
		}
	}
	return false
}

type legacyMatcher struct {
	airlines      map[string]db.Airline
	airports      map[string]db.Airport
	aircraftTypes map[string]db.Aircraft
}

func (matcher legacyMatcher) airport(flight *Flight, pattern string) bool {
	if !legacyGlob(pattern) {
		return flight.DepartureAirportIataCode == pattern || flight.ArrivalAirportIataCode == pattern
	}
	for _, code := range []string{flight.DepartureAirportIataCode, flight.ArrivalAirportIataCode} {
		if airport, ok := matcher.airports[code]; ok {
			if legacyGlobMatch(airport.IataCode, pattern) || (airport.IcaoCode.Valid && legacyGlobMatch(airport.IcaoCode.String, pattern)) {
				return true
			}
		}
	}
	return false
}

func (matcher legacyMatcher) aircraft(flight *Flight, pattern string) bool {
	if !legacyGlob(pattern) {
		return flight.AircraftIataCode == pattern
	}
	aircraft, ok := matcher.aircraftTypes[flight.AircraftIataCode]
	return ok && (legacyGlobMatch(aircraft.IataCode, pattern) ||
		(aircraft.IcaoCode.Valid && legacyGlobMatch(aircraft.IcaoCode.String, pattern)) ||
		legacyGlobMatch(aircraft.Name, pattern))
}

// Legacy flight-number filters match the operating number (IATA or ICAO), not codeshares.
func (matcher legacyMatcher) flightNumber(flight *Flight, pattern string) bool {
	match := func(number string) bool {
		if legacyGlob(pattern) {
			return legacyGlobMatch(number, pattern)
		}
		return number == pattern
	}
	if match(flight.FlightNumber.String()) {
		return true
	}
	airline, ok := matcher.airlines[flight.AirlineIataCode]
	return ok && airline.IcaoCode.Valid && match(fmt.Sprintf("%s%d%s", airline.IcaoCode.String, flight.Number, flight.Suffix))
}

// Malformed globs are literal values, matching the legacy web adapter.
func legacyGlob(pattern string) bool {
	_, err := path.Match(pattern, "")
	return strings.ContainsAny(pattern, "*?[\\") && err == nil
}

func legacyGlobMatch(value, pattern string) bool {
	match, _ := path.Match(pattern, value)
	return match
}
