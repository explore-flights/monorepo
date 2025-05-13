package xsql

import (
	"database/sql"
	"errors"
)

type Int64 int64

func (i *Int64) Scan(src any) error {
	var base sql.NullInt64
	if err := base.Scan(src); err != nil {
		return err
	}

	if !base.Valid {
		return errors.New("Int64.Scan: empty int")
	}

	*i = Int64(base.Int64)
	return nil
}
