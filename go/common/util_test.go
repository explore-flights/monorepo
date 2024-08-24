package common

import "testing"

func TestSliceEqualContent(t *testing.T) {
	s1 := []string{"a", "b", "c", "d"}
	s2 := []string{"a", "d", "c", "b"}

	if !SliceEqualContent(s1, s2) {
		t.Fatal("slices should be equal")
	}
}
