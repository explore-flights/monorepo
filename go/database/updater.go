package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
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
	"path"
	"slices"
	"strings"
	"time"
)

type updater struct {
	s3c interface {
		adapt.S3Getter
		adapt.S3Putter
	}
	inputFileUriSchema string
}

func (u *updater) Handle(ctx context.Context, t time.Time, databaseBucket, databaseKey, inputBucket, inputPrefix string, dateRanges xtime.LocalDateRanges) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	if err := u.withTempDir(func(dir string) error {
		ddbHomePath := path.Join(dir, "duckdb-home")
		tmpDbPath := path.Join(dir, "tmp.db")
		dstDbPath := path.Join(dir, "dst.db")

		if err := os.Mkdir(ddbHomePath, 0750); err != nil {
			return err
		}

		if err := u.runTimed("download db file", func() error {
			return u.downloadDbFile(ctx, databaseBucket, databaseKey, tmpDbPath)
		}); err != nil {
			return err
		}

		if err := u.runTimed("update database", func() error {
			return u.updateDatabase(
				ctx,
				t,
				ddbHomePath,
				tmpDbPath,
				dstDbPath,
				inputBucket,
				inputPrefix,
				dateRanges,
			)
		}); err != nil {
			return err
		}

		if err := u.runTimed("upload db file", func() error {
			return u.uploadDbFile(ctx, databaseBucket, databaseKey, dstDbPath)
		}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (u *updater) downloadDbFile(ctx context.Context, databaseBucket, databaseKey, tmpDbPath string) error {
	resp, err := u.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(databaseBucket),
		Key:    aws.String(databaseKey),
	})
	if err != nil {
		return fmt.Errorf("failed GetObject for db file: %w", err)
	}
	defer resp.Body.Close()

	f, err := os.Create(tmpDbPath)
	if err != nil {
		return fmt.Errorf("failed to create tmp db file: %w", err)
	}
	defer f.Close()

	if _, err = io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("failed to download db file: %w", err)
	}

	return nil
}

func (u *updater) updateDatabase(ctx context.Context, t time.Time, ddbHomePath, tmpDbPath, dstDbPath, inputBucket, inputPrefix string, ldrs xtime.LocalDateRanges) error {
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

	if err = u.runTimed("update sequence", func() error {
		return u.runUpdateSequence(ctx, t, conn, u.buildInputFileUris(inputBucket, inputPrefix, ldrs), dstDbPath)
	}); err != nil {
		return err
	}

	return nil
}

func (u *updater) runUpdateSequence(ctx context.Context, t time.Time, conn *sql.Conn, inputFileUris []string, dstDbPath string) error {
	placeholders := make([]string, len(inputFileUris))
	anyTypedInputFileUris := make([]any, len(inputFileUris))
	for i, v := range inputFileUris {
		placeholders[i] = "?"
		anyTypedInputFileUris[i] = v
	}

	sequence := []common.Tuple[[2]string, [][]any]{
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
		{
			[2]string{"use memory", `USE memory`},
			nil,
		},
		{
			[2]string{"attach dst db", fmt.Sprintf(`ATTACH '%s' AS dst_db`, dstDbPath)},
			nil,
		},
		{
			[2]string{"set threads=1", `SET threads TO 1`},
			nil,
		},
		{
			[2]string{"copy tmp to dst", `COPY FROM DATABASE tmp_db TO dst_db`},
			nil,
		},
		{
			[2]string{"set threads=16", `SET threads TO 16`},
			nil,
		},
		{
			[2]string{"detach tmp db", `DETACH tmp_db`},
			nil,
		},
		{
			[2]string{"detach dst db", `DETACH dst_db`},
			nil,
		},
	}

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
				`SET threads TO 16`,
				[]driver.NamedValue{},
			},
			// https://github.com/duckdb/duckdb/issues/12837
			{
				`SET home_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: path.Join(ddbHomePath, "home")}},
			},
			{
				`SET secret_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: path.Join(ddbHomePath, "secrets")}},
			},
			{
				`SET extension_directory = ?`,
				[]driver.NamedValue{{Ordinal: 1, Value: path.Join(ddbHomePath, "extensions")}},
			},
			{
				`SET allow_persistent_secrets = false`,
				[]driver.NamedValue{},
			},
			{
				`SET memory_limit = '8GB'`,
				[]driver.NamedValue{},
			},
			{
				`CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )`,
				[]driver.NamedValue{},
			},
			{
				fmt.Sprintf(`ATTACH '%s' AS tmp_db`, tmpDbPath),
				[]driver.NamedValue{},
			},
			{
				`USE tmp_db`,
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
