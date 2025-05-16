package db

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xsync"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"iter"
	"maps"
	"strings"
	"sync"
	"time"
)

type aircraftConfigurationsAdapter struct {
	AirlineId      uuid.UUID
	Configurations xsql.SQLArray[xsql.String, *xsql.String]
}

func (a *aircraftConfigurationsAdapter) Scan(src any) error {
	configurationsRaw, ok := src.(map[string]any)
	if !ok {
		return fmt.Errorf("AircraftConfigurationsAdapter.Scan: expected map[string]any, got %T", src)
	}

	var airlineId uuid.UUID
	var configurations xsql.SQLArray[xsql.String, *xsql.String]

	if err := airlineId.Scan(configurationsRaw["airline_id"]); err != nil {
		return err
	}

	if err := configurations.Scan(configurationsRaw["configurations"]); err != nil {
		return err
	}

	*a = aircraftConfigurationsAdapter{
		AirlineId:      airlineId,
		Configurations: configurations,
	}
	return nil
}

type flightRepoDatabase interface {
	Conn(ctx context.Context) (*sql.Conn, error)
}

type FlightRepo struct {
	db       flightRepoDatabase
	airlines *xsync.Preload[map[uuid.UUID]Airline]
	airports *xsync.Preload[map[uuid.UUID]Airport]
	aircraft *xsync.Preload[map[uuid.UUID]Aircraft]
}

func NewFlightRepo(db flightRepoDatabase) *FlightRepo {
	fr := FlightRepo{db: db}
	fr.airlines = xsync.NewPreload(fr.airlinesInternal)
	fr.airports = xsync.NewPreload(fr.airportsInternal)
	fr.aircraft = xsync.NewPreload(fr.aircraftInternal)

	return &fr
}

func (fr *FlightRepo) Flights(ctx context.Context, start, end xtime.LocalDate) (map[xtime.LocalDate][]Flight, error) {
	var mtx sync.Mutex
	result := make(map[xtime.LocalDate][]Flight)

	g, ctx := errgroup.WithContext(ctx)
	curr := start

	for curr <= end {
		d := curr
		g.Go(func() error {
			flights, err := fr.flightsInternal(ctx, d)
			if err != nil {
				return err
			}

			mtx.Lock()
			defer mtx.Unlock()

			result[d] = flights

			return nil
		})

		curr += 1
	}

	return result, g.Wait()
}

func (fr *FlightRepo) Airlines(ctx context.Context) (map[uuid.UUID]Airline, error) {
	return fr.airlines.Value(ctx)
}

func (fr *FlightRepo) airlinesInternal() (map[uuid.UUID]Airline, error) {
	ctx := context.Background()
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    id,
    name,
    ( SELECT identifier FROM airline_identifiers WHERE issuer = 'iata' AND airline_id = id ),
    ( SELECT identifier FROM airline_identifiers WHERE issuer = 'icao' AND airline_id = id )
FROM airlines
`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	airlines := make(map[uuid.UUID]Airline)
	for rows.Next() {
		var airline Airline
		if err = rows.Scan(&airline.Id, &airline.Name, &airline.IataCode, &airline.IcaoCode); err != nil {
			return nil, err
		}

		airlines[airline.Id] = airline
	}

	return airlines, rows.Err()
}

func (fr *FlightRepo) Airports(ctx context.Context) (map[uuid.UUID]Airport, error) {
	return fr.airports.Value(ctx)
}

func (fr *FlightRepo) airportsInternal() (map[uuid.UUID]Airport, error) {
	ctx := context.Background()
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    id,
    iata_area_code,
    country_code,
    city_code,
    type,
    lng,
    lat,
    timezone,
    name,
    ( SELECT identifier FROM airport_identifiers WHERE issuer = 'iata' AND airport_id = id ),
    ( SELECT identifier FROM airport_identifiers WHERE issuer = 'icao' AND airport_id = id )
FROM airports
`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	airports := make(map[uuid.UUID]Airport)
	for rows.Next() {
		var airport Airport
		err = rows.Scan(
			&airport.Id,
			&airport.IataAreaCode,
			&airport.CountryCode,
			&airport.CityCode,
			&airport.Type,
			&airport.Lng,
			&airport.Lat,
			&airport.Timezone,
			&airport.Name,
			&airport.IataCode,
			&airport.IcaoCode,
		)
		if err != nil {
			return nil, err
		}

		airports[airport.Id] = airport
	}

	return airports, rows.Err()
}

