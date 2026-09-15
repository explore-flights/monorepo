package db

import (
	"context"
	"database/sql"
	"time"
)

type LiveFlight struct {
	FlightNumber
	DepartureAirportIataCode string
	ArrivalAirportIataCode   string
	DepartureTime            time.Time
	ArrivalTime              time.Time
}

// LiveFlights uses the latest published operating legs, not historical schedule
// versions or codeshares. Departure is inclusive and arrival is exclusive.
func (fr *FlightRepo) LiveFlights(ctx context.Context, timestamp time.Time) ([]LiveFlight, *time.Time, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer conn.Close()

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()

	// The export stores UTC wall-clock values as TIMESTAMP (without timezone).
	// Bind UTC parameters with that same type to avoid session-timezone coercion.
	var upcoming sql.NullTime
	err = tx.QueryRowContext(ctx, `
SELECT
    MIN(departure_timestamp_utc)
FROM flight_variant_history_latest
WHERE duration_seconds > 0
AND service_type = 'J'
AND departure_timestamp_utc > CAST(? AS TIMESTAMP)
`, timestamp.UTC()).Scan(&upcoming)
	if err != nil {
		return nil, nil, err
	}

	rows, err := tx.QueryContext(ctx, `
SELECT
    airline_iata_code,
    number,
    suffix,
    departure_airport_iata_code,
    arrival_airport_iata_code,
    departure_timestamp_utc,
    departure_timestamp_utc + to_seconds(duration_seconds) AS arrival_timestamp_utc
FROM flight_variant_history_latest
WHERE duration_seconds > 0
AND service_type = 'J'
AND departure_timestamp_utc <= CAST(? AS TIMESTAMP)
AND departure_timestamp_utc + to_seconds(duration_seconds) > CAST(? AS TIMESTAMP)
ORDER BY
    departure_timestamp_utc,
    airline_iata_code,
    number,
    suffix,
    departure_airport_iata_code
`, timestamp.UTC(), timestamp.UTC())
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	flights := make([]LiveFlight, 0)
	for rows.Next() {
		var flight LiveFlight
		if err := rows.Scan(
			&flight.AirlineIataCode,
			&flight.Number,
			&flight.Suffix,
			&flight.DepartureAirportIataCode,
			&flight.ArrivalAirportIataCode,
			&flight.DepartureTime,
			&flight.ArrivalTime,
		); err != nil {
			return nil, nil, err
		}
		flight.DepartureTime = flight.DepartureTime.UTC()
		flight.ArrivalTime = flight.ArrivalTime.UTC()
		flights = append(flights, flight)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}

	var next *time.Time
	if upcoming.Valid {
		value := upcoming.Time.UTC()
		next = &value
	}
	return flights, next, nil
}
