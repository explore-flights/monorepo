package schedulesearch

import (
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/stretchr/testify/assert"
)

func TestWithDepartureDateRangeLocal(t *testing.T) {
	condition := WithDepartureDateRangeLocal(
		xtime.NewLocalDateFromParts(2026, time.January, 1),
		xtime.NewLocalDateFromParts(2027, time.January, 1),
	)

	filter, params := condition.cond.Condition()
	assert.Equal(
		t,
		"fvh.departure_date_local >= CAST(? AS DATE) AND fvh.departure_date_local < CAST(? AS DATE)",
		filter,
	)
	assert.Equal(t, []any{"2026-01-01", "2027-01-01"}, params)
}
