package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
	"time"
)

type ConnectionsSearchRequest struct {
	Origins             []string  `json:"origins"`
	Destinations        []string  `json:"destinations"`
	MinDeparture        time.Time `json:"minDeparture"`
	MaxDeparture        time.Time `json:"maxDeparture"`
	MaxFlights          int       `json:"maxFlights"`
	MinLayoverMS        int       `json:"minLayoverMS"`
	MaxLayoverMS        int       `json:"maxLayoverMS"`
	MaxDurationMS       int       `json:"maxDurationMS"`
	IncludeAirport      *[]string `json:"includeAirport,omitempty"`
	ExcludeAirport      *[]string `json:"excludeAirport,omitempty"`
	IncludeFlightNumber *[]string `json:"includeFlightNumber,omitempty"`
	ExcludeFlightNumber *[]string `json:"excludeFlightNumber,omitempty"`
	IncludeAircraft     *[]string `json:"includeAircraft,omitempty"`
	ExcludeAircraft     *[]string `json:"excludeAircraft,omitempty"`
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
		} else if req.IncludeAirport != nil && len(*req.IncludeAirport) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(IncludeAirport) must be <= 100")
		} else if req.ExcludeAirport != nil && len(*req.ExcludeAirport) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(ExcludeAirport) must be <= 100")
		} else if req.IncludeFlightNumber != nil && len(*req.IncludeFlightNumber) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(IncludeFlightNumber) must be <= 100")
		} else if req.ExcludeFlightNumber != nil && len(*req.ExcludeFlightNumber) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(ExcludeFlightNumber) must be <= 100")
		} else if req.IncludeAircraft != nil && len(*req.IncludeAircraft) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(IncludeAircraft) must be <= 100")
		} else if req.ExcludeAircraft != nil && len(*req.ExcludeAircraft) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "len(ExcludeAircraft) must be <= 100")
		}

		options := make([]search.ConnectionOption, 0)
		if req.IncludeAirport != nil {
			options = appendOptions[search.WithIncludeAirport, search.WithIncludeAirportGlob](options, *req.IncludeAirport)
		}

		if req.ExcludeAirport != nil {
			options = appendOptions[search.WithExcludeAirport, search.WithExcludeAirportGlob](options, *req.ExcludeAirport)
		}

		if req.IncludeFlightNumber != nil {
			options = appendOptions[search.WithIncludeFlightNumber, search.WithIncludeFlightNumberGlob](options, *req.IncludeFlightNumber)
		}

		if req.ExcludeFlightNumber != nil {
			options = appendOptions[search.WithExcludeFlightNumber, search.WithExcludeFlightNumberGlob](options, *req.ExcludeFlightNumber)
		}

		if req.IncludeAircraft != nil {
			options = appendOptions[search.WithIncludeAircraft, search.WithIncludeAircraftGlob](options, *req.IncludeAircraft)
		}

		if req.ExcludeAircraft != nil {
			options = appendOptions[search.WithExcludeAircraft, search.WithExcludeAircraftGlob](options, *req.ExcludeAircraft)
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

type restr interface {
	~[]string
	Matches(f *common.Flight) bool
}

func appendOptions[Reg restr, Glob restr](options []search.ConnectionOption, values []string) []search.ConnectionOption {
	regular := make(Reg, 0)
	glob := make(Glob, 0)

	for _, v := range values {
		if hasMeta(v) {
			glob = append(glob, v)
		} else {
			regular = append(regular, v)
		}
	}

	if len(regular) > 0 {
		options = append(options, regular)
	}

	if len(glob) > 0 {
		options = append(options, glob)
	}

	return options
}

func hasMeta(pattern string) bool {
	return strings.ContainsAny(pattern, "*?[\\")
}
