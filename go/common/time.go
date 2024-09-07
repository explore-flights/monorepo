package common

import (
	"encoding/json"
	"fmt"
	"time"
)

const (
	offsetTimeFormat = "15:04:05Z07:00"
	offsetOnlyFormat = "Z07:00"
)

type OffsetTime struct {
	Hour int
	Min  int
	Sec  int
	Loc  *time.Location
}

func NewOffsetTime(t time.Time) OffsetTime {
	hour, minute, sec := t.Clock()
	return OffsetTime{
		Hour: hour,
		Min:  minute,
		Sec:  sec,
		Loc:  t.Location(),
	}
}

func ParseOffsetTime(v string) (OffsetTime, error) {
	t, err := time.Parse(offsetTimeFormat, v)
	if err != nil {
		return OffsetTime{}, err
	}

	return OffsetTime{
		Hour: t.Hour(),
		Min:  t.Minute(),
		Sec:  t.Second(),
		Loc:  t.Location(),
	}, nil
}

func MustParseOffsetTime(v string) OffsetTime {
	t, err := ParseOffsetTime(v)
	if err != nil {
		panic(err)
	}

	return t
}

func (t OffsetTime) Time(d LocalDate) time.Time {
	return time.Date(d.Year, d.Month, d.Day, t.Hour, t.Min, t.Sec, 0, t.Loc)
}

func (t OffsetTime) String() string {
	return fmt.Sprintf("%02d:%02d:%02d", t.Hour, t.Min, t.Sec) + time.Now().In(t.Loc).Format(offsetOnlyFormat)
}

func (t *OffsetTime) UnmarshalJSON(data []byte) error {
	var v string
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}

	var err error
	*t, err = ParseOffsetTime(v)

	return err
}

func (t OffsetTime) MarshalJSON() ([]byte, error) {
	return json.Marshal(t.String())
}

func SplitTime(t time.Time) (LocalDate, OffsetTime) {
	return NewLocalDate(t), NewOffsetTime(t)
}
