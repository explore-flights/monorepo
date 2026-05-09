package web

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/raw"
	"github.com/explore-flights/monorepo/go/api/business/seatmap"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
)

var iataFlightNumberRgx = regexp.MustCompile("^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$")
var icaoFlightNumberRgx = regexp.MustCompile("^([0-9A-Z]{3})([0-9]{1,4})([A-Z]?)$")
var numberAndSuffixRgx = regexp.MustCompile("^([0-9]{1,4})([A-Z]?)$")

type dataHandlerRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	Airports(ctx context.Context) (map[string]db.Airport, error)
	Aircraft(ctx context.Context) (map[string]db.Aircraft, error)
	RelatedFlightNumbers(ctx context.Context, fn db.FlightNumber, version time.Time) (common.Set[db.FlightNumber], error)
	FlightSchedules(ctx context.Context, fn db.FlightNumber, version time.Time) (db.FlightSchedules, error)
	FlightScheduleVersions(ctx context.Context, fn db.FlightNumber, departureAirportIataCode string, departureDate xtime.LocalDate) (db.FlightScheduleVersions, error)
	GlobalUpdatesReport(ctx context.Context) ([]db.UpdateReportItem, error)
	UpdatesReport(ctx context.Context, fn db.FlightNumber, version time.Time) ([]db.UpdateReportItem, error)
	Destinations(ctx context.Context, departureAirportIataCode string) ([]string, error)
}

type DataHandler struct {
	repo      dataHandlerRepo
	smSearch  *seatmap.Search
	rawSearch *raw.Search
}

func NewDataHandler(repo dataHandlerRepo, smSearch *seatmap.Search, rawSearch *raw.Search) *DataHandler {
	return &DataHandler{
		repo:      repo,
		smSearch:  smSearch,
		rawSearch: rawSearch,
	}
}

func (dh *DataHandler) Airlines(c echo.Context) error {
	airlines, err := dh.repo.Airlines(c.Request().Context())
	if err != nil {
		return err
	}

	resp := make([]model.Airline, 0, len(airlines))
	for _, airline := range airlines {
		resp = append(resp, model.AirlineFromDb(airline))
	}

	return c.JSON(http.StatusOK, resp)
}

func (dh *DataHandler) Airports(c echo.Context) error {
	airports, err := dh.repo.Airports(c.Request().Context())
	if err != nil {
		return err
	}

	resp := make([]model.Airport, 0, len(airports))
	for _, airport := range airports {
		resp = append(resp, model.AirportFromDb(airport))
	}

	return c.JSON(http.StatusOK, resp)
}

func (dh *DataHandler) Aircraft(c echo.Context) error {
	aircraft, err := dh.repo.Aircraft(c.Request().Context())
	if err != nil {
		return err
	}

	resp := make([]model.Aircraft, 0, len(aircraft))
	for _, ac := range aircraft {
		resp = append(resp, model.AircraftFromDb(ac))
	}

	return c.JSON(http.StatusOK, resp)
}

