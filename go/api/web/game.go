package web

import (
	"context"
	"errors"
	"fmt"
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
	FindConnection(ctx context.Context, minFlights, maxFlights int, seed string) ([2]uuid.UUID, error)
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
	minFlights := 4
	maxFlights := math.MaxInt32

	if minFlightsRaw := c.QueryParam("minFlights"); minFlightsRaw != "" {
		v, err := strconv.Atoi(minFlightsRaw)
		if err != nil || v < 1 {
			return NewHTTPError(http.StatusBadRequest, WithCause(err))
		}

		minFlights = v
	}

	if maxFlightsRaw := c.QueryParam("maxFlights"); maxFlightsRaw != "" {
		v, err := strconv.Atoi(maxFlightsRaw)
		if err != nil || v < 1 {
			return NewHTTPError(http.StatusBadRequest, WithCause(err))
		}

		maxFlights = v
	}

	var seed string
	if seed = c.QueryParam("seed"); seed == "" {
		seed = fmt.Sprintf("%s/%d", xtime.NewLocalDate(time.Now().UTC()).String(), 0)
	}

	todaysConnections, err := gh.repo.FindConnection(c.Request().Context(), minFlights, maxFlights, seed)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, db.ErrNotFound) {
			status = http.StatusNotFound
		}

		return NewHTTPError(status, WithCause(err))
	}

	return c.JSON(http.StatusOK, model.ConnectionGameChallenge{
		Seed:               seed,
		DepartureAirportId: model.UUID(todaysConnections[0]),
		ArrivalAirportId:   model.UUID(todaysConnections[1]),
	})
}
