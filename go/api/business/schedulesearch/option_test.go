package schedulesearch

import (
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/stretchr/testify/assert"
)

func TestWithDepartureDateRangeUTC(t *testing.T) {
	condition := WithDepartureDateRangeUTC(
		xtime.NewLocalDateFromParts(2026, time.January, 1),
		xtime.NewLocalDateFromParts(2027, time.January, 1),
	)

	filter, params := condition.cond.Condition()
	assert.Equal(
		t,
		"( ( (fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) >= CAST(? AS TIMESTAMPTZ) ) AND ( (fvh.departure_date_local + fv.departure_time_local - TO_SECONDS(fv.departure_utc_offset_seconds)) < CAST(? AS TIMESTAMPTZ) ) )",
		filter,
	)
	assert.Equal(t, []any{"2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"}, params)
}