func (dh *DataHandler) FlightSchedule(c echo.Context) error {
	ctx := c.Request().Context()
	fnRaw := c.Param("fn")
	versionRaw := c.Param("version")

	var version time.Time
	if versionRaw == "" || versionRaw == "latest" {
		version = time.Date(2999, time.December, 31, 23, 59, 59, 0, time.UTC)
	} else {
		var err error
		version, err = time.Parse(time.RFC3339, versionRaw)
		if err != nil {
			return NewHTTPError(http.StatusBadRequest, WithMessage("Invalid version format"), WithCause(err))
		}
	}

	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	var flightSchedules db.FlightSchedules
	var relatedFlightNumbers common.Set[db.FlightNumber]
	var reportItems []db.UpdateReportItem
	var airlines map[string]db.Airline
	var airports map[string]db.Airport
	var aircraft map[string]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			flightSchedules, err = dh.repo.FlightSchedules(ctx, fn, version)
			return err
		})

		g.Go(func() error {
			var err error
			relatedFlightNumbers, err = dh.repo.RelatedFlightNumbers(ctx, fn, version)
			return err
		})

		g.Go(func() error {
			var err error
			reportItems, err = dh.repo.UpdatesReport(ctx, fn, version)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = dh.repo.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = dh.repo.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = dh.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return err
		}
	}

	fs := model.FlightSchedules{
		FlightNumber:         model.FlightNumberFromDb(fn),
		RelatedFlightNumbers: make([]model.FlightNumber, 0, len(relatedFlightNumbers)),
		Items:                make([]model.FlightScheduleItem, 0, len(flightSchedules.Items)),
		UpdateReport:         make([]model.UpdateReportItem, 0, len(reportItems)),
		Variants:             make(map[model.UUID]model.FlightScheduleVariant, len(flightSchedules.Variants)),
		Airlines:             make(map[string]model.Airline),
		Airports:             make(map[string]model.Airport),
		Aircraft:             make(map[string]model.Aircraft),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := make(common.Set[string])
	referencedAircraft := make(common.Set[string])

	referencedAirlines.Add(fn.AirlineIataCode)

	for _, item := range flightSchedules.Items {
		fs.Items = append(fs.Items, model.FlightScheduleItemFromDb(item))
		referencedAirports.Add(item.DepartureAirportIataCode)
	}

	for _, item := range reportItems {
		fs.UpdateReport = append(fs.UpdateReport, model.UpdateReportItemFromDb(item))
	}

	for variantId, variant := range flightSchedules.Variants {
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineIataCode)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineIataCode)
		referencedAirports.Add(variant.ArrivalAirportIataCode)
		referencedAircraft.Add(variant.AircraftIataCode)
	}

	for relFn := range relatedFlightNumbers {
		referencedAirlines.Add(relFn.AirlineIataCode)
		fs.RelatedFlightNumbers = append(fs.RelatedFlightNumbers, model.FlightNumberFromDb(relFn))
	}

	for airlineIataCode := range referencedAirlines {
		fs.Airlines[airlineIataCode] = model.AirlineFromDb(airlines[airlineIataCode])
	}

	for airportIataCode := range referencedAirports {
		fs.Airports[airportIataCode] = model.AirportFromDb(airports[airportIataCode])
	}

	model.AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, fs.Aircraft)

	slices.SortFunc(fs.UpdateReport, func(a, b model.UpdateReportItem) int {
		return a.Version.Compare(b.Version)
	})

	addExpirationHeaders(c, time.Now(), time.Hour)
	return c.JSON(http.StatusOK, fs)
}

func (dh *DataHandler) FlightScheduleVersions(c echo.Context) error {
	ctx := c.Request().Context()
	fnRaw := c.Param("fn")
	departureAirportRaw := c.Param("departureAirport")
	departureDateLocalRaw := c.Param("departureDateLocal")

	fs, err := dh.loadFlightScheduleVersions(ctx, fnRaw, departureAirportRaw, departureDateLocalRaw)
	if err != nil {
		return err
	}

	addExpirationHeaders(c, time.Now(), time.Hour)
	return c.JSON(http.StatusOK, fs)
}

