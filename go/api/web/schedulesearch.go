package web

import (
	"cmp"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/schedulesearch"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
)

type scheduleSearchHandlerRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	Airports(ctx context.Context) (map[string]db.Airport, error)
	Aircraft(ctx context.Context) (map[string]db.Aircraft, error)
}

type ScheduleSearchHandler struct {
	repo   scheduleSearchHandlerRepo
	search *schedulesearch.Search
}

func NewScheduleSearchHandler(repo scheduleSearchHandlerRepo, search *schedulesearch.Search) *ScheduleSearchHandler {
	return &ScheduleSearchHandler{
		repo:   repo,
		search: search,
	}
}

func (h *ScheduleSearchHandler) Query(c echo.Context) error {
	ctx := c.Request().Context()
	conditions := make([]schedulesearch.Condition, 0)

	for k, values := range c.QueryParams() {
		if len(values) < 1 {
			continue
		}

		subConditions := make([]schedulesearch.Condition, 0, len(values))
		switch k {
		case "airlineId":
			subConditions = append(subConditions, schedulesearch.WithAirlines(values...))

		case "aircraftId":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithAircraftIataCode(value))
			}

		case "aircraftConfigurationVersion":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithAircraftConfigurationVersion(value))
			}

		case "aircraft":
			for _, value := range values {
				if aircraftIataCode, aircraftConfigurationVersion, ok := strings.Cut(value, "-"); ok {
					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithAircraftIataCode(aircraftIataCode),
						schedulesearch.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
					))
				}
			}

		case "departureAirportId":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithDepartureAirportIataCode(value))
			}

		case "arrivalAirportId":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithArrivalAirportIataCode(value))
			}

		case "route":
			for _, value := range values {
				if departureAirport, arrivalAirport, ok := strings.Cut(value, "-"); ok {
					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithDepartureAirportIataCode(departureAirport),
						schedulesearch.WithArrivalAirportIataCode(arrivalAirport),
					))
				}
			}

		case "minDepartureTime":
			minDepartureTime, err := time.Parse(time.RFC3339, values[0])
			if err != nil {
				return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
			}

			subConditions = append(subConditions, schedulesearch.WithMinDepartureTime(minDepartureTime))

		case "maxDepartureTime":
			maxDepartureTime, err := time.Parse(time.RFC3339, values[0])
			if err != nil {
				return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
			}

			subConditions = append(subConditions, schedulesearch.WithMaxDepartureTime(maxDepartureTime))
		}

		if len(subConditions) > 0 {
			conditions = append(conditions, schedulesearch.WithAny(subConditions...))
		}
	}

	if len(conditions) < 2 {
		return NewHTTPError(http.StatusBadRequest, WithMessage("too few filters"))
	}

	result, err := h.queryInternal(ctx, schedulesearch.WithAll(conditions...))
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) Allegris(c echo.Context) error {
	ctx := c.Request().Context()
	result, err := h.queryAllegris(ctx)
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) AllegrisRSSFeed(c echo.Context) error {
	return h.allegrisFeed(c, "application/rss+xml", (*feeds.Feed).WriteRss)
}

func (h *ScheduleSearchHandler) AllegrisAtomFeed(c echo.Context) error {
	return h.allegrisFeed(c, "application/atom+xml", (*feeds.Feed).WriteAtom)
}

func (h *ScheduleSearchHandler) allegrisFeed(c echo.Context, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	ctx := c.Request().Context()
	result, err := h.queryAllegris(ctx)
	if err != nil {
		return err
	}

	return h.specialAircraftFeed(
		c,
		result,
		"https://explore.flights/allegris",
		"Lufthansa Allegris Flights",
		"Allegris",
		contentType,
		writer,
	)
}

func (h *ScheduleSearchHandler) SwissA350(c echo.Context) error {
	ctx := c.Request().Context()
	result, err := h.querySwissA350(ctx)
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) SwissA350RSSFeed(c echo.Context) error {
	return h.swissA350Feed(c, "application/rss+xml", (*feeds.Feed).WriteRss)
}

func (h *ScheduleSearchHandler) SwissA350AtomFeed(c echo.Context) error {
	return h.swissA350Feed(c, "application/atom+xml", (*feeds.Feed).WriteAtom)
}

func (h *ScheduleSearchHandler) swissA350Feed(c echo.Context, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	ctx := c.Request().Context()
	result, err := h.querySwissA350(ctx)
	if err != nil {
		return err
	}

	return h.specialAircraftFeed(
		c,
		result,
		"https://explore.flights/swiss350",
		"Swiss A350 Flights",
		"Swiss A350",
		contentType,
		writer,
	)
}

