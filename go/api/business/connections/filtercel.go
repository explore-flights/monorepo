package connections

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strconv"
	"time"

	"cel.dev/cel-go/cel"
	"cel.dev/cel-go/common/types"
	"cel.dev/cel-go/common/types/ref"
	"cel.dev/cel-go/common/types/traits"
	"cel.dev/cel-go/ext"
	"github.com/explore-flights/monorepo/go/api/db"
)

// The bridges expose the native fields below with their Go names. For example:
//
// airport.CountryCode == 'DE'
// flight.FlightNumber.Airline.IataCode == 'LH' && flight.duration() < duration('8h')
// flight.ArrivalAirport.IataCode == 'JFK' ? yield() : proceed(LayoverWindow{Max: duration('6h')})
//
// connection is a typed flight list supporting indexing, list macros, and slice(start, end).
// Utilities:
//
//   - flight.duration(): arrival minus departure.
//   - FlightNumber.code() / icaoCode(): formatted operating or codeshare number.
//   - connection.first() / last(): typed endpoint flights.
//   - connection.duration(): elapsed time including layovers.
//   - connection.flightDuration(): summed flight time.
//   - connection.flightNumberCount(): consecutive operating-number groups.
//   - connection.visitsAirport(code): any departure or arrival at the airport.
//   - connection.hasAirportRepeat(): revisits an airport, counting a shared transfer once.
//   - connection.commonMarketingAirlines(): sorted common marketing IATA codes.
//   - connection.layovers(): typed Incoming/Outgoing flights, with duration() and
//     sameFlightNumber() methods.
//
// Nullable database fields use pointers; test presence with has(airport.IcaoCode).
//
// Standard CEL duration('45m'), timestamp(...), and list macros remain available.
// Evaluators return abort(), yield(), proceed(LayoverWindow{Min: ..., Max: ...}),
// or yield() + proceed(...). Omitted Max is unbounded; explicit zero is preserved.

// ExpressionError reports invalid CEL evaluation separately from repository failures.
type ExpressionError struct {
	Err error
}

func (e *ExpressionError) Error() string { return e.Err.Error() }
func (e *ExpressionError) Unwrap() error { return e.Err }

type CelAirportFilter struct {
	celFilter
}

type CelConnectionEvaluator struct {
	celFilter
	flightAdapter flightAdapter
}

type celFilter struct {
	prog     cel.Program
	adapter  types.Adapter
	airlines map[string]*airline
	airports map[string]*airport
	aircraft map[string]*aircraft
}

type flightNumber struct {
	Airline *airline
	Number  int
	Suffix  string
}

type airline struct {
	IataCode string
	IcaoCode *string
	Name     string
}

type airport struct {
	IataCode     string
	IcaoCode     *string
	IataAreaCode *string
	CountryCode  string
	CityCode     string
	Type         string
	Lng          float64
	Lat          float64
	Timezone     string
	Name         string
}

type aircraft struct {
	IataCode       string
	ParentIataCode *string
	IcaoCode       *string
	Wtc            *string
	EngineCount    *int16
	EngineType     *string
	Name           string
	IsFamily       bool
}

type connection struct {
	source  Connection
	derived []*flight
	list    traits.Lister
}

func (c connection) size() int {
	if c.source != nil {
		return len(c.source)
	}
	return len(c.derived)
}

func (c connection) raw(index int) *Flight {
	if c.source != nil {
		return c.source[index]
	}
	return c.derived[index].source
}

func (c connection) flight(index int) *flight {
	if c.source != nil {
		return c.list.Get(types.Int(index)).(*flight)
	}
	return c.derived[index]
}

type connectionActivation struct {
	list   traits.Lister
	flight *flight
}

func (a *connectionActivation) ResolveName(name string) (any, bool) {
	switch name {
	case "connection":
		return a.list, true
	case "flight":
		return a.flight, true
	default:
		return nil, false
	}
}

func (*connectionActivation) Parent() cel.Activation { return nil }

type layover struct {
	Incoming *flight
	Outgoing *flight
}

