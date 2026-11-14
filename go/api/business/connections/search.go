package connections

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"iter"
	"slices"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"golang.org/x/sync/errgroup"
)

var (
	canceledPageFull        = errors.New("canceled: page full")
	canceledInternalTimeout = errors.New("canceled: internal timeout")
)

type searchRepo interface {
	IterFlights(context.Context, xtime.LocalDate, *error) iter.Seq[db.Flight]
	Airports(context.Context) (map[string]db.Airport, error)
}

type Search struct {
	repo searchRepo
}

func NewSearch(repo searchRepo) *Search {
	return &Search{repo: repo}
}

func (s *Search) FindConnections(ctx context.Context, query Query, pageSize uint, after *Continuation) ([]Connection, *Continuation, error) {
	if pageSize == 0 {
		return nil, after, nil
	}

	baseCtx := ctx
	if deadline, ok := ctx.Deadline(); ok {
		// cancel 1s earlier to allow for continuation across requests
		internalTimeout := time.Until(deadline) - (time.Second * 1)
		if internalTimeout > 0 {
			var timeoutCtxCancel context.CancelFunc
			ctx, timeoutCtxCancel = context.WithTimeoutCause(ctx, internalTimeout, canceledInternalTimeout)
			defer timeoutCtxCancel()
		}
	}

	minDeparture := query.MinDeparture
	skipN := uint32(0)
	if after != nil {
		minDeparture = after.Departure
		skipN = after.Consumed
	}

	chResult := make(chan Connection)

	// use the unmodified baseCtx: tightened timeout should only be propagated to the collecting goroutine
	// the collecting goroutine then cancels the childContext
	childContext, cancel := context.WithCancelCause(baseCtx)
	defer cancel(nil)

	g, childContext := errgroup.WithContext(childContext)
	g.Go(func() error {
		defer close(chResult)

		origins, err := s.loadAirports(childContext, query.DepartureAirportFilter)
		if err != nil {
			return err
		}

		fl := flightLoader{
			repo:         s.repo,
			watermark:    minDeparture,
			flightsCache: make(map[xtime.LocalDate]map[string][]*Flight),
		}

		return s.findConnections(
			childContext,
			&fl,
			fl.moveWatermark,
			minDeparture,
			query.MaxDeparture,
			origins,
			nil,
			query.ConnectionEvaluator,
			chResult,
		)
	})

	results := make([]Connection, 0)
	newContinuation := &Continuation{
		Departure: minDeparture,
		Consumed:  skipN,
	}

loop:
	for i := range uint64(skipN) + uint64(pageSize) {
		select {
		case conn, ok := <-chResult:
			if !ok {
				// channel was closed, results are complete, no more pages
				newContinuation = nil
				break loop
			}

			if i >= uint64(skipN) {
				results = append(results, conn)

				if conn[0].DepartureTime.Equal(newContinuation.Departure) {
					newContinuation.Consumed++
				} else {
					newContinuation.Departure = conn[0].DepartureTime
					newContinuation.Consumed = 1
				}
			}

		case <-ctx.Done():
			if errors.Is(context.Cause(ctx), canceledInternalTimeout) {
				// ctx was canceled by our internal tightened timeout: break loop and return continuation
				break loop
			}

			_ = g.Wait()
			return nil, nil, ctx.Err()
		}
	}

	cancel(canceledPageFull)

	if err := g.Wait(); err != nil {
		if !(errors.Is(err, context.Canceled) && errors.Is(context.Cause(childContext), canceledPageFull)) {
			return nil, nil, err
		}
	}

	return results, newContinuation, nil
}

func (s *Search) findConnections(
	ctx context.Context,
	fl *flightLoader,
	moveWatermark func(time.Time),
	minDeparture, maxDeparture time.Time,
	origins []string,
	parentConn Connection,
	connectionEvaluator ConnectionEvaluator,
	chResult chan<- Connection) error {

	var loadFlightErr error
	for f := range fl.iterFlights(ctx, minDeparture, maxDeparture, origins, &loadFlightErr) {
		conn := make(Connection, len(parentConn), len(parentConn)+1)
		copy(conn, parentConn)
		conn = append(conn, f)

		evaluation, err := connectionEvaluator.Evaluate(ctx, conn)
		if err != nil {
			return err
		}

		if evaluation.Yield {
			select {
			case chResult <- conn:
			case <-ctx.Done():
				return ctx.Err()
			}
		}

		if window := evaluation.Next; window != nil {
			if window.MinLayover < 0 {
				return fmt.Errorf("MinLayover can not be negative (got %s)", window.MaxLayover)
			}

			var nextFlightMaxDeparture time.Time
			if window.MaxLayover != nil {
				maxLayover := *window.MaxLayover
				if maxLayover < 0 {
					return fmt.Errorf("MaxLayover can not be negative (got %s)", maxLayover)
				}

				nextFlightMaxDeparture = f.ArrivalTime.Add(maxLayover)
			} else {
				nextFlightMaxDeparture = maxSupportedTime()
			}

			if err := s.findConnections(
				ctx,
				fl,
				func(time.Time) {},
				f.ArrivalTime.Add(window.MinLayover),
				nextFlightMaxDeparture,
				[]string{f.ArrivalAirportIataCode},
				conn,
				connectionEvaluator,
				chResult,
			); err != nil {
				return err
			}
		}

		moveWatermark(f.DepartureTime)
	}

	if loadFlightErr != nil {
		return loadFlightErr
	}

	return nil
}

