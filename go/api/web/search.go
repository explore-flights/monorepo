package web

import (
	"context"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type searchHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	FindFlightNumbers(ctx context.Context, query string, limit int) ([]db.FlightNumber, error)
}

type SearchHandler struct {
	repo searchHandlerRepo
}

func NewSearchHandler(repo searchHandlerRepo) *SearchHandler {
	return &SearchHandler{repo: repo}
}

func (sh *SearchHandler) Search(c echo.Context) error {
	resp, airlines, err := sh.search(c)

	if c.Request().Header.Get(echo.HeaderAccept) == echo.MIMEApplicationJSON {
		// api request
		if err != nil {
			return err
		}

		return c.JSON(http.StatusOK, resp)
	}

	// user request
	if err != nil {
		q := make(url.Values)
		q.Set("status", strconv.Itoa(http.StatusInternalServerError))
		q.Set("error", "Internal Server Error")
		q.Set("message", err.Error())
		q.Set("path", c.Request().URL.Path)

		return c.Redirect(http.StatusFound, "/error?"+q.Encode())
	} else if len(resp.FlightNumbers) < 1 {
		q := make(url.Values)
		q.Set("status", strconv.Itoa(http.StatusNotFound))
		q.Set("error", "Not Found")
		q.Set("message", "No flights found matching your search")
		q.Set("path", c.Request().URL.Path)

		return c.Redirect(http.StatusFound, "/error?"+q.Encode())
	} else if len(resp.FlightNumbers) > 1 {
		q := make(url.Values)
		for _, fn := range resp.FlightNumbers {
			q.Add("v", sh.flightNumberString(airlines, fn))
		}

		return c.Redirect(http.StatusFound, "/flight?"+q.Encode())
	}

	return c.Redirect(http.StatusFound, "/flight/"+url.PathEscape(sh.flightNumberString(airlines, resp.FlightNumbers[0])))
}

func (sh *SearchHandler) search(c echo.Context) (model.SearchResponse, map[uuid.UUID]db.Airline, error) {
	ctx := c.Request().Context()
	fns, err := sh.repo.FindFlightNumbers(ctx, strings.TrimSpace(c.QueryParam("q")), 100)
	if err != nil {
		return model.SearchResponse{}, nil, err
	}

	airlines, err := sh.repo.Airlines(ctx)
	if err != nil {
		return model.SearchResponse{}, nil, err
	}

	added := make(common.Set[uuid.UUID])
	resp := model.SearchResponse{
		Airlines:      make([]model.Airline, 0, len(fns)/4),
		FlightNumbers: make([]model.FlightNumber, len(fns)),
	}

	for i, fn := range fns {
		resp.FlightNumbers[i] = model.FlightNumberFromDb(fn)

		if added.Add(fn.AirlineId) {
			if airline, ok := airlines[fn.AirlineId]; ok {
				resp.Airlines = append(resp.Airlines, model.AirlineFromDb(airline))
			}
		}
	}

	return resp, airlines, nil
}

func (sh *SearchHandler) flightNumberString(airlines map[uuid.UUID]db.Airline, fn model.FlightNumber) string {
	if airline, ok := airlines[uuid.UUID(fn.AirlineId)]; ok {
		if airline.IataCode.Valid {
			return fmt.Sprintf("%s%d%s", airline.IataCode.String, fn.Number, fn.Suffix)
		}

		if airline.IcaoCode.Valid {
			return fmt.Sprintf("%s%d%s", airline.IcaoCode.String, fn.Number, fn.Suffix)
		}
	}

	return fmt.Sprintf("%s-%d%s", fn.AirlineId, fn.Number, fn.Suffix)
}
