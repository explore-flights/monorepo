package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"database/sql/driver"
	"encoding/binary"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/explore-flights/monorepo/go/database/db"
	"github.com/marcboeker/go-duckdb/v2"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	setThreads    = "SET threads TO 16"
	workingDbName = "tmp_db"
)

type updater struct {
	s3c interface {
		adapt.S3Getter
		adapt.S3Putter
	}
	parquetFileUriSchema string
	inputFileUriSchema   string
}

func (u *updater) UpdateDatabase(
	ctx context.Context,
	t time.Time,
	databaseBucket,
	fullDatabaseKey,
	baseDataDatabaseKey,
	parquetBucket,
	variantsKey,
	historyPrefix,
	latestPrefix,
	inputBucket,
	inputPrefix string,
	dateRanges xtime.LocalDateRanges) error {

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	if err := u.withTempDir(func(tmpDir string) error {
		ddbHomePath := filepath.Join(tmpDir, "duckdb-home")
		tmpDbPath := filepath.Join(tmpDir, "tmp.db")
		dstDbPath := filepath.Join(tmpDir, "dst.db")

		if err := os.Mkdir(ddbHomePath, 0750); err != nil {
			return err
		}

		if err := u.runTimed("download db file", func() error {
			return u.downloadS3File(ctx, databaseBucket, fullDatabaseKey, tmpDbPath)
		}); err != nil {
			return err
		}

		if err := u.withDatabase(ctx, ddbHomePath, tmpDbPath, func(conn *sql.Conn) error {
			if !dateRanges.Empty() {
				if err := u.runTimed("update database", func() error {
					return u.runMainUpdateSequence(ctx, t, conn, u.buildInputFileUris(inputBucket, inputPrefix, dateRanges))
				}); err != nil {
					return err
				}
			}

			if err := u.runTimed("create and upload basedata db", func() error {
				return u.createAndUploadBaseDataDb(ctx, conn, tmpDir, databaseBucket, baseDataDatabaseKey)
			}); err != nil {
				return err
			}

			if err := u.runTimed("export variants", func() error {
				return u.exportVariants(ctx, conn, parquetBucket, variantsKey)
			}); err != nil {
				return err
			}

			if err := u.runTimed("export history", func() error {
				return u.exportHistory(ctx, conn, parquetBucket, historyPrefix)
			}); err != nil {
				return err
			}

			if err := u.runTimed("export latest", func() error {
				return u.exportLatest(ctx, conn, parquetBucket, latestPrefix)
			}); err != nil {
				return err
			}

			if _, err := u.exportDatabase(ctx, conn, workingDbName, dstDbPath, true, true); err != nil {
				return err
			}

			return nil
		}); err != nil {
			return err
		}

		if err := u.runTimed("upload db file", func() error {
			return u.uploadDbFile(ctx, databaseBucket, fullDatabaseKey, dstDbPath)
		}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (u *updater) downloadS3File(ctx context.Context, bucket, key, dstFilePath string) error {
	f, err := os.Create(dstFilePath)
	if err != nil {
		return fmt.Errorf("failed to create dst file %q: %w", dstFilePath, err)
	}
	defer f.Close()

	return u.copyS3FileTo(ctx, bucket, key, f)
}

func (u *updater) copyS3FileTo(ctx context.Context, bucket, key string, w io.Writer) error {
	resp, err := u.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed GetObject for key %q: %w", key, err)
	}
	defer resp.Body.Close()

	if _, err = io.Copy(w, resp.Body); err != nil {
		return fmt.Errorf("failed to download file from s3: %w", err)
	}

	return nil
}

func (u *updater) withDatabase(ctx context.Context, ddbHomePath, tmpDbPath string, fn func(conn *sql.Conn) error) error {
	connector, err := duckdb.NewConnector("", u.dbInit(ctx, ddbHomePath, tmpDbPath))
	if err != nil {
		return fmt.Errorf("failed to connect to duckdb: %w", err)
	}
	defer connector.Close()

	database := sql.OpenDB(connector)
	defer database.Close()

	conn, err := database.Conn(ctx)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer conn.Close()

	return fn(conn)
}

func (u *updater) runMainUpdateSequence(ctx context.Context, t time.Time, conn *sql.Conn, inputFileUris []string) error {
	placeholders := make([]string, len(inputFileUris))
	anyTypedInputFileUris := make([]any, len(inputFileUris))
	for i, v := range inputFileUris {
		placeholders[i] = "?"
		anyTypedInputFileUris[i] = v
	}

	sequence := []common.Tuple[[2]string, [][]any]{
		{
			[2]string{"use working db", fmt.Sprintf(`USE %s`, workingDbName)},
			nil,
		},
		{
			[2]string{"X11LoadRawData", strings.Replace(db.X11LoadRawData, "?", "["+strings.Join(placeholders, ",")+"]", 1)},
			[][]any{anyTypedInputFileUris},
		},
		{
			[2]string{"X12FlattenRawData", db.X12FlattenRawData},
			nil,
		},
		{
			[2]string{"drop raw", `DROP TABLE lh_flight_schedules_raw`},
			nil,
		},
		{
			[2]string{"X13OperatingFlights", db.X13OperatingFlights},
			nil,
		},
		{
			[2]string{"drop flattened", `DROP TABLE lh_flight_schedules_flattened`},
			nil,
		},
		{
			[2]string{"X14InsertAirlines", db.X14InsertAirlines},
			nil,
		},
		{
			[2]string{"X15InsertAirports", db.X15InsertAirports},
			nil,
		},
		{
			[2]string{"X16InsertAircraft", db.X16InsertAircraft},
			nil,
		},
		{
			[2]string{"X17InsertFlightNumbers", db.X17InsertFlightNumbers},
			nil,
		},
		{
			[2]string{"X18InsertFlightVariants", db.X18InsertFlightVariants},
			nil,
		},
		{
			[2]string{"X19LhFlightsFresh", db.X19LhFlightsFresh},
			[][]any{{t}},
		},
		{
			[2]string{"drop operating", `DROP TABLE lh_flight_schedules_operating`},
			nil,
		},
		{
			[2]string{"X20UpdateHistory", db.X20UpdateHistory},
			nil,
		},
		{
			[2]string{"X21CreateRemovedMarkers", db.X21CreateRemovedMarkers},
			[][]any{{t}},
		},
		{
			[2]string{"drop fresh", `DROP TABLE lh_flights_fresh`},
			nil,
		},
	}

	return u.runUpdateSequence(ctx, conn, sequence)
}

func (u *updater) createAndUploadBaseDataDb(ctx context.Context, conn *sql.Conn, tmpDir, bucket, key string) error {
	tmpFilePath := filepath.Join(tmpDir, "basedata.temp.db")
	finalFilePath := filepath.Join(tmpDir, "basedata.db")

	defer os.Remove(tmpFilePath)
	defer os.Remove(finalFilePath)

	tmpDbName, err := u.exportDatabase(ctx, conn, workingDbName, tmpFilePath, false, false)
	if err != nil {
		return fmt.Errorf("failed to copy tmp db name: %w", err)
	}

	sequence := []common.Tuple[[2]string, [][]any]{
		{
			[2]string{"use basedata db", fmt.Sprintf(`USE %s`, tmpDbName)},
			nil,
		},
		{
			[2]string{
				"delete unused basedata",
				`
DELETE FROM airline_identifiers aid
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = aid.airline_id ) ;

DELETE FROM airlines al
WHERE NOT EXISTS ( FROM flight_numbers fn WHERE fn.airline_id = al.id ) ;

DELETE FROM airport_identifiers aid
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.departure_airport_id = aid.airport_id OR fv.arrival_airport_id = aid.airport_id ) ;

DELETE FROM airports ap
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.departure_airport_id = ap.id OR fv.arrival_airport_id = ap.id ) ;

DELETE FROM aircraft_identifiers aid
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.aircraft_id = aid.aircraft_id ) ;

DELETE FROM aircraft ac
WHERE NOT EXISTS ( FROM flight_variants fv WHERE fv.aircraft_id = ac.id ) ;
`,
			},
			nil,
		},
		{
			[2]string{"drop history", `DROP TABLE flight_variant_history`},
			nil,
		},
		{
			[2]string{"drop variants", `DROP TABLE flight_variants`},
			nil,
		},
	}

	if err = u.runUpdateSequence(ctx, conn, sequence); err != nil {
		return fmt.Errorf("failed to run update sequence: %w", err)
	}

	if _, err = u.exportDatabase(ctx, conn, tmpDbName, finalFilePath, true, true); err != nil {
		return fmt.Errorf("failed to copy tmp db name: %w", err)
	}

	if err = u.uploadDbFile(ctx, bucket, key, finalFilePath); err != nil {
		return fmt.Errorf("failed to upload basedata db file: %w", err)
	}

	return nil
}

func (u *updater) exportVariants(ctx context.Context, conn *sql.Conn, bucket, key string) error {
	exportUri := u.buildParquetFileUri(bucket, key)
	sequence := []common.Tuple[[2]string, [][]any]{
		{
			[2]string{"use working db", fmt.Sprintf(`USE %s`, workingDbName)},
			nil,
		},
		{
			[2]string{"single thread", `SET threads TO 1`},
			nil,
		},
		{
			[2]string{
				"export variants",
				fmt.Sprintf(`COPY flight_variants TO '%s' ( FORMAT parquet, COMPRESSION gzip, OVERWRITE_OR_IGNORE )`, exportUri),
			},
			nil,
		},
		{
			[2]string{"reset threads", setThreads},
			nil,
		},
	}

	return u.runUpdateSequence(ctx, conn, sequence)
}

func (u *updater) exportHistory(ctx context.Context, conn *sql.Conn, bucket, prefix string) error {
	exportUri := u.buildParquetFileUri(bucket, prefix)
	sequence := []common.Tuple[[2]string, [][]any]{
		{
			[2]string{"use working db", fmt.Sprintf(`USE %s`, workingDbName)},
			nil,
		},
		{
			[2]string{"single thread", `SET threads TO 1`},
			nil,
		},
		{
			[2]string{
				"export history",
				fmt.Sprintf(`
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
    COALESCE(
      (
        SELECT LIST_SORT(ARRAY_AGG(DISTINCT {
          'airline_id': cs_fvh.airline_id,
          'number': cs_fvh.number,
          'suffix': cs_fvh.suffix
        }))
        FROM flight_variant_history cs_fvh
        WHERE cs_fvh.flight_variant_id IS NOT NULL
        AND cs_fvh.flight_variant_id = fvh.flight_variant_id
        AND cs_fvh.departure_date_local = fvh.departure_date_local
        AND NOT (cs_fvh.airline_id = fvh.airline_id AND cs_fvh.number = fvh.number AND cs_fvh.suffix = fvh.suffix)
        AND GREATEST(fvh.created_at, cs_fvh.created_at) < LEAST(COALESCE(fvh.replaced_at, CAST('2999-12-31T23:59:59.999+00' AS TIMESTAMPTZ)), COALESCE(cs_fvh.replaced_at, CAST('2999-12-31T23:59:59.999+00' AS TIMESTAMPTZ)))
      ),
      []
    ) AS code_shares,
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
				`, exportUri),
			},
			nil,
		},
		{
			[2]string{"reset threads", setThreads},
			nil,
		},
	}

	return u.runUpdateSequence(ctx, conn, sequence)
}

func (u *updater) exportLatest(ctx context.Context, conn *sql.Conn, bucket, prefix string) error {
	exportUri := u.buildParquetFileUri(bucket, prefix)
	sequence := []common.Tuple[[2]string, [][]any]{
		{
			[2]string{"use working db", fmt.Sprintf(`USE %s`, workingDbName)},
			nil,
		},
		{
			[2]string{"single thread", `SET threads TO 1`},
			nil,
		},
		{
			[2]string{
				"export latest",
				fmt.Sprintf(`
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
      COALESCE(
        (
          SELECT LIST_SORT(ARRAY_AGG({
            'airline_id': cs_fvh.airline_id,
            'number': cs_fvh.number,
            'suffix': cs_fvh.suffix
          })) FROM latest_active_history cs_fvh
          WHERE cs_fvh.flight_variant_id = fvh.flight_variant_id
          AND cs_fvh.departure_date_local = fvh.departure_date_local
          AND NOT (cs_fvh.airline_id = fvh.airline_id AND cs_fvh.number = fvh.number AND cs_fvh.suffix = fvh.suffix)
        ),
        []
      ) AS code_shares
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
				`, exportUri),
			},
			nil,
		},
		{
			[2]string{"reset threads", setThreads},
			nil,
		},
	}

	return u.runUpdateSequence(ctx, conn, sequence)
}

func (u *updater) runUpdateSequence(ctx context.Context, conn *sql.Conn, sequence []common.Tuple[[2]string, [][]any]) error {
	for _, update := range sequence {
		if err := u.runUpdateScript(ctx, conn, update.V1[0], update.V1[1], update.V2); err != nil {
			return err
		}
	}

	return nil
}

func (u *updater) runUpdateScript(ctx context.Context, conn *sql.Conn, name, script string, params [][]any) error {
	script = strings.TrimSpace(script)
	queries := strings.Split(script, ";")
	queries = slices.DeleteFunc(queries, func(s string) bool {
		return strings.TrimSpace(s) == ""
	})

	for i, query := range queries {
		var queryParams []any
		if len(params) > i {
			queryParams = params[i]
		}

		suffix := ""
		if len(queries) > 1 {
			suffix = fmt.Sprintf(" (%d/%d)", i+1, len(queries))
		}

		if err := u.runUpdateQuery(ctx, conn, name+suffix, query, queryParams); err != nil {
			return err
		}
	}

	return nil
}

func (u *updater) runUpdateQuery(ctx context.Context, conn *sql.Conn, name, query string, params []any) error {
	var rowsAffected int64
	start := time.Now()
	printDone := func() {
		fmt.Printf("%s done within %v; rows affected: %d\n", name, time.Since(start), rowsAffected)
	}

	fmt.Printf("running %s\n", name)
	defer printDone()

	r, err := conn.ExecContext(ctx, query, params...)
	if err != nil {
		return fmt.Errorf("failed to run query %s: %w", name, err)
	}

	rowsAffected, _ = r.RowsAffected()
	return nil
}

func (u *updater) dbInit(ctx context.Context, ddbHomePath, tmpDbPath string) func(execer driver.ExecerContext) error {
	return func(execer driver.ExecerContext) error {
		bootQueries := []common.Tuple[string, []driver.NamedValue]{
			{
				setThreads,
				[]driver.NamedValue{},
			},
			// https://github.com/duckdb/duckdb/issues/12837
			{
				`SET home_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: filepath.Join(ddbHomePath, "home")}},
			},
			{
				`SET secret_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: filepath.Join(ddbHomePath, "secrets")}},
			},
			{
				`SET extension_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: filepath.Join(ddbHomePath, "extensions")}},
			},
			{
				`SET temp_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: filepath.Join(ddbHomePath, "tmp")}},
			},
			{
				`SET allow_persistent_secrets = false`,
				[]driver.NamedValue{},
			},
			{
				`SET memory_limit = '16GB'`,
				[]driver.NamedValue{},
			},
			{
				`SET partitioned_write_max_open_files = 1`,
				[]driver.NamedValue{},
			},
			{
				`SET partitioned_write_flush_threshold = 10000`,
				[]driver.NamedValue{},
			},
			{
				`CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )`,
				[]driver.NamedValue{},
			},
			{
				fmt.Sprintf(`ATTACH '%s' AS %s`, tmpDbPath, workingDbName),
				[]driver.NamedValue{},
			},
		}

		for i, query := range bootQueries {
			if err := u.runTimed(fmt.Sprintf("db init (%d) %q", i, query.V1), func() error {
				_, err := execer.ExecContext(ctx, query.V1, query.V2)
				return err
			}); err != nil {
				return fmt.Errorf("failed to run query %q: %w", query.V1, err)
			}
		}

		return nil
	}
}

