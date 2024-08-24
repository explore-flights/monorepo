//go:build !lambda

package adapt

import (
	"errors"
	"os"
)

func IsS3NotFound(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}