func (fr *FlightRepo) Aircraft(ctx context.Context) (map[uuid.UUID]Aircraft, error) {
	return fr.aircraft.Value(ctx)
}

func (fr *FlightRepo) aircraftInternal() (map[uuid.UUID]Aircraft, error) {
	ctx := context.Background()
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    id,
    equip_code,
    name,
    ( SELECT identifier FROM aircraft_identifiers WHERE issuer = 'iata' AND aircraft_id = id ),
    ( SELECT identifier FROM aircraft_identifiers WHERE issuer = 'icao' AND aircraft_id = id ),
    COALESCE(
    	(
			SELECT ARRAY_AGG({'airline_id': sub.operating_airline_id, 'configurations': sub.aircraft_configuration_versions})
			FROM (
				SELECT
					fv.operating_airline_id,
					COALESCE(ARRAY_AGG(DISTINCT fv.aircraft_configuration_version), []) AS aircraft_configuration_versions
				FROM flight_variants fv
				WHERE fv.aircraft_id = aircraft.id
				GROUP BY fv.operating_airline_id
			) sub
		),
    	[]
    )
FROM aircraft
`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	aircraft := make(map[uuid.UUID]Aircraft)
	for rows.Next() {
		var ac Aircraft
		var configurationsRaw xsql.SQLArray[aircraftConfigurationsAdapter, *aircraftConfigurationsAdapter]
		if err = rows.Scan(&ac.Id, &ac.EquipCode, &ac.Name, &ac.IataCode, &ac.IcaoCode, &configurationsRaw); err != nil {
			return nil, err
		}

		ac.Configurations = make(map[uuid.UUID][]string)
		for _, configurationRaw := range configurationsRaw {
			for _, v := range configurationRaw.Configurations {
				ac.Configurations[configurationRaw.AirlineId] = append(ac.Configurations[configurationRaw.AirlineId], string(v))
			}
		}

		aircraft[ac.Id] = ac
	}

	return aircraft, rows.Err()
}

func (fr *FlightRepo) FindFlightNumbers(ctx context.Context, query string, limit int) ([]FlightNumber, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	query = strings.ToUpper(query)
	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    sub.airline_id,
    sub.number,
    sub.suffix
FROM (
	SELECT
		fn.airline_id,
		fn.number,
		fn.suffix,
		MIN(
			CASE
				WHEN aid.identifier IS NOT NULL AND UPPER(CONCAT(aid.identifier, fn.number, fn.suffix)) = ? THEN 1
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) = ? THEN 2
				WHEN aid.identifier IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(aid.identifier, fn.number, fn.suffix)), ?) THEN 3
			    WHEN airl.name IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(airl.name, fn.number, fn.suffix)), ?) THEN 4
				WHEN aid.identifier IS NOT NULL AND UPPER(CONCAT(aid.identifier, fn.number, fn.suffix)) GLOB ? THEN 5
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) GLOB ? THEN 6
				ELSE 7
			END
		) AS priority
	FROM flight_numbers fn
	INNER JOIN airlines airl
	ON fn.airline_id = airl.id
	LEFT JOIN airline_identifiers aid
	ON fn.airline_id = aid.airline_id
	GROUP BY fn.airline_id, fn.number, fn.suffix
) sub
WHERE ? OR sub.priority < 7
ORDER BY sub.priority, sub.airline_id ASC, sub.number ASC, sub.suffix ASC
LIMIT ?
`,
		query,
		query,
		query,
		query,
		query,
		query,
		query == "",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]FlightNumber, 0, limit)
	for rows.Next() {
		var flightNumber FlightNumber
		if err = rows.Scan(&flightNumber.AirlineId, &flightNumber.Number, &flightNumber.Suffix); err != nil {
			return nil, err
		}

		results = append(results, flightNumber)
	}

	return results, rows.Err()
}

