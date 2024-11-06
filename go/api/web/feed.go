package web

import (
	"cmp"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"io"
	"iter"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

func NewFlightUpdateFeedEndpoint(dh *data.Handler, contentType string, writer func(*feeds.Feed, io.Writer) error) echo.HandlerFunc {
	buildFeedId := func(fn common.FlightNumber, departureDateUtc xtime.LocalDate, departureAirport string) string {
		q := make(url.Values)
		q.Set("departure_airport", departureAirport)
		q.Set("departure_date_utc", departureDateUtc.String())

		return fmt.Sprintf("https://explore.flights/flight/%s?%s", fn.String(), q.Encode())
	}

	buildFeedContent := func(f *common.Flight) string {
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

		feedId := buildFeedId(fn, departureDate, departureAirport)
		link := &feeds.Link{
			Href: feedId,
			Rel:  "self",
			Type: "text/html",
		}

		feed := &feeds.Feed{
			Id:    feedId,
			Title: fmt.Sprintf("Flight %s from %s on %s (UTC)", fn.String(), departureAirport, departureDate.String()),
			Link:  link,
		}

		f, lastModified, err := dh.Flight(c.Request().Context(), fn, departureDate, departureAirport, true)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		if f == nil {
			created := time.Date(2024, time.May, 1, 0, 0, 0, 0, time.UTC)

			feed.Created = created
			feed.Updated = lastModified
			feed.Items = append(feed.Items, &feeds.Item{
				Id:          feedId,
				IsPermaLink: "false",
				Title:       "Flight no longer available",
				Link:        link,
				Created:     created,
				Updated:     lastModified,
				Content:     "The flight is no longer available",
				Description: "The flight is no longer available",
			})
		} else {
			feed.Created = f.Metadata.CreationTime
			feed.Updated = f.Metadata.UpdateTime

			content := buildFeedContent(f)
			feed.Items = append(feed.Items, &feeds.Item{
				Id:          feedId,
				IsPermaLink: "false",
				Title:       fmt.Sprintf("Flight %s from %s to %s on %s (local) updated", fn.String(), f.DepartureAirport, f.ArrivalAirport, f.DepartureTime.Format(time.DateOnly)),
				Link:        link,
				Created:     f.Metadata.CreationTime,
				Updated:     f.Metadata.UpdateTime,
				Content:     content,
				Description: content,
			})
		}

		c.Response().Header().Add(echo.HeaderContentType, contentType)
		addExpirationHeaders(c, time.Now(), time.Hour)

		_ = writer(feed, c.Response())
		return nil
	}
}

func NewAllegrisUpdateFeedEndpoint(dh *data.Handler, contentType string, writer func(*feeds.Feed, io.Writer) error) echo.HandlerFunc {
	const (
		feedId                                 = "https://explore.flights/allegris"
		allegrisAircraftType                   = "359"
		allegrisAircraftConfigurationNoFirst   = "C38E24M201"
		allegrisAircraftConfigurationWithFirst = "F4C38E24M201"
	)

	buildItemLink := func(fn common.FlightNumber, aircraftConfigurationVersion string) string {
		q := make(url.Values)
		q.Set("aircraft_type", allegrisAircraftType)
		q.Set("aircraft_configuration_version", aircraftConfigurationVersion)

		return fmt.Sprintf("https://explore.flights/flight/%s?%s", fn.String(), q.Encode())
	}

	buildItemContent := func(fn common.FlightNumber, variants []*common.FlightScheduleVariant) string {
		rangeByRoute := make(map[[2]string]xtime.LocalDateRanges)

		for _, variant := range variants {
			route := [2]string{variant.Data.DepartureAirport, variant.Data.ArrivalAirport}

			if ldrs, ok := rangeByRoute[route]; ok {
				rangeByRoute[route] = ldrs.ExpandAll(variant.Ranges)
			} else {
				rangeByRoute[route] = variant.Ranges
			}
		}

		routesSorted := slices.SortedFunc(maps.Keys(rangeByRoute), func(a [2]string, b [2]string) int {
			return cmp.Or(
				cmp.Compare(a[0], b[0]),
				cmp.Compare(a[1], b[1]),
			)
		})

		result := fmt.Sprintf("Flight %s operates Allegris on:\n", fn.String())
		for _, route := range routesSorted {
			ldrs := rangeByRoute[route]
			if cnt, span := ldrs.Span(); cnt > 0 {
				result += fmt.Sprintf("%s - %s from %s until %s (%d days)\n", route[0], route[1], span[0].String(), span[1].String(), cnt)
			}
		}

		return strings.TrimSpace(result)
	}

	return func(c echo.Context) error {
		results := make(map[string]map[common.FlightNumber][]*common.FlightScheduleVariant)

		err := dh.FlightSchedules(c.Request().Context(), common.Lufthansa, func(seq iter.Seq[*common.FlightSchedule]) error {
			for fs := range seq {
				fn := fs.Number()

				for _, variant := range fs.Variants {
					if variant.Data.ServiceType == "J" && variant.Data.AircraftType == allegrisAircraftType && variant.Data.OperatedAs == fn {
						if variant.Data.AircraftConfigurationVersion == allegrisAircraftConfigurationNoFirst || variant.Data.AircraftConfigurationVersion == allegrisAircraftConfigurationWithFirst {
							byFn, ok := results[variant.Data.AircraftConfigurationVersion]
							if !ok {
								byFn = make(map[common.FlightNumber][]*common.FlightScheduleVariant)
								results[variant.Data.AircraftConfigurationVersion] = byFn
							}

							byFn[fn] = append(byFn[fn], variant)
						}
					}
				}
			}

			return nil
		})

		if err != nil {
			noCache(c)
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		feed := &feeds.Feed{
			Id:    feedId,
			Title: "Lufthansa Allegris Flights",
			Link: &feeds.Link{
				Href: feedId,
				Rel:  "self",
				Type: "text/html",
			},
		}

		for aircraftConfigurationVersion, byFn := range results {
			for fn, variants := range byFn {
				if len(variants) < 0 {
					continue
				}

				itemLink := buildItemLink(fn, aircraftConfigurationVersion)
				var created time.Time
				var updated time.Time

				for _, variant := range variants {
					if created.IsZero() || created.After(variant.Metadata.CreationTime) {
						created = variant.Metadata.CreationTime
					}

					updateTime := common.Max(variant.Metadata.RangesUpdateTime, variant.Metadata.DataUpdateTime)
					if updated.IsZero() || updated.Before(updateTime) {
						updated = updateTime
					}
				}

				var suffix string
				if aircraftConfigurationVersion == allegrisAircraftConfigurationNoFirst {
					suffix = "without first"
				} else {
					suffix = "with first"
				}

				content := buildItemContent(fn, variants)
				feed.Items = append(feed.Items, &feeds.Item{
					Id:          itemLink,
					IsPermaLink: "false",
					Title:       fmt.Sprintf("Flight %s operates on Allegris %s (%s)", fn.String(), suffix, aircraftConfigurationVersion),
					Link: &feeds.Link{
						Href: itemLink,
						Rel:  "self",
						Type: "text/html",
					},
					Created:     created,
					Updated:     updated,
					Content:     content,
					Description: content,
				})
			}
		}

		c.Response().Header().Add(echo.HeaderContentType, contentType)
		addExpirationHeaders(c, time.Now(), time.Hour)
		return writer(feed, c.Response())
	}
}
