package business

import (
	"context"
	"database/sql"
	"fmt"
	"iter"
	"slices"
	"strings"
	"time"
)

type UpdateSequence []UpdateScript

func (us UpdateSequence) Run(ctx context.Context, conn *sql.Conn) error {
	for _, script := range us {
		if err := script.Run(ctx, conn); err != nil {
			return err
		}
	}

	return nil
}

type UpdateScript struct {
	Name   string
	Script string
	Params [][]any
	Checks []func(r sql.Result) error
}

func (us UpdateScript) Queries() iter.Seq[UpdateQuery] {
	return func(yield func(UpdateQuery) bool) {
		script := strings.TrimSpace(us.Script)
		queries := strings.Split(script, ";")
		queries = slices.DeleteFunc(queries, func(s string) bool {
			return strings.TrimSpace(s) == ""
		})

		for i, query := range queries {
			q := UpdateQuery{
				name:  us.Name,
				query: query,
			}

			if len(us.Params) > i {
				q.params = us.Params[i]
			}

			if len(us.Checks) > i {
				q.check = us.Checks[i]
			}

			if len(queries) > 1 {
				q.name += fmt.Sprintf(" (%d/%d)", i+1, len(queries))
			}

			if !yield(q) {
				break
			}
		}
	}
}

func (us UpdateScript) Run(ctx context.Context, conn *sql.Conn) error {
	for q := range us.Queries() {
		if err := q.Run(ctx, conn); err != nil {
			return err
		}
	}

	return nil
}

type UpdateQuery struct {
	name   string
	query  string
	params []any
	check  func(r sql.Result) error
}

func (uq UpdateQuery) Run(ctx context.Context, conn *sql.Conn) error {
	var rowsAffected int64
	start := time.Now()
	printDone := func() {
		fmt.Printf("%s done within %v; rows affected: %d\n", uq.name, time.Since(start), rowsAffected)
	}

	fmt.Printf("running %s\n", uq.name)
	defer printDone()

	r, err := conn.ExecContext(ctx, uq.query, uq.params...)
	if err != nil {
		return fmt.Errorf("failed to run query %s: %w", uq.name, err)
	}

	rowsAffected, _ = r.RowsAffected()
	if uq.check == nil {
		return nil
	}

	return uq.check(r)
}
