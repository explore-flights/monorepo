package search

import (
	"path"
	"slices"
)

type ConnectionSearchOption interface {
	Apply(f *Options)
}

type WithCountMultiLeg bool

func (a WithCountMultiLeg) Apply(f *Options) {
	f.countMultiLeg = bool(a)
}

type WithIncludeAircraft string

func (a WithIncludeAircraft) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		code, ok := f.IataAircraftType()
		return ok && code == string(a)
	})
}

type WithExcludeAircraft []string

func (a WithExcludeAircraft) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		code, ok := f.IataAircraftType()
		return ok && !slices.Contains(a, code)
	})
}

type WithIncludeAircraftGlob string

func (a WithIncludeAircraftGlob) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		code, ok := f.IataAircraftType()
		return ok && globMatch(code, string(a))
	})
}

type WithExcludeAircraftGlob []string

func (a WithExcludeAircraftGlob) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		code, ok := f.IataAircraftType()
		return ok && !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(code, s)
		})
	})
}

type WithIncludeAirport string

func (a WithIncludeAirport) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		depCode, depOk := f.IataDepartureAirport()
		arrCode, arrOk := f.IataArrivalAirport()
		return (depOk && depCode == string(a)) || (arrOk && arrCode == string(a))
	})
}

type WithExcludeAirport []string

func (a WithExcludeAirport) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		depCode, depOk := f.IataDepartureAirport()
		arrCode, arrOk := f.IataArrivalAirport()
		return depOk && !slices.Contains(a, depCode) && arrOk && !slices.Contains(a, arrCode)
	})
}

type WithIncludeAirportGlob string

func (a WithIncludeAirportGlob) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		depCode, depOk := f.IataDepartureAirport()
		arrCode, arrOk := f.IataArrivalAirport()
		return (depOk && globMatch(depCode, string(a))) || (arrOk && globMatch(arrCode, string(a)))
	})
}

type WithExcludeAirportGlob []string

func (a WithExcludeAirportGlob) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		depCode, depOk := f.IataDepartureAirport()
		arrCode, arrOk := f.IataArrivalAirport()

		return depOk && arrOk && !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(depCode, s) && globMatch(arrCode, s)
		})
	})
}

type WithIncludeFlightNumber string

func (a WithIncludeFlightNumber) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		v, ok := f.IataNumber()
		return ok && v == string(a)
	})
}

type WithExcludeFlightNumber []string

func (a WithExcludeFlightNumber) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		v, ok := f.IataNumber()
		return ok && !slices.Contains(a, v)
	})
}

type WithIncludeFlightNumberGlob string

func (a WithIncludeFlightNumberGlob) Apply(f *Options) {
	f.any = append(f.any, func(f *Flight) bool {
		v, ok := f.IataNumber()
		return ok && globMatch(v, string(a))
	})
}

type WithExcludeFlightNumberGlob []string

func (a WithExcludeFlightNumberGlob) Apply(f *Options) {
	f.all = append(f.all, func(f *Flight) bool {
		v, ok := f.IataNumber()
		return ok && !slices.ContainsFunc(a, func(s string) bool {
			return globMatch(v, s)
		})
	})
}

func globMatch(v, pattern string) bool {
	match, _ := path.Match(pattern, v)
	return match
}