func (f *flight) duration() time.Duration {
	return f.source.ArrivalTime.Sub(f.source.DepartureTime)
}

func (number flightNumber) code() string {
	return number.Airline.IataCode + strconv.Itoa(number.Number) + number.Suffix
}

func (number flightNumber) icaoCode() string {
	if number.Airline.IcaoCode == nil || *number.Airline.IcaoCode == "" {
		return ""
	}
	return *number.Airline.IcaoCode + strconv.Itoa(number.Number) + number.Suffix
}

func (c connection) duration() time.Duration {
	if c.size() == 0 {
		return 0
	}
	return c.raw(c.size() - 1).ArrivalTime.Sub(c.raw(0).DepartureTime)
}

func (c connection) flightDuration() time.Duration {
	var total time.Duration
	for index := range c.size() {
		flight := c.raw(index)
		total += flight.ArrivalTime.Sub(flight.DepartureTime)
	}
	return total
}

func (c connection) layovers() []*layover {
	count := max(0, c.size()-1)
	result := make([]*layover, count)
	if count == 0 {
		return result
	}

	values := make([]layover, count)
	incoming := c.flight(0)
	for index := range values {
		outgoing := c.flight(index + 1)
		values[index] = layover{Incoming: incoming, Outgoing: outgoing}
		result[index] = &values[index]
		incoming = outgoing
	}
	return result
}

// Count consecutive operating-flight-number groups, preserving multi-leg flights.
func (c connection) flightNumberCount() int {
	count := 0
	for index := range c.size() {
		flight := c.raw(index)
		if index == 0 || flight.FlightNumber != c.raw(index-1).FlightNumber {
			count++
		}
	}
	return count
}

func (c connection) visitsAirport(code string) bool {
	for index := range c.size() {
		flight := c.raw(index)
		if flight.DepartureAirportIataCode == code || flight.ArrivalAirportIataCode == code {
			return true
		}
	}
	return false
}

func (c connection) hasAirportRepeat() bool {
	seen := make(map[string]bool)
	for index := range c.size() {
		flight := c.raw(index)
		departure := flight.DepartureAirportIataCode
		// The arrival and following departure at a transfer are one visit.
		if index == 0 || departure != c.raw(index-1).ArrivalAirportIataCode {
			if seen[departure] {
				return true
			}
			seen[departure] = true
		}
		arrival := flight.ArrivalAirportIataCode
		if seen[arrival] {
			return true
		}
		seen[arrival] = true
	}
	return false
}

// Each leg contributes its operating airline and all codeshare marketing airlines.
// Empty input has no common marketing airlines.
func (c connection) commonMarketingAirlines() []string {
	var common map[string]bool
	for index := range c.size() {
		flight := c.raw(index)
		marketing := map[string]bool{flight.FlightNumber.AirlineIataCode: true}
		for share := range flight.CodeShares {
			marketing[share.AirlineIataCode] = true
		}
		if index == 0 {
			common = marketing
		} else {
			for code := range common {
				if !marketing[code] {
					delete(common, code)
				}
			}
		}
		if len(common) == 0 {
			break
		}
	}
	result := make([]string, 0, len(common))
	for code := range common {
		result = append(result, code)
	}
	slices.Sort(result)
	return result
}

func (l *layover) duration() time.Duration {
	return l.Outgoing.source.DepartureTime.Sub(l.Incoming.source.ArrivalTime)
}

func (l *layover) sameFlightNumber() bool {
	return l.Incoming.source.FlightNumber == l.Outgoing.source.FlightNumber
}

func NewCelAirportFilter(expression string) (*CelAirportFilter, error) {
	filter, err := newCelFilter(expression, "airport", cel.ObjectType("connections.airport"), cel.BoolType, nil, nil, nil)
	if err != nil {
		return nil, err
	}
	return &CelAirportFilter{celFilter: filter}, nil
}

