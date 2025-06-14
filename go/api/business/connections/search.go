package connections

import (
	"context"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"path"
	"slices"
	"time"
)

type predicateContext struct {
	airlines map[uuid.UUID]db.Airline
	airports map[uuid.UUID]db.Airport
	aircraft map[uuid.UUID]db.Aircraft
}

func (pctx *predicateContext) globMatchAirline(airlineId uuid.UUID, pattern string) bool {
	airline, ok := pctx.airlines[airlineId]
	if !ok {
		return false
	}

	return pctx.globMatch(airline.IataCode, pattern) ||
		(airline.IcaoCode.Valid && pctx.globMatch(airline.IcaoCode.String, pattern))
}

func (pctx *predicateContext) globMatchAirport(airportId uuid.UUID, pattern string) bool {
	airport, ok := pctx.airports[airportId]
	if !ok {
		return false
	}

	return pctx.globMatch(airport.IataCode, pattern) ||
		(airport.IcaoCode.Valid && pctx.globMatch(airport.IcaoCode.String, pattern))
}

func (pctx *predicateContext) globMatchAircraft(aircraftId uuid.UUID, pattern string) bool {
	aircraft, ok := pctx.aircraft[aircraftId]
	if !ok {
		return false
	}

	return (aircraft.IataCode.Valid && pctx.globMatch(aircraft.IataCode.String, pattern)) ||
		(aircraft.IcaoCode.Valid && pctx.globMatch(aircraft.IcaoCode.String, pattern)) ||
		(aircraft.Name.Valid && pctx.globMatch(aircraft.Name.String, pattern))
}

func (pctx *predicateContext) anyMatchFlightNumber(f *Flight, predicate func(fn string) bool) bool {
	airline, ok := pctx.airlines[f.AirlineId]
	if !ok {
		return false
	}

	if predicate(fmt.Sprintf("%s%d%s", airline.IataCode, f.Number, f.Suffix)) {
		return true
	}

	if airline.IcaoCode.Valid && predicate(fmt.Sprintf("%s%d%s", airline.IcaoCode.String, f.Number, f.Suffix)) {
		return true
	}

	return false
}

func (pctx *predicateContext) globMatch(v, pattern string) bool {
	match, _ := path.Match(pattern, v)
	return match
}

type flightPredicate func(pctx *predicateContext, f *Flight) bool

type searchRepo interface {
	Flights(ctx context.Context, start, end xtime.LocalDate) (map[xtime.LocalDate][]db.Flight, error)
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
}

type Options struct {
	countMultiLeg bool
	all           []flightPredicate
	any           []flightPredicate
}

type Connection struct {
	Flight   *Flight
	Outgoing []Connection
}

type Search struct {
	repo searchRepo
}

func NewSearch(repo searchRepo) *Search {
	return &Search{repo}
}

