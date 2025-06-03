package schedulesearch

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/db"
)

type searchRepo interface {
	FlightSchedulesLatestRaw(ctx context.Context, filter string, params []any) (db.FlightSchedulesMany, error)
}

type Search struct {
	repo searchRepo
}

func NewSearch(repo searchRepo) *Search {
	return &Search{repo: repo}
}

func (s *Search) QuerySchedules(ctx context.Context, cond Condition) (db.FlightSchedulesMany, error) {
	filter, params := cond.Apply()
	return s.repo.FlightSchedulesLatestRaw(ctx, filter, params)
}
