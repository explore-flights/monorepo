package xtime

import (
	"cmp"
	"encoding/json"
	"iter"
	"time"
)

var ldZero LocalDate

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
	return ld == ldZero
}

func (ld LocalDate) Weekday() time.Weekday {
	return ld.Time(nil).Weekday()
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
