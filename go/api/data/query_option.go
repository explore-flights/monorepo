package data

import (
	"errors"
	"github.com/explore-flights/monorepo/go/common"
	"maps"
	"time"
)

type QueryScheduleOption func(*querySchedulesOptions) error

type schedulePredicate func(fs *common.FlightSchedule) bool
type variantPredicate func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool

type querySchedulesOptions struct {
	airlines           common.Set[common.AirlineIdentifier]
	schedulePredicates []schedulePredicate
	variantPredicates  []variantPredicate
}

func (o *querySchedulesOptions) apply(opts ...QueryScheduleOption) error {
	o.airlines = make(common.Set[common.AirlineIdentifier])

	var err error
	for _, opt := range opts {
		err = errors.Join(err, opt(o))
	}

	return err
}

func (o *querySchedulesOptions) and(opts []querySchedulesOptions) error {
	var err error
	for _, child := range opts {
		if len(child.airlines) > 0 {
			err = errors.Join(err, errors.New("cannot use airline filter in AND clauses"))
		}

		o.schedulePredicates = append(o.schedulePredicates, child.schedulePredicates...)
		o.variantPredicates = append(o.variantPredicates, child.variantPredicates...)
	}

	return err
}

func (o *querySchedulesOptions) or(opts []querySchedulesOptions) error {
	var err error
	fsPredicates := make([]schedulePredicate, 0)
	fsvPredicates := make([]variantPredicate, 0)

	for _, child := range opts {
		if len(child.schedulePredicates) > 0 && len(child.variantPredicates) > 0 {
			err = errors.Join(err, errors.New("cannot use both schedule and variant filters in OR clauses"))
		}

		maps.Copy(o.airlines, child.airlines)

		if len(child.schedulePredicates) > 0 {
			fsPredicates = append(fsPredicates, child.testSchedule)
		}

		if len(child.variantPredicates) > 0 {
			fsvPredicates = append(fsvPredicates, child.testVariant)
		}
	}

	if len(fsPredicates) > 0 {
		o.schedulePredicates = append(o.schedulePredicates, func(fs *common.FlightSchedule) bool {
			for _, p := range fsPredicates {
				if p(fs) {
					return true
				}
			}

			return false
		})
	}

	if len(fsvPredicates) > 0 {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			for _, p := range fsvPredicates {
				if p(fs, fsv) {
					return true
				}
			}

			return false
		})
	}

	return err
}

func (o *querySchedulesOptions) testSchedule(fs *common.FlightSchedule) bool {
	for _, p := range o.schedulePredicates {
		if !p(fs) {
			return false
		}
	}

	return true
}

func (o *querySchedulesOptions) testVariant(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
	for _, p := range o.variantPredicates {
		if !p(fs, fsv) {
			return false
		}
	}

	return true
}

func WithAirlines(airlines ...common.AirlineIdentifier) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		for _, airline := range airlines {
			o.airlines[airline] = struct{}{}
		}

		return nil
	}
}

func WithFlightNumber(fn common.FlightNumber) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.airlines = make(common.Set[common.AirlineIdentifier])
		o.airlines[fn.Airline] = struct{}{}

		o.schedulePredicates = append(o.schedulePredicates, func(fs *common.FlightSchedule) bool {
			return fs.Number() == fn
		})

		return nil
	}
}

func WithServiceType(serviceType string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fsv.Data.ServiceType == serviceType
		})

		return nil
	}
}

func WithAircraftType(aircraftType string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fsv.Data.AircraftType == aircraftType
		})

		return nil
	}
}

func WithAircraftConfigurationVersion(aircraftConfigurationVersion string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fsv.Data.AircraftConfigurationVersion == aircraftConfigurationVersion
		})

		return nil
	}
}

func WithDepartureAirport(airport string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fsv.Data.DepartureAirport == airport
		})

		return nil
	}
}

func WithArrivalAirport(airport string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fsv.Data.ArrivalAirport == airport
		})

		return nil
	}
}

func WithIgnoreCodeShares() QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			return fs.Number() == fsv.Data.OperatedAs
		})

		return nil
	}
}

func WithMinDepartureTime(minDepartureTime time.Time) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			if cnt, span := fsv.Ranges.Span(); cnt > 0 {
				return fsv.DepartureTime(span[1]).After(minDepartureTime)
			}

			return false
		})

		return nil
	}
}

func WithMaxDepartureTime(maxDepartureTime time.Time) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantPredicates = append(o.variantPredicates, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) bool {
			if cnt, span := fsv.Ranges.Span(); cnt > 0 {
				return fsv.DepartureTime(span[0]).Before(maxDepartureTime)
			}

			return false
		})

		return nil
	}
}

func WithAll(opts ...QueryScheduleOption) QueryScheduleOption {
	if len(opts) == 1 {
		return opts[0]
	}

	return func(o *querySchedulesOptions) error {
		var err error
		childs := make([]querySchedulesOptions, len(opts))

		for i, opt := range opts {
			err = errors.Join(err, childs[i].apply(opt))
		}

		return errors.Join(err, o.and(childs))
	}
}

func WithAny(opts ...QueryScheduleOption) QueryScheduleOption {
	if len(opts) == 1 {
		return opts[0]
	}

	return func(o *querySchedulesOptions) error {
		var err error
		childs := make([]querySchedulesOptions, len(opts))

		for i, opt := range opts {
			err = errors.Join(err, childs[i].apply(opt))
		}

		return errors.Join(err, o.or(childs))
	}
}
