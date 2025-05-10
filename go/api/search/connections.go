package search

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"slices"
	"strings"
	"time"
)

type flightPredicate func(f *Flight) bool

type connectionsFlightRepo interface {
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

type ConnectionsHandler struct {
	fr connectionsFlightRepo
}

func NewConnectionsHandler(fr connectionsFlightRepo) *ConnectionsHandler {
	return &ConnectionsHandler{fr}
}

func (ch *ConnectionsHandler) FindConnections(ctx context.Context, originsRaw, destinationsRaw []string, minDeparture, maxDeparture time.Time, maxFlights uint32, minLayover, maxLayover, maxDuration time.Duration, options ...ConnectionSearchOption) ([]Connection, error) {
	var f Options
	for _, opt := range options {
		opt.Apply(&f)
	}

	minDate := xtime.NewLocalDate(minDeparture.UTC())
	maxDate := xtime.NewLocalDate(maxDeparture.Add(maxDuration).UTC())

	var flightsByDeparture map[Departure][]*Flight
	var origins []uuid.UUID
	var destinations []uuid.UUID
	{
		var flightsByDate map[xtime.LocalDate][]db.Flight
		var airlines map[uuid.UUID]db.Airline
		var airports map[uuid.UUID]db.Airport
		var aircraft map[uuid.UUID]db.Aircraft

		g, ctx := errgroup.WithContext(ctx)
		g.Go(func() error {
			var err error
			flightsByDate, err = ch.fr.Flights(ctx, minDate, maxDate)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = ch.fr.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = ch.fr.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = ch.fr.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return nil, err
		}

		flightsByDeparture = mapAndGroupByDepartureUTC(flightsByDate, airlines, airports, aircraft, f.all)
		origins = mapAirports(airports, originsRaw)
		destinations = mapAirports(airports, destinationsRaw)
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
						if !p(f) {
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

func allMatch(predicates []flightPredicate, f *Flight) bool {
	for _, p := range predicates {
		if !p(f) {
			return false
		}
	}

	return true
}

func mapAndGroupByDepartureUTC(flightsByDate map[xtime.LocalDate][]db.Flight, airlines map[uuid.UUID]db.Airline, airports map[uuid.UUID]db.Airport, aircraft map[uuid.UUID]db.Aircraft, predicates []flightPredicate) map[Departure][]*Flight {
	result := make(map[Departure][]*Flight)
	for _, flights := range flightsByDate {
		for _, f := range flights {
			f := &Flight{
				Flight:   f,
				airlines: airlines,
				airports: airports,
				aircraft: aircraft,
			}

			if allMatch(predicates, f) {
				d := f.DepartureUTC()
				result[d] = append(result[d], f)
			}
		}
	}

	return result
}

func mapAirports(airports map[uuid.UUID]db.Airport, raw []string) []uuid.UUID {
	result := make([]uuid.UUID, 0, len(raw))

	for _, search := range raw {
		if icaoCode, ok := strings.CutPrefix(search, "icao:"); ok {
			for _, airport := range airports {
				if airport.IcaoCode.Valid && airport.IcaoCode.String == icaoCode {
					result = append(result, airport.Id)
					break
				}
			}
		} else {
			iataCode, ok := strings.CutPrefix(search, "iata:")
			if !ok {
				iataCode = search
			}

			for _, airport := range airports {
				if airport.IataCode.Valid && airport.IataCode.String == iataCode {
					result = append(result, airport.Id)
					break
				}
			}
		}
	}

	return result
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
