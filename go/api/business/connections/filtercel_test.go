package connections

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
)

func filterCatalogs() (map[string]db.Airline, map[string]db.Airport, map[string]db.Aircraft) {
	airlines := map[string]db.Airline{
		"LH": {IataCode: "LH", IcaoCode: sql.NullString{String: "DLH", Valid: true}, Name: "Lufthansa"},
		"UA": {IataCode: "UA", IcaoCode: sql.NullString{String: "UAL", Valid: true}, Name: "United"},
	}
	airports := map[string]db.Airport{
		"FRA": {IataCode: "FRA", IcaoCode: sql.NullString{String: "EDDF", Valid: true}, CountryCode: "DE", Timezone: "Europe/Berlin"},
		"MUC": {IataCode: "MUC", CountryCode: "DE", Timezone: "Europe/Berlin"},
		"JFK": {IataCode: "JFK", CountryCode: "US", Timezone: "America/New_York"},
	}
	aircraft := map[string]db.Aircraft{
		"359": {
			IataCode:       "359",
			IcaoCode:       sql.NullString{String: "A359", Valid: true},
			ParentIataCode: sql.NullString{String: "350", Valid: true},
			Name:           "Airbus A350-900",
			EngineCount:    sql.NullInt16{Int16: 2, Valid: true},
			EngineType:     sql.NullString{String: "J", Valid: true},
		},
	}
	return airlines, airports, aircraft
}

func filterConnection() Connection {
	first := &Flight{db.Flight{
		FlightNumber:                 db.FlightNumber{AirlineIataCode: "LH", Number: 400, Suffix: "A"},
		DepartureAirportIataCode:     "FRA",
		ArrivalAirportIataCode:       "MUC",
		DepartureTime:                testDate.Add(8 * time.Hour),
		ArrivalTime:                  testDate.Add(10 * time.Hour),
		ServiceType:                  "J",
		AircraftIataCode:             "359",
		AircraftOwner:                "LH",
		AircraftConfigurationVersion: "C20M200",
		SeatsBusiness:                20,
		SeatsEconomy:                 200,
		CodeShares:                   common.Set[db.FlightNumber]{{AirlineIataCode: "UA", Number: 900}: {}},
		DataElements:                 map[int64]string{1: "example"},
	}}
	second := &Flight{db.Flight{
		FlightNumber:             first.FlightNumber,
		DepartureAirportIataCode: "MUC",
		ArrivalAirportIataCode:   "JFK",
		DepartureTime:            testDate.Add(10*time.Hour + 20*time.Minute),
		ArrivalTime:              testDate.Add(12*time.Hour + 20*time.Minute),
		ServiceType:              "J",
		AircraftIataCode:         "359",
	}}
	third := &Flight{db.Flight{
		FlightNumber:             db.FlightNumber{AirlineIataCode: "LH", Number: 401, Suffix: "B"},
		DepartureAirportIataCode: "JFK",
		ArrivalAirportIataCode:   "LAX",
		DepartureTime:            testDate.Add(13*time.Hour + 20*time.Minute),
		ArrivalTime:              testDate.Add(14*time.Hour + 20*time.Minute),
		ServiceType:              "J",
		AircraftIataCode:         "359",
	}}
	return Connection{first, second, third}
}

