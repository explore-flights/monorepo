package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/labstack/echo/v4"
	"net/http"
	"time"
)

type ConnectionsSearchRequest struct {
	Origins         []string  `json:"origins"`
	Destinations    []string  `json:"destinations"`
	MinDeparture    time.Time `json:"minDeparture"`
	MaxDeparture    time.Time `json:"maxDeparture"`
	MaxFlights      int       `json:"maxFlights"`
	MinLayoverMS    int       `json:"minLayoverMS"`
	MaxLayoverMS    int       `json:"maxLayoverMS"`
	MaxDurationMS   int       `json:"maxDurationMS"`
	IncludeAircraft *[]string `json:"includeAircraft,omitempty"`
	ExcludeAircraft *[]string `json:"excludeAircraft,omitempty"`
}

func NewConnectionsEndpoint(ch *search.ConnectionsHandler) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		var req ConnectionsSearchRequest
		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		minLayover := time.Duration(req.MinLayoverMS) * time.Millisecond
		maxLayover := time.Duration(req.MaxLayoverMS) * time.Millisecond
		maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

		if len(req.Origins) < 1 || len(req.Origins) > 10 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(origins) must be between 1 and 10")
		} else if len(req.Destinations) < 1 || len(req.Destinations) > 10 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(destinations) must be between 1 and 10")
		} else if req.MaxFlights > 4 {
			return echo.NewHTTPError(http.StatusBadRequest, "maxFlights must be <=4")
		} else if req.MaxDeparture.Add(maxDuration).Sub(req.MinDeparture) > time.Hour*24*14 {
			return echo.NewHTTPError(http.StatusBadRequest, "range must be <=14d")
		}

		options := make([]search.ConnectionOption, 0)
		if req.IncludeAircraft != nil {
			options = append(options, search.WithIncludeAircraft(*req.IncludeAircraft))
		}

		if req.ExcludeAircraft != nil {
			options = append(options, search.WithExcludeAircraft(*req.ExcludeAircraft))
		}

		conns, err := ch.FindConnections(
			ctx,
			req.Origins,
			req.Destinations,
			req.MinDeparture,
			req.MaxDeparture,
			req.MaxFlights,
			minLayover,
			maxLayover,
			maxDuration,
			options...,
		)

		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		switch c.Param("export") {
		case "json":
			return c.JSON(http.StatusOK, search.ExportConnectionsJson(conns))

		default:
			c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextPlainCharsetUTF8)
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsText(c.Response(), conns)
		}
	}
}
