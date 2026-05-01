//go:build !lambda

package db

import "github.com/explore-flights/monorepo/go/common"

func bootQueriesSecrets() []common.Tuple[string, []any] {
	return nil
}