func (fr *FlightRepo) IterFlightNumbers(ctx context.Context, airlineId uuid.UUID, outErr *error) iter.Seq2[FlightNumber, time.Time] {
	return func(yield func(FlightNumber, time.Time) bool) {
		conn, err := fr.db.Conn(ctx)
		if err != nil {
			*outErr = err
			return
		}
		defer conn.Close()

		rows, err := conn.QueryContext(
			ctx,
			`
SELECT
    fn.airline_id,
    fn.number,
    fn.suffix,
    MAX(fvh.created_at)
FROM flight_numbers fn
INNER JOIN flight_variant_history fvh
ON fn.airline_id = fvh.airline_id
AND fn.number = fvh.number
AND fn.suffix = fvh.suffix
WHERE fn.airline_id = ?
AND fvh.airline_id = ?
GROUP BY fn.airline_id, fn.number, fn.suffix
ORDER BY fn.airline_id ASC, fn.number ASC, fn.suffix ASC
`,
			airlineId,
			airlineId,
		)
		if err != nil {
			*outErr = err
			return
		}
		defer rows.Close()

		for rows.Next() {
			var flightNumber FlightNumber
			var maxCreatedAt time.Time
			if err = rows.Scan(&flightNumber.AirlineId, &flightNumber.Number, &flightNumber.Suffix, &maxCreatedAt); err != nil {
				*outErr = err
				return
			}

			if !yield(flightNumber, maxCreatedAt) {
				break
			}
		}

		if err = rows.Err(); err != nil {
			*outErr = err
			return
		}
	}
}

func (fr *FlightRepo) FlightSchedules(ctx context.Context, fn FlightNumber, version time.Time) (FlightSchedules, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return FlightSchedules{}, err
	}
	defer conn.Close()

	items := make([]FlightScheduleItem, 0)
	variantIds := make(common.Set[uuid.UUID])
	err = func() error {
		rows, err := conn.QueryContext(
			ctx,
			`
WITH filtered_flight_variant_history AS (
    SELECT
        departure_date_local,
		departure_airport_id,
		code_shares,
		flight_variant_id,
		created_at
    FROM flight_variant_history
	WHERE airline_id = ?
	AND number_mod_10 = (? % 10)
	AND number = ?
	AND suffix = ?
	AND created_at <= CAST(? AS TIMESTAMPTZ)
)
SELECT
    departure_date_local,
    departure_airport_id,
    FIRST(code_shares ORDER BY created_at DESC),
    FIRST(flight_variant_id ORDER BY created_at DESC),
    FIRST(created_at ORDER BY created_at DESC),
    COUNT(DISTINCT created_at)
FROM filtered_flight_variant_history
GROUP BY departure_date_local, departure_airport_id
ORDER BY departure_date_local ASC
`,
			fn.AirlineId,
			fn.Number,
			fn.Number,
			fn.Suffix,
			version.Format(time.RFC3339),
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var fsi FlightScheduleItem
			var codeShares xsql.SQLArray[FlightNumber, *FlightNumber]
			err = rows.Scan(
				&fsi.DepartureDateLocal,
				&fsi.DepartureAirportId,
				&codeShares,
				&fsi.FlightVariantId,
				&fsi.Version,
				&fsi.VersionCount,
			)
			if err != nil {
				return err
			}

			fsi.CodeShares = make(common.Set[FlightNumber])
			for _, codeShareFn := range codeShares {
				fsi.CodeShares.Add(codeShareFn)
			}

			items = append(items, fsi)

			if fsi.FlightVariantId.Valid {
				variantIds.Add(fsi.FlightVariantId.V)
			}
		}

		return rows.Err()
	}()
	if err != nil {
		return FlightSchedules{}, err
	}

	variants, err := fr.flightVariants(ctx, conn, variantIds)
	if err != nil {
		return FlightSchedules{}, err
	}

	return FlightSchedules{
		Items:    items,
		Variants: variants,
	}, nil
}

func (fr *FlightRepo) FlightScheduleVersions(ctx context.Context, fn FlightNumber, departureAirport uuid.UUID, departureDate xtime.LocalDate) (FlightScheduleVersions, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return FlightScheduleVersions{}, err
	}
	defer conn.Close()

	versions := make([]FlightScheduleVersion, 0)
	variantsIds := make(common.Set[uuid.UUID])
	err = func() error {
		rows, err := conn.QueryContext(
			ctx,
			`
SELECT
    created_at,
    flight_variant_id
FROM flight_variant_history
WHERE airline_id = ?
AND number_mod_10 = (? % 10)
AND number = ?
AND suffix = ?
AND departure_airport_id = ?
AND departure_date_local = ?
ORDER BY created_at ASC
`,
			fn.AirlineId,
			fn.Number,
			fn.Number,
			fn.Suffix,
			departureAirport,
			departureDate.String(),
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var version FlightScheduleVersion
			if err = rows.Scan(&version.Version, &version.FlightVariantId); err != nil {
				return err
			}

			versions = append(versions, version)

			if version.FlightVariantId.Valid {
				variantsIds.Add(version.FlightVariantId.V)
			}
		}

		return rows.Err()
	}()
	if err != nil {
		return FlightScheduleVersions{}, err
	}

	variants, err := fr.flightVariants(ctx, conn, variantsIds)
	if err != nil {
		return FlightScheduleVersions{}, err
	}

	return FlightScheduleVersions{
		Versions: versions,
		Variants: variants,
	}, nil
}

