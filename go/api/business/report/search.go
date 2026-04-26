package report

import (
	"context"
	"database/sql"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
)

type searchRepo interface {
	Report(ctx context.Context, selectFields []db.SelectExpression, filter db.Condition, groupBy []db.ValueExpression, scanner func(rows *sql.Rows) error) error
}

type Search struct {
	repo searchRepo
}

func NewSearch(repo searchRepo) *Search {
	return &Search{repo}
}

func (s *Search) Destinations(ctx context.Context, airportIataCode string, cond *Condition) (map[string]time.Duration, error) {
	destinations := make(map[string]time.Duration)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var destinationAirportIataCode string
			var minDurationSeconds int64
			if err := rows.Scan(&destinationAirportIataCode, &minDurationSeconds); err != nil {
				return err
			}

			destinations[destinationAirportIataCode] = time.Duration(minDurationSeconds) * time.Second
		}

		return nil
	}

	fullCond := WithDepartureAirportIataCode(airportIataCode)
	if cond != nil && cond.cond != nil {
		fullCond = WithAll(
			fullCond,
			*cond,
		)
	}

	return destinations, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.LiteralValueExpression("arrival_airport_iata_code"),
			db.AggregationValueExpression{
				Function: "MIN",
				Expr:     db.LiteralValueExpression("min_duration_seconds"),
			},
		},
		fullCond.cond,
		[]db.ValueExpression{
			db.LiteralValueExpression("arrival_airport_iata_code"),
		},
		scanner,
	)
}

func (s *Search) AircraftReport(ctx context.Context, cond *Condition) (map[string][]AircraftReport, error) {
	reportsByAircraftIataCode := make(map[string][]AircraftReport)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var aircraftIataCode string
			var report AircraftReport
			if err := rows.Scan(&aircraftIataCode, &report.DurationSeconds5mTrunc, &report.Flights); err != nil {
				return err
			}

			reportsByAircraftIataCode[aircraftIataCode] = append(reportsByAircraftIataCode[aircraftIataCode], report)
		}

		return nil
	}

	return reportsByAircraftIataCode, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.LiteralValueExpression("ac.iata_code"),
			db.LiteralValueExpression("r.duration_seconds_5m_trunc"),
			db.AggregationValueExpression{
				Function: "SUM",
				Expr:     db.LiteralValueExpression("r.count"),
			},
		},
		s.withIsOperating(cond).cond,
		[]db.ValueExpression{
			db.LiteralValueExpression("ac.iata_code"),
			db.LiteralValueExpression("r.duration_seconds_5m_trunc"),
		},
		scanner,
	)
}

func (s *Search) FlightsByAirline(ctx context.Context, cond *Condition) (map[string]int, error) {
	flightsByAirlineIataCode := make(map[string]int)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var airlineIataCode string
			var count int
			if err := rows.Scan(&airlineIataCode, &count); err != nil {
				return err
			}

			flightsByAirlineIataCode[airlineIataCode] = count
		}

		return nil
	}

	return flightsByAirlineIataCode, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.LiteralValueExpression("airline_iata_code"),
			db.AggregationValueExpression{
				Function: "SUM",
				Expr:     db.LiteralValueExpression("count"),
			},
		},
		s.withIsOperating(cond).cond,
		[]db.ValueExpression{
			db.LiteralValueExpression("airline_iata_code"),
		},
		scanner,
	)
}

func (s *Search) withIsOperating(cond *Condition) Condition {
	fullCond := WithIsOperating()
	if cond != nil && cond.cond != nil {
		fullCond = WithAll(
			fullCond,
			*cond,
		)
	}

	return fullCond
}
