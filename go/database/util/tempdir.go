package util

import (
	"fmt"
	"os"
)

func WithTempDir(fn func(dir string) error) error {
	dir, err := os.MkdirTemp("", "duckdb_update_database_*")
	if err != nil {
		return fmt.Errorf("failed to create temporary directory: %w", err)
	}

	defer os.RemoveAll(dir)

	return fn(dir)
}
