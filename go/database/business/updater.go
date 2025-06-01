package business

import (
	"context"
	"database/sql"
	"github.com/explore-flights/monorepo/go/database/db"
	"github.com/explore-flights/monorepo/go/database/util"
	"time"
)

type Updater struct{}

func (*Updater) RunUpdateSequence(ctx context.Context, conn *sql.Conn, t time.Time, inputFileUri string) error {
	sequence := util.UpdateSequence{
		{
			Name:   "X11LoadRawData",
			Script: db.X11LoadRawData,
			Params: [][]any{{inputFileUri}},
		},
		{
			Name:   "X12UpdateDatabase",
			Script: db.X12UpdateDatabase,
			Params: [][]any{{t}},
		},
		{
			Name:   "X13UpdateHistory",
			Script: db.X13UpdateHistory,
			Params: [][]any{{t}},
		},
	}

	return sequence.Run(ctx, conn)
}
