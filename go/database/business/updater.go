package business

import (
	"context"
	"database/sql"
	"github.com/explore-flights/monorepo/go/database/db"
	"github.com/explore-flights/monorepo/go/database/util"
	"strings"
	"time"
)

type Updater struct{}

func (*Updater) RunUpdateSequence(ctx context.Context, conn *sql.Conn, t time.Time, inputFileUris []string) error {
	placeholders := make([]string, len(inputFileUris))
	anyTypedInputFileUris := make([]any, len(inputFileUris))
	for i, v := range inputFileUris {
		placeholders[i] = "?"
		anyTypedInputFileUris[i] = v
	}

	sequence := util.UpdateSequence{
		{
			Name:   "X11LoadRawData",
			Script: strings.Replace(db.X11LoadRawData, "?", "["+strings.Join(placeholders, ",")+"]", 1),
			Params: [][]any{anyTypedInputFileUris},
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
