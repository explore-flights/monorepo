package util

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"path/filepath"

	"github.com/explore-flights/monorepo/go/common"
	"github.com/marcboeker/go-duckdb/v2"
)

func WithDatabase(ctx context.Context, ddbHomePath, tmpDbPath, tmpDbName string, threadCount int, fn func(conn *sql.Conn) error) error {
	connector, err := duckdb.NewConnector("", dbInit(ctx, ddbHomePath, tmpDbPath, tmpDbName, threadCount))
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

func dbInit(ctx context.Context, ddbHomePath, tmpDbPath, tmpDbName string, threadCount int) func(execer driver.ExecerContext) error {
	return func(execer driver.ExecerContext) error {
		bootQueries := []common.Tuple[string, []driver.NamedValue]{
			{
				fmt.Sprintf("SET threads TO %d", threadCount),
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
				`SET TimeZone = 'UTC'`,
				[]driver.NamedValue{},
			},
			{
				`CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )`,
				[]driver.NamedValue{},
			},
			{
				fmt.Sprintf(`ATTACH '%s' AS %s`, tmpDbPath, tmpDbName),
				[]driver.NamedValue{},
			},
			{
				fmt.Sprintf(`USE %s`, tmpDbName),
				[]driver.NamedValue{},
			},
		}

		for i, query := range bootQueries {
			if err := RunTimed(fmt.Sprintf("db init (%d) %q", i, query.V1), func() error {
				_, err := execer.ExecContext(ctx, query.V1, query.V2)
				return err
			}); err != nil {
				return fmt.Errorf("failed to run query %q: %w", query.V1, err)
			}
		}

		return nil
	}
}

func ExportDatabase(ctx context.Context, conn *sql.Conn, srcDbName, dstDbFilePath string, detachDst, detachSrc bool, numThreadsRestore int) (string, error) {
	tmpExportDbName, err := GenerateIdentifier()
	if err != nil {
		return "", fmt.Errorf("failed to generate temp export database identifier: %w", err)
	}

	return tmpExportDbName, RunTimed(fmt.Sprintf("export db %q to %q", srcDbName, dstDbFilePath), func() error {
		if _, err = conn.ExecContext(ctx, fmt.Sprintf(`ATTACH '%s' AS %s`, dstDbFilePath, tmpExportDbName)); err != nil {
			return fmt.Errorf("failed to attach export database: %w", err)
		}

		if err = CopyDatabase(ctx, conn, srcDbName, tmpExportDbName, numThreadsRestore); err != nil {
			return fmt.Errorf("failed to copy database %q to %q: %w", srcDbName, tmpExportDbName, err)
		}

		if detachDst || detachSrc {
			if _, err = conn.ExecContext(ctx, `USE memory`); err != nil {
				return fmt.Errorf("failed to switch to memory db: %w", err)
			}
		}

		if detachDst {
			if _, err = conn.ExecContext(ctx, fmt.Sprintf(`DETACH %s`, tmpExportDbName)); err != nil {
				return fmt.Errorf("failed to attach export database: %w", err)
			}
		}

		if detachSrc {
			if _, err = conn.ExecContext(ctx, fmt.Sprintf(`DETACH %s`, srcDbName)); err != nil {
				return fmt.Errorf("failed to detach src database: %w", err)
			}
		}

		return nil
	})
}

func CopyDatabase(ctx context.Context, conn *sql.Conn, srcDbName, dstDbName string, numThreadsRestore int) error {
	queries := []string{
		`SET threads TO 1`,
		fmt.Sprintf(`COPY FROM DATABASE %s TO %s`, srcDbName, dstDbName),
		fmt.Sprintf("SET threads TO %d", numThreadsRestore),
	}

	for _, query := range queries {
		if _, err := conn.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to run query %q: %w", query, err)
		}
	}

	return nil
}
