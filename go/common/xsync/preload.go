package xsync

import "context"

type Preload[T any] struct {
	done  <-chan struct{}
	value T
	err   error
}

func NewPreload[T any](fetcher func() (T, error)) *Preload[T] {
	done := make(chan struct{})
	pl := Preload[T]{
		done: done,
	}

	go func() {
		defer close(done)
		pl.value, pl.err = fetcher()
	}()

	return &pl
}

func (pl *Preload[T]) Value(ctx context.Context) (T, error) {
	select {
	case <-pl.done:
		return pl.value, pl.err
	case <-ctx.Done():
		var zero T
		return zero, ctx.Err()
	}
}
