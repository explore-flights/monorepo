package xsql

import (
	"database/sql"
	"errors"
)

type String string

func (str *String) Scan(src any) error {
	var base sql.NullString
	if err := base.Scan(src); err != nil {
		return err
	}

	if !base.Valid {
		return errors.New("String.Scan: empty string")
	}

	*str = String(base.String)
	return nil
}
