package connections

import (
	"fmt"
	"reflect"

	"cel.dev/cel-go/cel"
	"cel.dev/cel-go/common/operators"
	"cel.dev/cel-go/common/types"
	"cel.dev/cel-go/common/types/ref"
	"cel.dev/cel-go/common/types/traits"
)

var evaluationType = types.NewObjectType("connections.ConnectionEvaluation", traits.AdderType)

// celEvaluation implements CEL's addition trait without coupling business values to CEL.
type celEvaluation struct {
	value ConnectionEvaluation
}

func (e *celEvaluation) Type() ref.Type { return evaluationType }
func (e *celEvaluation) Value() any     { return e.value }

func (e *celEvaluation) ConvertToNative(t reflect.Type) (any, error) {
	if t == reflect.TypeFor[ConnectionEvaluation]() {
		return e.value, nil
	}
	return nil, fmt.Errorf("cannot convert connection evaluation to %v", t)
}

func (e *celEvaluation) ConvertToType(t ref.Type) ref.Val {
	if t == evaluationType {
		return e
	}
	if t == types.TypeType {
		return evaluationType
	}
	return types.NewErr("cannot convert connection evaluation to %v", t)
}

func (e *celEvaluation) Equal(other ref.Val) ref.Val {
	right, ok := other.(*celEvaluation)
	if !ok {
		return types.MaybeNoSuchOverloadErr(other)
	}
	return types.Bool(reflect.DeepEqual(e.value, right.value))
}

func (e *celEvaluation) Add(other ref.Val) ref.Val {
	right, ok := other.(*celEvaluation)
	if !ok {
		return types.MaybeNoSuchOverloadErr(other)
	}
	if e.value.Next != nil && right.value.Next != nil {
		return types.NewErr("cannot combine two proceed() evaluations; specify one LayoverWindow")
	}
	result := ConnectionEvaluation{Yield: e.value.Yield || right.value.Yield, Next: e.value.Next}
	if result.Next == nil {
		result.Next = right.value.Next
	}
	return &celEvaluation{value: result}
}

func evaluationEnvironment() []cel.EnvOption {
	return []cel.EnvOption{
		cel.Types(evaluationType),
		cel.Abbrevs("connections.LayoverWindow"),
		cel.Function("abort", cel.Overload("connection_abort", nil, evaluationType,
			cel.FunctionBinding(func(...ref.Val) ref.Val {
				return &celEvaluation{}
			}))),
		cel.Function("yield", cel.Overload("connection_yield", nil, evaluationType,
			cel.FunctionBinding(func(...ref.Val) ref.Val {
				return &celEvaluation{value: ConnectionEvaluation{Yield: true}}
			}))),
		cel.Function("proceed", cel.Overload("connection_proceed", []*cel.Type{cel.ObjectType("connections.LayoverWindow")}, evaluationType,
			cel.UnaryBinding(func(value ref.Val) ref.Val {
				window := value.Value().(*LayoverWindow)
				if window.MinLayover < 0 {
					return types.NewErr("LayoverWindow.Min cannot be negative")
				}
				if window.MaxLayover != nil && *window.MaxLayover < window.MinLayover {
					return types.NewErr("LayoverWindow.Max must be greater than or equal to Min")
				}
				return &celEvaluation{value: ConnectionEvaluation{Next: window}}
			}))),
		// CEL's built-in addition dispatches through the custom value's Adder trait.
		cel.Function(operators.Add, cel.Overload("connection_evaluation_add", []*cel.Type{evaluationType, evaluationType}, evaluationType)),
	}
}

// celTypeProvider supplies the lazy flight fields and LayoverWindow construction.
type celTypeProvider struct {
	types.Provider
	adapter types.Adapter
}

// Native object construction cannot convert CEL durations to *time.Duration.
// Construct this one business type explicitly to retain absent versus zero Max.
func (p *celTypeProvider) NewValue(name string, fields map[string]ref.Val) ref.Val {
	if name != "connections.LayoverWindow" {
		return p.Provider.NewValue(name, fields)
	}
	window := &LayoverWindow{}
	if value, present := fields["Min"]; present {
		duration, ok := value.(types.Duration)
		if !ok {
			return types.NewErr("LayoverWindow.Min must be a duration")
		}
		window.MinLayover = duration.Duration
	}
	if value, present := fields["Max"]; present {
		duration, ok := value.(types.Duration)
		if !ok {
			return types.NewErr("LayoverWindow.Max must be a duration")
		}
		window.MaxLayover = &duration.Duration
	}
	return p.adapter.NativeToValue(window)
}
