package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"math"
	"net/http"
	"strconv"
	"time"
)

type gameHandlerRepo interface {
	FindConnection(ctx context.Context, minFlights, maxFlights, offset int, seed string) ([2]uuid.UUID, error)
}

type GameHandler struct {
	repo gameHandlerRepo
}

func NewGameHandler(repo gameHandlerRepo) *GameHandler {
	return &GameHandler{
		repo: repo,
	}
}

func (gh *GameHandler) ConnectionGame(c echo.Context) error {
	offset := 0
	if offsetRaw := c.QueryParam("offset"); offsetRaw != "" {
		if v, err := strconv.ParseInt(offsetRaw, 10, 64); err == nil && v >= 0 {
			offset = int(v)
		}
	}

	seed := xtime.NewLocalDate(time.Now().UTC()).String()
	todaysConnections, err := gh.repo.FindConnection(c.Request().Context(), 4, math.MaxInt, offset, seed)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, db.ErrNotFound) {
			status = http.StatusNotFound
		}

		return NewHTTPError(status, WithCause(err))
	}

	return c.JSON(http.StatusOK, model.ConnectionGameChallenge{
		Seed:               seed,
		Offset:             offset,
		DepartureAirportId: model.UUID(todaysConnections[0]),
		ArrivalAirportId:   model.UUID(todaysConnections[1]),
	})
}
