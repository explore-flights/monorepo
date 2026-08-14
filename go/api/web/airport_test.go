package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/labstack/echo/v4"
)

func TestAirportStatisticsHandlerResolvesAirportAndReferences(t *testing.T) {
	repo := newAirportHandlerTestRepo()
	repo.statistics = []db.AirportStatistics{
		{
			AirportIataCode: "FRA",
			Direction:       db.AirportMovementDirectionDeparture,
			YearLocal:       2026,
			ScheduledLegs:   1,
			RouteStatistics: []db.AirportRouteStatistics{
				{
					OtherAirportIataCode:     "JFK",
					OperatingAirlineIataCode: "LH",
					AircraftIataCode:         "359",
					ScheduledLegs:            1,
				},
			},
			DailyStatistics: []db.AirportDailyStatistics{},
		},
	}

	e := echo.New()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/data/airport/EDDF/2026/summary", nil)
	c := e.NewContext(request, recorder)
	c.SetPath("/data/airport/:airport/:year/summary")
	c.SetParamNames("airport", "year")
	c.SetParamValues("EDDF", "2026")

	handler := YearMiddleware()(NewAirportHandler(repo).Statistics)
	if err := handler(c); err != nil {
		t.Fatalf("Statistics returned an error: %v", err)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("response status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var response model.AirportStatisticsResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.AirportIataCode != "FRA" || response.YearLocal != 2026 {
		t.Fatalf("unexpected response identity: %+v", response)
	}
	if len(response.Directions) != 1 || response.Directions[0].ScheduledLegs != 1 {
		t.Fatalf("unexpected directions: %+v", response.Directions)
	}
	if len(response.Airlines) != 1 || len(response.Airports) != 2 || len(response.Aircraft) != 1 {
		t.Fatalf("unexpected references: airlines=%d airports=%d aircraft=%d", len(response.Airlines), len(response.Airports), len(response.Aircraft))
	}
	if repo.statisticsAirport != "FRA" || repo.statisticsYear != 2026 {
		t.Fatalf("repo received airport=%q year=%d", repo.statisticsAirport, repo.statisticsYear)
	}
}

func TestAirportTimetableHandlerReturnsLocalTimes(t *testing.T) {
	repo := newAirportHandlerTestRepo()
	departureTime := time.Date(2026, time.January, 1, 10, 0, 0, 0, time.FixedZone("", 3600))
	repo.movements = []db.Flight{
		{
			FlightNumber:             db.FlightNumber{AirlineIataCode: "LH", Number: 400},
			DepartureTime:            departureTime,
			DepartureAirportIataCode: "FRA",
			ArrivalTime:              departureTime.Add(8 * time.Hour).In(time.FixedZone("", -5*60*60)),
			ArrivalAirportIataCode:   "JFK",
			ServiceType:              "J",
			AircraftOwner:            "LH",
			AircraftIataCode:         "359",
			CodeShares: common.Set[db.FlightNumber]{
				{AirlineIataCode: "UA", Number: 900}: {},
			},
			DataElements: map[int64]string{1: "value"},
		},
	}

	e := echo.New()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/data/airport/FRA/2026-01-01/departures", nil)
	c := e.NewContext(request, recorder)
	c.SetPath("/data/airport/:airport/:date/departures")
	c.SetParamNames("airport", "date")
	c.SetParamValues("FRA", "2026-01-01")

	if err := NewAirportHandler(repo).Departures(c); err != nil {
		t.Fatalf("Departures returned an error: %v", err)
	}

	var response model.AirportTimetableResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Direction != db.AirportMovementDirectionDeparture || len(response.Movements) != 1 {
		t.Fatalf("unexpected timetable: %+v", response)
	}
	if response.Movements[0].DurationSeconds != 8*60*60 {
		t.Fatalf("durationSeconds = %d, want %d", response.Movements[0].DurationSeconds, 8*60*60)
	}
	if len(response.Airlines) != 2 {
		t.Fatalf("airline references = %d, want 2", len(response.Airlines))
	}
	if repo.movementDirection != db.AirportMovementDirectionDeparture || repo.movementDate.String() != "2026-01-01" {
		t.Fatalf("repo received direction=%q date=%s", repo.movementDirection, repo.movementDate)
	}
}

type airportHandlerTestRepo struct {
	statistics        []db.AirportStatistics
	movements         []db.Flight
	statisticsAirport string
	statisticsYear    int
	movementDate      xtime.LocalDate
	movementDirection db.AirportMovementDirection
}

func newAirportHandlerTestRepo() *airportHandlerTestRepo {
	return &airportHandlerTestRepo{}
}

func (repo *airportHandlerTestRepo) Airlines(context.Context) (map[string]db.Airline, error) {
	return map[string]db.Airline{
		"LH": {IataCode: "LH", Name: "Lufthansa"},
		"UA": {IataCode: "UA", Name: "United Airlines"},
	}, nil
}

func (repo *airportHandlerTestRepo) Airports(context.Context) (map[string]db.Airport, error) {
	return map[string]db.Airport{
		"FRA": {IataCode: "FRA", IcaoCode: sql.NullString{String: "EDDF", Valid: true}, Name: "Frankfurt"},
		"JFK": {IataCode: "JFK", IcaoCode: sql.NullString{String: "KJFK", Valid: true}, Name: "John F. Kennedy"},
	}, nil
}

func (repo *airportHandlerTestRepo) Aircraft(context.Context) (map[string]db.Aircraft, error) {
	return map[string]db.Aircraft{
		"359": {IataCode: "359", Name: "Airbus A350-900", Configurations: map[string][]string{}},
	}, nil
}

func (repo *airportHandlerTestRepo) AirportStatistics(_ context.Context, airportIataCode string, year int) ([]db.AirportStatistics, error) {
	repo.statisticsAirport = airportIataCode
	repo.statisticsYear = year
	return repo.statistics, nil
}

func (repo *airportHandlerTestRepo) AirportMovements(_ context.Context, _ string, dateLocal xtime.LocalDate, direction db.AirportMovementDirection) ([]db.Flight, error) {
	repo.movementDate = dateLocal
	repo.movementDirection = direction
	return repo.movements, nil
}