func (dh *DataHandler) FlightScheduleVersionRaw(c echo.Context) error {
	ctx := c.Request().Context()
	fnRaw := c.Param("fn")
	versionRaw := c.Param("version")
	departureAirportRaw := c.Param("departureAirport")
	departureDateLocalRaw := c.Param("departureDateLocal")

	fn, _, err := dh.parseAndResolveFlightNumber(ctx, fnRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	version, err := time.Parse(time.RFC3339, versionRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	airport, err := dh.parseAndResolveAirport(ctx, departureAirportRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	departureDateLocal, err := xtime.ParseLocalDate(departureDateLocalRaw)
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	schedules, err := dh.rawSearch.Search(ctx, version, fn.String(), departureDateLocal, airport.IataCode)
	if err != nil {
		return NewHTTPError(http.StatusInternalServerError, WithCause(err))
	}

	if len(schedules) < 1 {
		return NewHTTPError(http.StatusNotFound)
	}

	addExpirationHeaders(c, time.Now(), time.Hour*24)
	return c.JSON(http.StatusOK, schedules)
}

func (dh *DataHandler) SeatMap(c echo.Context) error {
	ctx := c.Request().Context()

	fnRaw := c.Param("fn")
	departureAirportRaw := strings.ToUpper(c.Param("departureAirport"))
	departureDateLocalRaw := c.Param("departureDateLocal")

	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	departureAirportIataCode, err := dh.parseAirport(ctx, departureAirportRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var departureDateLocal xtime.LocalDate
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	sm, err := dh.smSearch.SeatMap(ctx, fn, departureAirportIataCode, departureDateLocal)
	if err != nil {
		if errors.Is(err, seatmap.ErrNotFound) {
			return NewHTTPError(http.StatusNotFound, WithCause(err))
		}

		return err
	}

	return c.JSON(http.StatusOK, sm)
}

func (dh *DataHandler) FlightScheduleVersionsRSSFeed(c echo.Context) error {
	return dh.flightScheduleVersionsFeed(c, "application/rss+xml", (*feeds.Feed).WriteRss)
}

func (dh *DataHandler) FlightScheduleVersionsAtomFeed(c echo.Context) error {
	return dh.flightScheduleVersionsFeed(c, "application/atom+xml", (*feeds.Feed).WriteAtom)
}

func (dh *DataHandler) flightScheduleVersionsFeed(c echo.Context, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	ctx := c.Request().Context()
	fnRaw := c.Param("fn")
	departureAirportRaw := c.Param("departureAirport")
	departureDateLocalRaw := c.Param("departureDateLocal")

	fs, err := dh.loadFlightScheduleVersions(ctx, fnRaw, departureAirportRaw, departureDateLocalRaw)
	if err != nil {
		return err
	}

	feed := dh.buildFlightScheduleVersionsFeed(fs)

	c.Response().Header().Add(echo.HeaderContentType, contentType)
	addExpirationHeaders(c, time.Now(), time.Hour)

	return writer(feed, c.Response())
}

func (dh *DataHandler) buildFlightScheduleVersionsFeed(fs model.FlightScheduleVersions) *feeds.Feed {
	const maxSize = 20

	fnName := func(fn model.FlightNumber) string {
		return fmt.Sprintf("%s%d%s", fn.AirlineIataCode, fn.Number, fn.Suffix)
	}

	airportName := func(airportIataCode string) string {
		return airportIataCode
	}

	aircraftName := func(aircraftIataCode string) string {
		aircraft, ok := fs.Aircraft[aircraftIataCode]
		if !ok {
			return aircraftIataCode
		}

		return cmp.Or(aircraft.Name(), aircraft.IcaoCode, aircraft.IataCode())
	}

	aircraftAndConfigurationVersionName := func(airlineIataCode, aircraftIataCode, v string) string {
		configName := v
		if names, ok := data.AircraftConfigurationName(airlineIataCode, aircraftIataCode, v); ok {
			configName = names.Name
		}

		return fmt.Sprintf("%s (%s)", aircraftName(aircraftIataCode), configName)
	}

	baseFnName := fnName(fs.FlightNumber)
	departureAirportName := airportName(fs.DepartureAirportIataCode)
	feedId := fmt.Sprintf("https://explore.flights/flight/%s/versions/%s/%s", baseFnName, fs.DepartureAirportIataCode, fs.DepartureDateLocal.String())
	baseLink := &feeds.Link{
		Href: feedId,
		Rel:  "alternate",
		Type: "text/html",
	}

	feed := &feeds.Feed{
		Id:      feedId,
		Title:   fmt.Sprintf("Flight %s from %s on %s (airport local time)", baseFnName, departureAirportName, fs.DepartureDateLocal.String()),
		Link:    baseLink,
		Created: common.ProjectCreationTime(),
		Updated: common.ProjectCreationTime(),
	}

	versions := fs.Versions
	slices.SortFunc(versions, func(a, b model.FlightScheduleVersion) int {
		return a.Version.Compare(b.Version)
	})

	if len(versions) > maxSize {
		versions = versions[len(versions)-maxSize:]
	} else if len(versions) < maxSize {
		feed.Items = append(feed.Items, &feeds.Item{
			Id:          fmt.Sprintf("%s#%s", feedId, common.ProjectCreationTime().Format(time.RFC3339)),
			IsPermaLink: "false",
			Title:       "Initial Record (empty)",
			Link:        baseLink,
			Created:     common.ProjectCreationTime(),
			Updated:     common.ProjectCreationTime(),
			Content:     "Start of the feed",
			Description: "Start of the feed",
		})
	}

	var prevVariant *model.FlightScheduleVariant
	for _, version := range versions {
		itemId := fmt.Sprintf("%s#%s", feedId, version.Version.Format(time.RFC3339))
		item := &feeds.Item{
			Id:          itemId,
			IsPermaLink: "false",
			Link: &feeds.Link{
				Href: itemId,
				Rel:  "alternate",
				Type: "text/html",
			},
			Created: version.Version,
			Updated: version.Version,
		}

		if version.FlightVariantId != nil {
			variant := fs.Variants[*version.FlightVariantId]
			updates := make([]string, 0)

			if prevVariant == nil || prevVariant.OperatedAs != variant.OperatedAs {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", fnName(prevVariant.OperatedAs))
				}

				updates = append(updates, fmt.Sprintf("Operated As: %snew=%s", old, fnName(variant.OperatedAs)))
			}

			if prevVariant == nil || prevVariant.DepartureTimeLocal != variant.DepartureTimeLocal {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", prevVariant.DepartureTimeLocal.String())
				}

				updates = append(updates, fmt.Sprintf("Departure Time: %snew=%s", old, variant.DepartureTimeLocal.String()))
			}

			if prevVariant == nil || prevVariant.DurationSeconds != variant.DurationSeconds {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", (time.Duration(prevVariant.DurationSeconds) * time.Second).String())
				}

				updates = append(updates, fmt.Sprintf("Duration: %snew=%s", old, (time.Duration(variant.DurationSeconds)*time.Second).String()))
			}

			if prevVariant == nil || prevVariant.ArrivalAirportIataCode != variant.ArrivalAirportIataCode {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", airportName(prevVariant.ArrivalAirportIataCode))
				}

				updates = append(updates, fmt.Sprintf("Arrival Airport: %snew=%s", old, airportName(variant.ArrivalAirportIataCode)))
			}

			if prevVariant == nil || prevVariant.ServiceType != variant.ServiceType {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", prevVariant.ServiceType)
				}

				updates = append(updates, fmt.Sprintf("Service Type: %snew=%s", old, variant.ServiceType))
			}

			if prevVariant == nil || prevVariant.AircraftOwner != variant.AircraftOwner {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", prevVariant.AircraftOwner)
				}

				updates = append(updates, fmt.Sprintf("Aircraft Owner: %snew=%s", old, variant.AircraftOwner))
			}

			if prevVariant == nil || prevVariant.AircraftIataCode != variant.AircraftIataCode || prevVariant.AircraftConfigurationVersion != variant.AircraftConfigurationVersion {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", aircraftAndConfigurationVersionName(prevVariant.OperatedAs.AirlineIataCode, prevVariant.AircraftIataCode, prevVariant.AircraftConfigurationVersion))
				}

				updates = append(updates, fmt.Sprintf("Aircraft: %snew=%s", old, aircraftAndConfigurationVersionName(variant.OperatedAs.AirlineIataCode, variant.AircraftIataCode, variant.AircraftConfigurationVersion)))
			}

			slices.SortFunc(variant.CodeShares, func(a, b model.FlightNumber) int {
				return cmp.Or(
					strings.Compare(a.AirlineIataCode, b.AirlineIataCode),
					a.Number-b.Number,
					strings.Compare(a.Suffix, b.Suffix),
				)
			})

			if prevVariant == nil || !slices.Equal(prevVariant.CodeShares, variant.CodeShares) {
				var old string
				if prevVariant != nil {
					parts := make([]string, 0, len(prevVariant.CodeShares))
					for _, csFn := range prevVariant.CodeShares {
						parts = append(parts, fnName(csFn))
					}

					old = fmt.Sprintf("old=%s ", strings.Join(parts, ","))
				}

				parts := make([]string, 0, len(variant.CodeShares))
				for _, csFn := range variant.CodeShares {
					parts = append(parts, fnName(csFn))
				}

				updates = append(updates, fmt.Sprintf("Codeshares: %snew=%s", old, strings.Join(parts, ",")))
			}

			if prevVariant == nil || !maps.Equal(prevVariant.DataElements, variant.DataElements) {
				allElementsIds := make(common.Set[int64])
				if prevVariant != nil {
					for id := range prevVariant.DataElements {
						allElementsIds.Add(id)
					}
				}

				for id := range variant.DataElements {
					allElementsIds.Add(id)
				}

				for _, id := range slices.Sorted(maps.Keys(allElementsIds)) {
					var oldValue, newValue string
					if prevVariant != nil && prevVariant.DataElements[id] != "" {
						oldValue = prevVariant.DataElements[id]
					} else {
						oldValue = "none"
					}

					if variant.DataElements[id] != "" {
						newValue = variant.DataElements[id]
					} else {
						newValue = "none"
					}

					updates = append(updates, fmt.Sprintf("Data Element %d: old=%s new=%s", id, oldValue, newValue))
				}
			}

			item.Title = "Flight updated"
			item.Content = strings.Join(updates, "\n")

			prevVariant = &variant
		} else {
			item.Title = "Flight cancelled/removed"
			item.Content = fmt.Sprintf("The flight %s departing from %s on %s was cancelled/removed from the Lufthansa API", baseFnName, departureAirportName, fs.DepartureDateLocal.String())

			prevVariant = nil
		}

		item.Description = item.Content

		feed.Items = append(feed.Items, item)
		feed.Updated = item.Updated
	}

	// newest first
	slices.Reverse(feed.Items)

	return feed
}

