package web

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"net/http"
)

type reportHandlerRepo interface {
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Destinations(ctx context.Context, airportId uuid.UUID) ([]uuid.UUID, error)
	Report(ctx context.Context, request db.ReportRequest) ([]db.ReportRow, error)
}

type ReportHandler struct {
	repo reportHandlerRepo
}

func NewReportHandler(repo reportHandlerRepo) *ReportHandler {
	return &ReportHandler{repo: repo}
}

func (rh *ReportHandler) Destinations(c echo.Context) error {
	ctx := c.Request().Context()
	airportId, err := util{}.parseAirport(ctx, c.Param("airport"), rh.repo.Airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var destinationAirportIds []uuid.UUID
	var airports map[uuid.UUID]db.Airport

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		destinationAirportIds, err = rh.repo.Destinations(gCtx, airportId)
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

func (rh *ReportHandler) Report(c echo.Context) error {
	report, err := rh.repo.Report(c.Request().Context(), db.ReportRequest{
		Dimensions: db.ReportDimensions{
			YearLocal:          true,
			ScheduleYear:       true,
			IsSummerSchedule:   true,
			DepartureAirportId: true,
			ArrivalAirportId:   true,
		},
	})
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, report)
}
