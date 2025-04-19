package xtime

import (
	"cmp"
	"time"
)

var unixZero = time.Unix(0, 0)

type LocalDate int64

func NewLocalDate(t time.Time) LocalDate {
	year1 := 1970
	year2 := t.Year()
	mul := 1

	if year1 > year2 {
		year1, year2 = year2, year1
		mul = -1
	}

	totalYears := year2 - year1
	year2 -= 1 // exclude the current year for leap year calculations
	leapYears1 := year1/4 - year1/100 + year1/400
	leapYears2 := year2/4 - year2/100 + year2/400
	leapYears := leapYears2 - leapYears1
	regularYears := totalYears - leapYears

	totalDays := regularYears*365 + leapYears*366
	totalDays += t.YearDay() - 1

	return LocalDate(totalDays * mul)
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

func (ld LocalDate) Date() (int, time.Month, int) {
	return unixZero.AddDate(0, 0, int(ld)).Date()
}

func (ld LocalDate) Time(loc *time.Location) time.Time {
	year, month, day := ld.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, cmp.Or(loc, time.UTC))
}

func (ld LocalDate) Range(days int) LocalDateRange {
	return LocalDateRange{ld, ld + LocalDate(days)}
}

func (ld LocalDate) DaysUntil(other LocalDate) int {
	return int(other - ld)
}

func (ld LocalDate) IsZero() bool {
	return ld == 0
}

func (ld *LocalDate) UnmarshalText(text []byte) error {
	var err error
	*ld, err = ParseLocalDate(string(text))

	return err
}

func (ld LocalDate) MarshalText() ([]byte, error) {
	return []byte(ld.String()), nil
}
