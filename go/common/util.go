package common

type SelfComparator[T any] interface {
	Compare(other T) int
}

func Min[T SelfComparator[T]](a, b T) T {
	if a.Compare(b) < 0 {
		return a
	}

	return b
}

func Max[T SelfComparator[T]](a, b T) T {
	if a.Compare(b) > 0 {
		return a
	}

	return b
}
