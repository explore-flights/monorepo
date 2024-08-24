package common

import "slices"

func SliceEqualContent[S ~[]E, E comparable](s1, s2 S) bool {
	if len(s1) != len(s2) {
		return false
	}

	s1 = slices.Clone(s1)
	s2 = slices.Clone(s2)

	for len(s1) > 0 && len(s2) > 0 {
		idx := slices.Index(s2, s1[0])
		if idx == -1 {
			return false
		}

		s1 = s1[1:]
		s2 = slices.Delete(s2, idx, idx+1)
	}

	return len(s1) == 0 && len(s2) == 0
}
