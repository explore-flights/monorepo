package xtime

import (
	"encoding/json"
	"github.com/stretchr/testify/assert"
	"testing"
	"time"
)

func TestNewLocalTime(t *testing.T) {
	assert.Equal(t, LocalTime(0), NewLocalTime(time.Date(0, time.January, 1, 0, 0, 0, 0, time.UTC)))
	assert.Equal(t, LocalTime(86399000000000), NewLocalTime(time.Date(0, time.January, 1, 23, 59, 59, 0, time.UTC)))
}

func TestParseLocalTime(t *testing.T) {
	lt, err := ParseLocalTime("15:04:05")
	assert.NoError(t, err)
	assert.Equal(t, LocalTime(54245000000000), lt)
	assert.Equal(t, "15:04:05", lt.String())

	hour, minute, second := lt.Clock()
	assert.Equal(t, 15, hour)
	assert.Equal(t, 4, minute)
	assert.Equal(t, 5, second)
}

func TestLocalTime_Time(t *testing.T) {
	assert.Equal(
		t,
		time.Date(2024, time.June, 15, 9, 30, 28, 0, time.UTC),
		MustParseLocalTime("09:30:28").Time(MustParseLocalDate("2024-06-15"), nil),
	)

	loc, err := time.LoadLocation("Europe/Berlin")
	assert.NoError(t, err)

	tt := time.Date(2024, time.March, 31, 3, 30, 0, 0, loc)

	assert.Equal(t, tt, MustParseLocalTime("02:30:00").Time(MustParseLocalDate("2024-03-31"), loc))
	assert.Equal(t, tt, MustParseLocalTime("03:30:00").Time(MustParseLocalDate("2024-03-31"), loc))
}

func TestLocalTime_JSON(t *testing.T) {
	b, err := json.Marshal(LocalTime(86399000000000))
	assert.NoError(t, err)
	assert.Equal(t, `"23:59:59"`, string(b))
}
