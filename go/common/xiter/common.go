package xiter

import (
	"iter"
	"slices"
)

func All[Slice ~[]E, E any](s Slice) iter.Seq[E] {
	return func(yield func(E) bool) {
		for _, v := range s {
			if !yield(v) {
				return
			}
		}
	}
}

func Single[T any](v T) iter.Seq[T] {
	return func(yield func(T) bool) {
		yield(v)
	}
}

func Map[T any, R any](seq iter.Seq[T], f func(T) R) iter.Seq[R] {
	return func(yield func(R) bool) {
		for v := range seq {
			if !yield(f(v)) {
				return
			}
		}
	}
}

func Filter[T any](seq iter.Seq[T], f func(T) bool) iter.Seq[T] {
	return func(yield func(T) bool) {
		for v := range seq {
			if f(v) {
				if !yield(v) {
					return
				}
			}
		}
	}
}

func Combine[T any](seqs ...iter.Seq[T]) iter.Seq[T] {
	return func(yield func(T) bool) {
		for _, seq := range seqs {
			for v := range seq {
				if !yield(v) {
					return
				}
			}
		}
	}
}

func Chunk[Slice ~[]E, E any](seq iter.Seq[E], n int) iter.Seq[Slice] {
	return slices.Chunk(slices.AppendSeq(make(Slice, 0), seq), n)
}

func Empty[T any]() iter.Seq[T] {
	return func(yield func(T) bool) {

	}
}
