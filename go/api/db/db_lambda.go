//go:build lambda

package db

import "github.com/explore-flights/monorepo/go/common"

func bootQueriesSecrets() []common.Tuple[string, []any] {
	return []common.Tuple[string, []any]{
		{
			`CREATE OR REPLACE SECRET secret ( TYPE s3, PROVIDER credential_chain, REGION 'eu-central-1' )`,
			nil,
		},
	}
}
