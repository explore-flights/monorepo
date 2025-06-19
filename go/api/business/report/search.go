package report

import (
	"context"
	"database/sql"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/gofrs/uuid/v5"
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

func (s *Search) Destinations(ctx context.Context, airportId uuid.UUID, cond *Condition) ([]uuid.UUID, error) {
	destinationAirportIds := make([]uuid.UUID, 0)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var destinationAirportId uuid.UUID
			if err := rows.Scan(&destinationAirportId); err != nil {
				return err
			}

			destinationAirportIds = append(destinationAirportIds, destinationAirportId)
		}

		return nil
	}

	fullCond := WithDepartureAirportId(airportId)
	if cond != nil && cond.cond != nil {
		fullCond = WithAll(
			fullCond,
			*cond,
		)
	}

	return destinationAirportIds, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.DistinctValueExpression{db.LiteralValueExpression("arrival_airport_id")},
		},
		fullCond.cond,
		nil,
		scanner,
	)
}

func (s *Search) AircraftReport(ctx context.Context, cond *Condition) (map[uuid.UUID][]AircraftReport, error) {
	reportsByAircraftId := make(map[uuid.UUID][]AircraftReport)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var aircraftId uuid.UUID
			var report AircraftReport
			if err := rows.Scan(&aircraftId, &report.DurationSeconds5mTrunc, &report.Flights); err != nil {
				return err
			}

			reportsByAircraftId[aircraftId] = append(reportsByAircraftId[aircraftId], report)
		}

		return nil
	}

	return reportsByAircraftId, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.LiteralValueExpression("COALESCE(acf.id, act.id)"),
			db.LiteralValueExpression("r.duration_seconds_5m_trunc"),
			db.AggregationValueExpression{
				Function: "SUM",
				Expr:     db.LiteralValueExpression("r.count"),
			},
		},
		s.withIsOperating(cond).cond,
		[]db.ValueExpression{
			db.LiteralValueExpression("COALESCE(acf.id, act.id)"),
			db.LiteralValueExpression("r.duration_seconds_5m_trunc"),
		},
		scanner,
	)
}

func (s *Search) FlightsByAirline(ctx context.Context, cond *Condition) (map[uuid.UUID]int, error) {
	flightsByAirlineIds := make(map[uuid.UUID]int)
	scanner := func(rows *sql.Rows) error {
		for rows.Next() {
			var airlineId uuid.UUID
			var count int
			if err := rows.Scan(&airlineId, &count); err != nil {
				return err
			}

			flightsByAirlineIds[airlineId] = count
		}

		return nil
	}

	return flightsByAirlineIds, s.repo.Report(
		ctx,
		[]db.SelectExpression{
			db.LiteralValueExpression("airline_id"),
			db.AggregationValueExpression{
				Function: "SUM",
				Expr:     db.LiteralValueExpression("count"),
			},
		},
		s.withIsOperating(cond).cond,
		[]db.ValueExpression{
			db.LiteralValueExpression("airline_id"),
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
