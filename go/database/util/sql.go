package util

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"fmt"
	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
	"iter"
	"strconv"
	"strings"
	"time"
)

type UpdateSequence []UpdateScript

func (us UpdateSequence) Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error {
	if rows == nil {
		rows = make(map[string]int64)
	}

	for _, script := range us {
		if err := script.Run(ctx, conn, rows); err != nil {
			return err
		}
	}

	return nil
}

type UpdateScript struct {
	Name   string
	Script string
	Params [][]any
}

func (us UpdateScript) Steps(outErr *error) iter.Seq[UpdateStep] {
	return func(yield func(UpdateStep) bool) {
		env, err := cel.NewEnv()
		if err != nil {
			*outErr = err
			return
		}

		script := strings.TrimSpace(us.Script)
		rawQueries := strings.Split(script, ";")

		var queryIdx int
		for _, rawQuery := range rawQueries {
			for step := range us.ParseSteps(env, rawQuery, &queryIdx, outErr) {
				if !yield(step) {
					return
				}
			}
		}
	}
}

func (us UpdateScript) ParseSteps(env *cel.Env, raw string, queryIdx *int, outErr *error) iter.Seq[UpdateStep] {
	return func(yield func(UpdateStep) bool) {
		raw = strings.TrimSpace(raw)

		isQuery := false
		identifier := ""
		name := us.Name

		for line := range strings.Lines(raw) {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			comment, ok := strings.CutPrefix(line, "--")
			if !ok {
				isQuery = true
				break
			}

			comment = strings.TrimSpace(comment)

			if assertionRaw, ok := strings.CutPrefix(comment, "assert:"); ok {
				assertionRaw = strings.TrimSpace(assertionRaw)
				ast, issues := env.Parse(assertionRaw)
				if issues != nil && issues.Err() != nil {
					*outErr = issues.Err()
					return
				}

				program, err := env.Program(ast)
				if err != nil {
					*outErr = err
					return
				}

				if !yield(UpdateAssertion{raw: assertionRaw, program: program}) {
					return
				}
			} else {
				name += fmt.Sprintf(" %s", comment)
				if id, ok := strings.CutPrefix(comment, "id:"); ok {
					identifier = strings.TrimSpace(id)
				}
			}
		}

		if isQuery {
			var params []any
			if len(us.Params) > *queryIdx {
				params = us.Params[*queryIdx]
			}

			name += fmt.Sprintf(" (part %d)", *queryIdx+1)

			yield(UpdateQuery{
				identifier: identifier,
				name:       name,
				query:      raw,
				params:     params,
			})

			*queryIdx++
		}
	}
}

func (us UpdateScript) Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error {
	var err error
	for q := range us.Steps(&err) {
		if err = q.Run(ctx, conn, rows); err != nil {
			return err
		}
	}

	return err
}

type UpdateStep interface {
	Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error
}

type UpdateQuery struct {
	identifier string
	name       string
	query      string
	params     []any
}

func (uq UpdateQuery) Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error {
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
	if uq.identifier != "" {
		rows[uq.identifier] = rowsAffected
	}

	return nil
}

type UpdateAssertion struct {
	raw     string
	program cel.Program
}

func (uc UpdateAssertion) Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error {
	anyMap := make(map[string]any)
	for k, v := range rows {
		anyMap[k] = v
	}

	res, _, err := uc.program.ContextEval(ctx, anyMap)
	if err != nil {
		return fmt.Errorf("check %q failed: %w", uc.raw, err)
	}

	if !res.ConvertToType(types.BoolType).Value().(bool) {
		return fmt.Errorf("check %q returned false", uc.raw)
	}

	fmt.Printf("check %q OK\n", uc.raw)

	return nil
}

func GenerateIdentifier() (string, error) {
	const randomLength = 10
	const timestampLength = 8 // hex unix timestamp (within reasonable time span)
	const chars = "abcdefghijklmnopqrstuvwxyz"

	r := make([]byte, 0, randomLength+timestampLength+1)
	b := make([]byte, 4)

	for range randomLength {
		if _, err := rand.Read(b); err != nil {
			return "", err
		}

		r = append(r, chars[binary.BigEndian.Uint32(b)%uint32(len(chars))])
	}

	r = append(r, '_')
	r = strconv.AppendInt(r, time.Now().Unix(), 16)

	return string(r), nil
}
