package xtime

import (
	"github.com/stretchr/testify/assert"
	"math/big"
	"slices"
	"testing"
)

func TestLocalDateBitSet_AddIter(t *testing.T) {
	var bs LocalDateBitSet
	bs = bs.Add(MustParseLocalDate("2024-01-01"))
	bs = bs.Add(MustParseLocalDate("2024-06-01"))

	assert.Equal(
		t,
		[]LocalDate{
			MustParseLocalDate("2024-01-01"),
			MustParseLocalDate("2024-06-01"),
		},
		slices.Sorted(bs.Iter),
	)
}

func TestLocalDateBitSet_RemoveIter(t *testing.T) {
	var bs LocalDateBitSet
	bs = bs.Add(MustParseLocalDate("2024-01-01"))
	bs = bs.Add(MustParseLocalDate("2024-06-01"))
	bs = bs.Remove(MustParseLocalDate("2024-01-01"))

	assert.Equal(
		t,
		[]LocalDate{
			MustParseLocalDate("2024-06-01"),
		},
		slices.Sorted(bs.Iter),
	)
}

func TestLocalDateBitSet_Compact(t *testing.T) {
	bs := LocalDateBitSet{
		offset: MustParseLocalDate("2024-01-01"),
		bitset: *big.NewInt(0b10),
	}

	bs = bs.Compact()

	assert.Equal(t, MustParseLocalDate("2024-01-02"), bs.offset)
	assert.Equal(t, int64(1), bs.bitset.Int64())
}

func TestLocalDateBitSet_Or(t *testing.T) {
	var bs1 LocalDateBitSet
	bs1 = bs1.Add(MustParseLocalDate("2024-01-01"))

	var bs2 LocalDateBitSet
	bs2 = bs2.Add(MustParseLocalDate("2024-06-01"))

	bs := bs1.Or(bs2)

	assert.Equal(
		t,
		[]LocalDate{
			MustParseLocalDate("2024-01-01"),
			MustParseLocalDate("2024-06-01"),
		},
		slices.Sorted(bs.Iter),
	)
}

func TestLocalDateBitSet_Contains(t *testing.T) {
	var bs LocalDateBitSet
	bs = bs.Add(MustParseLocalDate("2024-01-01"))

	assert.True(t, bs.Contains(MustParseLocalDate("2024-01-01")))
	assert.False(t, bs.Contains(MustParseLocalDate("2024-06-01")))
}

func TestLocalDateBitSet_SpanCount(t *testing.T) {
	var bs LocalDateBitSet

	span, ok := bs.Span()
	assert.False(t, ok)
	assert.Equal(t, 0, bs.Count())

	bs = bs.Add(MustParseLocalDate("2024-01-01"))
	span, ok = bs.Span()
	assert.True(t, ok)
	assert.Equal(
		t,
		LocalDateRange{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-01-01")},
		span,
	)
	assert.Equal(t, 1, bs.Count())

	bs = bs.Add(MustParseLocalDate("2024-06-01"))
	span, ok = bs.Span()
	assert.True(t, ok)
	assert.Equal(
		t,
		LocalDateRange{MustParseLocalDate("2024-01-01"), MustParseLocalDate("2024-06-01")},
		span,
	)
	assert.Equal(t, 2, bs.Count())
}

func TestLocalDateBitSet_Empty(t *testing.T) {
	var bs LocalDateBitSet
	assert.True(t, bs.Empty())

	bs = bs.Add(MustParseLocalDate("2024-01-01"))
	assert.False(t, bs.Empty())
}
