package xtime

import (
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestLocalDateRanges_Add_Simple(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
	}

	ldrs = ldrs.Add(MustParseLocalDate("2024-02-01"))

	assert.Equal(
		t,
		LocalDateRanges{
			{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-02-01")},
		},
		ldrs,
	)
}

func TestLocalDateRanges_Add_AlreadyExists(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
	}

	ldrs = ldrs.Add(MustParseLocalDate("2024-01-15"))

	assert.Equal(
		t,
		LocalDateRanges{
			{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
		},
		ldrs,
	)
}

func TestLocalDateRanges_Expand_InBetween(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
		{MustParseLocalDate("2024-12-01"), MustParseLocalDate("2024-12-31")},
	}

	ldrs = ldrs.Expand(LocalDateRange{
		MustParseLocalDate("2024-06-01"),
		MustParseLocalDate("2024-06-30"),
	})

	assert.Equal(
		t,
		LocalDateRanges{
			{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
			{MustParseLocalDate("2024-06-01"), MustParseLocalDate("2024-06-30")},
			{MustParseLocalDate("2024-12-01"), MustParseLocalDate("2024-12-31")},
		},
		ldrs,
	)
}

func TestLocalDateRanges_Expand_Connect(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
		{MustParseLocalDate("2024-03-01"), MustParseLocalDate("2024-03-31")},
	}

	ldrs = ldrs.Expand(LocalDateRange{
		MustParseLocalDate("2024-02-01"),
		MustParseLocalDate("2024-02-29"),
	})

	assert.Equal(
		t,
		LocalDateRanges{
			{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-03-31")},
		},
		ldrs,
	)
}

func TestLocalDateRanges_Remove_Disconnect(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-31")},
	}

	ldrs = ldrs.Remove(MustParseLocalDate("2024-01-15"))

	assert.Equal(
		t,
		LocalDateRanges{
			{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-14")},
			{MustParseLocalDate("2024-01-16"), MustParseLocalDate("2024-01-31")},
		},
		ldrs,
	)
}

func TestLocalDateRanges_Remove_Empty(t *testing.T) {
	ldrs := LocalDateRanges{
		{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-01")},
	}

	ldrs = ldrs.Remove(MustParseLocalDate("2024-01-01"))

	assert.Equal(
		t,
		LocalDateRanges{},
		ldrs,
	)
}
