package web

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/seatmap"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"io"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

var iataFlightNumberRgx = regexp.MustCompile("^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$")
var icaoFlightNumberRgx = regexp.MustCompile("^([0-9A-Z]{3})([0-9]{1,4})([A-Z]?)$")
var numberAndSuffixRgx = regexp.MustCompile("^([0-9]{1,4})([A-Z]?)$")

type dataHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
	FlightSchedules(ctx context.Context, fn db.FlightNumber, version time.Time) (db.FlightSchedules, error)
	FlightScheduleVersions(ctx context.Context, fn db.FlightNumber, departureAirport uuid.UUID, departureDate xtime.LocalDate) (db.FlightScheduleVersions, error)
}

type DataHandler struct {
	repo     dataHandlerRepo
	smSearch *seatmap.Search
}

func NewDataHandler(repo dataHandlerRepo, smSearch *seatmap.Search) *DataHandler {
	return &DataHandler{
		repo:     repo,
		smSearch: smSearch,
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
	var airlines map[uuid.UUID]db.Airline
	var airports map[uuid.UUID]db.Airport
	var aircraft map[uuid.UUID]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			flightSchedules, err = dh.repo.FlightSchedules(ctx, fn, version)
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
		FlightNumber: model.FlightNumberFromDb(fn),
		Items:        make([]model.FlightScheduleItem, 0, len(flightSchedules.Items)),
		Variants:     make(map[model.UUID]model.FlightScheduleVariant, len(flightSchedules.Variants)),
		Airlines:     make(map[model.UUID]model.Airline),
		Airports:     make(map[model.UUID]model.Airport),
		Aircraft:     make(map[model.UUID]model.Aircraft),
	}
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])
	referencedAircraft := make(common.Set[uuid.UUID])

	referencedAirlines.Add(fn.AirlineId)

	for _, item := range flightSchedules.Items {
		var flightVariantId *model.UUID
		if item.FlightVariantId.Valid {
			id := model.UUID(item.FlightVariantId.V)
			flightVariantId = &id
		}

		fs.Items = append(fs.Items, model.FlightScheduleItem{
			DepartureDateLocal: item.DepartureDateLocal,
			DepartureAirportId: model.UUID(item.DepartureAirportId),
			FlightVariantId:    flightVariantId,
			Version:            item.Version,
			VersionCount:       item.VersionCount,
		})

		referencedAirports.Add(item.DepartureAirportId)
	}

	for variantId, variant := range flightSchedules.Variants {
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariantFromDb(variant)

		for cs := range variant.CodeShares {
			referencedAirlines.Add(cs.AirlineId)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineId)
		referencedAirports.Add(variant.ArrivalAirportId)
		referencedAircraft.Add(variant.AircraftId)
	}

	for airlineId := range referencedAirlines {
		fs.Airlines[model.UUID(airlineId)] = model.AirlineFromDb(airlines[airlineId])
	}

	for airportId := range referencedAirports {
		fs.Airports[model.UUID(airportId)] = model.AirportFromDb(airports[airportId])
	}

	for aircraftId := range referencedAircraft {
		fs.Aircraft[model.UUID(aircraftId)] = model.AircraftFromDb(aircraft[aircraftId])
	}

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

