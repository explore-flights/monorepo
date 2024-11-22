package data

import (
	"errors"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"maps"
	"time"
)

type QueryScheduleOption func(*querySchedulesOptions) error

type scheduleVisitor func(fs *common.FlightSchedule) (*common.FlightSchedule, bool)
type variantVisitor func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool)

type querySchedulesOptions struct {
	airlines         common.Set[common.AirlineIdentifier]
	scheduleVisitors []scheduleVisitor
	variantVisitors  []variantVisitor
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

		o.scheduleVisitors = append(o.scheduleVisitors, child.scheduleVisitors...)
		o.variantVisitors = append(o.variantVisitors, child.variantVisitors...)
	}

	return err
}

func (o *querySchedulesOptions) or(opts []querySchedulesOptions) error {
	var err error
	fsVisitors := make([]scheduleVisitor, 0)
	fsvVisitors := make([]variantVisitor, 0)

	for _, child := range opts {
		if len(child.scheduleVisitors) > 0 && len(child.variantVisitors) > 0 {
			err = errors.Join(err, errors.New("cannot use both schedule and variant filters in OR clauses"))
		}

		maps.Copy(o.airlines, child.airlines)

		if len(child.scheduleVisitors) > 0 {
			fsVisitors = append(fsVisitors, child.visitSchedule)
		}

		if len(child.variantVisitors) > 0 {
			fsvVisitors = append(fsvVisitors, child.visitVariant)
		}
	}

	if len(fsVisitors) > 0 {
		o.scheduleVisitors = append(o.scheduleVisitors, func(fs *common.FlightSchedule) (*common.FlightSchedule, bool) {
			for _, p := range fsVisitors {
				if modFs, ok := p(fs); ok {
					return modFs, true
				}
			}

			return fs, false
		})
	}

	if len(fsvVisitors) > 0 {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			for _, p := range fsvVisitors {
				if modFsv, ok := p(fs, fsv); ok {
					return modFsv, true
				}
			}

			return fsv, false
		})
	}

	return err
}

func (o *querySchedulesOptions) visitSchedule(fs *common.FlightSchedule) (*common.FlightSchedule, bool) {
	for _, p := range o.scheduleVisitors {
		if modFs, ok := p(fs); !ok {
			return fs, false
		} else {
			fs = modFs
		}
	}

	return fs, true
}

func (o *querySchedulesOptions) visitVariant(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
	for _, p := range o.variantVisitors {
		if modFsv, ok := p(fs, fsv); !ok {
			return fsv, false
		} else {
			fsv = modFsv
		}
	}

	return fsv, true
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

		o.scheduleVisitors = append(o.scheduleVisitors, func(fs *common.FlightSchedule) (*common.FlightSchedule, bool) {
			return fs, fs.Number() == fn
		})

		return nil
	}
}

func WithServiceType(serviceType string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fsv.Data.ServiceType == serviceType
		})

		return nil
	}
}

func WithAircraftType(aircraftType string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fsv.Data.AircraftType == aircraftType
		})

		return nil
	}
}

func WithAircraftConfigurationVersion(aircraftConfigurationVersion string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fsv.Data.AircraftConfigurationVersion == aircraftConfigurationVersion
		})

		return nil
	}
}

func WithDepartureAirport(airport string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fsv.Data.DepartureAirport == airport
		})

		return nil
	}
}

func WithArrivalAirport(airport string) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fsv.Data.ArrivalAirport == airport
		})

		return nil
	}
}

func WithIgnoreCodeShares() QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			return fsv, fs.Number() == fsv.Data.OperatedAs
		})

		return nil
	}
}

func WithMinDepartureTime(minDepartureTime time.Time) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			subRanges := fsv.Ranges.RemoveAll(func(d xtime.LocalDate) bool {
				return fsv.DepartureTime(d).Before(minDepartureTime)
			})

			if subRanges.Empty() {
				return fsv, false
			}

			fsv = fsv.Clone(false)
			fsv.Ranges = subRanges
			return fsv, true
		})

		return nil
	}
}

func WithMaxDepartureTime(maxDepartureTime time.Time) QueryScheduleOption {
	return func(o *querySchedulesOptions) error {
		o.variantVisitors = append(o.variantVisitors, func(fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) (*common.FlightScheduleVariant, bool) {
			subRanges := fsv.Ranges.RemoveAll(func(d xtime.LocalDate) bool {
				return fsv.DepartureTime(d).After(maxDepartureTime)
			})

			if subRanges.Empty() {
				return fsv, false
			}

			fsv = fsv.Clone(false)
			fsv.Ranges = subRanges
			return fsv, true
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
