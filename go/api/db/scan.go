package db

import (
	"database/sql"
	"fmt"

	"github.com/duckdb/duckdb-go/v2"
)

type scannable[T any] interface {
	*T
	sql.Scanner
}

type DuckDBMap[K comparable, KT scannable[K], V any, VT scannable[V]] map[K]V

func (m *DuckDBMap[K, KT, V, VT]) Scan(v any) error {
	data, ok := v.(duckdb.OrderedMap)
	if !ok {
		return fmt.Errorf("invalid type `%T` for scanning `OrderedMap`, expected `OrderedMap`", v)
	}

	result := make(DuckDBMap[K, KT, V, VT])
	for i := range data.Len() {
		var key K
		var value V
		var kPtr KT = &key
		var vPtr VT = &value

		if err := kPtr.Scan(data.Keys()[i]); err != nil {
			return err
		}

		if err := vPtr.Scan(data.Values()[i]); err != nil {
			return nil
		}

		result[key] = value
	}

	*m = result
	return nil
}