func (fr *FlightRepo) flightVariants(ctx context.Context, conn *sql.Conn, variantIds common.Set[uuid.UUID]) (map[uuid.UUID]FlightScheduleVariant, error) {
	variantIds = maps.Clone(variantIds)
	placeholders, params := buildParams(maps.Keys(variantIds))
	rows, err := conn.QueryContext(
		ctx,
		strings.Replace(`
SELECT
    id,
    operating_airline_id,
    operating_number,
    operating_suffix,
    departure_time_local,
    departure_utc_offset_seconds,
    duration_seconds,
    arrival_airport_id,
    arrival_utc_offset_seconds,
    service_type,
    aircraft_owner,
    aircraft_id,
    aircraft_configuration_version,
    aircraft_registration
FROM flight_variants
WHERE id IN (:flightVariantIds)
			`, ":flightVariantIds", placeholders, 1),
		params...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	variants := make(map[uuid.UUID]FlightScheduleVariant)
	for rows.Next() {
		var fsv FlightScheduleVariant
		err = rows.Scan(
			&fsv.Id,
			&fsv.OperatedAs.AirlineId,
			&fsv.OperatedAs.Number,
			&fsv.OperatedAs.Suffix,
			&fsv.DepartureTimeLocal,
			&fsv.DepartureUtcOffsetSeconds,
			&fsv.DurationSeconds,
			&fsv.ArrivalAirportId,
			&fsv.ArrivalUtcOffsetSeconds,
			&fsv.ServiceType,
			&fsv.AircraftOwner,
			&fsv.AircraftId,
			&fsv.AircraftConfigurationVersion,
			&fsv.AircraftRegistration,
		)
		if err != nil {
			return nil, err
		}

		if variantIds.Remove(fsv.Id) {
			variants[fsv.Id] = fsv
		}
	}

	return variants, rows.Err()
}

func (fr *FlightRepo) flightsInternal(ctx context.Context, d xtime.LocalDate) ([]Flight, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	year, month, day := d.Date()
	rows, err := conn.QueryContext(
		ctx,
		`
SELECT
    airline_id,
    number,
    suffix,
    departure_timestamp_utc,
    departure_utc_offset_seconds,
    departure_airport_id,
    duration_seconds,
    arrival_utc_offset_seconds,
    arrival_airport_id,
    service_type,
    aircraft_owner,
    aircraft_id,
    aircraft_configuration_version,
    aircraft_registration,
    code_shares
FROM flight_variant_history_latest
WHERE year_utc = ?
AND month_utc = ?
AND day_utc = ?
`,
		year,
		int(month),
		day,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	flights := make([]Flight, 0)
	for rows.Next() {
		var f Flight
		var departureUtcOffsetSeconds, arrivalUtcOffsetSeconds, durationSeconds int
		var codeShares xsql.SQLArray[FlightNumber, *FlightNumber]
		err = rows.Scan(
			&f.AirlineId,
			&f.Number,
			&f.Suffix,
			&f.DepartureTime,
			&departureUtcOffsetSeconds,
			&f.DepartureAirportId,
			&durationSeconds,
			&arrivalUtcOffsetSeconds,
			&f.ArrivalAirportId,
			&f.ServiceType,
			&f.AircraftOwner,
			&f.AircraftId,
			&f.AircraftConfigurationVersion,
			&f.AircraftRegistration,
			&codeShares,
		)
		if err != nil {
			return nil, err
		}

		f.DepartureTime = f.DepartureTime.In(time.FixedZone("", departureUtcOffsetSeconds))
		f.ArrivalTime = f.DepartureTime.Add(time.Duration(durationSeconds) * time.Second)
		f.ArrivalTime = f.ArrivalTime.In(time.FixedZone("", arrivalUtcOffsetSeconds))
		f.CodeShares = make(common.Set[FlightNumber])

		for _, codeShareFn := range codeShares {
			f.CodeShares.Add(codeShareFn)
		}

		flights = append(flights, f)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return flights, rows.Err()
}

func buildParams[T any](values iter.Seq[T]) (string, []any) {
	placeholders := make([]string, 0)
	params := make([]any, 0)
	for v := range values {
		placeholders = append(placeholders, "?")
		params = append(params, v)
	}

	return strings.Join(placeholders, ","), params
}
