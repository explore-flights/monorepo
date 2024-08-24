package common

import (
	"testing"
	"time"
)

func TestSplitTime(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	d, ot := SplitTime(now)
	restored := ot.Time(d)

	if now != restored {
		t.Fatalf("Restored time does not match the original time: %v != %v", now, restored)
		return
	}
}