func (u *updater) exportDatabase(ctx context.Context, conn *sql.Conn, srcDbName, dstDbFilePath string, detachDst, detachSrc bool) (string, error) {
	tmpExportDbName, err := u.generateIdentifier()
	if err != nil {
		return "", fmt.Errorf("failed to generate temp export database identifier: %w", err)
	}

	return tmpExportDbName, u.runTimed(fmt.Sprintf("export db %q to %q", srcDbName, dstDbFilePath), func() error {
		if _, err = conn.ExecContext(ctx, fmt.Sprintf(`ATTACH '%s' AS %s`, dstDbFilePath, tmpExportDbName)); err != nil {
			return fmt.Errorf("failed to attach export database: %w", err)
		}

		if err = u.copyDatabase(ctx, conn, srcDbName, tmpExportDbName); err != nil {
			return fmt.Errorf("failed to copy database %q to %q: %w", srcDbName, tmpExportDbName, err)
		}

		if detachDst {
			if _, err = conn.ExecContext(ctx, fmt.Sprintf(`DETACH %s`, tmpExportDbName)); err != nil {
				return fmt.Errorf("failed to attach export database: %w", err)
			}
		}

		if detachSrc {
			if _, err = conn.ExecContext(ctx, `USE memory`); err != nil {
				return fmt.Errorf("failed to switch to memory db: %w", err)
			}

			if _, err = conn.ExecContext(ctx, fmt.Sprintf(`DETACH %s`, srcDbName)); err != nil {
				return fmt.Errorf("failed to detach src database: %w", err)
			}
		}

		return nil
	})
}

