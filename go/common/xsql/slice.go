package xsql

import (
	"database/sql"
	"fmt"
)

type SQLArray[T any, PT interface {
	*T
	sql.Scanner
}] []T

func (sqla *SQLArray[T, PT]) Scan(src any) error {
	values, ok := src.([]any)
	if !ok {
		return fmt.Errorf("%T is not a []any", src)
	}

	result := make([]T, len(values))
	for i := range values {
		var ptr PT = &result[i]
		if err := ptr.Scan(values[i]); err != nil {
			return err
		}
	}

	*sqla = result
	return nil
}
