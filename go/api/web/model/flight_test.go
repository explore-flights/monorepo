package model

import (
	"database/sql"
	"encoding/json"
	"testing"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
)

func TestFlightScheduleItemFromDbIncludesPreviousVariant(t *testing.T) {
	currentId := uuid.Must(uuid.NewV4())
	previousId := uuid.Must(uuid.NewV4())

	item := FlightScheduleItemFromDb(db.FlightScheduleItem{
		FlightVariantId:         sql.Null[uuid.UUID]{V: currentId, Valid: true},
		PreviousFlightVariantId: sql.Null[uuid.UUID]{V: previousId, Valid: true},
	})

	require.NotNil(t, item.FlightVariantId)
	require.Equal(t, UUID(currentId), *item.FlightVariantId)
	require.NotNil(t, item.PreviousFlightVariantId)
	require.Equal(t, UUID(previousId), *item.PreviousFlightVariantId)

	payload, err := json.Marshal(item)
	require.NoError(t, err)
	require.JSONEq(t, `{
		"departureDateLocal":"1970-01-01",
		"departureAirportId":"",
		"flightVariantId":"`+UUID(currentId).String()+`",
		"previousFlightVariantId":"`+UUID(previousId).String()+`",
		"version":"0001-01-01T00:00:00Z",
		"versionCount":0
	}`, string(payload))
}

func TestFlightScheduleItemFromDbOmitsMissingVariantIds(t *testing.T) {
	item := FlightScheduleItemFromDb(db.FlightScheduleItem{})

	require.Nil(t, item.FlightVariantId)
	require.Nil(t, item.PreviousFlightVariantId)

	payload, err := json.Marshal(item)
	require.NoError(t, err)
	require.NotContains(t, string(payload), "flightVariantId")
	require.NotContains(t, string(payload), "previousFlightVariantId")
}