func NewCelConnectionEvaluator(expression string, airlines map[string]db.Airline, airports map[string]db.Airport, aircraft map[string]db.Aircraft) (*CelConnectionEvaluator, error) {
	filter, err := newCelFilter(expression, "connection", cel.ListType(cel.ObjectType("connections.flight")), evaluationType, airlines, airports, aircraft)
	if err != nil {
		return nil, err
	}
	evaluator := &CelConnectionEvaluator{celFilter: filter}
	evaluator.flightAdapter = flightAdapter{Adapter: filter.adapter, filter: &evaluator.celFilter}
	return evaluator, nil
}

func newCelFilter(expression, variable string, variableType, resultType *cel.Type, airlines map[string]db.Airline, airports map[string]db.Airport, aircrafts map[string]db.Aircraft) (celFilter, error) {
	environment, err := filterEnvironment()
	if err != nil {
		return celFilter{}, err
	}
	variables := []cel.EnvOption{cel.Variable(variable, variableType)}
	if variable == "connection" {
		variables = append(variables, cel.Variable("flight", cel.ObjectType("connections.flight")))
	}
	environment, err = environment.Extend(variables...)
	if err != nil {
		return celFilter{}, err
	}
	ast, issues := environment.Compile(expression)
	if issues.Err() != nil {
		return celFilter{}, fmt.Errorf("compile %s expression: %w", variable, issues.Err())
	}
	if !ast.OutputType().IsExactType(resultType) {
		return celFilter{}, fmt.Errorf("%s expression must return %s, got %s", variable, resultType, ast.OutputType())
	}
	program, err := environment.Program(ast, cel.InterruptCheckFrequency(64), cel.EvalOptions(cel.OptOptimize))
	if err != nil {
		return celFilter{}, fmt.Errorf("plan %s expression: %w", variable, err)
	}

	filter := celFilter{
		prog:     program,
		adapter:  environment.CELTypeAdapter(),
		airlines: make(map[string]*airline, len(airlines)),
		airports: make(map[string]*airport, len(airports)),
		aircraft: make(map[string]*aircraft, len(aircrafts)),
	}
	for code, value := range airlines {
		filter.airlines[code] = &airline{IataCode: code, IcaoCode: nullablePointer(value.IcaoCode.String, value.IcaoCode.Valid), Name: value.Name}
	}
	for code, value := range airports {
		value.IataCode = code
		filter.airports[code] = mapAirport(value)
	}
	for code, value := range aircrafts {
		filter.aircraft[code] = &aircraft{
			IataCode:       code,
			ParentIataCode: nullablePointer(value.ParentIataCode.String, value.ParentIataCode.Valid),
			IcaoCode:       nullablePointer(value.IcaoCode.String, value.IcaoCode.Valid),
			Wtc:            nullablePointer(value.Wtc.String, value.Wtc.Valid),
			EngineCount:    nullablePointer(value.EngineCount.Int16, value.EngineCount.Valid),
			EngineType:     nullablePointer(value.EngineType.String, value.EngineType.Valid),
			Name:           value.Name,
			IsFamily:       value.IsFamily,
		}
	}
	return filter, nil
}

func (filter *CelAirportFilter) Apply(ctx context.Context, a *Airport) (bool, error) {
	result, err := filter.evaluate(ctx, "airport", map[string]any{"airport": mapAirport(a.Airport)})
	if err != nil {
		return false, err
	}
	accepted, ok := result.(types.Bool)
	if !ok {
		return false, fmt.Errorf("airport filter did not return bool")
	}
	return bool(accepted), nil
}

func mapAirport(value db.Airport) *airport {
	return &airport{
		IataCode:     value.IataCode,
		IcaoCode:     nullablePointer(value.IcaoCode.String, value.IcaoCode.Valid),
		IataAreaCode: nullablePointer(value.IataAreaCode.String, value.IataAreaCode.Valid),
		CountryCode:  value.CountryCode,
		CityCode:     value.CityCode,
		Type:         value.Type,
		Lng:          value.Lng,
		Lat:          value.Lat,
		Timezone:     value.Timezone,
		Name:         value.Name,
	}
}

