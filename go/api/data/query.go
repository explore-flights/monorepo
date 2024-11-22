package data

import (
	"context"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"iter"
	"maps"
)

func (h *Handler) QuerySchedules(ctx context.Context, opts ...QueryScheduleOption) (map[common.FlightNumber]*common.FlightSchedule, error) {
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

	accumulate := func(acc map[common.FlightNumber]*common.FlightSchedule, fn common.FlightNumber, fs *common.FlightSchedule, fsv *common.FlightScheduleVariant) {
		if existingFs, ok := acc[fn]; ok {
			if existingFsv, ok := existingFs.Variant(fsv.Data); ok {
				existingFsv.Ranges = existingFsv.Ranges.ExpandAll(fsv.Ranges)
			} else {
				existingFs.Variants = append(existingFs.Variants, fsv.Clone(true))
			}
		} else {
			acc[fn] = fs.Clone(false)
			acc[fn].Variants = append(acc[fn].Variants, fsv.Clone(true))
		}
	}

	wg := concurrent.WorkGroup[common.AirlineIdentifier, map[common.FlightNumber]*common.FlightSchedule, map[common.FlightNumber]*common.FlightSchedule]{
		Parallelism: min(uint(airlineCount), 10),
		Worker: func(ctx context.Context, airline common.AirlineIdentifier, acc map[common.FlightNumber]*common.FlightSchedule) (map[common.FlightNumber]*common.FlightSchedule, error) {
			if acc == nil {
				acc = make(map[common.FlightNumber]*common.FlightSchedule)
			}

			return acc, h.flightSchedulesStream(ctx, airline, func(seq iter.Seq2[string, *onceIter[*common.FlightSchedule]]) error {
				for _, scheduleIt := range seq {
					fs, err := scheduleIt.Read()
					if err != nil {
						return err
					}

					fs, ok := o.visitSchedule(fs)
					if !ok {
						continue
					}

					fn := fs.Number()
					for _, fsv := range fs.Variants {
						fsv, ok = o.visitVariant(fs, fsv)
						if !ok {
							continue
						}

						if !fsv.Ranges.Empty() {
							accumulate(acc, fn, fs, fsv)
						}
					}
				}

				return nil
			})
		},
		Combiner: func(ctx context.Context, a, b map[common.FlightNumber]*common.FlightSchedule) (map[common.FlightNumber]*common.FlightSchedule, error) {
			if a == nil {
				a = make(map[common.FlightNumber]*common.FlightSchedule)
			}

			if b != nil {
				for fn, fs := range b {
					for _, fsv := range fs.Variants {
						accumulate(a, fn, fs, fsv)
					}
				}
			}

			return a, nil
		},
		Finisher: func(ctx context.Context, acc map[common.FlightNumber]*common.FlightSchedule) (map[common.FlightNumber]*common.FlightSchedule, error) {
			if acc == nil {
				acc = make(map[common.FlightNumber]*common.FlightSchedule)
			}

			return acc, nil
		},
	}

	return wg.RunSeq(ctx, airlineSeq)
}
