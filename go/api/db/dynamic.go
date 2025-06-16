package db

import (
	"fmt"
	"iter"
	"strings"
)

type Condition interface {
	Condition() (string, []any)
}

type BaseCondition struct {
	Filter string
	Params []any
}

func (c BaseCondition) Condition() (string, []any) {
	return c.Filter, c.Params
}

type InCondition struct {
	Lhs ValueExpression
	Rhs []ValueExpression
}

func NewInCondition[T any](field string, values iter.Seq[T]) InCondition {
	c := InCondition{
		Lhs: LiteralValueExpression(field),
	}

	for v := range values {
		c.Rhs = append(c.Rhs, ParameterValueExpression{v})
	}

	return c
}

func (c InCondition) Condition() (string, []any) {
	if len(c.Rhs) == 0 {
		return "FALSE", nil
	}

	lhs, params := c.Lhs.Value()

	rhsValues := make([]string, len(c.Rhs))
	for i, rhs := range c.Rhs {
		var rhsParams []any
		rhsValues[i], rhsParams = rhs.Value()
		params = append(params, rhsParams...)
	}

	return fmt.Sprintf("%s IN (%s)", lhs, strings.Join(rhsValues, ",")), params
}

type AndCondition []Condition

func (c AndCondition) Condition() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Condition()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " AND ")), params
}

type OrCondition []Condition

func (c OrCondition) Condition() (string, []any) {
	if len(c) == 0 {
		return "FALSE", nil
	}

	filters := make([]string, 0, len(c))
	params := make([]any, 0, len(c))

	for _, cond := range c {
		subFilter, subParams := cond.Condition()
		filters = append(filters, subFilter)
		params = append(params, subParams...)
	}

	return fmt.Sprintf("( %s )", strings.Join(filters, " OR ")), params
}

type SelectExpression interface {
	Select() (string, []any)
}

type ValueExpression interface {
	Value() (string, []any)
	SelectExpression
}

type LiteralValueExpression string

func (e LiteralValueExpression) Value() (string, []any) {
	return string(e), nil
}

func (e LiteralValueExpression) Select() (string, []any) {
	return e.Value()
}

type ParameterValueExpression [1]any

func (e ParameterValueExpression) Value() (string, []any) {
	return "?", []any{e[0]}
}

func (e ParameterValueExpression) Select() (string, []any) {
	return e.Value()
}

type DistinctValueExpression [1]ValueExpression

func (e DistinctValueExpression) Value() (string, []any) {
	s, params := e[0].Value()
	return fmt.Sprintf("DISTINCT %s", s), params
}

func (e DistinctValueExpression) Select() (string, []any) {
	return e.Value()
}

type BinaryValueExpression struct {
	Lhs      ValueExpression
	Operator string
	Rhs      ValueExpression
}

func (e BinaryValueExpression) Value() (string, []any) {
	var params []any
	lhsStr, lhsParams := e.Lhs.Value()
	rhsStr, rhsParams := e.Rhs.Value()

	params = append(params, lhsParams...)
	params = append(params, rhsParams...)

	return fmt.Sprintf("%s %s %s", lhsStr, e.Operator, rhsStr), params
}

func (e BinaryValueExpression) Select() (string, []any) {
	return e.Value()
}

type AggregationValueExpression struct {
	Function string
	Expr     ValueExpression
	Filter   *Condition
}

func (e AggregationValueExpression) Value() (string, []any) {
	var params []any

	exprStr, exprParams := e.Expr.Value()
	s := fmt.Sprintf("%s( %s )", e.Function, exprStr)
	params = append(params, exprParams...)

	if e.Filter != nil {
		filterExpr, filterParams := (*e.Filter).Condition()
		s += fmt.Sprintf(" FILTER ( %s )", filterExpr)
		params = append(params, filterParams...)
	}

	return s, params
}

func (e AggregationValueExpression) Select() (string, []any) {
	return e.Value()
}

type AliasSelectExpression struct {
	Expr  ValueExpression
	Alias *string
}

func (s AliasSelectExpression) Select() (string, []any) {
	exprStr, exprParams := s.Expr.Value()
	if s.Alias != nil {
		exprStr += fmt.Sprintf(" AS %s", *s.Alias)
	}

	return exprStr, exprParams
}
