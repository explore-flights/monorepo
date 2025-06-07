package db

import (
	"fmt"
	"strings"
)

type Condition interface {
	Apply() (string, []any)
}

type BaseCondition struct {
	Filter string
	Params []any
}

func (c BaseCondition) Apply() (string, []any) {
	return c.Filter, c.Params
}

type AndCondition []Condition

func (c AndCondition) Apply() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Apply()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " AND ")), params
}

type OrCondition []Condition

func (c OrCondition) Apply() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Apply()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " OR ")), params
}
