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
	"github.com/gofrs/uuid/v5"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
)

type scheduleSearchHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
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
			for _, value := range values {
				var airlineId model.UUID
				if err := airlineId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithAirlines(uuid.UUID(airlineId)))
			}

		case "aircraftId":
			for _, value := range values {
				var aircraftId model.UUID
				if err := aircraftId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithAircraftId(uuid.UUID(aircraftId)))
			}

		case "aircraftConfigurationVersion":
			for _, value := range values {
				subConditions = append(subConditions, schedulesearch.WithAircraftConfigurationVersion(value))
			}

		case "aircraft":
			for _, value := range values {
				if aircraftIdRaw, aircraftConfigurationVersion, ok := strings.Cut(value, "-"); ok {
					var aircraftId model.UUID
					if err := aircraftId.FromString(aircraftIdRaw); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithAircraftId(uuid.UUID(aircraftId)),
						schedulesearch.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
					))
				}
			}

		case "departureAirportId":
			for _, value := range values {
				var airportId model.UUID
				if err := airportId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithDepartureAirportId(uuid.UUID(airportId)))
			}

		case "arrivalAirportId":
			for _, value := range values {
				var airportId model.UUID
				if err := airportId.FromString(value); err != nil {
					return NewHTTPError(http.StatusBadRequest, WithCause(err))
				}

				subConditions = append(subConditions, schedulesearch.WithArrivalAirportId(uuid.UUID(airportId)))
			}

		case "route":
			for _, value := range values {
				if departureAirport, arrivalAirport, ok := strings.Cut(value, "-"); ok {
					var departureAirportId model.UUID
					if err := departureAirportId.FromString(departureAirport); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					var arrivalAirportId model.UUID
					if err := arrivalAirportId.FromString(arrivalAirport); err != nil {
						return NewHTTPError(http.StatusBadRequest, WithCause(err))
					}

					subConditions = append(subConditions, schedulesearch.WithAll(
						schedulesearch.WithDepartureAirportId(uuid.UUID(departureAirportId)),
						schedulesearch.WithArrivalAirportId(uuid.UUID(arrivalAirportId)),
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
		if airline, ok := result.Airlines[fn.AirlineId]; ok {
			airlinePrefix = cmp.Or(airline.IataCode, airline.IcaoCode, airline.Id.String()+"-")
		} else {
			airlinePrefix = fn.AirlineId.String() + "-"
		}

		return fmt.Sprintf("%s%d%s", airlinePrefix, fn.Number, fn.Suffix)
	}

	airportName := func(airportId model.UUID) string {
		airport, ok := result.Airports[airportId]
		if !ok {
			return airportId.String()
		}

		return cmp.Or(airport.IataCode, airport.IcaoCode, airport.Name, airport.Id.String())
	}

	routeName := func(departureAirportId, arrivalAirportId model.UUID) string {
		return fmt.Sprintf("%s - %s", airportName(departureAirportId), airportName(arrivalAirportId))
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
		aggByAirports := make(map[model.UUID]map[model.UUID][]struct {
			MinVersion                    time.Time
			MaxVersion                    time.Time
			MinDepartureDateLocal         xtime.LocalDate
			MaxDepartureDateLocal         xtime.LocalDate
			OperatingDays                 int
			AircraftIds                   common.Set[model.UUID]
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
			aggByArrivalAirport, ok := aggByAirports[item.DepartureAirportId]
			if !ok {
				aggByArrivalAirport = make(map[model.UUID][]struct {
					MinVersion                    time.Time
					MaxVersion                    time.Time
					MinDepartureDateLocal         xtime.LocalDate
					MaxDepartureDateLocal         xtime.LocalDate
					OperatingDays                 int
					AircraftIds                   common.Set[model.UUID]
					AircraftConfigurationVersions common.Set[string]
				})
				aggByAirports[item.DepartureAirportId] = aggByArrivalAirport
			}

			agg := aggByArrivalAirport[flightVariant.ArrivalAirportId]
			var latestEntry struct {
				MinVersion                    time.Time
				MaxVersion                    time.Time
				MinDepartureDateLocal         xtime.LocalDate
				MaxDepartureDateLocal         xtime.LocalDate
				OperatingDays                 int
				AircraftIds                   common.Set[model.UUID]
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

				latestEntry.MaxDepartureDateLocal = item.DepartureDateLocal
				latestEntry.OperatingDays += 1
				latestEntry.AircraftIds.Add(flightVariant.AircraftId)
				latestEntry.AircraftConfigurationVersions.Add(flightVariant.AircraftConfigurationVersion)

				agg[idx] = latestEntry
			} else {
				latestEntry.MinVersion = item.Version
				latestEntry.MaxVersion = item.Version
				latestEntry.MinDepartureDateLocal = item.DepartureDateLocal
				latestEntry.MaxDepartureDateLocal = item.DepartureDateLocal
				latestEntry.OperatingDays = 1

				latestEntry.AircraftIds = make(common.Set[model.UUID])
				latestEntry.AircraftConfigurationVersions = make(common.Set[string])

				latestEntry.AircraftIds.Add(flightVariant.AircraftId)
				latestEntry.AircraftConfigurationVersions.Add(flightVariant.AircraftConfigurationVersion)

				agg = append(agg, latestEntry)
			}

			aggByArrivalAirport[flightVariant.ArrivalAirportId] = agg
		}

		for departureAirportId, aggByArrivalAirport := range aggByAirports {
			for arrivalAirportId, entries := range aggByArrivalAirport {
				for _, entry := range entries {
					q := make(url.Values)
					q.Set("departure_airport_id", departureAirportId.String())
					q.Set("departure_date_gte", entry.MinDepartureDateLocal.String())
					q.Set("departure_date_lte", entry.MaxDepartureDateLocal.String())

					for aircraftId := range entry.AircraftIds {
						q.Set("aircraft_id", aircraftId.String())
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
						Updated: entry.MaxVersion,
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
	var lhAirlineId uuid.UUID
	var a350900AircraftId uuid.UUID
	{
		airlines, err := h.repo.Airlines(ctx)
		if err != nil {
			return model.FlightSchedulesMany{}, err
		}

		for _, airline := range airlines {
			if airline.IataCode == "LH" {
				lhAirlineId = airline.Id
				break
			}
		}

		aircraft, err := h.repo.Aircraft(ctx)
		if err != nil {
			return model.FlightSchedulesMany{}, err
		}

		for _, ac := range aircraft {
			if ac.IataCode.Valid && ac.IataCode.String == "359" {
				a350900AircraftId = ac.Id
				break
			}
		}
	}

	if lhAirlineId.IsNil() || a350900AircraftId.IsNil() {
		return model.FlightSchedulesMany{}, NewHTTPError(http.StatusInternalServerError)
	}

	result, err := h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines(lhAirlineId),
			schedulesearch.WithAircraftId(a350900AircraftId),
			schedulesearch.WithAny(
				schedulesearch.WithAircraftConfigurationVersion("C38E24M201"),
				schedulesearch.WithAircraftConfigurationVersion("F4C38E24M201"),
			),
		),
	)
	if err != nil {
		return model.FlightSchedulesMany{}, err
	}

	return result, nil
}

func (h *ScheduleSearchHandler) querySwissA350(ctx context.Context) (model.FlightSchedulesMany, error) {
	var lxAirlineId uuid.UUID
	var a350900AircraftId uuid.UUID
	{
		airlines, err := h.repo.Airlines(ctx)
		if err != nil {
			return model.FlightSchedulesMany{}, err
		}

		for _, airline := range airlines {
			if airline.IataCode == "LX" {
				lxAirlineId = airline.Id
				break
			}
		}

		aircraft, err := h.repo.Aircraft(ctx)
		if err != nil {
			return model.FlightSchedulesMany{}, err
		}

		for _, ac := range aircraft {
			if ac.IataCode.Valid && ac.IataCode.String == "359" {
				a350900AircraftId = ac.Id
				break
			}
		}
	}

	if lxAirlineId.IsNil() || a350900AircraftId.IsNil() {
		return model.FlightSchedulesMany{}, NewHTTPError(http.StatusInternalServerError)
	}

	result, err := h.queryInternal(
		ctx,
		schedulesearch.WithAll(
			schedulesearch.WithAirlines(lxAirlineId),
			schedulesearch.WithAircraftId(a350900AircraftId),
		),
	)
	if err != nil {
		return model.FlightSchedulesMany{}, err
	}

	return result, nil
}

func (h *ScheduleSearchHandler) queryInternal(ctx context.Context, condition schedulesearch.Condition) (model.FlightSchedulesMany, error) {
	var dbResult db.FlightSchedulesMany
	var airlines map[uuid.UUID]db.Airline
	var airports map[uuid.UUID]db.Airport
	var aircraft map[uuid.UUID]db.Aircraft

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
