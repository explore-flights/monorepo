package web

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
	"time"
)

type dataHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
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

	if airlineIdRaw, numberAndSuffix, found := strings.Cut(fnRaw, "-"); found {
		var airlineId model.UUID
		if err := airlineId.FromString(airlineIdRaw); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}

		airlines, err := dh.repo.Airlines(ctx)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		airline, ok := airlines[uuid.UUID(airlineId)]
		if !ok || !airline.IataCode.Valid {
			return echo.NewHTTPError(http.StatusNotFound)
		}

		fnRaw = airline.IataCode.String + numberAndSuffix
	}

	fn, err := common.ParseFlightNumber(fnRaw)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err)
	}

	addExpirationHeaders(c, time.Now(), time.Hour)

	fs, err := dh.dh.FlightSchedule(c.Request().Context(), fn)
	return jsonResponse(c, fs, err, func(v *common.FlightSchedule) bool { return v == nil })
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
