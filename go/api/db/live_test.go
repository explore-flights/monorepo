package db

import (
	"context"
	"testing"
	"time"
)

func TestLiveFlightsBoundariesAndNextDeparture(t *testing.T) {
	database := newAirportTestDatabase(t)
	database.SetMaxOpenConns(1)
	mustExecAirportTest(t, database, `
 SET TimeZone = 'Europe/Berlin';
 CREATE TABLE flight_variant_history_latest (
 airline_iata_code TEXT, number INTEGER, suffix TEXT,
 departure_airport_iata_code TEXT, arrival_airport_iata_code TEXT,
 departure_timestamp_utc TIMESTAMP, duration_seconds INTEGER, service_type TEXT
 );
 INSERT INTO flight_variant_history_latest VALUES
 ('LH', 1, '', 'FRA', 'JFK', '2025-12-31 23:00:00', 7200, 'J'),
 ('LH', 2, 'A', 'JFK', 'FRA', '2026-01-01 00:00:00', 3600, 'J'),
 ('LH', 3, '', 'FRA', 'LHR', '2025-12-31 23:00:00', 3600, 'J'),
 ('LH', 4, '', 'LHR', 'FRA', '2026-01-01 00:00:00.500', 3600, 'J'),
 ('LH', 5, '', 'FRA', 'JFK', '2026-01-01 00:00:00.500', 3600, 'J'),
 ('LH', 6, '', 'FRA', 'QKL', '2026-01-01 00:00:00.100', 3600, 'C'),
 ('LH', 7, '', 'FRA', 'QKL', '2025-12-31 23:00:00', 7200, 'F'),
 ('LH', 8, '', 'FRA', 'JFK', '2026-01-01 00:00:00', 0, 'J'),
 ('LH', 9, '', 'FRA', 'JFK', '2026-01-02 00:00:00', 3600, 'F');
 `)
	repo := NewFlightRepo(database)
	timestamp, _ := time.Parse(time.RFC3339Nano, "2026-01-01T01:00:00+01:00")
	flights, next, err := repo.LiveFlights(context.Background(), timestamp)
	if err != nil {
		t.Fatal(err)
	}
	if len(flights) != 2 || flights[0].Number != 1 || flights[1].Number != 2 {
		t.Fatalf("unexpected flights: %+v", flights)
	}
	if next == nil || next.Format(time.RFC3339Nano) != "2026-01-01T00:00:00.5Z" {
		t.Fatalf("unexpected next departure: %v", next)
	}
	flights, next, err = repo.LiveFlights(context.Background(), *next)
	if err != nil {
		t.Fatal(err)
	}
	if len(flights) != 4 || next != nil {
		t.Fatalf("exact next timestamp: flights=%+v next=%v", flights, next)
	}
	flights, next, err = repo.LiveFlights(context.Background(), timestamp.Add(24*time.Hour))
	if err != nil || len(flights) != 0 || next != nil {
		t.Fatalf("exhausted: flights=%v next=%v err=%v", flights, next, err)
	}
	flights, next, err = repo.LiveFlights(context.Background(), timestamp.Add(-24*time.Hour))
	if err != nil || len(flights) != 0 || next == nil {
		t.Fatalf("before first departure: flights=%v next=%v err=%v", flights, next, err)
	}
}
