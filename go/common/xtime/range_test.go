package xtime

import (
	"encoding/json"
	"github.com/stretchr/testify/assert"
	"slices"
	"testing"
)

func TestLocalDateRange_Iter(t *testing.T) {
	ldr := LocalDateRange{MustParseLocalDate("2024-06-01"), MustParseLocalDate("2024-06-02")}

	assert.Equal(
		t,
		[]LocalDate{
			MustParseLocalDate("2024-06-01"),
			MustParseLocalDate("2024-06-02"),
		},
		slices.Sorted(ldr.Iter()),
	)
}

func TestLocalDateRanges_JSON(t *testing.T) {
	var ldrs LocalDateRanges
	ldrs = ldrs.ExpandAll(NewLocalDateRanges(LocalDateRange{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")}.Iter()))
	ldrs = ldrs.ExpandAll(NewLocalDateRanges(LocalDateRange{MustParseLocalDate("2024-06-01"), MustParseLocalDate("2024-06-15")}.Iter()))
	ldrs = ldrs.Add(MustParseLocalDate("2024-03-01"))

	b, err := json.Marshal(ldrs)
	assert.NoError(t, err)
	assert.Equal(
		t,
		`[["2024-01-01","2024-01-31"],["2024-03-01","2024-03-01"],["2024-06-01","2024-06-15"]]`,
		string(b),
	)
}
