package web

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/business/report"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"net/http"
	"slices"
	"strconv"
)

type reportHandlerRepo interface {
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
}

type ReportHandler struct {
	repo   reportHandlerRepo
	search *report.Search
}

func NewReportHandler(repo reportHandlerRepo, search *report.Search) *ReportHandler {
	return &ReportHandler{
		repo:   repo,
		search: search,
	}
}

func (rh *ReportHandler) Destinations(c echo.Context) error {
	ctx := c.Request().Context()
	airportId, err := util{}.parseAirport(ctx, c.Param("airport"), rh.repo.Airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	cond, err := rh.parseCondition(c)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var destinationAirportIds []uuid.UUID
	var airports map[uuid.UUID]db.Airport

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		destinationAirportIds, err = rh.search.Destinations(gCtx, airportId, cond)
		return err
	})

	g.Go(func() error {
		var err error
		airports, err = rh.repo.Airports(gCtx)
		return err
	})

	if err := g.Wait(); err != nil {
		return err
	}

	result := make([]model.Airport, 0, len(destinationAirportIds))
	for _, id := range destinationAirportIds {
		result = append(result, model.AirportFromDb(airports[id]))
	}

	return c.JSON(http.StatusOK, result)
}

func (rh *ReportHandler) Aircraft(c echo.Context) error {
	ctx := c.Request().Context()
	airportId, err := util{}.parseAirport(ctx, c.Param("airport"), rh.repo.Airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	cond, err := rh.parseCondition(c)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	fullCond := report.WithDepartureAirportId(airportId)
	if cond != nil {
		fullCond = report.WithAll(fullCond, *cond)
	}

	var reportsByAircraftId map[uuid.UUID][]report.AircraftReport
	var aircraft map[uuid.UUID]db.Aircraft

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		reportsByAircraftId, err = rh.search.AircraftReport(gCtx, &fullCond)
		return err
	})

	g.Go(func() error {
		var err error
		aircraft, err = rh.repo.Aircraft(gCtx)
		return err
	})

	if err := g.Wait(); err != nil {
		return err
	}

	result := make([]model.AircraftReport, 0, len(reportsByAircraftId))
	for aircraftId, reports := range reportsByAircraftId {
		flightsAndDuration := make([][2]int, 0, len(reports))

		for _, r := range reports {
			flightsAndDuration = append(flightsAndDuration, [2]int{r.DurationSeconds5mTrunc, r.Flights})
		}

		slices.SortFunc(flightsAndDuration, func(a, b [2]int) int {
			return a[0] - b[0]
		})

		if _, ok := aircraft[aircraftId]; !ok {
			println(aircraftId.String())
		}

		result = append(result, model.AircraftReport{
			Aircraft:           model.AircraftFromDb(aircraft[aircraftId]),
			FlightsAndDuration: flightsAndDuration,
		})
	}

	return c.JSON(http.StatusOK, result)
}

func (rh *ReportHandler) parseCondition(c echo.Context) (*report.Condition, error) {
	yearRaw := c.Param("year")
	if yearRaw != "" {
		year, err := strconv.Atoi(yearRaw)
		if err != nil {
			return nil, err
		}

		scheduleRaw := c.Param("schedule")
		if scheduleRaw != "" {
			var cond report.Condition
			if scheduleRaw == "summer" {
				cond = report.WithAll(
					report.WithScheduleYear(year),
					report.WithSummerSchedule(),
				)
			} else {
				cond = report.WithAll(
					report.WithScheduleYear(year),
					report.WithWinterSchedule(),
				)
			}

			return &cond, nil
		} else {
			cond := report.WithYear(year)
			return &cond, nil
		}
	}

	return nil, nil
}
