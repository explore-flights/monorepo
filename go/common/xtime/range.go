package xtime

import (
	"iter"
	"slices"
)

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
