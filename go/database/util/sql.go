package util

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"fmt"
	"iter"
	"strconv"
	"strings"
	"time"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
)

const (
	queryKindUnknown = iota
	queryKindExec
	queryKindQuery
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
		queryKind := queryKindUnknown
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
				program, err := parseProgram(env, assertionRaw)
				if err != nil {
					*outErr = err
					return
				}

				if !yield(UpdateAssertion{raw: assertionRaw, program: program}) {
					return
				}
			} else if assignmentRaw, ok := strings.CutPrefix(comment, "assign:"); ok {
				var identifierRaw, exprRaw string
				var ok bool

				identifierRaw = strings.TrimSpace(assignmentRaw)
				identifierRaw, exprRaw, ok = strings.Cut(identifierRaw, " ")
				if !ok {
					*outErr = fmt.Errorf("assignment malformed, expected whitspace: %q", assignmentRaw)
					return
				}

				identifier = strings.TrimSpace(identifierRaw)
				exprRaw = strings.TrimSpace(exprRaw)

				switch exprRaw {
				case "from:rows_affected":
					queryKind = queryKindExec

				case "from:result":
					queryKind = queryKindQuery

				default:
					program, err := parseProgram(env, exprRaw)
					if err != nil {
						*outErr = err
						return
					}

					if !yield(UpdateAssignment{raw: assignmentRaw, identifier: identifier, program: program}) {
						return
					}

					identifier = ""
				}
			} else {
				name += fmt.Sprintf(" %s", comment)
			}
		}

		if isQuery {
			if identifier != "" && queryKind == queryKindUnknown {
				*outErr = fmt.Errorf("identifier set as %q but queryKind is unknown", identifier)
				return
			}

			var params []any
			if len(us.Params) > *queryIdx {
				params = us.Params[*queryIdx]
			}

			name += fmt.Sprintf(" (part %d)", *queryIdx+1)

			yield(UpdateQuery{
				queryKind:  queryKind,
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
	queryKind  int
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

	switch uq.queryKind {
	case queryKindUnknown, queryKindExec:
		r, err := conn.ExecContext(ctx, uq.query, uq.params...)
		if err != nil {
			return fmt.Errorf("failed to run query %s: %w", uq.name, err)
		}

		rowsAffected, _ = r.RowsAffected()

	case queryKindQuery:
		if err := conn.QueryRowContext(ctx, uq.query, uq.params...).Scan(&rowsAffected); err != nil {
			return fmt.Errorf("failed to run query %s: %w", uq.name, err)
		}

	default:
		return fmt.Errorf("unknown query kind: %d", uq.queryKind)
	}

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

type UpdateAssignment struct {
	raw        string
	identifier string
	program    cel.Program
}

func (ua UpdateAssignment) Run(ctx context.Context, conn *sql.Conn, rows map[string]int64) error {
	anyMap := make(map[string]any)
	for k, v := range rows {
		anyMap[k] = v
	}

	res, _, err := ua.program.ContextEval(ctx, anyMap)
	if err != nil {
		return fmt.Errorf("assignment %q failed: %w", ua.raw, err)
	}

	result, ok := res.ConvertToType(types.IntType).Value().(int64)
	if !ok {
		return fmt.Errorf("assignment %q returned non-int64", ua.raw)
	}

	rows[ua.identifier] = result

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

func parseProgram(env *cel.Env, program string) (cel.Program, error) {
	ast, issues := env.Parse(program)
	if issues != nil && issues.Err() != nil {
		return nil, issues.Err()
	}

	return env.Program(ast)
}
