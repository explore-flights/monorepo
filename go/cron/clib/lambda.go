//go:build lambda

package clib

import (
	"os"
)

func DuckDBExtensionsPath(ddbHomePath string) string {
	const path = "/tmp/duckdb_extensions"
	if err := os.MkdirAll(path, 0750); err != nil {
		panic(err)
	}

	return path
}
