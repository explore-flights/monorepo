package action

import (
	"context"
	"github.com/explore-flights/monorepo/go/common/adapt"
)

type Action[IN any, OUT any] interface {
	Handle(ctx context.Context, params IN) (OUT, error)
}

type MinimalS3Client interface {
	adapt.S3Getter
	adapt.S3Putter
}
