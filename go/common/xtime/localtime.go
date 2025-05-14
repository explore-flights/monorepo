package xtime

import (
	"cmp"
	"fmt"
	"time"
)

type LocalTime time.Duration

func NewLocalTime(t time.Time) LocalTime {
	hour, minute, sec := t.Clock()

	d := time.Duration(0)
	d += time.Duration(hour) * time.Hour
	d += time.Duration(minute) * time.Minute
	d += time.Duration(sec) * time.Second

	return LocalTime(d)
}

func ParseLocalTime(v string) (LocalTime, error) {
	t, err := time.Parse("15:04:05", v)
	if err != nil {
		return LocalTime(0), err
	}

	return NewLocalTime(t), nil
}

func MustParseLocalTime(v string) LocalTime {
	t, err := ParseLocalTime(v)
	if err != nil {
		panic(err)
	}

	return t
}

func (lt LocalTime) Clock() (int, int, int) {
	d := time.Duration(lt).Truncate(time.Second)
	hour := d / time.Hour
	d %= time.Hour

	minute := d / time.Minute
	d %= time.Minute

	second := d / time.Second

	return int(hour), int(minute), int(second)
}

func (lt LocalTime) Time(d LocalDate, loc *time.Location) time.Time {
	year, month, day := d.Date()
	hour, minute, second := lt.Clock()
	return time.Date(year, month, day, hour, minute, second, 0, cmp.Or(loc, time.UTC))
}

func (lt LocalTime) String() string {
	d := time.Duration(lt).Truncate(time.Second)
	hour := d / time.Hour
	d %= time.Hour

	minute := d / time.Minute
	d %= time.Minute

	second := d / time.Second

	return fmt.Sprintf("%02d:%02d:%02d", hour, minute, second)
}

func (lt *LocalTime) UnmarshalText(text []byte) error {
	var err error
	*lt, err = ParseLocalTime(string(text))

	return err
}

func (lt LocalTime) MarshalText() ([]byte, error) {
	return []byte(lt.String()), nil
}

func (lt *LocalTime) Scan(src any) error {
	t, ok := src.(time.Time)
	if !ok {
		return fmt.Errorf("LocalTime.Scan: expected time.Time, got %T\n", src)
	}

	*lt = NewLocalTime(t)
	return nil
}
