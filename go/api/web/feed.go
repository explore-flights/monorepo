package web

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"io"
	"maps"
	"net/http"
	"slices"
	"strings"
	"time"
)

func NewFlightUpdateFeedEndpoint(dh *data.Handler, contentType string, writer func(*feeds.Feed, io.Writer) error) echo.HandlerFunc {
	feedContent := func(f *common.Flight) string {
		content := fmt.Sprintf(
			`
Flight %s from %s to %s
Departure: %s
Arrival: %s
Aircraft: %s (%s)
Codeshares: %+v
`,
			f.Number().String(),
			f.DepartureAirport,
			f.ArrivalAirport,
			f.DepartureTime.Format(time.RFC3339),
			f.ArrivalTime.Format(time.RFC3339),
			f.AircraftType,
			f.AircraftConfigurationVersion,
			strings.Join(slices.Sorted(xiter.Map(maps.Keys(f.CodeShares), common.FlightNumber.String)), ", "),
		)

		return strings.TrimSpace(content)
	}

	return func(c echo.Context) error {
		fnRaw := c.Param("fn")
		departureDateRaw := c.Param("departureDate")
		departureAirport := strings.ToUpper(c.Param("departureAirport"))

		fn, err := common.ParseFlightNumber(fnRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		departureDate, err := xtime.ParseLocalDate(departureDateRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		feedId := baseUrl(c) + fmt.Sprintf("/%s/%s/%s", fn.String(), departureDate.String(), departureAirport)
		link := &feeds.Link{Href: fmt.Sprintf("https://explore.flights/flight/%s", fn.String())}
		feed := &feeds.Feed{
			Id:    feedId,
			Title: fmt.Sprintf("Flight %s from %s on %s (UTC)", fn.String(), departureAirport, departureDate.String()),
			Link:  link,
		}

		f, err := dh.Flight(c.Request().Context(), fn, departureDate, departureAirport, true)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		if f == nil {
			now := time.Now()

			feed.Created = now
			feed.Updated = now
			feed.Items = append(feed.Items, &feeds.Item{
				Id:      feedId,
				Title:   "Flight no longer available",
				Link:    link,
				Created: now,
				Updated: now,
				Content: "The flight is no longer available",
			})
		} else {
			feed.Created = f.Metadata.CreationTime
			feed.Updated = f.Metadata.UpdateTime
			feed.Items = append(feed.Items, &feeds.Item{
				Id:      feedId,
				Title:   fmt.Sprintf("Flight %s from %s to %s on %s (local) updated", fn.String(), f.DepartureAirport, f.ArrivalAirport, f.DepartureTime.Format(time.DateOnly)),
				Link:    link,
				Created: f.Metadata.CreationTime,
				Updated: f.Metadata.UpdateTime,
				Content: feedContent(f),
			})
		}

		c.Response().Header().Add(echo.HeaderContentType, contentType)
		addExpirationHeaders(c, time.Now(), time.Hour)

		_ = writer(feed, c.Response())
		return nil
	}
}
