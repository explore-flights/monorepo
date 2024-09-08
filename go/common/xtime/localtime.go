package xtime

import (
	"cmp"
	"encoding/json"
	"fmt"
	"time"
)

var (
	ltZero   LocalTime
	Midnight = ltZero
)

type LocalTime struct {
	Hour int
	Min  int
	Sec  int
}

func NewLocalTime(t time.Time) LocalTime {
	hour, minute, sec := t.Clock()
	return LocalTime{
		Hour: hour,
		Min:  minute,
		Sec:  sec,
	}
}

func ParseLocalTime(v string) (LocalTime, error) {
	t, err := time.Parse("15:04:05", v)
	if err != nil {
		return LocalTime{}, err
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

func (lt LocalTime) Time(d LocalDate, loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, lt.Hour, lt.Min, lt.Sec, 0, cmp.Or(loc, time.UTC))
}

func (lt LocalTime) String() string {
	return fmt.Sprintf("%02d:%02d:%02d", lt.Hour, lt.Min, lt.Sec)
}

func (lt *LocalTime) UnmarshalJSON(data []byte) error {
	var v string
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}

	var err error
	*lt, err = ParseLocalTime(v)

	return err
}

func (lt LocalTime) MarshalJSON() ([]byte, error) {
	return json.Marshal(lt.String())
}