func (h *ScheduleSearchHandler) specialAircraftFeed(c echo.Context, result model.FlightSchedulesMany, feedId, feedTitle, shortName, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	fnName := func(fn model.FlightNumber) string {
		var airlinePrefix string
		if airline, ok := result.Airlines[fn.AirlineIataCode]; ok {
			airlinePrefix = cmp.Or(airline.IataCode, airline.IcaoCode)
		} else {
			airlinePrefix = fn.AirlineIataCode
		}

		return fmt.Sprintf("%s%d%s", airlinePrefix, fn.Number, fn.Suffix)
	}

	airportName := func(airportIataCode string) string {
		airport, ok := result.Airports[airportIataCode]
		if !ok {
			return airportIataCode
		}

		return cmp.Or(airport.IataCode, airport.IcaoCode, airport.Name)
	}

	routeName := func(departureAirportIataCode, arrivalAirportIataCode string) string {
		return fmt.Sprintf("%s - %s", airportName(departureAirportIataCode), airportName(arrivalAirportIataCode))
	}

	baseLink := &feeds.Link{
		Href: feedId,
		Rel:  "alternate",
		Type: "text/html",
	}

	feed := &feeds.Feed{
		Id:      feedId,
		Title:   feedTitle,
		Link:    baseLink,
		Created: common.ProjectCreationTime(),
		Updated: common.ProjectCreationTime(),
	}

	for _, schedule := range result.Schedules {
		fnStr := fnName(schedule.FlightNumber)
		aggByAirports := make(map[string]map[string][]struct {
			MinVersion                    time.Time
			MaxVersion                    time.Time
			MaxNonStandaloneVersion       time.Time
			MinDepartureDateLocal         xtime.LocalDate
			MaxDepartureDateLocal         xtime.LocalDate
			OperatingDays                 int
			AircraftIataCodes             common.Set[string]
			AircraftConfigurationVersions common.Set[string]
		})

		// make sure the items are sorted by departure date
		slices.SortFunc(schedule.Items, func(a, b model.FlightScheduleItem) int {
			return int(a.DepartureDateLocal - b.DepartureDateLocal)
		})

		for _, item := range schedule.Items {
			if item.FlightVariantId == nil {
				continue
			}

			flightVariant := result.Variants[*item.FlightVariantId]
			aggByArrivalAirport, ok := aggByAirports[item.DepartureAirportIataCode]
			if !ok {
				aggByArrivalAirport = make(map[string][]struct {
					MinVersion                    time.Time
					MaxVersion                    time.Time
					MaxNonStandaloneVersion       time.Time
					MinDepartureDateLocal         xtime.LocalDate
					MaxDepartureDateLocal         xtime.LocalDate
					OperatingDays                 int
					AircraftIataCodes             common.Set[string]
					AircraftConfigurationVersions common.Set[string]
				})
				aggByAirports[item.DepartureAirportIataCode] = aggByArrivalAirport
			}

			agg := aggByArrivalAirport[flightVariant.ArrivalAirportIataCode]
			var latestEntry struct {
				MinVersion                    time.Time
				MaxVersion                    time.Time
				MaxNonStandaloneVersion       time.Time
				MinDepartureDateLocal         xtime.LocalDate
				MaxDepartureDateLocal         xtime.LocalDate
				OperatingDays                 int
				AircraftIataCodes             common.Set[string]
				AircraftConfigurationVersions common.Set[string]
			}

			if len(agg) > 0 && (item.DepartureDateLocal-agg[len(agg)-1].MaxDepartureDateLocal) < 7 {
				idx := len(agg) - 1
				latestEntry = agg[idx]

				if item.Version.Before(latestEntry.MinVersion) {
					latestEntry.MinVersion = item.Version
				}

				if item.Version.After(latestEntry.MaxVersion) {
					latestEntry.MaxVersion = item.Version
				}

				if item.VersionCount > 1 && item.Version.After(latestEntry.MaxNonStandaloneVersion) {
					latestEntry.MaxNonStandaloneVersion = item.Version
				}

				latestEntry.MaxDepartureDateLocal = item.DepartureDateLocal
				latestEntry.OperatingDays += 1
				latestEntry.AircraftIataCodes.Add(flightVariant.AircraftIataCode)
				latestEntry.AircraftConfigurationVersions.Add(flightVariant.AircraftConfigurationVersion)

				agg[idx] = latestEntry
			} else {
				latestEntry.MinVersion = item.Version
				latestEntry.MaxVersion = item.Version

				if item.VersionCount > 1 {
					latestEntry.MaxNonStandaloneVersion = item.Version
				}

				latestEntry.MinDepartureDateLocal = item.DepartureDateLocal
				latestEntry.MaxDepartureDateLocal = item.DepartureDateLocal
				latestEntry.OperatingDays = 1

				latestEntry.AircraftIataCodes = make(common.Set[string])
				latestEntry.AircraftConfigurationVersions = make(common.Set[string])

				latestEntry.AircraftIataCodes.Add(flightVariant.AircraftIataCode)
				latestEntry.AircraftConfigurationVersions.Add(flightVariant.AircraftConfigurationVersion)

				agg = append(agg, latestEntry)
			}

			aggByArrivalAirport[flightVariant.ArrivalAirportIataCode] = agg
		}

		for departureAirportId, aggByArrivalAirport := range aggByAirports {
			for arrivalAirportId, entries := range aggByArrivalAirport {
				for _, entry := range entries {
					q := make(url.Values)
					q.Set("departure_airport_id", departureAirportId)
					q.Set("departure_date_gte", entry.MinDepartureDateLocal.String())
					q.Set("departure_date_lte", entry.MaxDepartureDateLocal.String())

					for aircraftId := range entry.AircraftIataCodes {
						q.Set("aircraft_id", aircraftId)
					}

					for aircraftConfigurationVersion := range entry.AircraftConfigurationVersions {
						q.Set("aircraft_configuration_version", aircraftConfigurationVersion)
					}

					itemId := fmt.Sprintf("https://explore.flights/flight/%s?%s", fnStr, q.Encode())
					item := &feeds.Item{
						Id:          itemId,
						IsPermaLink: "false",
						Link: &feeds.Link{
							Href: itemId,
							Rel:  "alternate",
							Type: "text/html",
						},
						Title: fmt.Sprintf("Flight %s operates on %s", fnStr, shortName),
						Content: strings.TrimSpace(fmt.Sprintf(
							`
Flight %s operates on %s (%s)
From %s until %s for a total of %d flights
`,
							fnStr,
							shortName,
							routeName(departureAirportId, arrivalAirportId),
							entry.MinDepartureDateLocal.String(),
							entry.MaxDepartureDateLocal.String(),
							entry.OperatingDays,
						)),
						Created: entry.MinVersion,
					}

					// do not increase the updated timestamp for new "standalone" versions
					if entry.MaxNonStandaloneVersion.IsZero() {
						item.Updated = entry.MinVersion
					} else {
						item.Updated = entry.MaxNonStandaloneVersion
					}

					item.Description = item.Content
					feed.Items = append(feed.Items, item)

					if item.Updated.After(feed.Updated) {
						feed.Updated = item.Updated
					}
				}
			}
		}
	}

	slices.SortFunc(feed.Items, func(a, b *feeds.Item) int {
		// reverse order (newest first)
		return cmp.Or(
			b.Updated.Compare(a.Updated),
			strings.Compare(a.Title, b.Title),
			strings.Compare(a.Description, b.Description),
		)
	})

	c.Response().Header().Add(echo.HeaderContentType, contentType)
	addExpirationHeaders(c, time.Now(), time.Hour)

	return writer(feed, c.Response())
}