func (s *Search) loadAirports(ctx context.Context, filter AirportFilter) ([]string, error) {
	airports, err := s.repo.Airports(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]string, 0)
	for _, a := range airports {
		ok, err := filter.Apply(ctx, &Airport{a})
		if err != nil {
			return nil, err
		}

		if ok {
			result = append(result, a.IataCode)
		}
	}

	return result, nil
}

type flightLoader struct {
	repo interface {
		IterFlights(context.Context, xtime.LocalDate, *error) iter.Seq[db.Flight]
	}
	watermark    time.Time
	flightsCache map[xtime.LocalDate]map[string][]*Flight
}

func (fl *flightLoader) moveWatermark(watermark time.Time) {
	oldWatermarkDate := xtime.NewLocalDate(fl.watermark.UTC())
	watermarkDate := xtime.NewLocalDate(watermark.UTC())

	if watermarkDate > oldWatermarkDate {
		for d := range fl.flightsCache {
			if d < watermarkDate {
				delete(fl.flightsCache, d)
			}
		}

		fl.watermark = watermark
	}
}

func (fl *flightLoader) iterFlights(ctx context.Context, minDeparture, maxDeparture time.Time, origins []string, outErr *error) iter.Seq[*Flight] {
	if minDeparture.Before(minSupportedTime()) {
		minDeparture = minSupportedTime()
	}

	if maxDeparture.After(maxSupportedTime()) {
		maxDeparture = maxSupportedTime()
	}

	minDepartureDate := xtime.NewLocalDate(minDeparture.UTC())
	maxDepartureDate := xtime.NewLocalDate(maxDeparture.UTC())

	return func(yield func(*Flight) bool) {
		if minDeparture.Before(fl.watermark) {
			*outErr = fmt.Errorf("minDeparture=%s can not be before watermark=%s", minDeparture, fl.watermark)
			return
		}

		for date := range (xtime.LocalDateRange{minDepartureDate, maxDepartureDate}).Iter {
			flightsByOrigin, ok := fl.flightsCache[date]
			if !ok {
				// date is not present in cache, load from db
				flightsByOrigin = make(map[string][]*Flight)
				var err error
				for f := range fl.repo.IterFlights(ctx, date, &err) {
					flightsByOrigin[f.DepartureAirportIataCode] = append(flightsByOrigin[f.DepartureAirportIataCode], &Flight{f})
				}

				if err != nil {
					*outErr = err
					return
				}

				for _, flights := range flightsByOrigin {
					slices.SortStableFunc(flights, fl.compareFlights)
				}

				fl.flightsCache[date] = flightsByOrigin
			}

			relevantFlights := make([]*Flight, 0)
			for _, origin := range origins {
				if flights, ok := flightsByOrigin[origin]; ok {
					startIncl := slices.IndexFunc(flights, func(f *Flight) bool {
						return !f.DepartureTime.Before(minDeparture)
					})

					if startIncl != -1 {
						endIncl := -1
						for i, f := range slices.Backward(flights) {
							if !f.DepartureTime.After(maxDeparture) {
								endIncl = i
								break
							}
						}

						if endIncl >= startIncl {
							relevantFlights = append(relevantFlights, flights[startIncl:endIncl+1]...)
						}
					}
				}
			}

			slices.SortStableFunc(relevantFlights, fl.compareFlights)

			for _, f := range relevantFlights {
				if !yield(f) {
					return
				}
			}
		}
	}
}

func (fl *flightLoader) compareFlights(a, b *Flight) int {
	return cmp.Or(
		a.DepartureTime.Compare(b.DepartureTime),
		cmp.Compare(a.DepartureAirportIataCode, b.DepartureAirportIataCode),
		cmp.Compare(a.ArrivalAirportIataCode, b.ArrivalAirportIataCode),
		cmp.Compare(a.AirlineIataCode, b.AirlineIataCode),
		cmp.Compare(a.Number, b.Number),
		cmp.Compare(a.Suffix, b.Suffix),
	)
}

func minSupportedTime() time.Time {
	return time.Date(2024, time.March, 4, 0, 0, 0, 0, time.UTC)
}

func maxSupportedTime() time.Time {
	return time.Now().Add(time.Hour * 24 * 366)
}
