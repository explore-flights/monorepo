package connections

import (
	"fmt"
	"reflect"
	"slices"
	"strings"

	"cel.dev/cel-go/common/types"
	"cel.dev/cel-go/common/types/ref"
	"cel.dev/cel-go/common/types/traits"
)

// flight is a read-only CEL view. Fields are resolved only when an expression
// accesses them; the underlying flight and metadata catalogs remain unchanged.
type flight struct {
	source  *Flight
	adapter *flightAdapter
}

type flightAdapter struct {
	types.Adapter
	filter *celFilter
}

func (a *flightAdapter) NativeToValue(value any) ref.Val {
	if source, ok := value.(*Flight); ok {
		return &flight{source: source, adapter: a}
	}
	return a.Adapter.NativeToValue(value)
}

var flightValueType = types.NewObjectType("connections.flight", traits.IndexerType, traits.FieldTesterType)

var flightFields = map[string]*types.Type{
	"FlightNumber":                 types.NewObjectType("connections.flightNumber"),
	"DepartureTime":                types.TimestampType,
	"DepartureAirport":             types.NewObjectType("connections.airport"),
	"ArrivalTime":                  types.TimestampType,
	"ArrivalAirport":               types.NewObjectType("connections.airport"),
	"ServiceType":                  types.StringType,
	"AircraftOwner":                types.StringType,
	"Aircraft":                     types.NewObjectType("connections.aircraft"),
	"SeatsFirst":                   types.IntType,
	"SeatsBusiness":                types.IntType,
	"SeatsPremium":                 types.IntType,
	"SeatsEconomy":                 types.IntType,
	"AircraftConfigurationVersion": types.StringType,
	"CodeShares":                   types.NewListType(types.NewObjectType("connections.flightNumber")),
	"DataElements":                 types.NewMapType(types.IntType, types.StringType),
}

func (f *flight) field(name string) (any, error) {
	filter := f.adapter.filter
	switch name {
	case "FlightNumber":
		return filter.mapFlightNumber(f.source.FlightNumber), nil
	case "DepartureTime":
		return f.source.DepartureTime, nil
	case "DepartureAirport":
		return filter.findAirport(f.source.DepartureAirportIataCode), nil
	case "ArrivalTime":
		return f.source.ArrivalTime, nil
	case "ArrivalAirport":
		return filter.findAirport(f.source.ArrivalAirportIataCode), nil
	case "ServiceType":
		return f.source.ServiceType, nil
	case "AircraftOwner":
		return f.source.AircraftOwner, nil
	case "Aircraft":
		return filter.findAircraft(f.source.AircraftIataCode), nil
	case "SeatsFirst":
		return f.source.SeatsFirst, nil
	case "SeatsBusiness":
		return f.source.SeatsBusiness, nil
	case "SeatsPremium":
		return f.source.SeatsPremium, nil
	case "SeatsEconomy":
		return f.source.SeatsEconomy, nil
	case "AircraftConfigurationVersion":
		return f.source.AircraftConfigurationVersion, nil
	case "CodeShares":
		shares := make([]flightNumber, 0, len(f.source.CodeShares))
		for number := range f.source.CodeShares {
			shares = append(shares, filter.mapFlightNumber(number))
		}
		slices.SortFunc(shares, func(a, b flightNumber) int { return strings.Compare(a.code(), b.code()) })
		return shares, nil
	case "DataElements":
		return f.source.DataElements, nil
	default:
		return nil, fmt.Errorf("no such flight field: %s", name)
	}
}

func (f *flight) Type() ref.Type { return flightValueType }
func (f *flight) Value() any     { return f }

func (f *flight) ConvertToNative(t reflect.Type) (any, error) {
	if t == reflect.TypeFor[*flight]() {
		return f, nil
	}
	return nil, fmt.Errorf("cannot convert flight to %v", t)
}

func (f *flight) ConvertToType(t ref.Type) ref.Val {
	if t.TypeName() == flightValueType.TypeName() {
		return f
	}
	if t == types.TypeType {
		return flightValueType
	}
	return types.NewErr("cannot convert flight to %v", t)
}

func (f *flight) Equal(other ref.Val) ref.Val {
	right, ok := other.(*flight)
	return types.Bool(ok && f.source == right.source)
}

func (f *flight) Get(key ref.Val) ref.Val {
	name, ok := key.(types.String)
	if !ok {
		return types.MaybeNoSuchOverloadErr(key)
	}
	value, err := f.field(string(name))
	if err != nil {
		return types.NewErr("%v", err)
	}
	return f.adapter.NativeToValue(value)
}

func (f *flight) IsSet(key ref.Val) ref.Val {
	name, ok := key.(types.String)
	if !ok {
		return types.MaybeNoSuchOverloadErr(key)
	}
	// These non-nullable collections are present even when empty. Testing
	// presence must not build or sort the codeshare list.
	if name == "CodeShares" || name == "DataElements" {
		return types.True
	}
	value, err := f.field(string(name))
	if err != nil {
		return types.NewErr("%v", err)
	}
	return types.Bool(!reflect.ValueOf(value).IsZero())
}

// The provider keeps field checking typed without making the flight view copy
// those fields. Runtime getters share the same lazy access as list macros.
func (p *celTypeProvider) FindStructFieldNames(name string) ([]string, bool) {
	if name != flightValueType.TypeName() {
		return p.Provider.FindStructFieldNames(name)
	}
	names := make([]string, 0, len(flightFields))
	for name := range flightFields {
		names = append(names, name)
	}
	slices.Sort(names)
	return names, true
}

func (p *celTypeProvider) FindStructFieldType(name, field string) (*types.FieldType, bool) {
	if name != flightValueType.TypeName() {
		return p.Provider.FindStructFieldType(name, field)
	}
	t, ok := flightFields[field]
	if !ok {
		return nil, false
	}
	return &types.FieldType{
		Type:    t,
		GetFrom: func(value any) (any, error) { return value.(*flight).field(field) },
		IsSet:   func(value any) bool { return value.(*flight).IsSet(types.String(field)) == types.True },
	}, true
}