func (h *ScheduleSearchHandler) queryAllegris(ctx context.Context) (model.FlightSchedulesMany, error) {
	return h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines("LH"),
			schedulesearch.WithAny(
				schedulesearch.WithAll(
					schedulesearch.WithAircraftIataCode("359"),
					schedulesearch.WithAny(
						schedulesearch.WithTotalSeats(38+24+201),
						schedulesearch.WithTotalSeats(4+38+24+201),
					),
				),
				schedulesearch.WithAll(
					schedulesearch.WithAircraftIataCode("789"),
					schedulesearch.WithSeatsPremium(28),
					schedulesearch.WithSeatsEconomy(231),
				),
			),
		),
	)
}

func (h *ScheduleSearchHandler) querySwissA350(ctx context.Context) (model.FlightSchedulesMany, error) {
	return h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines("LX"),
			schedulesearch.WithAircraftIataCode("359"),
		),
	)
}

func (h *ScheduleSearchHandler) LHA380(c echo.Context) error {
	ctx := c.Request().Context()
	result, err := h.querySpecialAircraft(ctx, "LH", common.Set[string]{"388": struct{}{}})
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) LHA340(c echo.Context) error {
	ctx := c.Request().Context()
	result, err := h.querySpecialAircraft(ctx, "LH", common.Set[string]{"343": struct{}{}, "346": struct{}{}})
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) LH747(c echo.Context) error {
	ctx := c.Request().Context()
	result, err := h.querySpecialAircraft(ctx, "LH", common.Set[string]{"747": struct{}{}, "744": struct{}{}, "74H": struct{}{}})
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	return c.JSON(http.StatusOK, result)
}

func (h *ScheduleSearchHandler) querySpecialAircraft(ctx context.Context, airlineIata string, aircraftIata common.Set[string]) (model.FlightSchedulesMany, error) {
	var aircraftConditions []schedulesearch.Condition
	for iataCode := range aircraftIata {
		aircraftConditions = append(aircraftConditions, schedulesearch.WithAircraftIataCode(iataCode))
	}

	return h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines(airlineIata),
			schedulesearch.WithAny(aircraftConditions...),
		),
	)
}

func (h *ScheduleSearchHandler) queryInternal(ctx context.Context, condition schedulesearch.Condition) (model.FlightSchedulesMany, error) {
	var dbResult db.FlightSchedulesMany
	var airlines map[string]db.Airline
	var airports map[string]db.Airport
	var aircraft map[string]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			dbResult, err = h.search.QuerySchedules(
				ctx,
				schedulesearch.WithAll(
					schedulesearch.WithAny(
						schedulesearch.WithServiceType("J"),
						schedulesearch.WithServiceType("U"),
					),
					schedulesearch.WithIgnoreCodeShares(),
					condition,
				),
			)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = h.repo.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = h.repo.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = h.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return model.FlightSchedulesMany{}, err
		}
	}

	return model.FlightSchedulesManyFromDb(dbResult, airlines, airports, aircraft), nil
}