func TestCelEvaluatorFlightFieldsAndMethods(t *testing.T) {
	airlines, airports, aircraft := filterCatalogs()
	expression := `
  flight.FlightNumber.Airline.Name == 'Lufthansa' &&
  flight.FlightNumber.code() == 'LH400A' &&
  flight.FlightNumber.icaoCode() == 'DLH400A' &&
  flight.DepartureAirport.CountryCode == 'DE' &&
  flight.DepartureAirport.IcaoCode == 'EDDF' &&
  flight.DepartureTime == timestamp('2026-11-14T08:00:00Z') &&
  flight.duration() == duration('2h') &&
  flight.Aircraft.ParentIataCode == '350' &&
  flight.Aircraft.EngineCount == 2 &&
  flight.AircraftConfigurationVersion == 'C20M200' &&
  flight.SeatsBusiness == 20 && flight.SeatsEconomy == 200 &&
  flight.CodeShares.exists(n, n.Airline.IataCode == 'UA' && n.code() == 'UA900') &&
  flight.DataElements[1] == 'example'
 `
	evaluator, err := NewCelConnectionEvaluator("("+expression+") ? yield() : abort()", airlines, airports, aircraft)
	if err != nil {
		t.Fatal(err)
	}
	evaluation, err := evaluator.Evaluate(testContext(t), filterConnection()[:1])
	if err != nil || evaluation != (ConnectionEvaluation{Yield: true}) {
		t.Fatalf("evaluation=%v error=%v", evaluation, err)
	}
	rejected, err := NewCelConnectionEvaluator("flight.duration() < duration('1h') ? yield() : abort()", airlines, airports, aircraft)
	if err != nil {
		t.Fatal(err)
	}
	evaluation, err = rejected.Evaluate(testContext(t), filterConnection()[:1])
	if err != nil || evaluation != (ConnectionEvaluation{}) {
		t.Fatalf("evaluation=%v error=%v", evaluation, err)
	}
}

func TestCelEvaluatorConnectionMethods(t *testing.T) {
	airlines, airports, aircraft := filterCatalogs()
	expression := `
  connection.size() == 3 && flight.FlightNumber.code() == 'LH401B' &&
  connection.first().FlightNumber.code() == 'LH400A' &&
  connection.last().ArrivalAirport.IataCode == 'LAX' &&
  connection.duration() == duration('6h20m') &&
  connection.flightDuration() == duration('5h') &&
  connection.flightNumberCount() == 2 &&
  connection.layovers().size() == 2 &&
  connection.layovers()[0].sameFlightNumber() &&
  connection.layovers()[0].duration() == duration('20m') &&
  connection.layovers()[1].Incoming.ArrivalAirport.IataCode == 'JFK' &&
  connection.layovers().all(l, l.sameFlightNumber() || l.duration() >= duration('45m'))
   ? yield() + proceed(LayoverWindow{Max: duration('72h')}) : abort()
 `
	filter, err := NewCelConnectionEvaluator(expression, airlines, airports, aircraft)
	if err != nil {
		t.Fatal(err)
	}
	decision, err := filter.Evaluate(testContext(t), filterConnection())
	if err != nil || !decision.Yield || decision.Next == nil {
		t.Fatalf("decision=%v error=%v", decision, err)
	}
}