func (dh *DataHandler) SeatMap(c echo.Context) error {
	ctx := c.Request().Context()

	fnRaw := c.Param("fn")
	departureAirportRaw := strings.ToUpper(c.Param("departureAirport"))
	departureDateLocalRaw := c.Param("departureDateLocal")

	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	departureAirportId, err := dh.parseAirport(ctx, departureAirportRaw)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var departureDateLocal xtime.LocalDate
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	sm, err := dh.smSearch.SeatMap(ctx, fn, departureAirportId, departureDateLocal)
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
		var airlinePrefix string
		if airline, ok := fs.Airlines[fn.AirlineId]; ok {
			airlinePrefix = cmp.Or(airline.IataCode, airline.IcaoCode, airline.Id.String()+"-")
		} else {
			airlinePrefix = fn.AirlineId.String() + "-"
		}

		return fmt.Sprintf("%s%d%s", airlinePrefix, fn.Number, fn.Suffix)
	}

	airportName := func(airportId model.UUID) string {
		airport, ok := fs.Airports[airportId]
		if !ok {
			return airportId.String()
		}

		return cmp.Or(airport.IataCode, airport.IcaoCode, airport.Name, airport.Id.String())
	}

	aircraftName := func(aircraftId model.UUID) string {
		aircraft, ok := fs.Aircraft[aircraftId]
		if !ok {
			return aircraftId.String()
		}

		return cmp.Or(aircraft.Name, aircraft.EquipCode, aircraft.IataCode, aircraft.IcaoCode, aircraft.Id.String())
	}

	aircraftAndConfigurationVersionName := func(aircraftId model.UUID, v string) string {
		configName := v
		if aircraft, ok := fs.Aircraft[aircraftId]; ok && aircraft.IataCode == "359" {
			switch v {
			case "C38E24M201":
				configName = "Allegris (no first)"
				break

			case "F4C38E24M201":
				configName = "Allegris (with first)"
				break

			case "C48E21M224":
				configName = "LH Classic"
				break

			case "C30E26M262":
				configName = "LH Philippines Config 1"
				break

			case "C30E24M241":
				configName = "LH Philippines Config 2"
				break
			}
		}

		return fmt.Sprintf("%s (%s)", aircraftName(aircraftId), configName)
	}

	baseFnName := fnName(fs.FlightNumber)
	departureAirportName := airportName(fs.DepartureAirportId)
	feedId := fmt.Sprintf("https://explore.flights/flight/%s/versions/%s/%s", baseFnName, fs.DepartureAirportId.String(), fs.DepartureDateLocal.String())
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

			if prevVariant == nil || prevVariant.ArrivalAirportId != variant.ArrivalAirportId {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", airportName(prevVariant.ArrivalAirportId))
				}

				updates = append(updates, fmt.Sprintf("Arrival Airport: %snew=%s", old, airportName(variant.ArrivalAirportId)))
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

			if prevVariant == nil || prevVariant.AircraftId != variant.AircraftId || prevVariant.AircraftConfigurationVersion != variant.AircraftConfigurationVersion {
				var old string
				if prevVariant != nil {
					old = fmt.Sprintf("old=%s ", aircraftAndConfigurationVersionName(prevVariant.AircraftId, prevVariant.AircraftConfigurationVersion))
				}

				updates = append(updates, fmt.Sprintf("Aircraft: %snew=%s", old, aircraftAndConfigurationVersionName(variant.AircraftId, variant.AircraftConfigurationVersion)))
			}

			slices.SortFunc(variant.CodeShares, func(a, b model.FlightNumber) int {
				return cmp.Or(
					strings.Compare(a.AirlineId.String(), b.AirlineId.String()),
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

func (dh *DataHandler) loadFlightScheduleVersions(ctx context.Context, fnRaw, departureAirportRaw, departureDateLocalRaw string) (model.FlightScheduleVersions, error) {
	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	departureAirportId, err := dh.parseAirport(ctx, departureAirportRaw)
	if err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var departureDateLocal xtime.LocalDate
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return model.FlightScheduleVersions{}, NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	var flightScheduleVersions db.FlightScheduleVersions
	var airlines map[uuid.UUID]db.Airline
	var airports map[uuid.UUID]db.Airport
	var aircraft map[uuid.UUID]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			flightScheduleVersions, err = dh.repo.FlightScheduleVersions(ctx, fn, departureAirportId, departureDateLocal)
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
		FlightNumber:       model.FlightNumberFromDb(fn),
		DepartureDateLocal: departureDateLocal,
		DepartureAirportId: model.UUID(departureAirportId),
		Versions:           make([]model.FlightScheduleVersion, 0, len(flightScheduleVersions.Versions)),
		Variants:           make(map[model.UUID]model.FlightScheduleVariant, len(flightScheduleVersions.Variants)),
		Airlines:           make(map[model.UUID]model.Airline),
		Airports:           make(map[model.UUID]model.Airport),
		Aircraft:           make(map[model.UUID]model.Aircraft),
	}
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])
	referencedAircraft := make(common.Set[uuid.UUID])

	referencedAirlines.Add(fn.AirlineId)
	referencedAirports.Add(departureAirportId)

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
			referencedAirlines.Add(cs.AirlineId)
		}

		referencedAirlines.Add(variant.OperatedAs.AirlineId)
		referencedAirports.Add(variant.ArrivalAirportId)
		referencedAircraft.Add(variant.AircraftId)
	}

	for airlineId := range referencedAirlines {
		fs.Airlines[model.UUID(airlineId)] = model.AirlineFromDb(airlines[airlineId])
	}

	for airportId := range referencedAirports {
		fs.Airports[model.UUID(airportId)] = model.AirportFromDb(airports[airportId])
	}

	for aircraftId := range referencedAircraft {
		fs.Aircraft[model.UUID(aircraftId)] = model.AircraftFromDb(aircraft[aircraftId])
	}

	return fs, nil
}