func (dh *DataHandler) Destinations(c echo.Context) error {
	ctx := c.Request().Context()
	departureAirportRaw := c.Param("departureAirport")
	departureAirportIataCode, err := dh.parseAirport(ctx, departureAirportRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var destinationAirportIataCodes []string
	var airports map[string]db.Airport
	{
		g, ctx := errgroup.WithContext(ctx)
		g.Go(func() error {
			var err error
			destinationAirportIataCodes, err = dh.repo.Destinations(ctx, departureAirportIataCode)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = dh.repo.Airports(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return err
		}
	}

	responseAirports := make([]model.Airport, 0, len(destinationAirportIataCodes))
	for _, destinationAirportIataCode := range destinationAirportIataCodes {
		if airport, ok := airports[destinationAirportIataCode]; ok {
			responseAirports = append(responseAirports, model.AirportFromDb(airport))
		}
	}

	return c.JSON(http.StatusOK, responseAirports)
}

func (dh *DataHandler) GlobalUpdates(c echo.Context) error {
	reportItems, err := dh.repo.GlobalUpdatesReport(c.Request().Context())
	if err != nil {
		return err
	}

	result := make([]model.UpdateReportItem, 0, len(reportItems))
	for _, reportItem := range reportItems {
		result = append(result, model.UpdateReportItemFromDb(reportItem))
	}

	slices.SortFunc(result, func(a, b model.UpdateReportItem) int {
		return a.Version.Compare(b.Version)
	})

	return c.JSON(http.StatusOK, result)
}

func (dh *DataHandler) LegacyFlightScheduleVersionsRSSFeed(c echo.Context) error {
	return dh.legacyFlightScheduleVersionsFeed(c, "application/rss+xml", (*feeds.Feed).WriteRss)
}

func (dh *DataHandler) LegacyFlightScheduleVersionsAtomFeed(c echo.Context) error {
	return dh.legacyFlightScheduleVersionsFeed(c, "application/atom+xml", (*feeds.Feed).WriteAtom)
}

func (dh *DataHandler) legacyFlightScheduleVersionsFeed(c echo.Context, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	buildFeedId := func(fn common.FlightNumber, departureDateUtc xtime.LocalDate, departureAirport string) string {
		q := make(url.Values)
		q.Set("departure_airport", departureAirport)
		q.Set("departure_date_utc", departureDateUtc.String())

		return fmt.Sprintf("https://explore.flights/flight/%s?%s", fn.String(), q.Encode())
	}

	fnRaw := c.Param("fn")
	departureDateRaw := c.Param("departureDate")
	departureAirport := strings.ToUpper(c.Param("departureAirport"))

	fn, err := common.ParseFlightNumber(fnRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	departureDate, err := xtime.ParseLocalDate(departureDateRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	feedId := buildFeedId(fn, departureDate, departureAirport)
	link := &feeds.Link{
		Href: feedId,
		Rel:  "alternate",
		Type: "text/html",
	}

	created := time.Date(2024, time.May, 1, 0, 0, 0, 0, time.UTC)
	lastModified := time.Date(2025, time.June, 4, 0, 0, 0, 0, time.UTC)
	sunsetDate := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)
	newLink := fmt.Sprintf("https://explore.flights/flight/%s/versions/%s/%s", fnRaw, departureAirport, departureDate.String())
	newLinkMinusOne := fmt.Sprintf("https://explore.flights/flight/%s/versions/%s/%s", fnRaw, departureAirport, (departureDate - 1).String())
	newLinkPlusOne := fmt.Sprintf("https://explore.flights/flight/%s/versions/%s/%s", fnRaw, departureAirport, (departureDate + 1).String())
	feed := &feeds.Feed{
		Id:      feedId,
		Title:   fmt.Sprintf("Flight %s from %s on %s (UTC)", fn.String(), departureAirport, departureDate.String()),
		Link:    link,
		Created: created,
		Updated: lastModified,
		Items: []*feeds.Item{
			{
				Id:          feedId,
				IsPermaLink: "false",
				Title:       "Endpoint deprecated",
				Link: &feeds.Link{
					Href: newLink,
					Rel:  "alternate",
					Type: "text/html",
				},
				Created: lastModified,
				Updated: lastModified,
				Content: "This feed endpoint has been deprecated",
				Description: strings.TrimSpace(fmt.Sprintf(
					`
This feed endpoint has been deprecated. This endpoint does not yield any updates anymore immedietly.
Please update your process to use the new feed endpoint which you can find at either of:
- %s
- %s
- %s
Depending on the AIRPORT LOCAL DEPARTURE DATE of your flight. This endpoint used the UTC DEPARTURE DATE. The new endpoints use the AIRPORT LOCAL DEPARTURE DATE.

This endpoint will be removed after %s.
`,
					newLink,
					newLinkMinusOne,
					newLinkPlusOne,
					sunsetDate.Format(time.RFC3339),
				)),
			},
		},
	}

	c.Response().Header().Add(echo.HeaderContentType, contentType)
	addExpirationHeaders(c, time.Now(), time.Hour)

	return writer(feed, c.Response())
}

func (dh *DataHandler) loadFlightScheduleVersions(ctx context.Context, fnRaw, departureAirportRaw, departureDateLocalRaw string) (model.FlightScheduleVersions, error) {
	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	departureAirportIataCode, err := dh.parseAirport(ctx, departureAirportRaw)
	if err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var departureDateLocal xtime.LocalDate
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var flightScheduleVersions db.FlightScheduleVersions
	var airlines map[string]db.Airline
	var airports map[string]db.Airport
	var aircraft map[string]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			flightScheduleVersions, err = dh.repo.FlightScheduleVersions(ctx, fn, departureAirportIataCode, departureDateLocal)
			return err
		})

		g.Go(func() error {
			var err error
			airlines, err = dh.repo.Airlines(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			airports, err = dh.repo.Airports(ctx)
			return err
		})

		g.Go(func() error {
			var err error
			aircraft, err = dh.repo.Aircraft(ctx)
			return err
		})

		if err := g.Wait(); err != nil {
			return model.FlightScheduleVersions{}, err
		}
	}

	fs := model.FlightScheduleVersions{
		FlightNumber:             model.FlightNumberFromDb(fn),
		DepartureDateLocal:       departureDateLocal,
		DepartureAirportIataCode: departureAirportIataCode,
		Versions:                 make([]model.FlightScheduleVersion, 0, len(flightScheduleVersions.Versions)),
		Variants:                 make(map[model.UUID]model.FlightScheduleVariant, len(flightScheduleVersions.Variants)),
		Airlines:                 make(map[string]model.Airline),
		Airports:                 make(map[string]model.Airport),
		Aircraft:                 make(map[string]model.Aircraft),
	}
	referencedAirlines := make(common.Set[string])
	referencedAirports := make(common.Set[string])
	referencedAircraft := make(common.Set[string])

	referencedAirlines.Add(fn.AirlineIataCode)
	referencedAirports.Add(departureAirportIataCode)

	for _, version := range flightScheduleVersions.Versions {
		var flightVariantId *model.UUID
		if version.FlightVariantId.Valid {
			id := model.UUID(version.FlightVariantId.V)
			flightVariantId = &id
		}

		fsv := model.FlightScheduleVersion{
			Version:         version.Version,
			FlightVariantId: flightVariantId,
		}

		fs.Versions = append(fs.Versions, fsv)
	}

	for variantId, variant := range flightScheduleVersions.Variants {
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineIataCode)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineIataCode)
		referencedAirports.Add(variant.ArrivalAirportIataCode)
		referencedAircraft.Add(variant.AircraftIataCode)
	}

	for airlineIataCode := range referencedAirlines {
		fs.Airlines[airlineIataCode] = model.AirlineFromDb(airlines[airlineIataCode])
	}

	for airportIataCode := range referencedAirports {
		fs.Airports[airportIataCode] = model.AirportFromDb(airports[airportIataCode])
	}

	model.AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, fs.Aircraft)

	return fs, nil
}

