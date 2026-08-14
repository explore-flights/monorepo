package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/explore-flights/monorepo/go/common/xtime"
)

func (fr *FlightRepo) AirportStatistics(ctx context.Context, airportIataCode string, year int) ([]AirportStatistics, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	statistics, err := airportStatisticsSummary(ctx, conn, airportIataCode, year)
	if err != nil || len(statistics) == 0 {
		return statistics, err
	}

	byDirection := make(map[AirportMovementDirection]*AirportStatistics, len(statistics))
	for i := range statistics {
		byDirection[statistics[i].Direction] = &statistics[i]
	}

	if err = addAirportRouteStatistics(ctx, conn, airportIataCode, year, byDirection); err != nil {
		return nil, err
	}
	if err = addAirportDailyStatistics(ctx, conn, airportIataCode, year, byDirection); err != nil {
		return nil, err
	}

	return statistics, nil
}

func airportStatisticsSummary(ctx context.Context, conn *sql.Conn, airportIataCode string, year int) ([]AirportStatistics, error) {
	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    airport_iata_code,
    direction,
    year_local,
    scheduled_legs,
    route_count,
    airline_count,
    aircraft_type_count,
    first_date_local,
    last_date_local,
    duration_seconds_total,
    duration_seconds_average,
    duration_seconds_median,
    duration_seconds_minimum,
    duration_seconds_maximum
FROM airport_statistics
WHERE airport_iata_code = ?
AND year_local = ?
ORDER BY CASE direction WHEN 'departure' THEN 0 ELSE 1 END
`,
		airportIataCode,
		year,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]AirportStatistics, 0, 2)
	for rows.Next() {
		var statistics AirportStatistics
		err = rows.Scan(
			&statistics.AirportIataCode,
			&statistics.Direction,
			&statistics.YearLocal,
			&statistics.ScheduledLegs,
			&statistics.RouteCount,
			&statistics.AirlineCount,
			&statistics.AircraftTypeCount,
			&statistics.FirstDateLocal,
			&statistics.LastDateLocal,
			&statistics.DurationSecondsTotal,
			&statistics.DurationSecondsAverage,
			&statistics.DurationSecondsMedian,
			&statistics.DurationSecondsMinimum,
			&statistics.DurationSecondsMaximum,
		)
		if err != nil {
			return nil, err
		}

		statistics.RouteStatistics = make([]AirportRouteStatistics, 0)
		statistics.DailyStatistics = make([]AirportDailyStatistics, 0)
		result = append(result, statistics)
	}

	return result, rows.Err()
}

func addAirportRouteStatistics(ctx context.Context, conn *sql.Conn, airportIataCode string, year int, byDirection map[AirportMovementDirection]*AirportStatistics) error {
	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    stats.direction,
    route.other_airport_iata_code,
    route.operating_airline_iata_code,
    route.aircraft_iata_code,
    route.scheduled_legs,
    route.first_date_local,
    route.last_date_local,
    route.duration_seconds_total,
    route.duration_seconds_average,
    route.duration_seconds_median,
    route.duration_seconds_minimum,
    route.duration_seconds_maximum
FROM airport_statistics stats
CROSS JOIN UNNEST(stats.route_statistics) AS nested(route)
WHERE stats.airport_iata_code = ?
AND stats.year_local = ?
ORDER BY
    CASE stats.direction WHEN 'departure' THEN 0 ELSE 1 END,
    route.other_airport_iata_code,
    route.operating_airline_iata_code,
    route.aircraft_iata_code
`,
		airportIataCode,
		year,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var direction AirportMovementDirection
		var statistics AirportRouteStatistics
		err = rows.Scan(
			&direction,
			&statistics.OtherAirportIataCode,
			&statistics.OperatingAirlineIataCode,
			&statistics.AircraftIataCode,
			&statistics.ScheduledLegs,
			&statistics.FirstDateLocal,
			&statistics.LastDateLocal,
			&statistics.DurationSecondsTotal,
			&statistics.DurationSecondsAverage,
			&statistics.DurationSecondsMedian,
			&statistics.DurationSecondsMinimum,
			&statistics.DurationSecondsMaximum,
		)
		if err != nil {
			return err
		}

		if parent, ok := byDirection[direction]; ok {
			parent.RouteStatistics = append(parent.RouteStatistics, statistics)
		}
	}

	return rows.Err()
}

