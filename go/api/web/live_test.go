package web

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/labstack/echo/v4"
)

type liveRepoStub struct {
	timestamp time.Time
	err       error
}

func (r *liveRepoStub) LiveFlights(_ context.Context, timestamp time.Time) ([]db.LiveFlight, *time.Time, error) {
	r.timestamp = timestamp
	return []db.LiveFlight{{FlightNumber: db.FlightNumber{AirlineIataCode: "LH", Number: 400}, DepartureAirportIataCode: "FRA", ArrivalAirportIataCode: "JFK", DepartureTime: timestamp.Add(-time.Hour), ArrivalTime: timestamp.Add(time.Hour)}}, nil, r.err
}
func (*liveRepoStub) Airports(context.Context) (map[string]db.Airport, error) {
	return map[string]db.Airport{"FRA": {IataCode: "FRA", Name: "Frankfurt", Lat: 50, Lng: 8}, "JFK": {IataCode: "JFK", Name: "New York", Lat: 40, Lng: -73}}, nil
}
func TestLiveHandler(t *testing.T) {
	for _, timestamp := range []string{"", "bad", "2026-01-01", "2026-01-01T12:00:00"} {
		t.Run(timestamp, func(t *testing.T) {
			e := echo.New()
			e.Use(ErrorLogAndMaskMiddleware(log.New(io.Discard, "", 0)))
			e.GET("/api/live", NewLiveHandler(&liveRepoStub{}).Flights)
			recorder := httptest.NewRecorder()
			e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/live?timestamp="+url.QueryEscape(timestamp), nil))
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status=%d", recorder.Code)
			}
		})
	}
	repo := &liveRepoStub{}
	e := echo.New()
	e.Use(ErrorLogAndMaskMiddleware(log.New(io.Discard, "", 0)))
	e.GET("/api/live", NewLiveHandler(repo).Flights)
	recorder := httptest.NewRecorder()
	path := "/api/live?timestamp=" + url.QueryEscape("2026-01-01T01:00:00.123+01:00")
	e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	if recorder.Code != http.StatusOK {
		t.Fatal(recorder.Body.String())
	}
	var response model.LiveFlightsResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Timestamp.Format(time.RFC3339Nano) != "2026-01-01T00:00:00.123Z" || !repo.timestamp.Equal(response.Timestamp) {
		t.Fatalf("timestamp lost: %+v", response)
	}
	if response.NextDepartureTime != nil || len(response.Flights) != 1 || response.Flights[0].DepartureAirportIataCode != "FRA" || len(response.Airports) != 2 || response.Airports["FRA"].IataCode != "FRA" {
		t.Fatalf("response=%+v", response)
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("response must not be cached")
	}
	repo.err = errors.New("database unavailable")
	recorder = httptest.NewRecorder()
	e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d", recorder.Code)
	}
}

type parallelLiveRepoStub struct {
	liveRepoStub
	flightsStarted  chan struct{}
	airportsStarted chan struct{}
}

func (r *parallelLiveRepoStub) LiveFlights(ctx context.Context, timestamp time.Time) ([]db.LiveFlight, *time.Time, error) {
	close(r.flightsStarted)
	select {
	case <-r.airportsStarted:
		return r.liveRepoStub.LiveFlights(ctx, timestamp)
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	}
}

func (r *parallelLiveRepoStub) Airports(ctx context.Context) (map[string]db.Airport, error) {
	close(r.airportsStarted)
	select {
	case <-r.flightsStarted:
		return r.liveRepoStub.Airports(ctx)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestLiveHandlerLoadsInParallel(t *testing.T) {
	repo := &parallelLiveRepoStub{flightsStarted: make(chan struct{}), airportsStarted: make(chan struct{})}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	request := httptest.NewRequest(http.MethodGet, "/api/live?timestamp=2026-01-01T00:00:00Z", nil).WithContext(ctx)
	recorder := httptest.NewRecorder()
	if err := NewLiveHandler(repo).Flights(echo.New().NewContext(request, recorder)); err != nil {
		t.Fatalf("both loads must start before either completes: %v", err)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d", recorder.Code)
	}
}
