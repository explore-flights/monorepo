package search

import (
	"context"
	"github.com/explore-flights/monorepo/go/common"
	"time"
)

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

func (ch *ConnectionsHandler) FindConnections(ctx context.Context, origin, destination string, minDeparture, maxDeparture time.Time, maxFlights int, minLayover, maxLayover, maxDuration time.Duration) ([]Connection, error) {
	minDate := common.NewLocalDate(minDeparture.UTC())
	maxDate := common.NewLocalDate(maxDeparture.Add(maxDuration).UTC())

	var flightsByDeparture map[common.Departure][]*common.Flight
	{
		flightsByDate, err := ch.fr.Flights(ctx, minDate, maxDate)
		if err != nil {
			return nil, err
		}

		flightsByDeparture = groupByDeparture(flightsByDate)
	}

	return collectCtx(ctx, findConnections(
		ctx,
		flightsByDeparture,
		origin,
		destination,
		minDeparture,
		maxDeparture,
		maxFlights,
		minLayover,
		maxLayover,
		maxDuration,
	))
}

func findConnections(ctx context.Context, flightsByDeparture map[common.Departure][]*common.Flight, origin, destination string, minDeparture, maxDeparture time.Time, maxFlights int, minLayover, maxLayover, maxDuration time.Duration) <-chan Connection {
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

		currDate := common.NewLocalDate(minDeparture.UTC())
		for currDate.Compare(common.NewLocalDate(maxDeparture.UTC())) <= 0 {
			d := common.Departure{
				Airport: origin,
				Date:    currDate,
			}

			for _, f := range flightsByDeparture[d] {
				if f.ServiceType != "J" || f.Duration() > maxDuration || f.DepartureTime.Compare(minDeparture) < 0 || f.DepartureTime.Compare(maxDeparture) > 0 {
					continue
				}

				if f.ArrivalAirport == destination {
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
				} else {
					subConns := findConnections(
						ctx,
						flightsByDeparture,
						f.ArrivalAirport,
						destination,
						f.ArrivalTime.Add(minLayover),
						f.ArrivalTime.Add(maxLayover),
						maxFlights-1,
						minLayover,
						maxLayover,
						maxDuration-(f.Duration()+minLayover),
					)

					working = append(working, struct {
						f  *common.Flight
						ch <-chan Connection
					}{f: f, ch: subConns})
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

func groupByDeparture(flightsByDate map[common.LocalDate][]*common.Flight) map[common.Departure][]*common.Flight {
	result := make(map[common.Departure][]*common.Flight)
	for _, flights := range flightsByDate {
		for _, f := range flights {
			d := f.Departure()
			result[d] = append(result[d], f)
		}
	}

	return result
}

func collect[T any](ch <-chan T) []T {
	var r []T
	for v := range ch {
		r = append(r, v)
	}

	return r
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