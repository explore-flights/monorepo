package web

import (
	"context"
	"iter"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type sitemapRepoStub struct {
	airlines map[string]db.Airline
	airports map[string]db.Airport
}

func (r sitemapRepoStub) Airlines(context.Context) (map[string]db.Airline, error) {
	return r.airlines, nil
}

func (r sitemapRepoStub) Airports(context.Context) (map[string]db.Airport, error) {
	return r.airports, nil
}

func (sitemapRepoStub) IterFlightNumbers(context.Context, string, *error) iter.Seq2[db.FlightNumber, time.Time] {
	return func(func(db.FlightNumber, time.Time) bool) {}
}

func TestSitemapIndexIncludesAirportsAndSortedAirlines(t *testing.T) {
	handler := NewSitemapHandler(sitemapRepoStub{
		airlines: map[string]db.Airline{"ZZ": {}, "AA": {}},
		airports: map[string]db.Airport{},
	})
	recorder := httptest.NewRecorder()
	context := echo.New().NewContext(httptest.NewRequest("GET", "https://explore.flights/data/sitemap.xml", nil), recorder)

	require.NoError(t, handler.SitemapIndex(context))
	body := recorder.Body.String()
	assert.Contains(t, body, "https://explore.flights/data/sitemap/airports/sitemap.xml")
	assert.Less(t,
		indexOf(t, body, "https://explore.flights/data/sitemap/AA/sitemap.xml"),
		indexOf(t, body, "https://explore.flights/data/sitemap/ZZ/sitemap.xml"),
	)
}

func TestSitemapAirportsIncludesSortedOverviewPagesOnly(t *testing.T) {
	handler := NewSitemapHandler(sitemapRepoStub{
		airlines: map[string]db.Airline{},
		airports: map[string]db.Airport{"ZRH": {}, "FRA": {}},
	})
	recorder := httptest.NewRecorder()
	context := echo.New().NewContext(httptest.NewRequest("GET", "https://explore.flights/data/sitemap/airports/sitemap.xml", nil), recorder)

	require.NoError(t, handler.SitemapAirports(context))
	body := recorder.Body.String()
	assert.Contains(t, body, "https://explore.flights/airport/FRA")
	assert.Contains(t, body, "https://explore.flights/airport/ZRH")
	assert.NotContains(t, body, "/routes")
	assert.NotContains(t, body, "/map")
	assert.Less(t,
		indexOf(t, body, "https://explore.flights/airport/FRA"),
		indexOf(t, body, "https://explore.flights/airport/ZRH"),
	)
}

func TestNoIndexHeaders(t *testing.T) {
	context := echo.New().NewContext(httptest.NewRequest("GET", "/feed.rss", nil), httptest.NewRecorder())

	noIndex(context)
	assert.Equal(t, "noindex", context.Response().Header().Get(xRobotsTagHeader))

	noIndexFollow(context)
	assert.Equal(t, "noindex, follow", context.Response().Header().Get(xRobotsTagHeader))
}

func indexOf(t *testing.T, value, substring string) int {
	t.Helper()
	index := -1
	for i := 0; i+len(substring) <= len(value); i++ {
		if value[i:i+len(substring)] == substring {
			index = i
			break
		}
	}
	require.NotEqual(t, -1, index)
	return index
}