func (dh *DataHandler) parseFlightNumber(ctx context.Context, raw string) (db.FlightNumber, error) {
	airlines, err := dh.repo.Airlines(ctx)
	if err != nil {
		return db.FlightNumber{}, err
	}

	return parseFlightNumber(airlines, raw)
}

func parseFlightNumber(airlines map[string]db.Airline, raw string) (db.FlightNumber, error) {

	if groups := iataFlightNumberRgx.FindStringSubmatch(raw); groups != nil {
		airlineIata := strings.ToUpper(groups[1])
		number, err := strconv.Atoi(groups[2])
		if err != nil {
			return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q: %w", raw, err)
		}

		if _, ok := airlines[airlineIata]; ok {
			return db.FlightNumber{
				AirlineIataCode: airlineIata,
				Number:          number,
				Suffix:          groups[3],
			}, nil
		}
	}

	if groups := icaoFlightNumberRgx.FindStringSubmatch(raw); groups != nil {
		airlineIcao := strings.ToUpper(groups[1])
		number, err := strconv.Atoi(groups[2])
		if err != nil {
			return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q: %w", raw, err)
		}

		for _, airline := range airlines {
			if airline.IcaoCode.Valid && airline.IcaoCode.String == airlineIcao {
				return db.FlightNumber{
					AirlineIataCode: airline.IataCode,
					Number:          number,
					Suffix:          groups[3],
				}, nil
			}
		}
	}

	return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q", raw)
}