func (filter *CelConnectionEvaluator) Evaluate(ctx context.Context, c Connection) (ConnectionEvaluation, error) {
	if len(c) == 0 {
		return ConnectionEvaluation{}, &ExpressionError{Err: fmt.Errorf("connection evaluation requires a nonempty candidate")}
	}
	adapter := &filter.flightAdapter
	activation := &connectionActivation{
		list:   types.NewList(adapter, []*Flight(c)),
		flight: &flight{source: c[len(c)-1], adapter: adapter},
	}
	result, err := filter.evaluate(ctx, "connection", activation)
	if err != nil {
		return ConnectionEvaluation{}, err
	}
	evaluation, ok := result.(*celEvaluation)
	if !ok {
		return ConnectionEvaluation{}, &ExpressionError{Err: fmt.Errorf("connection evaluator did not return an evaluation")}
	}
	return evaluation.value, nil
}

func (filter *celFilter) evaluate(ctx context.Context, variable string, variables any) (ref.Val, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	result, _, err := filter.prog.ContextEval(ctx, variables)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, &ExpressionError{Err: fmt.Errorf("evaluate %s expression: %w", variable, err)}
	}
	return result, nil
}

func (filter *celFilter) mapFlightNumber(number db.FlightNumber) flightNumber {
	value := filter.airlines[number.AirlineIataCode]
	if value == nil {
		value = &airline{IataCode: number.AirlineIataCode}
	}
	return flightNumber{Airline: value, Number: number.Number, Suffix: number.Suffix}
}

func (filter *celFilter) findAirport(code string) *airport {
	if value := filter.airports[code]; value != nil {
		return value
	}
	return &airport{IataCode: code}
}

func (filter *celFilter) findAircraft(code string) *aircraft {
	if value := filter.aircraft[code]; value != nil {
		return value
	}
	return &aircraft{IataCode: code}
}

