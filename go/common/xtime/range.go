package xtime

import (
	"encoding/json"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"iter"
)

type LocalDateRange [2]LocalDate

func (ldr LocalDateRange) Iter() iter.Seq[LocalDate] {
	return func(yield func(LocalDate) bool) {
		curr := ldr[0]
		for curr <= ldr[1] {
			if !yield(curr) {
				return
			}

			curr += 1
		}
	}
}

type LocalDateRanges LocalDateBitSet

func NewLocalDateRanges(dates iter.Seq[LocalDate]) LocalDateRanges {
	var result LocalDateBitSet

	for d := range dates {
		result = result.Add(d).Compact()
	}

	return LocalDateRanges(result)
}

func (ldrs *LocalDateRanges) UnmarshalJSON(b []byte) error {
	var v []LocalDateRange
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}

	var result LocalDateBitSet
	for _, r := range v {
		for d := range r.Iter() {
			result = result.Add(d).Compact()
		}
	}

	*ldrs = LocalDateRanges(result)

	return nil
}

func (ldrs LocalDateRanges) MarshalJSON() ([]byte, error) {
	result := make([]LocalDateRange, 0)

	var start LocalDate
	var prev LocalDate

	for d := range LocalDateBitSet(ldrs).Iter {
		if start == 0 {
			start = d
		}

		if prev != 0 && prev != d-1 {
			result = append(result, LocalDateRange{start, prev})
			start = d
		}

		prev = d
	}

	if prev != 0 {
		result = append(result, LocalDateRange{start, prev})
	}

	return json.Marshal(result)
}

func (ldrs LocalDateRanges) Contains(d LocalDate) bool {
	return LocalDateBitSet(ldrs).Contains(d)
}

func (ldrs LocalDateRanges) Iter() iter.Seq[LocalDate] {
	return LocalDateBitSet(ldrs).Iter
}

func (ldrs LocalDateRanges) Span() (LocalDateRange, bool) {
	return LocalDateBitSet(ldrs).Span()
}

func (ldrs LocalDateRanges) Count() int {
	return LocalDateBitSet(ldrs).Count()
}

func (ldrs LocalDateRanges) Empty() bool {
	return LocalDateBitSet(ldrs).Empty()
}

func (ldrs LocalDateRanges) ExpandAll(other LocalDateRanges) LocalDateRanges {
	return LocalDateRanges(LocalDateBitSet(ldrs).Or(LocalDateBitSet(other)).Compact())
}

func (ldrs LocalDateRanges) Add(d LocalDate) LocalDateRanges {
	return LocalDateRanges(LocalDateBitSet(ldrs).Add(d).Compact())
}

func (ldrs LocalDateRanges) Remove(d LocalDate) LocalDateRanges {
	return LocalDateRanges(LocalDateBitSet(ldrs).Remove(d).Compact())
}

func (ldrs LocalDateRanges) RemoveAll(fn func(LocalDate) bool) LocalDateRanges {
	return NewLocalDateRanges(xiter.Filter(
		ldrs.Iter(),
		func(d LocalDate) bool {
			return !fn(d)
		},
	))
}
