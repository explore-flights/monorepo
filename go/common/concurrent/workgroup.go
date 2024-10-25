package concurrent

import (
	"context"
	"golang.org/x/sync/errgroup"
	"iter"
)

type WorkGroup[In any, Acc any, Out any] struct {
	Parallelism uint
	Worker      func(ctx context.Context, v In, acc Acc) (Acc, error)
	Combiner    func(ctx context.Context, a, b Acc) (Acc, error)
	Finisher    func(ctx context.Context, acc Acc) (Out, error)
}

func (wg WorkGroup[In, Acc, Out]) RunSeq(ctx context.Context, seq iter.Seq[In]) (Out, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	return wg.RunChan(ctx, wg.inputsFromSeq(ctx, seq))
}

func (wg WorkGroup[In, Acc, Out]) RunChan(ctx context.Context, ch <-chan In) (Out, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	accCh, waitForWorkers := wg.startWorkers(ctx, ch)
	acc, err := wg.combineAll(ctx, accCh)
	if err != nil {
		var def Out
		return def, err
	}

	if err = waitForWorkers(); err != nil {
		var def Out
		return def, err
	}

	return wg.Finisher(ctx, acc)
}

func (wg WorkGroup[In, Acc, Out]) combineAll(ctx context.Context, ch <-chan Acc) (Acc, error) {
	var overallAcc Acc
	for {
		select {
		case acc, ok := <-ch:
			if !ok {
				return overallAcc, nil
			}

			var err error
			overallAcc, err = wg.Combiner(ctx, overallAcc, acc)
			if err != nil {
				return overallAcc, err
			}

		case <-ctx.Done():
			return overallAcc, ctx.Err()
		}
	}
}

func (wg WorkGroup[In, Acc, Out]) startWorkers(ctx context.Context, inCh <-chan In) (<-chan Acc, func() error) {
	accCh := make(chan Acc, wg.Parallelism)
	g, ctx := errgroup.WithContext(ctx)
	for range wg.Parallelism {
		g.Go(func() error {
			var acc Acc
			for {
				select {
				case in, ok := <-inCh:
					if !ok {
						select {
						case accCh <- acc:
							return nil

						case <-ctx.Done():
							return ctx.Err()
						}
					}

					var err error
					acc, err = wg.Worker(ctx, in, acc)
					if err != nil {
						return err
					}

				case <-ctx.Done():
					return ctx.Err()
				}
			}
		})
	}

	errCh := make(chan error, 1)
	go func() {
		defer func() {
			close(errCh)
			close(accCh)
		}()

		if err := g.Wait(); err != nil {
			errCh <- err
		}
	}()

	return accCh, func() error {
		return <-errCh
	}
}

func (wg WorkGroup[In, Acc, Out]) inputsFromSeq(ctx context.Context, seq iter.Seq[In]) <-chan In {
	ch := make(chan In, wg.Parallelism)
	go func() {
		defer close(ch)

		for v := range seq {
			select {
			case ch <- v:
			case <-ctx.Done():
				return
			}
		}
	}()

	return ch
}