func TestCelConnectionEvaluations(t *testing.T) {
	for _, test := range []struct {
		expression string
		want       ConnectionEvaluation
	}{
		{"abort()", ConnectionEvaluation{}},
		{"yield()", ConnectionEvaluation{Yield: true}},
		{"proceed(LayoverWindow{Min: duration('75m')})", ConnectionEvaluation{Next: &LayoverWindow{MinLayover: 75 * time.Minute}}},
		{"proceed(LayoverWindow{Max: duration('0s')})", ConnectionEvaluation{Next: &LayoverWindow{MaxLayover: nullablePointer(time.Duration(0), true)}}},
		{"yield() + proceed(LayoverWindow{Min: duration('75m'), Max: duration('6h')})", ConnectionEvaluation{Yield: true, Next: &LayoverWindow{MinLayover: 75 * time.Minute, MaxLayover: nullablePointer(6*time.Hour, true)}}},
		{"proceed(LayoverWindow{Max: duration('6h')}) + yield()", ConnectionEvaluation{Yield: true, Next: &LayoverWindow{MaxLayover: nullablePointer(6*time.Hour, true)}}},
	} {
		t.Run(test.expression, func(t *testing.T) {
			evaluator, err := NewCelConnectionEvaluator(test.expression, nil, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			got, err := evaluator.Evaluate(testContext(t), filterConnection())
			if err != nil || !reflect.DeepEqual(got, test.want) {
				t.Fatalf("evaluation=%+v want=%+v error=%v", got, test.want, err)
			}
		})
	}
}

func TestCelEvaluationTypeChecking(t *testing.T) {
	for _, expression := range []string{
		"true", "0", "ABORT", "connection.exists(f, f.Unknown)",
		"proceed({ 'Min': duration('1h') })", "proceed(LayoverWindow{Min: 1})",
		"proceed(LayoverWindow{Unknown: duration('1h')})", "yield() + 1",
	} {
		if _, err := NewCelConnectionEvaluator(expression, nil, nil, nil); err == nil {
			t.Errorf("accepted invalid expression %q", expression)
		}
	}
	for _, expression := range []string{
		"proceed(LayoverWindow{Min: duration('-1s')})",
		"proceed(LayoverWindow{Max: duration('-1s')})",
		"proceed(LayoverWindow{Min: duration('2h'), Max: duration('1h')})",
		"proceed(LayoverWindow{}) + proceed(LayoverWindow{})",
	} {
		evaluator, err := NewCelConnectionEvaluator(expression, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := evaluator.Evaluate(testContext(t), filterConnection()); err == nil {
			t.Errorf("accepted invalid evaluation %q", expression)
		}
	}
}

func TestCelEvaluatorMissingMetadataRetainsCodes(t *testing.T) {
	evaluator, err := NewCelConnectionEvaluator(`
  flight.FlightNumber.Airline.IataCode == 'LH' &&
  flight.FlightNumber.code() == 'LH400A' && flight.FlightNumber.icaoCode() == '' &&
  flight.DepartureAirport.IataCode == 'FRA' && flight.ArrivalAirport.IataCode == 'MUC' &&
  flight.Aircraft.IataCode == '359' &&
  flight.CodeShares[0].code() == 'UA900' && flight.DataElements.size() == 0
    ? yield() : abort()
 `, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	input := *filterConnection()[0]
	input.DataElements = nil
	evaluation, err := evaluator.Evaluate(testContext(t), Connection{&input})
	if err != nil || evaluation != (ConnectionEvaluation{Yield: true}) {
		t.Fatalf("evaluation=%v error=%v", evaluation, err)
	}
}

func TestCelEvaluatorRuntimeErrors(t *testing.T) {
	for _, test := range []struct {
		name       string
		expression string
		candidate  Connection
		message    string
	}{
		{"empty candidate", "yield()", nil, "nonempty"},
		{"empty first", "connection.slice(0, 0).first().FlightNumber.Number > 0 ? yield() : abort()", filterConnection(), "nonempty"},
		{"empty last", "connection.slice(0, 0).last().FlightNumber.Number > 0 ? yield() : abort()", filterConnection(), "nonempty"},
		{"missing map key", "flight.DataElements[999] == 'missing' ? yield() : abort()", filterConnection(), "no such key"},
	} {
		t.Run(test.name, func(t *testing.T) {
			evaluator, err := NewCelConnectionEvaluator(test.expression, nil, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			_, err = evaluator.Evaluate(testContext(t), test.candidate)
			var expressionError *ExpressionError
			if !errors.As(err, &expressionError) || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("error=%v", err)
			}
		})
	}

	evaluator, err := NewCelConnectionEvaluator("yield()", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := evaluator.Evaluate(ctx, filterConnection()); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel error=%v", err)
	}
}

func TestCelEvaluatorCanBeReusedConcurrently(t *testing.T) {
	airlines, airports, aircraft := filterCatalogs()
	for _, test := range []struct {
		name       string
		expression string
		want       ConnectionEvaluation
	}{
		{"journey predicate", "connection.duration() > duration('1h') ? yield() : abort()", ConnectionEvaluation{Yield: true}},
		{"composed evaluation", "yield() + proceed(LayoverWindow{Min: duration('75m'), Max: duration('6h')})", ConnectionEvaluation{
			Yield: true,
			Next:  &LayoverWindow{MinLayover: 75 * time.Minute, MaxLayover: nullablePointer(6*time.Hour, true)},
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			evaluator, err := NewCelConnectionEvaluator(test.expression, airlines, airports, aircraft)
			if err != nil {
				t.Fatal(err)
			}
			ctx := testContext(t)
			var group sync.WaitGroup
			for range 20 {
				group.Go(func() {
					result, err := evaluator.Evaluate(ctx, filterConnection())
					if err != nil || !reflect.DeepEqual(result, test.want) {
						t.Errorf("evaluation=%+v error=%v", result, err)
					}
				})
			}
			group.Wait()
		})
	}
}

func TestCelBridgeWorksWithSearchInterfaces(t *testing.T) {
	airlines, airports, aircraft := filterCatalogs()
	connections, err := NewCelConnectionEvaluator(`
  connection.last().ArrivalAirport.IataCode == 'JFK' ? yield() :
  (connection.size() >= 3 ? abort() : proceed(LayoverWindow{Max: duration('72h')}))
 `, airlines, airports, aircraft)
	if err != nil {
		t.Fatal(err)
	}
	data := filterConnection()
	origins, err := NewCelAirportFilter("airport.IataCode == 'FRA'")
	if err != nil {
		t.Fatal(err)
	}
	repo := testRepo{flights: []db.Flight{data[0].Flight, data[1].Flight, data[2].Flight}, airports: airports}
	query := Query{MinDeparture: testDate, MaxDeparture: testDate.Add(24 * time.Hour), DepartureAirportFilter: origins, ConnectionEvaluator: connections}
	result, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil || len(result) != 1 || len(result[0]) != 2 {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(result), next, err)
	}
}

func TestCelAirportFilterTypedFields(t *testing.T) {
	value := &Airport{db.Airport{
		IataCode: "FRA", IcaoCode: sql.NullString{String: "EDDF", Valid: true},
		IataAreaCode: sql.NullString{String: "FRA", Valid: true},
		CountryCode:  "DE", CityCode: "FRA", Type: "large_airport",
		Lng: 8.57, Lat: 50.03, Timezone: "Europe/Berlin", Name: "Frankfurt Airport",
	}}
	filter, err := NewCelAirportFilter(`
  airport.IataCode == 'FRA' && airport.IcaoCode == 'EDDF' &&
  airport.IataAreaCode == 'FRA' && airport.CountryCode == 'DE' &&
  airport.CityCode == 'FRA' && airport.Type == 'large_airport' &&
  airport.Lng > 8.0 && airport.Lat > 50.0 &&
  airport.Timezone == 'Europe/Berlin' && airport.Name.startsWith('Frankfurt')
 `)
	if err != nil {
		t.Fatal(err)
	}
	accepted, err := filter.Apply(testContext(t), value)
	if err != nil || !accepted {
		t.Fatalf("accepted=%v error=%v", accepted, err)
	}
	value.CountryCode = "US"
	accepted, err = filter.Apply(testContext(t), value)
	if err != nil || accepted {
		t.Fatalf("accepted=%v error=%v", accepted, err)
	}
}

func TestCelAirportFilterErrors(t *testing.T) {
	for _, expression := range []string{"airport.Unknown == 'DE'", "airport.CountryCode", "flight.duration() > duration('1h')"} {
		if _, err := NewCelAirportFilter(expression); err == nil {
			t.Errorf("expected compile error for %q", expression)
		}
	}
	filter, err := NewCelAirportFilter("airport.CountryCode == ['DE'][1]")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := filter.Apply(testContext(t), &Airport{}); err == nil {
		t.Fatal("expected evaluation error")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := filter.Apply(ctx, &Airport{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("error=%v", err)
	}
}

func TestCelAirportFilterNullableFields(t *testing.T) {
	for _, test := range []struct {
		name  string
		valid bool
		value string
	}{
		{name: "null with stale value", value: "ignored"},
		{name: "present empty", valid: true},
		{name: "present value", valid: true, value: "EDDF"},
	} {
		t.Run(test.name, func(t *testing.T) {
			want := test.value
			if !test.valid {
				want = ""
			}
			filter, err := NewCelAirportFilter(fmt.Sprintf(`
  has(airport.IcaoCode) == %t && has(airport.IataAreaCode) == %t &&
  airport.IcaoCode == '%s' && airport.IataAreaCode == '%s'
`, test.valid, test.valid, want, want))
			if err != nil {
				t.Fatal(err)
			}
			value := sql.NullString{String: test.value, Valid: test.valid}
			accepted, err := filter.Apply(testContext(t), &Airport{db.Airport{IcaoCode: value, IataAreaCode: value}})
			if err != nil || !accepted {
				t.Fatalf("accepted=%v error=%v", accepted, err)
			}
		})
	}
}

func TestCelEvaluatorNullableFlightMetadata(t *testing.T) {
	for _, valid := range []bool{false, true} {
		t.Run(fmt.Sprintf("valid=%t", valid), func(t *testing.T) {
			// Present zero values must remain distinguishable from SQL NULL.
			airlines := map[string]db.Airline{"LH": {IcaoCode: sql.NullString{Valid: valid}}}
			aircraft := map[string]db.Aircraft{"359": {
				ParentIataCode: sql.NullString{Valid: valid},
				IcaoCode:       sql.NullString{Valid: valid},
				Wtc:            sql.NullString{Valid: valid},
				EngineCount:    sql.NullInt16{Valid: valid},
				EngineType:     sql.NullString{Valid: valid},
			}}
			evaluator, err := NewCelConnectionEvaluator(fmt.Sprintf(`
  has(flight.FlightNumber.Airline.IcaoCode) == %[1]t &&
  has(flight.Aircraft.ParentIataCode) == %[1]t &&
  has(flight.Aircraft.IcaoCode) == %[1]t &&
  has(flight.Aircraft.Wtc) == %[1]t &&
  has(flight.Aircraft.EngineCount) == %[1]t &&
  has(flight.Aircraft.EngineType) == %[1]t &&
  flight.Aircraft.EngineCount == 0 && flight.FlightNumber.icaoCode() == ''
    ? yield() : abort()
`, valid), airlines, nil, aircraft)
			if err != nil {
				t.Fatal(err)
			}
			evaluation, err := evaluator.Evaluate(testContext(t), filterConnection()[:1])
			if err != nil || evaluation != (ConnectionEvaluation{Yield: true}) {
				t.Fatalf("evaluation=%v error=%v", evaluation, err)
			}
		})
	}
}

func TestCelConnectionMembersOnDerivedLists(t *testing.T) {
	airlines, airports, aircraft := filterCatalogs()
	for _, source := range []string{
		`connection[0].FlightNumber.code() == 'LH400A'`,
		`connection.slice(1, 3).first().DepartureAirport.IataCode == 'MUC'`,
		`connection.slice(0, 2).last().ArrivalAirport.IataCode == 'JFK'`,
		`connection.slice(1, 3).duration() == duration('4h')`,
		`connection.slice(1, 3).flightDuration() == duration('3h')`,
		`connection.slice(0, 2).flightNumberCount() == 1`,
		`connection.slice(1, 3).layovers().size() == 1 && connection.slice(1, 3).layovers()[0].duration() == duration('1h')`,
		`connection.filter(f, f.ArrivalAirport.CountryCode == 'US').flightDuration() == duration('2h')`,
		`connection.map(f, f).flightNumberCount() == 2`,
		`[connection[2]].duration() == duration('1h')`,
		`(connection.slice(0, 1) + connection.slice(1, 3)).flightDuration() == duration('5h')`,
		`connection.slice(1, 1).duration() == duration('0s') && connection.slice(1, 1).flightDuration() == duration('0s') && connection.slice(1, 1).flightNumberCount() == 0 && connection.slice(1, 1).layovers().size() == 0`,
	} {
		t.Run(source, func(t *testing.T) {
			filter, err := NewCelConnectionEvaluator("("+source+") ? yield() : abort()", airlines, airports, aircraft)
			if err != nil {
				t.Fatal(err)
			}
			decision, err := filter.Evaluate(testContext(t), filterConnection())
			if err != nil || !decision.Yield || decision.Next != nil {
				t.Fatalf("decision=%v error=%v", decision, err)
			}
		})
	}
	for _, source := range []string{
		`[1, 2].flightDuration()`,
		`['LH'].commonMarketingAirlines().size()`,
		`connection.Flights.size()`,
	} {
		if _, err := NewCelConnectionEvaluator(source, nil, nil, nil); err == nil {
			t.Errorf("accepted invalid expression %q", source)
		}
	}
}

func TestCelCommonMarketingAirlines(t *testing.T) {
	data := filterConnection()
	data[0].CodeShares = common.Set[db.FlightNumber]{
		{AirlineIataCode: "UA", Number: 1}: {},
		{AirlineIataCode: "AC", Number: 2}: {},
		{AirlineIataCode: "UA", Number: 3}: {},
	}
	data[1].AirlineIataCode = "UA"
	data[1].CodeShares = common.Set[db.FlightNumber]{
		{AirlineIataCode: "LH", Number: 4}: {},
		{AirlineIataCode: "AC", Number: 5}: {},
	}
	data[2].AirlineIataCode = "AC"
	data[2].CodeShares = common.Set[db.FlightNumber]{{AirlineIataCode: "UA", Number: 6}: {}}

	for _, test := range []struct {
		name       string
		connection Connection
		expression string
	}{
		{"full", data, `connection.commonMarketingAirlines() == ['AC', 'UA']`},
		{"subset", data, `connection.slice(0, 2).commonMarketingAirlines() == ['AC', 'LH', 'UA']`},
		{"single", data, `[connection[0]].commonMarketingAirlines() == ['AC', 'LH', 'UA']`},
		{"filtered", data, `connection.filter(f, f.FlightNumber.Airline.IataCode != 'AC').commonMarketingAirlines() == ['AC', 'LH', 'UA']`},
		{"operating only", filterConnection(), `connection.commonMarketingAirlines() == ['LH']`},
		{"empty subset", data, `connection.slice(0, 0).commonMarketingAirlines() == []`},
		{"no intersection", Connection{data[0], &Flight{db.Flight{FlightNumber: db.FlightNumber{AirlineIataCode: "BA"}}}}, `connection.commonMarketingAirlines() == []`},
	} {
		t.Run(test.name, func(t *testing.T) {
			// Missing metadata must not affect the raw airline-code intersection.
			filter, err := NewCelConnectionEvaluator(test.expression+" ? yield() : abort()", nil, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			decision, err := filter.Evaluate(testContext(t), test.connection)
			if err != nil || !decision.Yield || decision.Next != nil {
				t.Fatalf("decision=%v error=%v", decision, err)
			}
		})
	}
}

func TestCelBindingsAndStrings(t *testing.T) {
	filter, err := NewCelConnectionEvaluator(`
  cel.bind(marketing, connection.commonMarketingAirlines(),
    marketing.join(',').lowerAscii() == 'lh' &&
    connection.visitsAirport(' fra '.trim().upperAscii())
      ? yield() : abort()
  )
`, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	decision, err := filter.Evaluate(testContext(t), filterConnection())
	if err != nil || !decision.Yield || decision.Next != nil {
		t.Fatalf("decision=%v error=%v", decision, err)
	}
}

func TestCelAirportRouteMembers(t *testing.T) {
	for _, test := range []struct {
		name       string
		connection Connection
		expression string
	}{
		{"departure", filterConnection(), `connection.visitsAirport('FRA')`},
		{"transfer", filterConnection(), `connection.visitsAirport('MUC')`},
		{"arrival", filterConnection(), `connection.visitsAirport('LAX')`},
		{"absent", filterConnection(), `!connection.visitsAirport('LHR')`},
		{"normal transfers", filterConnection(), `!connection.hasAirportRepeat()`},
		{"slice", filterConnection(), `!connection.slice(1, 3).visitsAirport('FRA') && connection.slice(1, 3).visitsAirport('MUC') && !connection.slice(1, 3).hasAirportRepeat()`},
		{"empty", filterConnection(), `!connection.slice(0, 0).visitsAirport('FRA') && !connection.slice(0, 0).hasAirportRepeat()`},
		{"single", Connection{&Flight{testFlight(1, "A", "B", 8)}}, `!connection.hasAirportRepeat()`},
		{"return", Connection{&Flight{testFlight(1, "A", "B", 8)}, &Flight{testFlight(2, "B", "A", 10)}}, `connection.hasAirportRepeat() && !connection.slice(1, 2).hasAirportRepeat()`},
		{"repeated transfer", Connection{&Flight{testFlight(1, "A", "B", 8)}, &Flight{testFlight(2, "B", "C", 10)}, &Flight{testFlight(3, "C", "B", 12)}}, `connection.hasAirportRepeat()`},
		{"same endpoints", Connection{&Flight{testFlight(1, "A", "A", 8)}}, `connection.hasAirportRepeat()`},
		{"discontinuous subset", Connection{&Flight{testFlight(1, "A", "B", 8)}, &Flight{testFlight(2, "C", "D", 12)}}, `connection.visitsAirport('C') && !connection.hasAirportRepeat()`},
		{"repeated departure in subset", Connection{&Flight{testFlight(1, "A", "B", 8)}, &Flight{testFlight(2, "A", "D", 12)}}, `connection.hasAirportRepeat()`},
	} {
		t.Run(test.name, func(t *testing.T) {
			filter, err := NewCelConnectionEvaluator(test.expression+" ? yield() : abort()", nil, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			decision, err := filter.Evaluate(testContext(t), test.connection)
			if err != nil || !decision.Yield || decision.Next != nil {
				t.Fatalf("decision=%v error=%v", decision, err)
			}
		})
	}
	for _, expression := range []string{
		`connection.visitsAirport(1) ? yield() : abort()`,
		`[1].hasAirportRepeat() ? yield() : abort()`,
	} {
		if _, err := NewCelConnectionEvaluator(expression, nil, nil, nil); err == nil {
			t.Errorf("accepted invalid expression %q", expression)
		}
	}
}

func TestCelFlightViewsAcrossDerivedLists(t *testing.T) {
	filter, err := NewCelConnectionEvaluator(`
		connection.first() == connection[0] &&
		connection.last() == flight &&
		connection.slice(1, 3).first() == connection[1] &&
		connection.filter(f, f.DepartureAirport.IataCode == 'FRA').first() == connection[0] &&
		connection.layovers()[0].Incoming == connection[0] &&
		connection.layovers()[0].Outgoing == connection[1] &&
		connection.all(f, has(f.CodeShares) && has(f.DataElements)) &&
		flight.CodeShares.size() == 0 && flight.DataElements.size() == 0
			? yield() : abort()
	`, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := filter.Evaluate(testContext(t), filterConnection())
	if err != nil || !result.Yield {
		t.Fatalf("evaluation=%v error=%v", result, err)
	}
}

func TestCelCodeSharesHaveDeterministicOrder(t *testing.T) {
	data := filterConnection()[:1]
	data[0].CodeShares = common.Set[db.FlightNumber]{
		{AirlineIataCode: "UA", Number: 900}: {},
		{AirlineIataCode: "AC", Number: 2}:   {},
		{AirlineIataCode: "AC", Number: 10}:  {},
	}
	filter, err := NewCelConnectionEvaluator(`
		flight.CodeShares.map(number, number.code()) == ['AC10', 'AC2', 'UA900']
			? yield() : abort()
	`, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for range 20 {
		result, err := filter.Evaluate(testContext(t), data)
		if err != nil || !result.Yield {
			t.Fatalf("evaluation=%v error=%v", result, err)
		}
	}
}
