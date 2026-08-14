from __future__ import annotations

import tempfile
import unittest
from datetime import date
from pathlib import Path

import duckdb

from updater import job


class AirportStatisticsExportTest(unittest.TestCase):
    def test_exports_operating_leg_summaries_with_arrival_local_dates(self) -> None:
        with tempfile.TemporaryDirectory(prefix="airport_statistics_test_") as tmp_dir:
            conn = duckdb.connect(":memory:")
            conn.execute("ATTACH ':memory:' AS tmp_db")
            conn.execute("USE tmp_db")
            conn.execute(
                """
CREATE TABLE flight_variants (
    id UUID NOT NULL,
    operating_airline_iata_code TEXT NOT NULL,
    operating_number USMALLINT NOT NULL,
    operating_suffix TEXT NOT NULL,
    departure_time_local TIME NOT NULL,
    departure_utc_offset_seconds INT NOT NULL,
    duration_seconds UINTEGER NOT NULL,
    arrival_airport_iata_code TEXT NOT NULL,
    arrival_utc_offset_seconds INT NOT NULL,
    aircraft_iata_code TEXT NOT NULL
)
"""
            )
            conn.execute(
                """
CREATE TABLE flight_variant_history (
    airline_iata_code TEXT NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    departure_airport_iata_code TEXT NOT NULL,
    departure_date_local DATE NOT NULL,
    replaced_at TIMESTAMPTZ,
    flight_variant_id UUID
)
"""
            )
            conn.execute(
                """
INSERT INTO flight_variants VALUES
    ('00000000-0000-0000-0000-000000000001', 'LH', 400, '', TIME '22:00:00', 3600, 28800, 'JFK', -18000, '744'),
    ('00000000-0000-0000-0000-000000000002', 'LH', 401, '', TIME '12:00:00', -18000, 25200, 'FRA', 3600, '744')
"""
            )
            conn.execute(
                """
INSERT INTO flight_variant_history VALUES
    ('LH', 400, '', 'FRA', DATE '2026-01-01', NULL, '00000000-0000-0000-0000-000000000001'),
    ('LH', 400, '', 'FRA', DATE '2026-01-02', NULL, '00000000-0000-0000-0000-000000000001'),
    ('UA', 9600, '', 'FRA', DATE '2026-01-01', NULL, '00000000-0000-0000-0000-000000000001'),
    ('LH', 401, '', 'JFK', DATE '2025-12-31', NULL, '00000000-0000-0000-0000-000000000002'),
    ('LH', 401, '', 'JFK', DATE '2025-12-30', TIMESTAMPTZ '2026-01-01T00:00:00Z', '00000000-0000-0000-0000-000000000002')
"""
            )

            previous_uri_schema = job.PARQUET_URI_SCHEMA
            try:
                job.PARQUET_URI_SCHEMA = "file"
                job._export_airport_statistics(conn, tmp_dir, "airport_statistics.parquet")
            finally:
                job.PARQUET_URI_SCHEMA = previous_uri_schema
                conn.close()

            parquet_path = Path(tmp_dir, "airport_statistics.parquet")
            with duckdb.connect(":memory:") as result_conn:
                rows = result_conn.execute(
                    """
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
    duration_seconds_median,
    LEN(route_statistics),
    route_statistics[1].scheduled_legs,
    LEN(daily_statistics)
FROM read_parquet(?)
ORDER BY airport_iata_code, direction, year_local
""",
                    [str(parquet_path)],
                ).fetchall()

            self.assertEqual(
                rows,
                [
                    (
                        "FRA",
                        "arrival",
                        2026,
                        1,
                        1,
                        1,
                        1,
                        date(2026, 1, 1),
                        date(2026, 1, 1),
                        25200.0,
                        1,
                        1,
                        1,
                    ),
                    (
                        "FRA",
                        "departure",
                        2026,
                        2,
                        1,
                        1,
                        1,
                        date(2026, 1, 1),
                        date(2026, 1, 2),
                        28800.0,
                        1,
                        2,
                        2,
                    ),
                    (
                        "JFK",
                        "arrival",
                        2026,
                        2,
                        1,
                        1,
                        1,
                        date(2026, 1, 2),
                        date(2026, 1, 3),
                        28800.0,
                        1,
                        2,
                        2,
                    ),
                    (
                        "JFK",
                        "departure",
                        2025,
                        1,
                        1,
                        1,
                        1,
                        date(2025, 12, 31),
                        date(2025, 12, 31),
                        25200.0,
                        1,
                        1,
                        1,
                    ),
                ],
            )


if __name__ == "__main__":
    unittest.main()
