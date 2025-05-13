package search

import (
	"github.com/gofrs/uuid/v5"
	"slices"
)

type ConnectionSearchOption interface {
	Apply(f *Options)
}

type WithCountMultiLeg bool

func (a WithCountMultiLeg) Apply(f *Options) {
	f.countMultiLeg = bool(a)
}

type WithIncludeAircraft uuid.UUID

func (a WithIncludeAircraft) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return f.AircraftId == uuid.UUID(a)
	})
}

type WithExcludeAircraft []uuid.UUID

func (a WithExcludeAircraft) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.Contains(a, f.AircraftId)
	})
}

type WithIncludeAircraftGlob string

func (a WithIncludeAircraftGlob) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.globMatchAircraft(f.AircraftId, string(a))
	})
}

type WithExcludeAircraftGlob []string

func (a WithExcludeAircraftGlob) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.globMatchAircraft(f.AircraftId, s)
		})
	})
}

type WithIncludeAirport uuid.UUID

func (a WithIncludeAirport) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return f.DepartureAirportId == uuid.UUID(a) || f.ArrivalAirportId == uuid.UUID(a)
	})
}

type WithExcludeAirport []uuid.UUID

func (a WithExcludeAirport) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.Contains(a, f.DepartureAirportId) && !slices.Contains(a, f.ArrivalAirportId)
	})
}

type WithIncludeAirportGlob string

func (a WithIncludeAirportGlob) Apply(f *Options) {
	f.any = append(f.any, func(pctx *predicateContext, f *Flight) bool {
		return pctx.globMatchAirport(f.DepartureAirportId, string(a)) || pctx.globMatchAirport(f.ArrivalAirportId, string(a))
	})
}

type WithExcludeAirportGlob []string

func (a WithExcludeAirportGlob) Apply(f *Options) {
	f.all = append(f.all, func(pctx *predicateContext, f *Flight) bool {
		return !slices.ContainsFunc(a, func(s string) bool {
			return pctx.globMatchAirport(f.DepartureAirportId, s) || pctx.globMatchAirport(f.ArrivalAirportId, s)
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
