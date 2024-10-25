package concurrent

import (
	"context"
	"errors"
	"github.com/stretchr/testify/assert"
	"testing"
	"time"
)

func TestWorkGroup_Run_HappyCase(t *testing.T) {
	const (
		countIdx = iota
		minIdx
		maxIdx
		sumIdx
	)

	wg := WorkGroup[int, [4]int, [4]int]{
		Parallelism: 10,
		Worker: func(ctx context.Context, v int, acc [4]int) ([4]int, error) {
			if acc[countIdx] == 0 {
				acc[countIdx] = 1
				acc[minIdx] = v
				acc[maxIdx] = v
				acc[sumIdx] = v
			} else {
				acc[countIdx] += 1
				acc[minIdx] = min(acc[minIdx], v)
				acc[maxIdx] = max(acc[maxIdx], v)
				acc[sumIdx] += v
			}

			return acc, nil
		},
		Combiner: func(ctx context.Context, a, b [4]int) ([4]int, error) {
			if a[countIdx] == 0 {
				return b, nil
			}

			a[countIdx] += b[countIdx]
			a[minIdx] = min(a[minIdx], b[minIdx])
			a[maxIdx] = max(a[maxIdx], b[maxIdx])
			a[sumIdx] += b[sumIdx]

			return a, nil
		},
		Finisher: func(ctx context.Context, acc [4]int) ([4]int, error) {
			return acc, nil
		},
	}

	result, err := wg.RunSeq(context.Background(), func(yield func(int) bool) {
		for i := -50; i <= 100; i++ {
			if !yield(i) {
				break
			}
		}
	})

	if assert.NoError(t, err) {
		assert.Equal(t, [4]int{151, -50, 100, 3775}, result)
	}
}

func TestWorkGroup_Run_Errors(t *testing.T) {
	workerErr := errors.New("worker")
	combinerErr := errors.New("combiner")
	finisherErr := errors.New("finisher")

	stdWorker := func(ctx context.Context, v struct{}, acc struct{}) (struct{}, error) {
		return struct{}{}, nil
	}

	stdCombiner := func(ctx context.Context, a, b struct{}) (struct{}, error) {
		return struct{}{}, nil
	}

	stdFinisher := func(ctx context.Context, acc struct{}) (struct{}, error) {
		return struct{}{}, nil
	}

	testCases := []struct {
		name        string
		worker      func(ctx context.Context, v struct{}, acc struct{}) (struct{}, error)
		combiner    func(ctx context.Context, a, b struct{}) (struct{}, error)
		finisher    func(ctx context.Context, acc struct{}) (struct{}, error)
		expectedErr error
	}{
		{
			name: "worker",
			worker: func(ctx context.Context, v struct{}, acc struct{}) (struct{}, error) {
				return struct{}{}, workerErr
			},
			combiner:    stdCombiner,
			finisher:    stdFinisher,
			expectedErr: workerErr,
		},
		{
			name:   "combiner",
			worker: stdWorker,
			combiner: func(ctx context.Context, a, b struct{}) (struct{}, error) {
				return struct{}{}, combinerErr
			},
			finisher:    stdFinisher,
			expectedErr: combinerErr,
		},
		{
			name:     "finisher",
			worker:   stdWorker,
			combiner: stdCombiner,
			finisher: func(ctx context.Context, acc struct{}) (struct{}, error) {
				return struct{}{}, finisherErr
			},
			expectedErr: finisherErr,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			wg := WorkGroup[struct{}, struct{}, struct{}]{
				Parallelism: 1,
				Worker:      tc.worker,
				Combiner:    tc.combiner,
				Finisher:    tc.finisher,
			}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			_, err := wg.RunChan(ctx, singleValueChan(struct{}{}))
			assert.ErrorIs(t, err, tc.expectedErr)
		})
	}
}

func TestWorkGroup_Run_Cancel(t *testing.T) {
	wg := WorkGroup[struct{}, struct{}, struct{}]{
		Parallelism: 10,
		Worker: func(ctx context.Context, v struct{}, acc struct{}) (struct{}, error) {
			ch := make(chan struct{})
			defer close(ch)

			select {
			case <-ch: // this would intentionally block forever
			case <-ctx.Done():
				return struct{}{}, ctx.Err()
			}

			return struct{}{}, nil
		},
		Combiner: func(ctx context.Context, a, b struct{}) (struct{}, error) {
			return struct{}{}, nil
		},
		Finisher: func(ctx context.Context, acc struct{}) (struct{}, error) {
			return struct{}{}, nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := wg.RunChan(ctx, singleValueChan(struct{}{}))
	assert.ErrorIs(t, err, context.Canceled)
}

func TestWorkGroup_Run_Timeout(t *testing.T) {
	wg := WorkGroup[struct{}, struct{}, struct{}]{
		Parallelism: 10,
		Worker: func(ctx context.Context, v struct{}, acc struct{}) (struct{}, error) {
			ch := make(chan struct{})
			defer close(ch)

			select {
			case <-ch: // this would intentionally block forever
			case <-ctx.Done():
				return struct{}{}, ctx.Err()
			}

			return struct{}{}, nil
		},
		Combiner: func(ctx context.Context, a, b struct{}) (struct{}, error) {
			return struct{}{}, nil
		},
		Finisher: func(ctx context.Context, acc struct{}) (struct{}, error) {
			return struct{}{}, nil
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond*10)
	defer cancel()

	_, err := wg.RunChan(ctx, singleValueChan(struct{}{}))
	assert.ErrorIs(t, err, context.DeadlineExceeded)
}

func singleValueChan[T any](v T) <-chan T {
	ch := make(chan T, 1)
	ch <- v
	close(ch)

	return ch
}
