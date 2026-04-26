package connections

import (
	"slices"
)

type SearchOption interface {
	Apply(f *Options)
}

type WithCountMultiLeg bool

func (a WithCountMultiLeg) Apply(f *Options) {
	f.countMultiLeg = bool(a)
}

type WithIncludeAircraft string

func (a WithIncludeAircraft) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return f.AircraftIataCode == string(a)
	})
}

type WithExcludeAircraft []string

func (a WithExcludeAircraft) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.Contains(a, f.AircraftIataCode)
	})
}

type WithIncludeAircraftGlob string

func (a WithIncludeAircraftGlob) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.globMatchAircraft(f.AircraftIataCode, string(a))
	})
}

type WithExcludeAircraftGlob []string

func (a WithExcludeAircraftGlob) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.globMatchAircraft(f.AircraftIataCode, s)
		})
	})
}

type WithIncludeAirport string

func (a WithIncludeAirport) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return f.DepartureAirportIataCode == string(a) || f.ArrivalAirportIataCode == string(a)
	})
}

type WithExcludeAirport []string

func (a WithExcludeAirport) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.Contains(a, f.DepartureAirportIataCode) && !slices.Contains(a, f.ArrivalAirportIataCode)
	})
}

type WithIncludeAirportGlob string

func (a WithIncludeAirportGlob) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.globMatchAirport(f.DepartureAirportIataCode, string(a)) || pctx.globMatchAirport(f.ArrivalAirportIataCode, string(a))
	})
}

type WithExcludeAirportGlob []string

func (a WithExcludeAirportGlob) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.globMatchAirport(f.DepartureAirportIataCode, s) || pctx.globMatchAirport(f.ArrivalAirportIataCode, s)
		})
	})
}

type WithIncludeFlightNumber string

func (a WithIncludeFlightNumber) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.anyMatchFlightNumber(f, func(fn string) bool {
			return fn == string(a)
		})
	})
}

type WithExcludeFlightNumber []string

func (a WithExcludeFlightNumber) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.anyMatchFlightNumber(f, func(fn string) bool {
				return fn == s
			})
		})
	})
}

type WithIncludeFlightNumberGlob string

func (a WithIncludeFlightNumberGlob) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.anyMatchFlightNumber(f, func(fn string) bool {
			return pctx.globMatch(fn, string(a))
		})
	})
}

type WithExcludeFlightNumberGlob []string

func (a WithExcludeFlightNumberGlob) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.anyMatchFlightNumber(f, func(fn string) bool {
				return pctx.globMatch(fn, s)
			})
		})
	})
}