func filterEnvironment() (*cel.Env, error) {
	environment, err := cel.NewEnv(
		ext.NativeTypes(reflect.TypeFor[flight](), reflect.TypeFor[layover](),
			reflect.TypeFor[flightNumber](), reflect.TypeFor[airport](), reflect.TypeFor[aircraft](),
			types.NativeTypeFor[LayoverWindow](types.ParseStructField(func(field reflect.StructField) string {
				switch field.Name {
				case "MinLayover":
					return "Min"
				case "MaxLayover":
					return "Max"
				default:
					return field.Name
				}
			}))),
		ext.Lists(),
		ext.Bindings(),
		ext.Strings(),
	)
	if err != nil {
		return nil, err
	}
	environment, err = environment.Extend(evaluationEnvironment()...)
	if err != nil {
		return nil, err
	}
	environment, err = environment.Extend(cel.CustomTypeProvider(&celTypeProvider{
		Provider: environment.CELTypeProvider(), adapter: environment.CELTypeAdapter(),
	}))
	if err != nil {
		return nil, err
	}
	adapter := environment.CELTypeAdapter()
	flightType := cel.ObjectType("connections.flight")
	connectionType := cel.ListType(cel.ObjectType("connections.flight"))
	numberType := cel.ObjectType("connections.flightNumber")
	layoverType := cel.ObjectType("connections.layover")
	return environment.Extend(
		cel.Function("duration",
			cel.MemberOverload("flight_duration", []*cel.Type{flightType}, cel.DurationType,
				cel.UnaryBinding(func(value ref.Val) ref.Val {
					return types.Duration{Duration: value.Value().(*flight).duration()}
				})),
			cel.MemberOverload("connection_duration", []*cel.Type{connectionType}, cel.DurationType,
				connectionBinding(func(flights connection) ref.Val {
					return types.Duration{Duration: flights.duration()}
				})),
			cel.MemberOverload("layover_duration", []*cel.Type{layoverType}, cel.DurationType,
				cel.UnaryBinding(func(value ref.Val) ref.Val {
					return types.Duration{Duration: value.Value().(*layover).duration()}
				})),
		),
		cel.Function("first", cel.MemberOverload("connection_first", []*cel.Type{connectionType}, flightType,
			connectionBinding(func(flights connection) ref.Val {
				if flights.size() == 0 {
					return types.NewErr("first() requires a nonempty connection")
				}
				return flights.flight(0)
			}))),
		cel.Function("last", cel.MemberOverload("connection_last", []*cel.Type{connectionType}, flightType,
			connectionBinding(func(flights connection) ref.Val {
				if flights.size() == 0 {
					return types.NewErr("last() requires a nonempty connection")
				}
				return flights.flight(flights.size() - 1)
			}))),
		cel.Function("flightDuration", cel.MemberOverload("connection_flight_duration", []*cel.Type{connectionType}, cel.DurationType,
			connectionBinding(func(flights connection) ref.Val {
				return types.Duration{Duration: flights.flightDuration()}
			}))),
		cel.Function("layovers", cel.MemberOverload("connection_layovers", []*cel.Type{connectionType}, cel.ListType(layoverType),
			connectionBinding(func(flights connection) ref.Val {
				return adapter.NativeToValue(flights.layovers())
			}))),
		cel.Function("flightNumberCount", cel.MemberOverload("connection_flight_number_count", []*cel.Type{connectionType}, cel.IntType,
			connectionBinding(func(flights connection) ref.Val {
				return types.Int(flights.flightNumberCount())
			}))),
		cel.Function("visitsAirport", cel.MemberOverload("connection_visits_airport", []*cel.Type{connectionType, cel.StringType}, cel.BoolType,
			cel.BinaryBinding(func(value, code ref.Val) ref.Val {
				flights, err := asConnection(value)
				if err != nil {
					return types.NewErr("flight list: %v", err)
				}
				return types.Bool(flights.visitsAirport(string(code.(types.String))))
			}))),
		cel.Function("hasAirportRepeat", cel.MemberOverload("connection_has_airport_repeat", []*cel.Type{connectionType}, cel.BoolType,
			connectionBinding(func(flights connection) ref.Val {
				return types.Bool(flights.hasAirportRepeat())
			}))),
		cel.Function("commonMarketingAirlines", cel.MemberOverload("connection_common_marketing_airlines", []*cel.Type{connectionType}, cel.ListType(cel.StringType),
			connectionBinding(func(flights connection) ref.Val {
				return adapter.NativeToValue(flights.commonMarketingAirlines())
			}))),
		cel.Function("sameFlightNumber", cel.MemberOverload("layover_same_flight_number", []*cel.Type{layoverType}, cel.BoolType,
			cel.UnaryBinding(func(value ref.Val) ref.Val {
				return types.Bool(value.Value().(*layover).sameFlightNumber())
			}))),
		cel.Function("code", cel.MemberOverload("flight_number_code", []*cel.Type{numberType}, cel.StringType,
			cel.UnaryBinding(func(value ref.Val) ref.Val {
				number, err := value.ConvertToNative(reflect.TypeFor[flightNumber]())
				if err != nil {
					return types.NewErr("flight number: %v", err)
				}
				return types.String(number.(flightNumber).code())
			}))),
		cel.Function("icaoCode", cel.MemberOverload("flight_number_icao_code", []*cel.Type{numberType}, cel.StringType,
			cel.UnaryBinding(func(value ref.Val) ref.Val {
				number, err := value.ConvertToNative(reflect.TypeFor[flightNumber]())
				if err != nil {
					return types.NewErr("flight number: %v", err)
				}
				return types.String(number.(flightNumber).icaoCode())
			}))),
	)
}

func nullablePointer[T any](value T, valid bool) *T {
	if !valid {
		return nil
	}
	return &value
}

func asConnection(value ref.Val) (connection, error) {
	if source, ok := value.Value().([]*Flight); ok {
		return connection{source: source, list: value.(traits.Lister)}, nil
	}
	// Slices, concatenations, and macro-produced lists can have different backing types.
	flights, err := value.ConvertToNative(reflect.TypeFor[[]*flight]())
	if err != nil {
		return connection{}, err
	}
	return connection{derived: flights.([]*flight)}, nil
}

func connectionBinding(function func(connection) ref.Val) cel.OverloadOpt {
	return cel.UnaryBinding(func(value ref.Val) ref.Val {
		flights, err := asConnection(value)
		if err != nil {
			return types.NewErr("flight list: %v", err)
		}
		return function(flights)
	})
}
