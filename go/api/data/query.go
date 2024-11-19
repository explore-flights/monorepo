package data

import (
	"context"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"iter"
	"maps"
	"slices"
)

func (h *Handler) QuerySchedules(ctx context.Context, opts ...QueryScheduleOption) (map[common.FlightNumber][]RouteAndRange, error) {
	var o querySchedulesOptions
	if err := o.apply(opts...); err != nil {
		return nil, err
	}

	var airlineSeq iter.Seq[common.AirlineIdentifier]
	var airlineCount int

	if len(o.airlines) < 1 {
		airlines, err := h.Airlines(ctx, "")
		if err != nil {
			return nil, err
		}

		airlineSeq = xiter.All(airlines)
		airlineCount = len(airlines)
	} else {
		airlineSeq = maps.Keys(o.airlines)
		airlineCount = len(o.airlines)
	}

	accumulate := func(acc map[common.FlightNumber][]RouteAndRange, fn common.FlightNumber, rr RouteAndRange) {
		if existingRRs, ok := acc[fn]; ok {
			idx := slices.IndexFunc(existingRRs, func(existingRR RouteAndRange) bool {
				return existingRR.DepartureAirport == rr.DepartureAirport && existingRR.ArrivalAirport == rr.ArrivalAirport
			})

			if idx == -1 {
				acc[fn] = append(acc[fn], rr)
			} else {
				existingRRs[idx].Range[0] = min(existingRRs[idx].Range[0], rr.Range[0])
				existingRRs[idx].Range[1] = max(existingRRs[idx].Range[1], rr.Range[1])
			}
		} else {
			acc[fn] = append(acc[fn], rr)
		}
	}

	wg := concurrent.WorkGroup[common.AirlineIdentifier, map[common.FlightNumber][]RouteAndRange, map[common.FlightNumber][]RouteAndRange]{
		Parallelism: min(uint(airlineCount), 10),
		Worker: func(ctx context.Context, airline common.AirlineIdentifier, acc map[common.FlightNumber][]RouteAndRange) (map[common.FlightNumber][]RouteAndRange, error) {
			if acc == nil {
				acc = make(map[common.FlightNumber][]RouteAndRange)
			}

			return acc, h.flightSchedulesStream(ctx, airline, func(seq iter.Seq2[string, *onceIter[*common.FlightSchedule]]) error {
				for _, scheduleIt := range seq {
					fs, err := scheduleIt.Read()
					if err != nil {
						return err
					}

					if !o.testSchedule(fs) {
						continue
					}

					fn := fs.Number()
					for _, variant := range fs.Variants {
						if !o.testVariant(fs, variant) {
							continue
						}

						if span, ok := variant.Ranges.Span(); ok {
							accumulate(acc, fn, RouteAndRange{
								DepartureAirport: variant.Data.DepartureAirport,
								ArrivalAirport:   variant.Data.ArrivalAirport,
								Range:            span,
							})
						}
					}
				}

				return nil
			})
		},
		Combiner: func(ctx context.Context, a, b map[common.FlightNumber][]RouteAndRange) (map[common.FlightNumber][]RouteAndRange, error) {
			if a == nil {
				a = make(map[common.FlightNumber][]RouteAndRange)
			}

			if b != nil {
				for fn, rrs := range b {
					for _, rr := range rrs {
						accumulate(a, fn, rr)
					}
				}
			}

			return a, nil
		},
		Finisher: func(ctx context.Context, acc map[common.FlightNumber][]RouteAndRange) (map[common.FlightNumber][]RouteAndRange, error) {
			if acc == nil {
				acc = make(map[common.FlightNumber][]RouteAndRange)
			}

			return acc, nil
		},
	}

	return wg.RunSeq(ctx, airlineSeq)
}
