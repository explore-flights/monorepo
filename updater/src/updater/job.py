from __future__ import annotations

import json
import logging
from pathlib import Path
import secrets
import tarfile
import tempfile
import time

import duckdb

from .config import Settings
from .sql_runner import UpdateScript
from .storage import Storage
from .util import timed, run_timed

LOGGER = logging.getLogger(__name__)
NUM_THREADS = 16
WORKING_DB_NAME = "tmp_db"
STORAGE_SCHEMA = "s3"
PARQUET_URI_SCHEMA = STORAGE_SCHEMA


@timed(LOGGER, "run")
def run(settings: Settings) -> None:
    storage = Storage.get(STORAGE_SCHEMA)

    with tempfile.TemporaryDirectory(prefix="duckdb_update_database_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        ddb_home_dir = tmp_dir.joinpath("duckdb-home")
        tmp_db_path = tmp_dir.joinpath("tmp.db")
        dst_db_path = tmp_dir.joinpath("dst.db")

        ddb_home_dir.mkdir(parents=True, exist_ok=True)

        run_timed(LOGGER, "download database", lambda: storage.download_file(settings.database_bucket, settings.full_database_key, tmp_db_path))

        with duckdb.connect(":memory:") as conn:
            _init_connection(conn, ddb_home_dir, tmp_db_path)

            if not settings.skip_update_database:
                _run_update_database(conn, storage, settings)

            _create_and_upload_basedata_db(conn, storage, tmp_dir, settings)
            _export_variants(conn, settings)
            _export_report(conn, settings)
            _export_connections(conn, settings)
            _export_history(conn, settings)
            _export_latest(conn, settings)

            if not settings.skip_update_database:
                _export_database(
                    conn=conn,
                    src_db_name=WORKING_DB_NAME,
                    dst_db_file_path=dst_db_path,
                    detach_dst=True,
                    detach_src=True,
                    num_threads_restore=NUM_THREADS,
                )

        if not settings.skip_update_database:
            run_timed(LOGGER, "upload database", lambda: storage.upload_file(settings.database_bucket, settings.full_database_key, dst_db_path))


@timed(LOGGER, "init duckdb")
def _init_connection(conn: duckdb.DuckDBPyConnection, ddb_home_dir: Path, tmp_db_path: Path) -> None:
    boot_queries = [
        f"SET threads TO {NUM_THREADS}",
        f"SET home_directory = '{ddb_home_dir.joinpath("home")}'",
        f"SET secret_directory = '{ddb_home_dir.joinpath("secrets")}'",
        f"SET extension_directory = '{ddb_home_dir.joinpath("extensions")}'",
        f"SET temp_directory = '{ddb_home_dir.joinpath("tmp")}'",
        "SET allow_persistent_secrets = false",
        "SET memory_limit = '22GB'",
        "SET partitioned_write_max_open_files = 1",
        "SET partitioned_write_flush_threshold = 10000",
        "SET TimeZone = 'UTC'",
        f"CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )",
        f"ATTACH '{tmp_db_path}' AS {WORKING_DB_NAME}",
        f"USE {WORKING_DB_NAME}",
    ]

    for idx, query in enumerate(boot_queries):
        run_timed(LOGGER, f"db init ({idx})", lambda: conn.execute(query))


@timed(LOGGER, "update database")
def _run_update_database(conn: duckdb.DuckDBPyConnection, storage: Storage, settings: Settings) -> None:
    with tempfile.TemporaryDirectory(prefix="duckdb_update_input_") as update_input_dir_str:
        update_input_dir = Path(update_input_dir_str)
        archive_path = update_input_dir.joinpath("input.tar.gz")

        storage.download_file(settings.input_bucket, settings.input_key, archive_path)

        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(update_input_dir)

        archive_path.unlink()

        conn.execute(f"USE {WORKING_DB_NAME}")
        rows: dict[str, int] = {}
        created_at = settings.time_utc.isoformat().replace("+00:00", "Z")
        input_pattern = f"{update_input_dir}/**/*.json"
        scripts = [
            UpdateScript(
                name="X11LoadRawData",
                script=_load_sql("11_load_raw_data.sql"),
                params=[[input_pattern]],
            ),
            UpdateScript(
                name="X12UpdateDatabase",
                script=_load_sql("12_update_database.sql"),
                params=[[created_at]],
            ),
            UpdateScript(
                name="X13UpdateHistory",
                script=_load_sql("13_update_history.sql"),
                params=[],
            ),
        ]

        for script in scripts:
            script.run(conn, rows)

        LOGGER.info("update summary rows=%s", rows)

        if settings.update_summary_bucket and settings.update_summary_key:
            payload = json.dumps(rows, indent="\t").encode("utf-8")
            storage.upload_bytes(settings.update_summary_bucket, settings.update_summary_key, payload)


@timed(LOGGER, "create and upload basedata db")
def _create_and_upload_basedata_db(conn: duckdb.DuckDBPyConnection,
                                   storage: Storage,
                                   tmp_dir: Path,
                                   settings: Settings) -> None:

    tmp_file_path = tmp_dir.joinpath("basedata.tmp.db")
    final_file_path = tmp_dir.joinpath("basedata.db")

    tmp_db_name = _export_database(
        conn=conn,
        src_db_name=WORKING_DB_NAME,
        dst_db_file_path=tmp_file_path,
        detach_dst=False,
        detach_src=False,
        num_threads_restore=NUM_THREADS,
    )

    UpdateScript(
        name="basedata cleanup",
        script=f"""
USE {tmp_db_name} ;
DROP TABLE aircraft_lh_mapping ;

DELETE FROM airline_icao_codes icao
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = icao.airline_id ) ;

DELETE FROM airlines al
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = al.id ) ;

DELETE FROM airports ap
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.departure_airport_id = ap.id OR fv.arrival_airport_id = ap.id ) ;

-- delete unused aircraft types
DELETE FROM aircraft ac
WHERE ac.aircraft_type_id IS NOT NULL
AND NOT EXISTS ( FROM flight_variants fv WHERE fv.aircraft_id = ac.aircraft_type_id ) ;

DELETE FROM aircraft_types act
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_type_id = act.id ) ;

-- delete orphaned aircraft families (1)
DELETE FROM aircraft ac
WHERE ac.aircraft_family_id IS NOT NULL
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = ac.aircraft_family_id )
AND NOT EXISTS ( FROM aircraft_families acf WHERE acf.parent_id = ac.aircraft_family_id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id ) ;

-- delete orphaned aircraft families (2)
DELETE FROM aircraft ac
WHERE ac.aircraft_family_id IS NOT NULL
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = ac.aircraft_family_id )
AND NOT EXISTS ( FROM aircraft_families acf WHERE acf.parent_id = ac.aircraft_family_id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id ) ;

-- delete orphaned aircraft families (3)
DELETE FROM aircraft ac
WHERE ac.aircraft_family_id IS NOT NULL
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = ac.aircraft_family_id )
AND NOT EXISTS ( FROM aircraft_families acf WHERE acf.parent_id = ac.aircraft_family_id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id ) ;

-- delete orphaned aircraft families (4)
DELETE FROM aircraft ac
WHERE ac.aircraft_family_id IS NOT NULL
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = ac.aircraft_family_id )
AND NOT EXISTS ( FROM aircraft_families acf WHERE acf.parent_id = ac.aircraft_family_id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id ) ;

-- delete orphaned aircraft families (5)
-- assign:last_orphaned_family_deletion from:rows_affected
DELETE FROM aircraft ac
WHERE ac.aircraft_family_id IS NOT NULL
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = ac.aircraft_family_id )
AND NOT EXISTS ( FROM aircraft_families acf WHERE acf.parent_id = ac.aircraft_family_id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id ) ;

-- assert: last_orphaned_family_deletion == 0

DROP TABLE flight_variant_history ;
DROP TABLE flight_variants ;
""",
    ).run(conn, {})

    _export_database(
        conn=conn,
        src_db_name=tmp_db_name,
        dst_db_file_path=final_file_path,
        detach_dst=True,
        detach_src=True,
        num_threads_restore=NUM_THREADS,
    )

    storage.upload_file(settings.database_bucket, settings.basedata_database_key, final_file_path)


@timed(LOGGER, "export variants")
def _export_variants(conn: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    export_uri = _build_parquet_file_uri(PARQUET_URI_SCHEMA, settings.parquet_bucket, settings.variants_key)
    conn.execute(f"USE {WORKING_DB_NAME}")
    conn.execute("SET threads TO 1")
    conn.execute(
        f"COPY flight_variants TO '{export_uri}' ( FORMAT parquet, COMPRESSION gzip, OVERWRITE_OR_IGNORE )"
    )
    conn.execute(f"SET threads TO {NUM_THREADS}")


@timed(LOGGER, "export report")
def _export_report(conn: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    export_uri = _build_parquet_file_uri(PARQUET_URI_SCHEMA, settings.parquet_bucket, settings.report_key)
    conn.execute(f"USE {WORKING_DB_NAME}")
    conn.execute("SET threads TO 1")
    conn.execute(
        """
CREATE OR REPLACE MACRO last_day_of_month(date, month) AS LAST_DAY(MAKE_DATE(YEAR(date), month, 1)) ;

CREATE OR REPLACE MACRO last_weekday_of_month(date, month, weekday) AS CASE
  WHEN DATE_PART('weekday', LAST_DAY_OF_MONTH(date, month)) = weekday THEN LAST_DAY_OF_MONTH(date, month)
  ELSE CAST(DATE_ADD(LAST_DAY_OF_MONTH(date, month), -INTERVAL ((DATE_PART('weekday', LAST_DAY_OF_MONTH(date, month)) - weekday + 7) % 7) DAY) AS DATE)
END ;

CREATE OR REPLACE MACRO is_summer_schedule(date) AS date >= LAST_WEEKDAY_OF_MONTH(date, 3, 0) AND date <= LAST_WEEKDAY_OF_MONTH(date, 10, 6) ;
"""
    )
    conn.execute(
        f"""
COPY (
	WITH latest_active_history AS (
		SELECT *
		FROM flight_variant_history
		WHERE replaced_at IS NULL
		AND flight_variant_id IS NOT NULL
	)
	SELECT
		YEAR(fvh.departure_date_local) AS year_local,
		MONTH(fvh.departure_date_local) AS month_local,
		CASE
			WHEN IS_SUMMER_SCHEDULE(fvh.departure_date_local) THEN YEAR(fvh.departure_date_local)
			ELSE IF(MONTH(fvh.departure_date_local) >= 10, YEAR(fvh.departure_date_local), YEAR(fvh.departure_date_local) - 1)
		END AS schedule_year,
		IS_SUMMER_SCHEDULE(fvh.departure_date_local) AS is_summer_schedule,
		fvh.airline_id,
		fvh.number,
		fvh.suffix,
		fvh.departure_airport_id,
		fv.arrival_airport_id,
		fv.aircraft_id,
		fv.seats_first,
		fv.seats_business,
		fv.seats_premium,
		fv.seats_economy,
		(fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix) AS is_operating,
		fv.duration_seconds - (fv.duration_seconds % (60 * 5)) AS duration_seconds_5m_trunc,
		COUNT(*) AS count,
		MIN(fv.duration_seconds) AS min_duration_seconds,
		MAX(fv.duration_seconds) AS max_duration_seconds,
		SUM(fv.duration_seconds) AS sum_duration_seconds
	FROM latest_active_history fvh
	INNER JOIN flight_variants fv
	ON fvh.flight_variant_id = fv.id
	WHERE fv.service_type = 'J' OR fv.service_type = 'U'
	GROUP BY
		YEAR(fvh.departure_date_local),
		MONTH(fvh.departure_date_local),
		IS_SUMMER_SCHEDULE(fvh.departure_date_local),
		fvh.airline_id,
		fvh.number,
		fvh.suffix,
		fvh.departure_airport_id,
		fv.arrival_airport_id,
		fv.aircraft_id,
		fv.seats_first,
		fv.seats_business,
		fv.seats_premium,
		fv.seats_economy,
		(fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix),
		fv.duration_seconds - (fv.duration_seconds % (60 * 5))
) TO '{export_uri}' (
	FORMAT parquet,
	COMPRESSION gzip,
	OVERWRITE_OR_IGNORE
)
"""
    )
    conn.execute("DROP MACRO is_summer_schedule; DROP MACRO last_weekday_of_month; DROP MACRO last_day_of_month;")
    conn.execute(f"SET threads TO {NUM_THREADS}")


@timed(LOGGER, "export connections")
def _export_connections(conn: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    export_uri = _build_parquet_file_uri(PARQUET_URI_SCHEMA, settings.parquet_bucket, settings.connections_key)
    conn.execute(f"USE {WORKING_DB_NAME}")
    conn.execute("SET threads TO 1")
    conn.execute(
        f"""
CREATE TABLE airport_connections AS
SELECT DISTINCT departure_airport_id, arrival_airport_id
FROM flight_variants ;

CREATE TABLE airport_connections_full AS
WITH RECURSIVE reachable_airports(departure_airport_id, arrival_airport_id, via, len) USING KEY (departure_airport_id, arrival_airport_id) AS (
	SELECT
		departure_airport_id,
		arrival_airport_id,
		arrival_airport_id AS via,
		CAST(1 AS DOUBLE) AS len
	FROM airport_connections
	
	UNION
	
	(
		SELECT
			ac.departure_airport_id,
			r.arrival_airport_id,
			r.departure_airport_id AS via,
			r.len + 1 AS len
		FROM reachable_airports r
		JOIN airport_connections ac
		ON ac.arrival_airport_id = r.departure_airport_id
		AND ac.departure_airport_id != r.arrival_airport_id
		LEFT JOIN recurring.reachable_airports AS rec
		ON rec.departure_airport_id = ac.departure_airport_id
		AND rec.arrival_airport_id = r.arrival_airport_id
		WHERE (r.len + 1) < COALESCE(rec.len, CAST('Infinity' AS DOUBLE))
	)
)
SELECT departure_airport_id, arrival_airport_id, MIN(len) AS min_flights
FROM reachable_airports
GROUP BY departure_airport_id, arrival_airport_id ;

SET threads TO 1 ;

COPY airport_connections_full TO '{export_uri}' (
	FORMAT parquet,
	COMPRESSION gzip,
	OVERWRITE_OR_IGNORE
) ;

DROP TABLE airport_connections_full ;
DROP TABLE airport_connections ;
"""
    )
    conn.execute(f"SET threads TO {NUM_THREADS}")


@timed(LOGGER, "export history")
def _export_history(conn: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    export_uri = _build_parquet_file_uri(PARQUET_URI_SCHEMA, settings.parquet_bucket, settings.history_prefix)
    conn.execute(f"USE {WORKING_DB_NAME}")
    conn.execute("SET threads TO 1")
    conn.execute(
        f"""
COPY (
  SELECT
    fvh.airline_id,
    fvh.number,
    fvh.suffix,
    fvh.departure_airport_id,
    fvh.departure_date_local,
    fvh.created_at,
    fvh.replaced_at,
    fvh.flight_variant_id,
    fv.operating_airline_id,
    fv.operating_number,
    fv.operating_suffix,
    (fvh.number % 10) AS number_mod_10
  FROM flight_variant_history fvh
  LEFT JOIN flight_variants fv
  ON fvh.flight_variant_id = fv.id
  ORDER BY fvh.airline_id ASC, number_mod_10 ASC
) TO '{export_uri}' (
  FORMAT parquet,
  COMPRESSION gzip,
  PARTITION_BY (airline_id, number_mod_10),
  OVERWRITE_OR_IGNORE
)
"""
    )
    conn.execute(f"SET threads TO {NUM_THREADS}")


@timed(LOGGER, "export latest")
def _export_latest(conn: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    export_uri = _build_parquet_file_uri(PARQUET_URI_SCHEMA, settings.parquet_bucket, settings.latest_prefix)
    conn.execute(f"USE {WORKING_DB_NAME}")
    conn.execute("SET threads TO 1")
    conn.execute(
        f"""
COPY (
  WITH latest_active_history AS (
    SELECT *
    FROM flight_variant_history
    WHERE replaced_at IS NULL
    AND flight_variant_id IS NOT NULL
  )
  SELECT
    *,
    YEAR(departure_timestamp_utc) AS year_utc,
    MONTH(departure_timestamp_utc) AS month_utc,
    DAY(departure_timestamp_utc) AS day_utc
  FROM (
    SELECT
      (fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) AS departure_timestamp_utc,
      fvh.airline_id,
      fvh.number,
      fvh.suffix,
      fvh.departure_airport_id,
      fvh.departure_date_local,
      fvh.created_at,
      fvh.flight_variant_id,
      fv.departure_time_local,
      fv.departure_utc_offset_seconds,
      fv.duration_seconds,
      fv.arrival_airport_id,
      fv.arrival_utc_offset_seconds,
      fv.service_type,
      fv.aircraft_owner,
      fv.aircraft_id,
      fv.seats_first,
	  fv.seats_business,
	  fv.seats_premium,
	  fv.seats_economy,
      fv.code_shares
    FROM latest_active_history fvh
    INNER JOIN flight_variants fv
    ON fvh.flight_variant_id = fv.id
    AND fvh.airline_id = fv.operating_airline_id
    AND fvh.number = fv.operating_number
    AND fvh.suffix = fv.operating_suffix
  )
  ORDER BY year_utc ASC, month_utc ASC, day_utc ASC
) TO '{export_uri}' (
  FORMAT parquet,
  COMPRESSION gzip,
  PARTITION_BY (year_utc, month_utc, day_utc),
  OVERWRITE_OR_IGNORE
)
"""
    )
    conn.execute(f"SET threads TO {NUM_THREADS}")


def _build_parquet_file_uri(schema: str, bucket: str, key: str) -> str:
    return f"{schema}://{bucket}/{key}"


def _load_sql(file_name: str) -> str:
    return Path(__file__).resolve().parent.joinpath("sql", file_name).read_text(encoding="utf-8")


@timed(LOGGER, "export database")
def _export_database(conn: duckdb.DuckDBPyConnection,
                     src_db_name: str,
                     dst_db_file_path: Path,
                     detach_dst: bool,
                     detach_src: bool,
                     num_threads_restore: int) -> str:

    tmp_export_db_name = _generate_identifier()
    conn.execute(f"ATTACH '{dst_db_file_path}' AS {tmp_export_db_name}")
    _copy_database(conn, src_db_name, tmp_export_db_name, num_threads_restore)

    if detach_dst or detach_src:
        conn.execute("USE memory")

    if detach_dst:
        conn.execute(f"DETACH {tmp_export_db_name}")

    if detach_src:
        conn.execute(f"DETACH {src_db_name}")

    return tmp_export_db_name


@timed(LOGGER, "copy database")
def _copy_database(conn: duckdb.DuckDBPyConnection,
                   src_db_name: str,
                   dst_db_name: str,
                   num_threads_restore: int) -> None:

    conn.execute("SET threads TO 1")
    conn.execute(f"COPY FROM DATABASE {src_db_name} TO {dst_db_name}")
    conn.execute(f"SET threads TO {num_threads_restore}")


def _generate_identifier() -> str:
    return f"id{secrets.token_hex(5)}_{int(time.time()):x}"


def _sql_escape_path(path: Path) -> str:
    return str(path).replace("'", "''")
