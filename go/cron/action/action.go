package action

import "context"

type Action[IN any, OUT any] interface {
	Handle(ctx context.Context, params IN) (OUT, error)
}
