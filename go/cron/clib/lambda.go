//go:build lambda

package clib

func DuckDBExtensionsPath(ddbHomePath string) string {
	return "/opt/lib/duckdb_extensions"
}
