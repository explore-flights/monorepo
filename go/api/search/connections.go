package search

import (
	"context"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"slices"
	"time"
)

type flightPredicate func(f *common.Flight) bool

type Filters struct {
	all []flightPredicate
	any []flightPredicate
}

type Connection struct {
	Flight   *common.Flight
	Outgoing []Connection
}

type ConnectionsHandler struct {
	fr *FlightRepo
}

func NewConnectionsHandler(fr *FlightRepo) *ConnectionsHandler {
	return &ConnectionsHandler{fr}
}

func (ch *ConnectionsHandler) FindConnections(ctx context.Context, origins, destinations []string, minDeparture, maxDeparture time.Time, maxFlights uint32, minLayover, maxLayover, maxDuration time.Duration, options ...FilterOption) ([]Connection, error) {
	var f Filters
	for _, opt := range options {
		opt.Apply(&f)
	}

	minDate := xtime.NewLocalDate(minDeparture.UTC())
	maxDate := xtime.NewLocalDate(maxDeparture.Add(maxDuration).UTC())

	var flightsByDeparture map[common.Departure][]*common.Flight
	{
		flightsByDate, err := ch.fr.Flights(ctx, minDate, maxDate)
		if err != nil {
			return nil, err
		}

		flightsByDeparture = groupByDepartureUTC(flightsByDate, f.all)
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
		true,
	))
}

func findConnections(ctx context.Context, flightsByDeparture map[common.Departure][]*common.Flight, origins, destinations []string, minDeparture, maxDeparture time.Time, maxFlights uint32, minLayover, maxLayover, maxDuration time.Duration, predicates []flightPredicate, initial bool) <-chan Connection {
	if maxFlights < 1 || maxDuration < 1 {
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
			f  *common.Flight
			ch <-chan Connection
		}, 0)

		currDate := xtime.NewLocalDate(minDeparture.UTC())
		for currDate.Compare(xtime.NewLocalDate(maxDeparture.UTC())) <= 0 {
			for _, origin := range origins {
				d := common.Departure{
					Airport: origin,
					Date:    currDate,
				}

				for _, f := range flightsByDeparture[d] {
					if f.ServiceType != "J" || f.Duration() > maxDuration || f.DepartureTime.Compare(minDeparture) < 0 || f.DepartureTime.Compare(maxDeparture) > 0 {
						continue
					}

					maxDuration := maxDuration
					if !initial {
						maxDuration = maxDuration - f.DepartureTime.Sub(minDeparture)
						if f.Duration() > maxDuration {
							continue
						}
					}

					remPredicates := make([]flightPredicate, 0, len(predicates))
					for _, p := range predicates {
						if !p(f) {
							remPredicates = append(remPredicates, p)
						}
					}

					if slices.Contains(destinations, f.ArrivalAirport) {
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
						subConns := findConnections(
							ctx,
							flightsByDeparture,
							[]string{f.ArrivalAirport},
							destinations,
							f.ArrivalTime.Add(minLayover),
							f.ArrivalTime.Add(maxLayover),
							maxFlights-1,
							minLayover,
							maxLayover,
							maxDuration-(f.Duration()+minLayover),
							remPredicates,
							false,
						)

						working = append(working, struct {
							f  *common.Flight
							ch <-chan Connection
						}{f: f, ch: subConns})
					}
				}
			}

			currDate = currDate.Next()
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

func allMatch(predicates []flightPredicate, f *common.Flight) bool {
	for _, p := range predicates {
		if !p(f) {
			return false
		}
	}

	return true
}

func groupByDepartureUTC(flightsByDate map[xtime.LocalDate][]*common.Flight, predicates []flightPredicate) map[common.Departure][]*common.Flight {
	result := make(map[common.Departure][]*common.Flight)
	for _, flights := range flightsByDate {
		for _, f := range flights {
			if allMatch(predicates, f) {
				d := f.DepartureUTC()
				result[d] = append(result[d], f)
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
