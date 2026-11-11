package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/schedulesearch"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fleetWatchRepoStub struct {
	filter string
	params []any
}

func (r *fleetWatchRepoStub) FlightSchedulesLatestRaw(_ context.Context, condition db.Condition) (db.FlightSchedulesMany, error) {
	r.filter, r.params = condition.Condition()
	id := uuid.FromStringOrNil("00000000-0000-0000-0000-000000000001")
	fn := db.FlightNumber{AirlineIataCode: "LH", Number: 400}
	return db.FlightSchedulesMany{
		Schedules: map[db.FlightNumber][]db.FlightScheduleItem{fn: {{
			DepartureDateLocal:       xtime.NewLocalDateFromParts(2027, time.January, 2),
			DepartureAirportIataCode: "FRA",
			FlightVariantId:          sql.Null[uuid.UUID]{V: id, Valid: true},
			Version:                  time.Date(2026, time.November, 11, 12, 0, 0, 0, time.UTC),
			VersionCount:             2,
		}}},
		Variants: map[uuid.UUID]db.FlightScheduleVariant{id: {Id: id, OperatedAs: fn, ArrivalAirportIataCode: "JFK", AircraftIataCode: "351"}},
	}, nil
}
func (*fleetWatchRepoStub) Airlines(context.Context) (map[string]db.Airline, error) {
	return map[string]db.Airline{"LH": {IataCode: "LH"}}, nil
}
func (*fleetWatchRepoStub) Airports(context.Context) (map[string]db.Airport, error) {
	return map[string]db.Airport{"FRA": {IataCode: "FRA"}, "JFK": {IataCode: "JFK"}}, nil
}
func (*fleetWatchRepoStub) Aircraft(context.Context) (map[string]db.Aircraft, error) {
	return map[string]db.Aircraft{"351": {IataCode: "351"}}, nil
}

func TestLHA350ScheduleAndFeeds(t *testing.T) {
	for _, format := range []string{"json", "rss", "atom"} {
		t.Run(format, func(t *testing.T) {
			repo := &fleetWatchRepoStub{}
			handler := NewScheduleSearchHandler(repo, schedulesearch.NewSearch(repo))
			e := echo.New()
			e.GET("/data/:year/schedule/lh351", handler.LHA350, YearMiddleware())
			e.GET("/data/schedule/lh351/feed.rss", handler.LHA350RSSFeed)
			e.GET("/data/schedule/lh351/feed.atom", handler.LHA350AtomFeed)
			path := "/data/schedule/lh351/feed." + format
			if format == "json" {
				path = "/data/2027/schedule/lh351"
			}
			recorder := httptest.NewRecorder()
			e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
			assert.Contains(t, repo.params, "LH")
			assert.Contains(t, repo.params, "351")
			assert.NotContains(t, repo.params, "359")
			assert.NotContains(t, repo.params, "LX")
			assert.Contains(t, recorder.Header().Get("Cache-Control"), "max-age=3600")
			if format == "json" {
				assert.Contains(t, repo.filter, "fvh.departure_date_local >= CAST(? AS DATE)")
				assert.Contains(t, repo.params, "2027-01-01")
				assert.Contains(t, repo.params, "2028-01-01")
				var result model.FlightSchedulesMany
				require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
				require.Len(t, result.Schedules, 1)
				assert.Equal(t, "LH", result.Schedules[0].FlightNumber.AirlineIataCode)
			} else {
				assert.NotContains(t, repo.filter, "fvh.departure_date_local >=")
				assert.Equal(t, "application/"+format+"+xml", recorder.Header().Get("Content-Type"))
				var result struct{ XMLName xml.Name }
				require.NoError(t, xml.Unmarshal(recorder.Body.Bytes(), &result))
				assert.Contains(t, recorder.Body.String(), "Lufthansa A350-1000")
				assert.Contains(t, recorder.Body.String(), "https://explore.flights/lh351")
				assert.Contains(t, recorder.Body.String(), "Flight LH400 operates on Lufthansa A350-1000")
				assert.Contains(t, recorder.Body.String(), "aircraft_id=351")
			}
		})
	}
}
