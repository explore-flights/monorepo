package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/database/business"
	"github.com/explore-flights/monorepo/go/database/util"
	"os"
	"path/filepath"
	"time"
)

const (
	numThreads    = 16
	setThreads    = "SET threads TO 16"
	workingDbName = "tmp_db"
)

type updater struct {
	s3c interface {
		adapt.S3Getter
		adapt.S3Putter
	}
	parquetFileUriSchema string
}

func (u *updater) UpdateDatabase(
	ctx context.Context,
	t time.Time,
	databaseBucket,
	fullDatabaseKey,
	baseDataDatabaseKey,
	parquetBucket,
	variantsKey,
	reportKey,
	historyPrefix,
	latestPrefix,
	inputBucket,
	inputKey,
	updateSummaryBucket,
	updateSummaryKey string,
	skipUpdateDatabase bool) error {

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	if err := util.WithTempDir(func(tmpDir string) error {
		ddbHomePath := filepath.Join(tmpDir, "duckdb-home")
		tmpDbPath := filepath.Join(tmpDir, "tmp.db")
		dstDbPath := filepath.Join(tmpDir, "dst.db")

		if err := os.Mkdir(ddbHomePath, 0750); err != nil {
			return err
		}

		if err := util.RunTimed("download db file", func() error {
			return util.DownloadS3File(ctx, u.s3c, databaseBucket, fullDatabaseKey, tmpDbPath)
		}); err != nil {
			return err
		}

		if err := util.WithDatabase(ctx, ddbHomePath, tmpDbPath, workingDbName, numThreads, func(conn *sql.Conn) error {
			if !skipUpdateDatabase {
				if err := util.RunTimed("update database", func() error {
					return u.runUpdateDatabase(ctx, t, conn, inputBucket, inputKey, updateSummaryBucket, updateSummaryKey)
				}); err != nil {
					return err
				}
			}

			if err := util.RunTimed("create and upload basedata db", func() error {
				return u.createAndUploadBaseDataDb(ctx, conn, tmpDir, databaseBucket, baseDataDatabaseKey)
			}); err != nil {
				return err
			}

			if err := util.RunTimed("export variants", func() error {
				return u.exportVariants(ctx, conn, parquetBucket, variantsKey)
			}); err != nil {
				return err
			}

			if err := util.RunTimed("export report", func() error {
				return u.exportReport(ctx, conn, parquetBucket, reportKey)
			}); err != nil {
				return err
			}

			if err := util.RunTimed("export history", func() error {
				return u.exportHistory(ctx, conn, parquetBucket, historyPrefix)
			}); err != nil {
				return err
			}

			if err := util.RunTimed("export latest", func() error {
				return u.exportLatest(ctx, conn, parquetBucket, latestPrefix)
			}); err != nil {
				return err
			}

			if !skipUpdateDatabase {
				if _, err := util.ExportDatabase(ctx, conn, workingDbName, dstDbPath, true, true, numThreads); err != nil {
					return err
				}
			}

			return nil
		}); err != nil {
			return err
		}

		if !skipUpdateDatabase {
			if err := util.RunTimed("upload db file", func() error {
				return util.UploadS3File(ctx, u.s3c, databaseBucket, fullDatabaseKey, dstDbPath)
			}); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (u *updater) runUpdateDatabase(ctx context.Context, t time.Time, conn *sql.Conn, inputBucket, inputKey, updateSummaryBucket, updateSummaryKey string) error {
	return util.WithTempDir(func(tmpDir string) error {
		if err := util.DownloadAndUpackGzippedTar(ctx, u.s3c, inputBucket, inputKey, tmpDir); err != nil {
			return fmt.Errorf("failed to download and upack tar: %w", err)
		}

		_, err := conn.ExecContext(ctx, fmt.Sprintf(`USE %s`, workingDbName))
		if err != nil {
			return err
		}

		upd := business.Updater{}
		rows, err := upd.RunUpdateSequence(ctx, conn, t, tmpDir+"/**/*.json")
		if err != nil {
			return err
		}

		fmt.Printf("rows: %+v\n", rows)

		if updateSummaryBucket != "" && updateSummaryKey != "" {
			jsonBytes, err := json.MarshalIndent(rows, "", "\t")
			if err != nil {
				return err
			}

			if err := adapt.S3PutRaw(ctx, u.s3c, updateSummaryBucket, updateSummaryKey, jsonBytes); err != nil {
				return fmt.Errorf("failed to upload update summary: %w", err)
			}
		}

		return nil
	})
}

func (u *updater) createAndUploadBaseDataDb(ctx context.Context, conn *sql.Conn, tmpDir, bucket, key string) error {
	tmpFilePath := filepath.Join(tmpDir, "basedata.temp.db")
	finalFilePath := filepath.Join(tmpDir, "basedata.db")

	defer os.Remove(tmpFilePath)
	defer os.Remove(finalFilePath)

	tmpDbName, err := util.ExportDatabase(ctx, conn, workingDbName, tmpFilePath, false, false, numThreads)
	if err != nil {
		return fmt.Errorf("failed to copy tmp db name: %w", err)
	}

	sequence := util.UpdateSequence{
		{
			Name:   "use basedata db",
			Script: fmt.Sprintf(`USE %s`, tmpDbName),
		},
		{
			Name:   "drop aircraft lh mapping",
			Script: `DROP TABLE aircraft_lh_mapping`,
		},
		{
			Name: "delete unused basedata",
			Script: `
DELETE FROM airline_icao_codes icao
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = icao.airline_id ) ;

DELETE FROM airlines al
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = al.id ) ;

DELETE FROM airports ap
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.departure_airport_id = ap.id OR fv.arrival_airport_id = ap.id ) ;

DELETE FROM aircraft ac
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.aircraft_id = ac.id ) ;

DELETE FROM aircraft_types act
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_type_id = act.id ) ;

DELETE FROM aircraft_families acf
WHERE NOT EXISTS ( FROM aircraft ac WHERE ac.aircraft_family_id = acf.id )
AND NOT EXISTS ( FROM aircraft_types act WHERE act.aircraft_family_id = acf.id ) ;
`,
		},
		{
			Name:   "drop history",
			Script: "DROP TABLE flight_variant_history",
		},
		{
			Name:   "drop variants",
			Script: "DROP TABLE flight_variants",
		},
	}

	if err = sequence.Run(ctx, conn, nil); err != nil {
		return fmt.Errorf("failed to run update sequence: %w", err)
	}

	if _, err = util.ExportDatabase(ctx, conn, tmpDbName, finalFilePath, true, true, numThreads); err != nil {
		return fmt.Errorf("failed to copy tmp db name: %w", err)
	}

	if err = util.UploadS3File(ctx, u.s3c, bucket, key, finalFilePath); err != nil {
		return fmt.Errorf("failed to upload basedata db file: %w", err)
	}

	return nil
}

func (u *updater) exportVariants(ctx context.Context, conn *sql.Conn, bucket, key string) error {
	exportUri := u.buildParquetFileUri(bucket, key)
	sequence := util.UpdateSequence{
		{
			Name:   "use working db",
			Script: fmt.Sprintf(`USE %s`, workingDbName),
		},
		{
			Name:   "single thread",
			Script: "SET threads TO 1",
		},
		{
			Name:   "export variants",
			Script: fmt.Sprintf(`COPY flight_variants TO '%s' ( FORMAT parquet, COMPRESSION gzip, OVERWRITE_OR_IGNORE )`, exportUri),
		},
		{
			Name:   "reset threads",
			Script: setThreads,
		},
	}

	return sequence.Run(ctx, conn, nil)
}

func (u *updater) exportReport(ctx context.Context, conn *sql.Conn, bucket, key string) error {
	exportUri := u.buildParquetFileUri(bucket, key)
	sequence := util.UpdateSequence{
		{
			Name:   "use working db",
			Script: fmt.Sprintf(`USE %s`, workingDbName),
		},
		{
			Name:   "single thread",
			Script: "SET threads TO 1",
		},
		{
			Name: "create macros",
			Script: `
CREATE OR REPLACE MACRO last_day_of_month(date, month) AS LAST_DAY(MAKE_DATE(YEAR(date), month, 1)) ;

CREATE OR REPLACE MACRO last_weekday_of_month(date, month, weekday) AS CASE
  WHEN DATE_PART('weekday', LAST_DAY_OF_MONTH(date, month)) = weekday THEN LAST_DAY_OF_MONTH(date, month)
  ELSE CAST(DATE_ADD(LAST_DAY_OF_MONTH(date, month), -INTERVAL ((DATE_PART('weekday', LAST_DAY_OF_MONTH(date, month)) - weekday + 7) % 7) DAY) AS DATE)
END ;

CREATE OR REPLACE MACRO is_summer_schedule(date) AS date >= LAST_WEEKDAY_OF_MONTH(date, 3, 0) AND date <= LAST_WEEKDAY_OF_MONTH(date, 10, 6) ;
`,
		},
		{
			Name: "export report",
			Script: fmt.Sprintf(
				`
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
		fv.aircraft_configuration_version,
		(fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix) AS is_operating,
		fv.duration_seconds - (fv.duration_seconds %% (60 * 5)) AS duration_seconds_5m_trunc,
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
		fv.aircraft_configuration_version,
		(fvh.airline_id = fv.operating_airline_id AND fvh.number = fv.operating_number AND fvh.suffix = fv.operating_suffix),
		fv.duration_seconds - (fv.duration_seconds %% (60 * 5))
) TO '%s' (
	FORMAT parquet,
	COMPRESSION gzip,
	OVERWRITE_OR_IGNORE
)
`,
				exportUri,
			),
		},
		{
			Name:   "drop macros",
			Script: `DROP MACRO is_summer_schedule; DROP MACRO last_weekday_of_month; DROP MACRO last_day_of_month;`,
		},
		{
			Name:   "reset threads",
			Script: setThreads,
		},
	}

	return sequence.Run(ctx, conn, nil)
}

func (u *updater) exportHistory(ctx context.Context, conn *sql.Conn, bucket, prefix string) error {
	exportUri := u.buildParquetFileUri(bucket, prefix)
	sequence := util.UpdateSequence{
		{
			Name:   "use working db",
			Script: fmt.Sprintf(`USE %s`, workingDbName),
		},
		{
			Name:   "single thread",
			Script: "SET threads TO 1",
		},
		{
			Name: "export history",
			Script: fmt.Sprintf(
				`
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
    (fvh.number %% 10) AS number_mod_10
  FROM flight_variant_history fvh
  LEFT JOIN flight_variants fv
  ON fvh.flight_variant_id = fv.id
  ORDER BY fvh.airline_id ASC, number_mod_10 ASC
) TO '%s' (
  FORMAT parquet,
  COMPRESSION gzip,
  PARTITION_BY (airline_id, number_mod_10),
  OVERWRITE_OR_IGNORE
)
`,
				exportUri,
			),
		},
		{
			Name:   "reset threads",
			Script: setThreads,
		},
	}

	return sequence.Run(ctx, conn, nil)
}

func (u *updater) exportLatest(ctx context.Context, conn *sql.Conn, bucket, prefix string) error {
	exportUri := u.buildParquetFileUri(bucket, prefix)
	sequence := util.UpdateSequence{
		{
			Name:   "use working db",
			Script: fmt.Sprintf(`USE %s`, workingDbName),
		},
		{
			Name:   "single thread",
			Script: "SET threads TO 1",
		},
		{
			Name: "export latest",
			Script: fmt.Sprintf(
				`
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
      fv.aircraft_configuration_version,
      fv.aircraft_registration,
      fv.code_shares
    FROM latest_active_history fvh
    INNER JOIN flight_variants fv
    ON fvh.flight_variant_id = fv.id
    AND fvh.airline_id = fv.operating_airline_id
    AND fvh.number = fv.operating_number
    AND fvh.suffix = fv.operating_suffix
  )
  ORDER BY year_utc ASC, month_utc ASC, day_utc ASC
) TO '%s' (
  FORMAT parquet,
  COMPRESSION gzip,
  PARTITION_BY (year_utc, month_utc, day_utc),
  OVERWRITE_OR_IGNORE
)
`,
				exportUri,
			),
		},
		{
			Name:   "reset threads",
			Script: setThreads,
		},
	}

	return sequence.Run(ctx, conn, nil)
}

func (u *updater) buildParquetFileUri(bucket, key string) string {
	return fmt.Sprintf("%s://%s/%s", u.parquetFileUriSchema, bucket, key)
}
