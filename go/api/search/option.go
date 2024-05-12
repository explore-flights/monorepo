package search

import (
	"github.com/explore-flights/monorepo/go/common"
	"path"
	"slices"
)

type ConnectionOption interface {
	Matches(f *common.Flight) bool
}

type WithIncludeAircraft []string

func (a WithIncludeAircraft) Matches(f *common.Flight) bool {
	return slices.Contains(a, f.AircraftType)
}

type WithExcludeAircraft []string

func (a WithExcludeAircraft) Matches(f *common.Flight) bool {
	return !slices.Contains(a, f.AircraftType)
}

type WithIncludeAircraftGlob []string

func (a WithIncludeAircraftGlob) Matches(f *common.Flight) bool {
	return slices.ContainsFunc(a, func(s string) bool {
		return globMatch(f.AircraftType, s)
	})
}

type WithExcludeAircraftGlob []string

func (a WithExcludeAircraftGlob) Matches(f *common.Flight) bool {
	return !WithIncludeAircraftGlob(a).Matches(f)
}

type WithIncludeAirport []string

func (a WithIncludeAirport) Matches(f *common.Flight) bool {
	return slices.Contains(a, f.DepartureAirport) && slices.Contains(a, f.ArrivalAirport)
}

type WithExcludeAirport []string

func (a WithExcludeAirport) Matches(f *common.Flight) bool {
	return !slices.Contains(a, f.DepartureAirport) && !slices.Contains(a, f.ArrivalAirport)
}

type WithIncludeAirportGlob []string

func (a WithIncludeAirportGlob) Matches(f *common.Flight) bool {
	return slices.ContainsFunc(a, func(s string) bool {
		return globMatch(f.DepartureAirport, s) && globMatch(f.ArrivalAirport, s)
	})
}

type WithExcludeAirportGlob []string

func (a WithExcludeAirportGlob) Matches(f *common.Flight) bool {
	return !WithIncludeAirportGlob(a).Matches(f)
}

type WithIncludeFlightNumber []string

func (a WithIncludeFlightNumber) Matches(f *common.Flight) bool {
	return slices.Contains(a, f.Number().String())
}

type WithExcludeFlightNumber []string

func (a WithExcludeFlightNumber) Matches(f *common.Flight) bool {
	return !slices.Contains(a, f.Number().String())
}

type WithIncludeFlightNumberGlob []string

func (a WithIncludeFlightNumberGlob) Matches(f *common.Flight) bool {
	v := f.Number().String()
	return slices.ContainsFunc(a, func(s string) bool {
		return globMatch(v, s)
	})
}

type WithExcludeFlightNumberGlob []string

func (a WithExcludeFlightNumberGlob) Matches(f *common.Flight) bool {
	return !WithIncludeFlightNumberGlob(a).Matches(f)
}

func globMatch(v, pattern string) bool {
	match, err := path.Match(pattern, v)
	return err == nil && match
}
