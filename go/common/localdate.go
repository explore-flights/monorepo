package common

import (
	"cmp"
	"encoding/json"
	"iter"
	"slices"
	"time"
)

var zero LocalDate

type LocalDate struct {
	Year  int
	Month time.Month
	Day   int
}

func NewLocalDate(t time.Time) LocalDate {
	year, month, day := t.Date()
	return LocalDate{year, month, day}
}

func ParseLocalDate(v string) (LocalDate, error) {
	t, err := time.Parse(time.DateOnly, v)
	return NewLocalDate(t), err
}

func MustParseLocalDate(v string) LocalDate {
	ld, err := ParseLocalDate(v)
	if err != nil {
		panic(err)
	}

	return ld
}

func (ld LocalDate) String() string {
	return ld.Time(nil).Format(time.DateOnly)
}

func (ld LocalDate) Time(loc *time.Location) time.Time {
	return time.Date(ld.Year, ld.Month, ld.Day, 0, 0, 0, 0, cmp.Or(loc, time.UTC))
}

func (ld LocalDate) Next() LocalDate {
	return NewLocalDate(ld.Time(nil).AddDate(0, 0, 1))
}

func (ld LocalDate) Compare(other LocalDate) int {
	return ld.Time(nil).Compare(other.Time(nil))
}

func (ld LocalDate) Until(endInclusive LocalDate) iter.Seq[LocalDate] {
	return func(yield func(LocalDate) bool) {
		curr := ld
		for curr.Compare(endInclusive) <= 0 {
			if !yield(curr) {
				break
			}

			curr = curr.Next()
		}
	}
}

func (ld LocalDate) IsZero() bool {
	return ld == zero
}

func (ld *LocalDate) UnmarshalJSON(data []byte) error {
	var v string
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}

	var err error
	*ld, err = ParseLocalDate(v)

	return err
}

func (ld LocalDate) MarshalJSON() ([]byte, error) {
	return json.Marshal(ld.String())
}

type LocalDateRange [2]LocalDate

func (ldr LocalDateRange) Iter() iter.Seq[LocalDate] {
	return ldr[0].Until(ldr[1])
}

func (ldr LocalDateRange) Contains(d LocalDate) bool {
	return ldr[0].Compare(d) <= 0 && ldr[1].Compare(d) >= 0
}

func (ldr LocalDateRange) Intersect(other LocalDateRange) (LocalDateRange, bool) {
	var start LocalDate
	var end LocalDate

	if ldr[0].Compare(other[0]) > 0 {
		start = ldr[0]
	} else {
		start = other[0]
	}

	if ldr[1].Compare(other[1]) < 0 {
		end = ldr[1]
	} else {
		end = other[1]
	}

	if start.Compare(end) > 0 {
		return LocalDateRange{}, false
	}

	return LocalDateRange{start, end}, true
}

type LocalDateRanges []LocalDateRange

func NewLocalDateRanges(dates iter.Seq[LocalDate]) LocalDateRanges {
	result := make(LocalDateRanges, 0)
	var currRange LocalDateRange
	for _, d := range slices.SortedFunc(dates, LocalDate.Compare) {
		if currRange[0].IsZero() {
			currRange[0] = d
		}

		if !currRange[1].IsZero() && currRange[1] != d && currRange[1].Next() != d {
			result = append(result, currRange)
			currRange[0] = d
		}

		currRange[1] = d
	}

	if !currRange[1].IsZero() {
		result = append(result, currRange)
	}

	return result
}

func (ldrs LocalDateRanges) Compact() LocalDateRanges {
	return NewLocalDateRanges(ldrs.Iter())
}

func (ldrs LocalDateRanges) Contains(d LocalDate) bool {
	for _, ldr := range ldrs {
		if ldr.Contains(d) {
			return true
		}
	}

	return false
}

func (ldrs LocalDateRanges) Iter() iter.Seq[LocalDate] {
	return func(yield func(LocalDate) bool) {
		for _, ldr := range ldrs {
			for d := range ldr.Iter() {
				if !yield(d) {
					break
				}
			}
		}
	}
}

func (ldrs LocalDateRanges) ExpandAll(other LocalDateRanges) LocalDateRanges {
	return NewLocalDateRanges(func(yield func(LocalDate) bool) {
		for d := range ldrs.Iter() {
			if !yield(d) {
				return
			}
		}

		for d := range other.Iter() {
			if !yield(d) {
				return
			}
		}
	})
}

func (ldrs LocalDateRanges) Expand(ldr LocalDateRange) LocalDateRanges {
	return ldrs.ExpandAll(LocalDateRanges{ldr})
}

func (ldrs LocalDateRanges) Add(d LocalDate) LocalDateRanges {
	return ldrs.Expand(LocalDateRange{d, d})
}

func (ldrs LocalDateRanges) Remove(rm LocalDate) LocalDateRanges {
	return NewLocalDateRanges(func(yield func(LocalDate) bool) {
		for d := range ldrs.Iter() {
			if d != rm {
				if !yield(d) {
					break
				}
			}
		}
	})
}