func (u *updater) copyDatabase(ctx context.Context, conn *sql.Conn, srcDbName, dstDbName string) error {
	queries := []string{
		`SET threads TO 1`,
		fmt.Sprintf(`COPY FROM DATABASE %s TO %s`, srcDbName, dstDbName),
		setThreads,
	}

	for _, query := range queries {
		if _, err := conn.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to run query %q: %w", query, err)
		}
	}

	return nil
}

func (u *updater) uploadDbFile(ctx context.Context, bucket, key, dbFilePath string) error {
	f, err := os.Open(dbFilePath)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = u.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   f,
	})
	return err
}

func (u *updater) runTimed(name string, fn func() error) error {
	start := time.Now()
	fmt.Printf("running %s\n", name)
	if err := fn(); err != nil {
		return fmt.Errorf("%s failed: %w", name, err)
	}

	fmt.Printf("finished %s, took %v\n", name, time.Since(start))
	return nil
}

func (u *updater) buildParquetFileUri(bucket, key string) string {
	return fmt.Sprintf("%s://%s/%s", u.parquetFileUriSchema, bucket, key)
}

func (u *updater) buildInputFileUris(bucket, prefix string, ldrs xtime.LocalDateRanges) []string {
	paths := make([]string, 0)
	for d := range ldrs.Iter {
		paths = append(paths, fmt.Sprintf("%s://%s/%s%s.json", u.inputFileUriSchema, bucket, prefix, d.Time(nil).Format("2006/01/02")))
	}

	return paths
}

func (u *updater) withTempDir(fn func(dir string) error) error {
	dir, err := os.MkdirTemp("", "duckdb_update_database_*")
	if err != nil {
		return fmt.Errorf("failed to create temporary directory: %w", err)
	}

	defer os.RemoveAll(dir)

	return fn(dir)
}

func (u *updater) generateIdentifier() (string, error) {
	const randomLength = 10
	const timestampLength = 8 // hex unix timestamp (within reasonable time span)
	const chars = "abcdefghijklmnopqrstuvwxyz"

	r := make([]byte, 0, randomLength+timestampLength+1)
	b := make([]byte, 4)

	for range randomLength {
		if _, err := rand.Read(b); err != nil {
			return "", err
		}

		r = append(r, chars[binary.BigEndian.Uint32(b)%uint32(len(chars))])
	}

	r = append(r, '_')
	r = strconv.AppendInt(r, time.Now().Unix(), 16)

	return string(r), nil
}
