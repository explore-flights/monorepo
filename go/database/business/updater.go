package business

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/database/db"
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

	var rawDataRows, flattenedRows, operatingFlightRows int64
	sequence := UpdateSequence{
		{
			Name:   "X11LoadRawData",
			Script: strings.Replace(db.X11LoadRawData, "?", "["+strings.Join(placeholders, ",")+"]", 1),
			Params: [][]any{anyTypedInputFileUris},
			Checks: []func(sql.Result) error{
				func(result sql.Result) error {
					var err error
					rawDataRows, err = result.RowsAffected()
					return err
				},
			},
		},
		{
			Name:   "X12FlattenRawData",
			Script: db.X12FlattenRawData,
			Checks: []func(sql.Result) error{
				func(result sql.Result) error {
					var err error
					flattenedRows, err = result.RowsAffected()
					if err != nil {
						return err
					}

					if flattenedRows < rawDataRows {
						return fmt.Errorf("flattened rows %d less than raw data rows %d", flattenedRows, rawDataRows)
					}

					return nil
				},
			},
		},
		{
			Name:   "X13OperatingFlights",
			Script: db.X13OperatingFlights,
			Checks: []func(sql.Result) error{
				func(result sql.Result) error {
					var err error
					operatingFlightRows, err = result.RowsAffected()
					if err != nil {
						return err
					}

					if operatingFlightRows > flattenedRows {
						return fmt.Errorf("operating flights rows %d are more than flattened rows %d", operatingFlightRows, flattenedRows)
					}

					return nil
				},
			},
		},
		{
			Name:   "X14InsertAirlines",
			Script: db.X14InsertAirlines,
		},
		{
			Name:   "X15InsertAirports",
			Script: db.X15InsertAirports,
		},
		{
			Name:   "X16InsertAircraft",
			Script: db.X16InsertAircraft,
		},
		{
			Name:   "X17InsertFlightNumbers",
			Script: db.X17InsertFlightNumbers,
		},
		{
			Name:   "X18OperatingFlightsWithCs",
			Script: db.X18OperatingFlightsWithCs,
			Checks: []func(sql.Result) error{
				func(result sql.Result) error {
					var operatingWithCsRows int64
					var err error
					operatingWithCsRows, err = result.RowsAffected()
					if err != nil {
						return err
					}

					if operatingWithCsRows != operatingFlightRows {
						return fmt.Errorf("operating with cs rows %d are not equal to operating rows %d", operatingWithCsRows, operatingFlightRows)
					}

					return nil
				},
			},
		},
		{
			Name:   "X19InsertFlightVariants",
			Script: db.X19InsertFlightVariants,
		},
		{
			Name:   "X20LhFlightsFresh",
			Script: db.X20LhFlightsFresh,
			Params: [][]any{{t}},
		},
		{
			Name:   "X21UpdateHistory",
			Script: db.X21UpdateHistory,
		},
		{
			Name:   "X22CreateRemovedMarkers",
			Script: db.X22CreateRemovedMarkers,
			Params: [][]any{{t}},
		},
		{
			Name:   "drop fresh",
			Script: "DROP TABLE lh_flights_fresh",
		},
	}

	return sequence.Run(ctx, conn)
}
