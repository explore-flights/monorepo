package db

import (
	"context"
	"database/sql"
	"testing"

	"github.com/duckdb/duckdb-go/v2"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

func TestAirportStatistics(t *testing.T) {
	database := newAirportTestDatabase(t)
	mustExecAirportTest(t, database, `
CREATE TABLE airport_statistics AS
SELECT
    'FRA'::TEXT AS airport_iata_code,
    'departure'::TEXT AS direction,
    2026::USMALLINT AS year_local,
    2::UBIGINT AS scheduled_legs,
    1::UINTEGER AS route_count,
    1::UINTEGER AS airline_count,
    1::UINTEGER AS aircraft_type_count,
    DATE '2026-01-01' AS first_date_local,
    DATE '2026-01-02' AS last_date_local,
    43200::UBIGINT AS duration_seconds_total,
    21600::DOUBLE AS duration_seconds_average,
    21600::DOUBLE AS duration_seconds_median,
    21000::UINTEGER AS duration_seconds_minimum,
    22200::UINTEGER AS duration_seconds_maximum,
    [STRUCT_PACK(
        other_airport_iata_code := 'JFK'::TEXT,
        operating_airline_iata_code := 'LH'::TEXT,
        aircraft_iata_code := '359'::TEXT,
        scheduled_legs := 2::UBIGINT,
        first_date_local := DATE '2026-01-01',
        last_date_local := DATE '2026-01-02',
        duration_seconds_total := 43200::UBIGINT,
        duration_seconds_average := 21600::DOUBLE,
        duration_seconds_median := 21600::DOUBLE,
        duration_seconds_minimum := 21000::UINTEGER,
        duration_seconds_maximum := 22200::UINTEGER
    )] AS route_statistics,
    [STRUCT_PACK(
        date_local := DATE '2026-01-01',
        scheduled_legs := 1::UBIGINT,
        route_count := 1::UINTEGER,
        airline_count := 1::UINTEGER,
        aircraft_type_count := 1::UINTEGER,
        duration_seconds_total := 21000::UBIGINT,
        duration_seconds_average := 21000::DOUBLE,
        duration_seconds_median := 21000::DOUBLE,
        duration_seconds_minimum := 21000::UINTEGER,
        duration_seconds_maximum := 21000::UINTEGER
    )] AS daily_statistics
`)

	repo := NewFlightRepo(database)
	statistics, err := repo.AirportStatistics(context.Background(), "FRA", 2026)
	if err != nil {
		t.Fatalf("AirportStatistics returned an error: %v", err)
	}
	if len(statistics) != 1 {
		t.Fatalf("AirportStatistics returned %d rows, want 1", len(statistics))
	}

	got := statistics[0]
	if got.Direction != AirportMovementDirectionDeparture || got.ScheduledLegs != 2 {
		t.Fatalf("unexpected summary: %+v", got)
	}
	if len(got.RouteStatistics) != 1 || got.RouteStatistics[0].OtherAirportIataCode != "JFK" {
		t.Fatalf("unexpected route statistics: %+v", got.RouteStatistics)
	}
	if len(got.DailyStatistics) != 1 || got.DailyStatistics[0].DateLocal.String() != "2026-01-01" {
		t.Fatalf("unexpected daily statistics: %+v", got.DailyStatistics)
	}
}

func TestAirportMovementsUsesLocalDatesAcrossUtcPartitions(t *testing.T) {
	database := newAirportTestDatabase(t)
	mustExecAirportTest(t, database, `
CREATE TABLE flight_variants (
    departure_airport_iata_code TEXT,
    departure_utc_offset_seconds INTEGER,
    duration_seconds UINTEGER,
    arrival_airport_iata_code TEXT,
    arrival_utc_offset_seconds INTEGER
);
INSERT INTO flight_variants VALUES
    ('FRA', 50400, 7200, 'DXB', 14400),
    ('JFK', -18000, 36000, 'FRA', 3600);

CREATE TABLE flight_variant_history_latest (
    airline_iata_code TEXT,
    number USMALLINT,
    suffix TEXT,
    departure_timestamp_utc TIMESTAMP,
    departure_utc_offset_seconds INTEGER,
    departure_airport_iata_code TEXT,
    departure_date_local DATE,
    duration_seconds UINTEGER,
    arrival_utc_offset_seconds INTEGER,
    arrival_airport_iata_code TEXT,
    service_type TEXT,
    aircraft_owner TEXT,
    aircraft_iata_code TEXT,
    seats_first USMALLINT,
    seats_business USMALLINT,
    seats_premium USMALLINT,
    seats_economy USMALLINT,
    aircraft_configuration_version TEXT,
    code_shares STRUCT(airline_iata_code TEXT, number USMALLINT, suffix TEXT)[],
    data_elements MAP(INTEGER, TEXT),
    year_utc USMALLINT,
    month_utc USMALLINT,
    day_utc USMALLINT
);
INSERT INTO flight_variant_history_latest VALUES
    ('LH', 700, '', TIMESTAMP '2025-12-31 11:00:00', 50400, 'FRA', DATE '2026-01-01', 7200, 14400, 'DXB', 'J', 'LH', '359', 0, 48, 24, 201, 'C48E24M201', [{'airline_iata_code': 'UA', 'number': 900, 'suffix': ''}], MAP {1: 'departure'}, 2025, 12, 31),
    ('LH', 401, '', TIMESTAMP '2025-12-31 20:00:00', -18000, 'JFK', DATE '2025-12-31', 36000, 3600, 'FRA', 'J', 'LH', '359', 0, 48, 24, 201, 'C48E24M201', [], MAP {2: 'arrival'}, 2025, 12, 31),
    ('LH', 402, '', TIMESTAMP '2026-01-01 20:00:00', -18000, 'JFK', DATE '2026-01-01', 36000, 3600, 'FRA', 'J', 'LH', '359', 0, 48, 24, 201, 'C48E24M201', [], MAP {}, 2026, 1, 1)
`)

	repo := NewFlightRepo(database)
	date := xtime.MustParseLocalDate("2026-01-01")

	departures, err := repo.AirportMovements(context.Background(), "FRA", date, AirportMovementDirectionDeparture)
	if err != nil {
		t.Fatalf("AirportMovements departures returned an error: %v", err)
	}
	if len(departures) != 1 || departures[0].Number != 700 {
		t.Fatalf("unexpected departures: %+v", departures)
	}
	if departures[0].DepartureTime.Format("2006-01-02T15:04:05-07:00") != "2026-01-01T01:00:00+14:00" {
		t.Fatalf("unexpected local departure time: %s", departures[0].DepartureTime)
	}

	arrivals, err := repo.AirportMovements(context.Background(), "FRA", date, AirportMovementDirectionArrival)
	if err != nil {
		t.Fatalf("AirportMovements arrivals returned an error: %v", err)
	}
	if len(arrivals) != 1 || arrivals[0].Number != 401 {
		t.Fatalf("unexpected arrivals: %+v", arrivals)
	}
	if arrivals[0].ArrivalTime.Format("2006-01-02T15:04:05-07:00") != "2026-01-01T07:00:00+01:00" {
		t.Fatalf("unexpected local arrival time: %s", arrivals[0].ArrivalTime)
	}
}

func newAirportTestDatabase(t *testing.T) *sql.DB {
	t.Helper()

	connector, err := duckdb.NewConnector("", nil)
	if err != nil {
		t.Fatalf("create DuckDB connector: %v", err)
	}
	database := sql.OpenDB(connector)
	t.Cleanup(func() {
		if err := database.Close(); err != nil {
			t.Errorf("close DuckDB database: %v", err)
		}
		if err := connector.Close(); err != nil {
			t.Errorf("close DuckDB connector: %v", err)
		}
	})

	return database
}

func mustExecAirportTest(t *testing.T, database *sql.DB, query string) {
	t.Helper()

	if _, err := database.Exec(query); err != nil {
		t.Fatalf("execute fixture SQL: %v", err)
	}
}
