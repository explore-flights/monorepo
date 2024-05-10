package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/goccy/go-graphviz"
	"github.com/labstack/echo/v4"
	"net/http"
	"strconv"
	"time"
)

func NewConnectionsEndpoint(ch *search.ConnectionsHandler) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		q := c.QueryParams()

		origins := q["origin"]
		destinations := q["destination"]
		minDeparture, err := time.Parse(time.RFC3339, q.Get("minDeparture"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxDeparture, err := time.Parse(time.RFC3339, q.Get("maxDeparture"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxFlights, err := strconv.Atoi(q.Get("maxFlights"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		minLayover, err := time.ParseDuration(q.Get("minLayover"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxLayover, err := time.ParseDuration(q.Get("maxLayover"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxDuration, err := time.ParseDuration(q.Get("maxDuration"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		if len(origins) < 1 || len(origins) > 10 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(origins) must be between 1 and 10")
		} else if len(destinations) < 1 || len(destinations) > 10 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(destinations) must be between 1 and 10")
		} else if maxFlights > 4 {
			return echo.NewHTTPError(http.StatusBadRequest, "maxFlights must be <=4")
		} else if maxDeparture.Add(maxDuration).Sub(minDeparture) > time.Hour*24*14 {
			return echo.NewHTTPError(http.StatusBadRequest, "range must be <=14d")
		}

		conns, err := ch.FindConnections(
			ctx,
			origins,
			destinations,
			minDeparture,
			maxDeparture,
			maxFlights,
			minLayover,
			maxLayover,
			maxDuration,
		)

		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		switch c.Param("export") {
		case "dot":
			c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextPlainCharsetUTF8)
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsImage(c.Response(), conns, graphviz.XDOT)

		case "svg":
			c.Response().Header().Set(echo.HeaderContentType, "image/svg+xml")
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsImage(c.Response(), conns, graphviz.SVG)

		case "jpg":
			c.Response().Header().Set(echo.HeaderContentType, "image/jpeg")
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsImage(c.Response(), conns, graphviz.JPG)

		case "png":
			c.Response().Header().Set(echo.HeaderContentType, "image/png")
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsImage(c.Response(), conns, graphviz.PNG)

		case "json":
			return c.JSON(http.StatusOK, search.ExportConnectionsJson(conns))

		default:
			c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextPlainCharsetUTF8)
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsText(c.Response(), conns)
		}
	}
}