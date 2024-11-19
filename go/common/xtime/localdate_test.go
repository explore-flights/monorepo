package xtime

import (
	"encoding/json"
	"github.com/stretchr/testify/assert"
	"testing"
	"time"
)

func TestNewLocalDate(t *testing.T) {
	assert.Equal(t, LocalDate(0), NewLocalDate(time.Date(1970, time.January, 1, 0, 0, 0, 0, time.FixedZone("", -60*60*14))))
	assert.Equal(t, LocalDate(0), NewLocalDate(time.Date(1970, time.January, 1, 0, 0, 0, 0, time.UTC)))
	assert.Equal(t, LocalDate(0), NewLocalDate(time.Date(1970, time.January, 1, 23, 59, 59, 0, time.FixedZone("", 60*60*14))))
}

func TestParseLocalDate(t *testing.T) {
	d, err := ParseLocalDate("2024-06-15")
	assert.NoError(t, err)
	assert.Equal(t, LocalDate(19889), d)
	assert.Equal(t, "2024-06-15", d.String())

	year, month, day := d.Date()
	assert.Equal(t, 2024, year)
	assert.Equal(t, time.June, month)
	assert.Equal(t, 15, day)
}

func TestLocalDate_String(t *testing.T) {
	assert.Equal(t, "2024-06-15", LocalDate(19889).String())
}

func TestLocalDate_JSON(t *testing.T) {
	b, err := json.Marshal(LocalDate(19889))
	assert.NoError(t, err)
	assert.Equal(t, `"2024-06-15"`, string(b))
}
