package web

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
)

type searchHandlerRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	FindFlightNumbers(ctx context.Context, query string, limit int) ([]db.FlightNumber, error)
}

type SearchHandler struct {
	repo searchHandlerRepo
}

func NewSearchHandler(repo searchHandlerRepo) *SearchHandler {
	return &SearchHandler{repo: repo}
}

func (sh *SearchHandler) Search(c echo.Context) error {
	resp, err := sh.search(c)

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
			q.Add("v", sh.flightNumberString(fn))
		}

		return c.Redirect(http.StatusFound, "/flight?"+q.Encode())
	}

	return c.Redirect(http.StatusFound, "/flight/"+url.PathEscape(sh.flightNumberString(resp.FlightNumbers[0])))
}

func (sh *SearchHandler) search(c echo.Context) (model.SearchResponse, error) {
	ctx := c.Request().Context()
	fns, err := sh.repo.FindFlightNumbers(ctx, strings.TrimSpace(c.QueryParam("q")), 100)
	if err != nil {
		return model.SearchResponse{}, err
	}

	airlines, err := sh.repo.Airlines(ctx)
	if err != nil {
		return model.SearchResponse{}, err
	}

	added := make(common.Set[string])
	resp := model.SearchResponse{
		Airlines:      make([]model.Airline, 0, len(fns)/4),
		FlightNumbers: make([]model.FlightNumber, len(fns)),
	}

	for i, fn := range fns {
		resp.FlightNumbers[i] = model.FlightNumberFromDb(fn)

		if added.Add(fn.AirlineIataCode) {
			if airline, ok := airlines[fn.AirlineIataCode]; ok {
				resp.Airlines = append(resp.Airlines, model.AirlineFromDb(airline))
			}
		}
	}

	return resp, nil
}

func (sh *SearchHandler) flightNumberString(fn model.FlightNumber) string {
	return fmt.Sprintf("%s%d%s", fn.AirlineIataCode, fn.Number, fn.Suffix)
}