func (dh *DataHandler) parseFlightNumber(ctx context.Context, raw string) (db.FlightNumber, error) {
	if airlineIdRaw, numberAndSuffix, found := strings.Cut(raw, "-"); found {
		var airlineId model.UUID
		if err := airlineId.FromString(airlineIdRaw); err != nil {
			return db.FlightNumber{}, err
		}

		groups := numberAndSuffixRgx.FindStringSubmatch(numberAndSuffix)
		if groups == nil {
			return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q", raw)
		}

		number, err := strconv.Atoi(groups[1])
		if err != nil {
			return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q: %w", raw, err)
		}

		return db.FlightNumber{
			AirlineId: uuid.UUID(airlineId),
			Number:    number,
			Suffix:    groups[2],
		}, nil
	}

	airlines, err := dh.repo.Airlines(ctx)
	if err != nil {
		return db.FlightNumber{}, err
	}

	if groups := iataFlightNumberRgx.FindStringSubmatch(raw); groups != nil {
		airlineIata := strings.ToUpper(groups[1])
		number, err := strconv.Atoi(groups[2])
		if err != nil {
			return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q: %w", raw, err)
		}

		for _, airline := range airlines {
			if airline.IataCode.Valid && airline.IataCode.String == airlineIata {
				return db.FlightNumber{
					AirlineId: airline.Id,
					Number:    number,
					Suffix:    groups[3],
				}, nil
			}
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
					AirlineId: airline.Id,
					Number:    number,
					Suffix:    groups[3],
				}, nil
			}
		}
	}

	return db.FlightNumber{}, fmt.Errorf("invalid FlightNumber: %q", raw)
}

func (dh *DataHandler) parseAirport(ctx context.Context, raw string) (uuid.UUID, error) {
	return util{}.parseAirport(ctx, raw, dh.repo.Airports)
}

func NewFlightSchedulesByConfigurationEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		airline := strings.ToUpper(c.Param("airline"))
		aircraftType := strings.ToUpper(c.Param("aircraftType"))
		aircraftConfigurationVersion := strings.ToUpper(c.Param("aircraftConfigurationVersion"))

		result, err := dh.QuerySchedules(
			c.Request().Context(),
			data.WithServiceType("J"),
			data.WithAirlines(common.AirlineIdentifier(airline)),
			data.WithAircraftType(aircraftType),
			data.WithAircraftConfigurationVersion(aircraftConfigurationVersion),
			data.WithIgnoreCodeShares(),
		)

		if err != nil {
			noCache(c)
			return err
		}

		addExpirationHeaders(c, time.Now(), time.Hour*3)
		return c.JSON(http.StatusOK, result)
	}
}
