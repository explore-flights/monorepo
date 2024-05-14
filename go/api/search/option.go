package search

import (
	"github.com/explore-flights/monorepo/go/common"
	"path"
	"slices"
)

type FilterOption interface {
	Apply(f *Filters)
}

type WithIncludeAircraft string

func (a WithIncludeAircraft) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return f.AircraftType == string(a)
	})
}

type WithExcludeAircraft []string

func (a WithExcludeAircraft) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		return !slices.Contains(a, f.AircraftType)
	})
}

type WithIncludeAircraftGlob string

func (a WithIncludeAircraftGlob) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return globMatch(f.AircraftType, string(a))
	})
}

type WithExcludeAircraftGlob []string

func (a WithExcludeAircraftGlob) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(f.AircraftType, s)
		})
	})
}

type WithIncludeAirport string

func (a WithIncludeAirport) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return f.DepartureAirport == string(a) || f.ArrivalAirport == string(a)
	})
}

type WithExcludeAirport []string

func (a WithExcludeAirport) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		return !slices.Contains(a, f.DepartureAirport) && !slices.Contains(a, f.ArrivalAirport)
	})
}

type WithIncludeAirportGlob string

func (a WithIncludeAirportGlob) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return globMatch(f.DepartureAirport, string(a)) || globMatch(f.ArrivalAirport, string(a))
	})
}

type WithExcludeAirportGlob []string

func (a WithExcludeAirportGlob) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(f.DepartureAirport, s) && globMatch(f.ArrivalAirport, s)
		})
	})
}

type WithIncludeFlightNumber string

func (a WithIncludeFlightNumber) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return f.Number().String() == string(a)
	})
}

type WithExcludeFlightNumber []string

func (a WithExcludeFlightNumber) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		return !slices.Contains(a, f.Number().String())
	})
}

type WithIncludeFlightNumberGlob string

func (a WithIncludeFlightNumberGlob) Apply(f *Filters) {
	f.any = append(f.any, func(f *common.Flight) bool {
		return globMatch(f.Number().String(), string(a))
	})
}

type WithExcludeFlightNumberGlob []string

func (a WithExcludeFlightNumberGlob) Apply(f *Filters) {
	f.all = append(f.all, func(f *common.Flight) bool {
		v := f.Number().String()
		return !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(v, s)
		})
	})
}

func globMatch(v, pattern string) bool {
	match, _ := path.Match(pattern, v)
	return match
}
