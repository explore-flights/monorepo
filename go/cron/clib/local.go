//go:build !lambda

package clib

import "path"

func DuckDBExtensionsPath(ddbHomePath string) string {
	return path.Join(ddbHomePath, "extensions")
}
