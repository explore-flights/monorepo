package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/marcboeker/go-duckdb/v2"
	"os"
	"path/filepath"
)

type Database struct {
	initDone   <-chan struct{}
	dbWorkPath string
	connector  *duckdb.Connector
	database   *sql.DB
	err        error
}

func NewDatabase(baseDbPath, variantsParquetPath, historyParquetPath, latestParquetPath string) *Database {
	initDone := make(chan struct{})
	db := Database{initDone: initDone}
	go func() {
		defer close(initDone)

		var err error
		defer func() {
			if err != nil {
				db.err = err

				if database := db.database; database != nil {
					db.database = nil
					if dbCloseErr := database.Close(); dbCloseErr != nil {
						db.err = errors.Join(db.err, dbCloseErr)
					}
				}

				if connector := db.connector; connector != nil {
					db.connector = nil
					if connCloseErr := connector.Close(); connCloseErr != nil {
						db.err = errors.Join(db.err, connCloseErr)
					}
				}

				if dbWorkPath := db.dbWorkPath; dbWorkPath != "" {
					db.dbWorkPath = ""
					if rmErr := os.RemoveAll(dbWorkPath); rmErr != nil {
						db.err = errors.Join(db.err, rmErr)
					}
				}
			}
		}()

		if db.dbWorkPath, err = os.MkdirTemp("", "duckdb_temp_*"); err != nil {
			return
		}

		if db.connector, err = duckdb.NewConnector("", connInit(context.Background())); err != nil {
			return
		}

		db.database = sql.OpenDB(db.connector)

		var conn *sql.Conn
		conn, err = db.database.Conn(context.Background())
		if err != nil {
			return
		}

		if err = dbInit(context.Background(), conn, db.dbWorkPath, baseDbPath, variantsParquetPath, historyParquetPath, latestParquetPath); err != nil {
			err = errors.Join(err, conn.Close())
			return
		}

		err = conn.Close()
	}()

	return &db
}

func (db *Database) Conn(ctx context.Context) (*sql.Conn, error) {
	<-db.initDone
	if err := db.err; err != nil {
		return nil, err
	}

	database := db.database
	if database == nil {
		return nil, errors.New("database is nil")
	}

	return database.Conn(ctx)
}

func (db *Database) Close() error {
	<-db.initDone

	var errs []error
	if database := db.database; database != nil {
		db.database = nil

		if err := database.Close(); err != nil {
			errs = append(errs, err)
		}
	}

	if connector := db.connector; connector != nil {
		db.connector = nil

		if err := connector.Close(); err != nil {
			errs = append(errs, err)
		}
	}

	if dbWorkPath := db.dbWorkPath; dbWorkPath != "" {
		db.dbWorkPath = ""

		if err := os.RemoveAll(dbWorkPath); err != nil {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

func dbInit(ctx context.Context, conn *sql.Conn, dbWorkPath, baseDbPath, variantsParquetPath, historyParquetPath, latestParquetPath string) error {
	bootQueries := []common.Tuple[string, []any]{
		{
			`SET threads TO 1`,
			nil,
		},
		// https://github.com/duckdb/duckdb/issues/12837
		{
			`SET home_directory = ?`,
			[]any{filepath.Join(dbWorkPath, "home")},
		},
		{
			`SET secret_directory = ?`,
			[]any{filepath.Join(dbWorkPath, "secrets")},
		},
		{
			`SET extension_directory = ?`,
			[]any{filepath.Join(dbWorkPath, "extensions")},
		},
		{
			`SET temp_directory = ?`,
			[]any{filepath.Join(dbWorkPath, "tmp")},
		},
		{
			`SET allow_persistent_secrets = false`,
			nil,
		},
		{
			`CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )`,
			nil,
		},
		{
			fmt.Sprintf(`ATTACH '%s' AS base_db (READ_ONLY)`, baseDbPath),
			nil,
		},
		{
			`COPY FROM DATABASE base_db TO memory`,
			nil,
		},
		{
			`DETACH base_db`,
			nil,
		},
		{
			fmt.Sprintf(
				`CREATE OR REPLACE VIEW flight_variants AS SELECT * FROM read_parquet('%s', hive_partitioning = false)`,
				variantsParquetPath,
			),
			nil,
		},
		{
			fmt.Sprintf(
				`CREATE OR REPLACE VIEW flight_variant_history AS SELECT * FROM read_parquet('%s', hive_partitioning = true, hive_types = {'airline_id': UUID, 'number_mod_10': USMALLINT})`,
				historyParquetPath+"/airline_id=*/number_mod_10=*/*.parquet",
			),
			nil,
		},
		{
			fmt.Sprintf(
				`CREATE OR REPLACE VIEW flight_variant_history_latest AS SELECT * FROM read_parquet('%s', hive_partitioning = true, hive_types = {'year_utc': USMALLINT, 'month_utc': USMALLINT, 'day_utc': USMALLINT})`,
				latestParquetPath+"/year_utc=*/month_utc=*/day_utc=*/*.parquet",
			),
			nil,
		},
	}

	for _, query := range bootQueries {
		if _, err := conn.ExecContext(ctx, query.V1, query.V2...); err != nil {
			return fmt.Errorf("failed to run query %q: %w", query.V1, err)
		}
	}

	return nil
}

func connInit(ctx context.Context) func(execer driver.ExecerContext) error {
	return func(execer driver.ExecerContext) error {
		bootQueries := []common.Tuple[string, []driver.NamedValue]{
			{
				`SET threads TO 1`,
				[]driver.NamedValue{},
			},
		}

		for _, query := range bootQueries {
			if _, err := execer.ExecContext(ctx, query.V1, query.V2); err != nil {
				return fmt.Errorf("failed to run query %q: %w", query.V1, err)
			}
		}

		return nil
	}
}
