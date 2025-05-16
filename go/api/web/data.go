package web

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"net/http"
	"regexp"
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
	repo dataHandlerRepo
	dh   *data.Handler
}

func NewDataHandler(repo dataHandlerRepo, dh *data.Handler) *DataHandler {
	return &DataHandler{
		repo: repo,
		dh:   dh,
	}
}

func (dh *DataHandler) Airlines(c echo.Context) error {
	airlines, err := dh.repo.Airlines(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError)
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
		return echo.NewHTTPError(http.StatusInternalServerError)
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
		return echo.NewHTTPError(http.StatusInternalServerError)
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
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid version format")
		}
	}

	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest)
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
			return echo.NewHTTPError(http.StatusInternalServerError)
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

		fsi := model.FlightScheduleItem{
			DepartureDateLocal: item.DepartureDateLocal,
			DepartureAirportId: model.UUID(item.DepartureAirportId),
			CodeShares:         make([]model.FlightNumber, 0, len(item.CodeShares)),
			FlightVariantId:    flightVariantId,
			Version:            item.Version,
			VersionCount:       item.VersionCount,
		}

		referencedAirports.Add(item.DepartureAirportId)

		for cs := range item.CodeShares {
			fsi.CodeShares = append(fsi.CodeShares, model.FlightNumberFromDb(cs))
			referencedAirlines.Add(cs.AirlineId)
		}

		fs.Items = append(fs.Items, fsi)
	}

	for variantId, variant := range flightSchedules.Variants {
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariant{
			Id:                           model.UUID(variant.Id),
			OperatedAs:                   model.FlightNumberFromDb(variant.OperatedAs),
			DepartureTimeLocal:           variant.DepartureTimeLocal,
			DepartureUtcOffsetSeconds:    variant.DepartureUtcOffsetSeconds,
			DurationSeconds:              variant.DurationSeconds,
			ArrivalAirportId:             model.UUID(variant.ArrivalAirportId),
			ArrivalUtcOffsetSeconds:      variant.ArrivalUtcOffsetSeconds,
			ServiceType:                  variant.ServiceType,
			AircraftOwner:                variant.AircraftOwner,
			AircraftId:                   model.UUID(variant.AircraftId),
			AircraftConfigurationVersion: variant.AircraftConfigurationVersion,
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
	departureAirportIdRaw := c.Param("departureAirport")
	departureDateLocalRaw := c.Param("departureDateLocal")

	fn, err := dh.parseFlightNumber(ctx, fnRaw)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest)
	}

	departureAirportId, err := dh.parseAirport(ctx, departureAirportIdRaw)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest)
	}

	var departureDateLocal xtime.LocalDate
	if departureDateLocal, err = xtime.ParseLocalDate(departureDateLocalRaw); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest)
	}

	var flightScheduleVersions db.FlightScheduleVersions
	var airlines map[uuid.UUID]db.Airline
	var airports map[uuid.UUID]db.Airport
	var aircraft map[uuid.UUID]db.Aircraft

	{
		g, ctx := errgroup.WithContext(ctx)

		g.Go(func() error {
			var err error
			flightScheduleVersions, err = dh.repo.FlightScheduleVersions(ctx, fn, uuid.UUID(departureAirportId), departureDateLocal)
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
			return echo.NewHTTPError(http.StatusInternalServerError)
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
		fs.Variants[model.UUID(variantId)] = model.FlightScheduleVariant{
			Id:                           model.UUID(variant.Id),
			OperatedAs:                   model.FlightNumberFromDb(variant.OperatedAs),
			DepartureTimeLocal:           variant.DepartureTimeLocal,
			DepartureUtcOffsetSeconds:    variant.DepartureUtcOffsetSeconds,
			DurationSeconds:              variant.DurationSeconds,
			ArrivalAirportId:             model.UUID(variant.ArrivalAirportId),
			ArrivalUtcOffsetSeconds:      variant.ArrivalUtcOffsetSeconds,
			ServiceType:                  variant.ServiceType,
			AircraftOwner:                variant.AircraftOwner,
			AircraftId:                   model.UUID(variant.AircraftId),
			AircraftConfigurationVersion: variant.AircraftConfigurationVersion,
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
	if len(raw) <= 4 {
		airports, err := dh.repo.Airports(ctx)
		if err != nil {
			return uuid.Nil, err
		}

		for _, airport := range airports {
			if (airport.IataCode.Valid && airport.IataCode.String == raw) || (airport.IcaoCode.Valid && airport.IcaoCode.String == raw) {
				return airport.Id, nil
			}
		}
	}

	var airportId model.UUID
	if err := airportId.FromString(raw); err != nil {
		return uuid.Nil, err
	}

	return uuid.UUID(airportId), nil
}

func NewSeatMapEndpoint(dh *data.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		fnRaw := c.Param("fn")
		departureAirport := strings.ToUpper(c.Param("departure"))
		arrivalAirport := strings.ToUpper(c.Param("arrival"))
		departureDateRaw := c.Param("date")
		aircraftType, aircraftConfigurationVersion, ok := strings.Cut(c.Param("aircraft"), "-")

		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest)
		}

		fn, err := common.ParseFlightNumber(fnRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		if len(departureAirport) != 3 || len(arrivalAirport) != 3 {
			return echo.NewHTTPError(http.StatusBadRequest)
		}

		departureDate, err := xtime.ParseLocalDate(departureDateRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		fs, err := dh.FlightSchedule(c.Request().Context(), fn)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		} else if fs == nil {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		fsd, ok := fs.Find(departureDate, departureAirport, arrivalAirport)
		if !ok {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		if fsd.Data.AircraftType != aircraftType || fsd.Data.AircraftConfigurationVersion != aircraftConfigurationVersion {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		allowFetchFresh := fsd.DepartureTime(departureDate).After(time.Now().Add(-time.Hour * 3))
		cabinClasses := []lufthansa.RequestCabinClass{
			lufthansa.RequestCabinClassEco,
			lufthansa.RequestCabinClassPremiumEco,
			lufthansa.RequestCabinClassBusiness,
			lufthansa.RequestCabinClassFirst,
		}
		rawSeatMaps := make(map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability)

		for _, cabinClass := range cabinClasses {
			sm, err := dh.SeatMap(
				c.Request().Context(),
				fn,
				departureAirport,
				arrivalAirport,
				departureDate,
				cabinClass,
				aircraftType,
				aircraftConfigurationVersion,
				allowFetchFresh,
			)

			if err != nil {
				if errors.Is(err, data.ErrSeatMapFreshFetchRequired) {
					return echo.NewHTTPError(http.StatusBadRequest, "Seatmaps can only be requested until 3 hours prior to departure")
				} else {
					return echo.NewHTTPError(http.StatusInternalServerError)
				}
			}

			if sm != nil {
				rawSeatMaps[cabinClass] = *sm
			}
		}

		sm := normalizeSeatMaps(rawSeatMaps)

		addExpirationHeaders(c, time.Now(), time.Hour*24*3)
		return c.JSON(http.StatusOK, sm)
	}
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
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		addExpirationHeaders(c, time.Now(), time.Hour*3)
		return c.JSON(http.StatusOK, result)
	}
}

func jsonResponse[T any](c echo.Context, v T, err error, isEmpty func(T) bool) error {
	if err != nil {
		return errorResponse(c, err)
	}

	if isEmpty(v) {
		return echo.NewHTTPError(http.StatusNotFound)
	}

	return c.JSON(http.StatusOK, v)
}

func errorResponse(c echo.Context, err error) error {
	noCache(c)

	if errors.Is(err, context.DeadlineExceeded) {
		return echo.NewHTTPError(http.StatusRequestTimeout, err)
	}

	return echo.NewHTTPError(http.StatusInternalServerError)
}