func (ch *Search) FindConnections(ctx context.Context, origins, destinations []uuid.UUID, minDeparture, maxDeparture time.Time, maxFlights uint32, minLayover, maxLayover, maxDuration time.Duration, options ...SearchOption) ([]Connection, error) {
	var f Options
	for _, opt := range options {
		opt.Apply(&f)
	}

	minDate := xtime.NewLocalDate(minDeparture.UTC())
	maxDate := xtime.NewLocalDate(maxDeparture.Add(maxDuration).UTC())

	var pctx predicateContext
	var flightsByDeparture map[Departure][]*Flight
	{
		var flightsByDate map[xtime.LocalDate][]db.Flight
		var airlines map[uuid.UUID]db.Airline
		var airports map[uuid.UUID]db.Airport
		var aircraft map[uuid.UUID]db.Aircraft

		g, ctx := errgroup.WithContext(ctx)
		g.Go(func() error {
			var err error
			flightsByDate, err = ch.repo.Flights(ctx, minDate, maxDate)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = ch.repo.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = ch.repo.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = ch.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return nil, err
		}

		pctx = predicateContext{
			airlines: airlines,
			airports: airports,
			aircraft: aircraft,
		}

		flightsByDeparture = mapAndGroupByDepartureUTC(&pctx, flightsByDate, f.all)
	}

	return collectCtx(ctx, findConnections(
		ctx,
		flightsByDeparture,
		origins,
		destinations,
		minDeparture,
		maxDeparture,
		maxFlights,
		minLayover,
		maxLayover,
		maxDuration,
		&pctx,
		f.any,
		f.countMultiLeg,
		nil,
	))
}

func findConnections(
	ctx context.Context,
	flightsByDeparture map[Departure][]*Flight,
	origins,
	destinations []uuid.UUID,
	minDeparture,
	maxDeparture time.Time,
	maxFlights uint32,
	minLayover,
	maxLayover,
	maxDuration time.Duration,
	pctx *predicateContext,
	predicates []flightPredicate,
	countMultiLeg bool,
	incomingFn *db.FlightNumber,
) <-chan Connection {

	if (countMultiLeg && maxFlights < 1) || maxDuration < 1 {
		ch := make(chan Connection)
		close(ch)
		return ch
	}

	ch := make(chan Connection, 256)
	go func() {
		defer close(ch)

		ctx, cancel := context.WithCancel(ctx)
		defer cancel()

		working := make([]struct {
			f  *Flight
			ch <-chan Connection
		}, 0)

		currDate := xtime.NewLocalDate(minDeparture.UTC())
		maxDate := xtime.NewLocalDate(maxDeparture.UTC())

		for currDate <= maxDate {
			for _, origin := range origins {
				d := Departure{
					AirportId: origin,
					Date:      currDate,
				}

				for _, f := range flightsByDeparture[d] {
					minDeparture := minDeparture
					maxDuration := maxDuration
					sameFlightNumber := false

					if incomingFn != nil {
						// subtract (actual) layover duration
						maxDuration = maxDuration - f.DepartureTime.Sub(minDeparture)

						// ignore minLayover for flights continuing on the same number (multi-leg)
						if *incomingFn != f.FlightNumber {
							minDeparture = minDeparture.Add(minLayover)
						} else {
							sameFlightNumber = true
						}
					}

					// J = regular flight
					// U = Rail&Fly
					if (f.ServiceType != "J" && f.ServiceType != "U") || (maxFlights < 1 && !sameFlightNumber) || f.Duration() > maxDuration || f.DepartureTime.Compare(minDeparture) < 0 || f.DepartureTime.Compare(maxDeparture) > 0 {
						continue
					}

					remPredicates := make([]flightPredicate, 0, len(predicates))
					for _, p := range predicates {
						if !p(pctx, f) {
							remPredicates = append(remPredicates, p)
						}
					}

					if slices.Contains(destinations, f.ArrivalAirportId) {
						if len(remPredicates) < 1 {
							conn := Connection{
								Flight:   f,
								Outgoing: nil,
							}

							select {
							case ch <- conn:
								break

							case <-ctx.Done():
								return
							}
						}
					} else {
						consumeFlights := uint32(1)

						if !countMultiLeg && sameFlightNumber {
							consumeFlights = 0
						}

						subConns := findConnections(
							ctx,
							flightsByDeparture,
							[]uuid.UUID{f.ArrivalAirportId},
							destinations,
							f.ArrivalTime,
							f.ArrivalTime.Add(maxLayover),
							maxFlights-consumeFlights,
							minLayover,
							maxLayover,
							maxDuration-f.Duration(),
							pctx,
							remPredicates,
							countMultiLeg,
							&f.FlightNumber,
						)

						working = append(working, struct {
							f  *Flight
							ch <-chan Connection
						}{f: f, ch: subConns})
					}
				}
			}

			currDate += 1
		}

		for _, w := range working {
			subConns, err := collectCtx(ctx, w.ch)
			if err != nil {
				return
			}

			if len(subConns) > 0 {
				conn := Connection{
					Flight:   w.f,
					Outgoing: subConns,
				}

				select {
				case ch <- conn:
					break

				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return ch
}

func mapAndGroupByDepartureUTC(pctx *predicateContext, flightsByDate map[xtime.LocalDate][]db.Flight, predicates []flightPredicate) map[Departure][]*Flight {
	result := make(map[Departure][]*Flight)
	for _, flights := range flightsByDate {
		for _, f := range flights {
			f := &Flight{f}
			if allMatch(pctx, f, predicates) {
				d := f.DepartureUTC()
				result[d] = append(result[d], f)
			}
		}
	}

	return result
}

func allMatch(pctx *predicateContext, f *Flight, predicates []flightPredicate) bool {
	for _, p := range predicates {
		if !p(pctx, f) {
			return false
		}
	}

	return true
}

func collectCtx[T any](ctx context.Context, ch <-chan T) ([]T, error) {
	var r []T
	for {
		select {
		case v, ok := <-ch:
			if ok {
				r = append(r, v)
			} else {
				return r, nil
			}
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}