func (dh *DataHandler) parseAndResolveFlightNumber(ctx context.Context, raw string) (db.FlightNumber, db.Airline, error) {
	airlines, err := dh.repo.Airlines(ctx)
	if err != nil {
		return db.FlightNumber{}, db.Airline{}, err
	}

	fn, err := parseFlightNumber(airlines, raw)
	if err != nil {
		return db.FlightNumber{}, db.Airline{}, err
	}

	if airline, ok := airlines[fn.AirlineIataCode]; ok {
		return fn, airline, nil
	}

	return db.FlightNumber{}, db.Airline{}, fmt.Errorf("airline not found: %q", fn.AirlineIataCode)
}

func (dh *DataHandler) parseAirport(ctx context.Context, raw string) (string, error) {
	return util{}.parseAirport(ctx, raw, dh.repo.Airports)
}

func (dh *DataHandler) parseAndResolveAirport(ctx context.Context, raw string) (db.Airport, error) {
	airportId, err := util{}.parseAirport(ctx, raw, dh.repo.Airports)
	if err != nil {
		return db.Airport{}, err
	}

	airports, err := dh.repo.Airports(ctx)
	if err != nil {
		return db.Airport{}, err
	}

	if airport, ok := airports[airportId]; ok {
		return airport, nil
	}

	return db.Airport{}, fmt.Errorf("airport not found: %q", raw)
}