func addAirportDailyStatistics(ctx context.Context, conn *sql.Conn, airportIataCode string, year int, byDirection map[AirportMovementDirection]*AirportStatistics) error {
	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    stats.direction,
    day.date_local,
    day.scheduled_legs,
    day.route_count,
    day.airline_count,
    day.aircraft_type_count,
    day.duration_seconds_total,
    day.duration_seconds_average,
    day.duration_seconds_median,
    day.duration_seconds_minimum,
    day.duration_seconds_maximum
FROM airport_statistics stats
CROSS JOIN UNNEST(stats.daily_statistics) AS nested(day)
WHERE stats.airport_iata_code = ?
AND stats.year_local = ?
ORDER BY
    CASE stats.direction WHEN 'departure' THEN 0 ELSE 1 END,
    day.date_local
`,
		airportIataCode,
		year,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var direction AirportMovementDirection
		var statistics AirportDailyStatistics
		err = rows.Scan(
			&direction,
			&statistics.DateLocal,
			&statistics.ScheduledLegs,
			&statistics.RouteCount,
			&statistics.AirlineCount,
			&statistics.AircraftTypeCount,
			&statistics.DurationSecondsTotal,
			&statistics.DurationSecondsAverage,
			&statistics.DurationSecondsMedian,
			&statistics.DurationSecondsMinimum,
			&statistics.DurationSecondsMaximum,
		)
		if err != nil {
			return err
		}

		if parent, ok := byDirection[direction]; ok {
			parent.DailyStatistics = append(parent.DailyStatistics, statistics)
		}
	}

	return rows.Err()
}

func (fr *FlightRepo) AirportMovements(ctx context.Context, airportIataCode string, dateLocal xtime.LocalDate, direction AirportMovementDirection) ([]Flight, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	firstUtcDate, lastUtcDate, ok, err := airportMovementUtcDateRange(ctx, conn, airportIataCode, dateLocal, direction)
	if err != nil || !ok {
		return []Flight{}, err
	}

	partitionConditions := make([]string, 0, firstUtcDate.DaysUntil(lastUtcDate)+1)
	params := make([]any, 0, cap(partitionConditions)*3+2)
	for date := firstUtcDate; date <= lastUtcDate; date++ {
		year, month, day := date.Date()
		partitionConditions = append(partitionConditions, "(year_utc = ? AND month_utc = ? AND day_utc = ?)")
		params = append(params, year, int(month), day)
	}

	var movementFilter string
	var movementOrder string
	switch direction {
	case AirportMovementDirectionDeparture:
		movementFilter = "departure_airport_iata_code = ? AND departure_date_local = CAST(? AS DATE)"
		movementOrder = "departure_timestamp_utc"
	case AirportMovementDirectionArrival:
		movementFilter = `
arrival_airport_iata_code = ?
AND CAST(
    departure_timestamp_utc
    + TO_SECONDS(CAST(duration_seconds AS BIGINT) + arrival_utc_offset_seconds)
    AS DATE
) = CAST(? AS DATE)
`
		movementOrder = "departure_timestamp_utc + TO_SECONDS(CAST(duration_seconds AS BIGINT) + arrival_utc_offset_seconds)"
	default:
		return nil, fmt.Errorf("invalid airport movement direction %q", direction)
	}
	params = append(params, airportIataCode, dateLocal.String())

	rows, err := conn.QueryContext(
		ctx,
		fmt.Sprintf(
			`
SELECT
    airline_iata_code,
    number,
    suffix,
    departure_timestamp_utc,
    departure_utc_offset_seconds,
    departure_airport_iata_code,
    duration_seconds,
    arrival_utc_offset_seconds,
    arrival_airport_iata_code,
    service_type,
    aircraft_owner,
    aircraft_iata_code,
    seats_first,
    seats_business,
    seats_premium,
    seats_economy,
    aircraft_configuration_version,
    code_shares,
    data_elements
FROM flight_variant_history_latest
WHERE (%s)
AND %s
ORDER BY %s, airline_iata_code, number, suffix
`,
			strings.Join(partitionConditions, " OR "),
			movementFilter,
			movementOrder,
		),
		params...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanFlights(rows)
}

func airportMovementUtcDateRange(ctx context.Context, conn *sql.Conn, airportIataCode string, dateLocal xtime.LocalDate, direction AirportMovementDirection) (xtime.LocalDate, xtime.LocalDate, bool, error) {
	var query string
	switch direction {
	case AirportMovementDirectionDeparture:
		query = `
SELECT
    MIN(departure_utc_offset_seconds),
    MAX(departure_utc_offset_seconds),
    CAST(0 AS UBIGINT)
FROM flight_variants
WHERE departure_airport_iata_code = ?
`
	case AirportMovementDirectionArrival:
		query = `
SELECT
    MIN(arrival_utc_offset_seconds),
    MAX(arrival_utc_offset_seconds),
    MAX(duration_seconds)
FROM flight_variants
WHERE arrival_airport_iata_code = ?
`
	default:
		return 0, 0, false, fmt.Errorf("invalid airport movement direction %q", direction)
	}

	var minimumOffsetSeconds sql.NullInt64
	var maximumOffsetSeconds sql.NullInt64
	var maximumDurationSeconds sql.NullInt64
	err := conn.QueryRowContext(ctx, query, airportIataCode).Scan(
		&minimumOffsetSeconds,
		&maximumOffsetSeconds,
		&maximumDurationSeconds,
	)
	if err != nil {
		return 0, 0, false, err
	}
	if !minimumOffsetSeconds.Valid || !maximumOffsetSeconds.Valid || !maximumDurationSeconds.Valid {
		return 0, 0, false, nil
	}

	localStart := dateLocal.Time(time.UTC)
	localEnd := (dateLocal + 1).Time(time.UTC)
	firstDepartureUtc := localStart.
		Add(-time.Duration(maximumOffsetSeconds.Int64) * time.Second).
		Add(-time.Duration(maximumDurationSeconds.Int64) * time.Second)
	lastDepartureUtc := localEnd.
		Add(-time.Duration(minimumOffsetSeconds.Int64) * time.Second).
		Add(-time.Nanosecond)

	return xtime.NewLocalDate(firstDepartureUtc), xtime.NewLocalDate(lastDepartureUtc), true, nil
}
