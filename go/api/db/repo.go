package db

import (
	"context"
	"database/sql"
	"errors"
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

var ErrNotFound = errors.New("not found")

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
    iata_code,
    ( SELECT icao_code FROM airline_icao_codes WHERE airline_id = id LIMIT 1 ),
    name
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
		if err = rows.Scan(&airline.Id, &airline.IataCode, &airline.IcaoCode, &airline.Name); err != nil {
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
    iata_code,
    icao_code,
    iata_area_code,
    country_code,
    city_code,
    type,
    lng,
    lat,
    timezone,
    name
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
			&airport.IataCode,
			&airport.IcaoCode,
			&airport.IataAreaCode,
			&airport.CountryCode,
			&airport.CityCode,
			&airport.Type,
			&airport.Lng,
			&airport.Lat,
			&airport.Timezone,
			&airport.Name,
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
    ac.id,
    COALESCE(act.aircraft_family_id, acf.parent_id),
    COALESCE(act.iata_code, acf.iata_code),
    act.icao_code,
    act.wtc,
    act.engine_count,
    act.engine_type,
    COALESCE(act.name, acf.name),
    CASE
    	WHEN ac.aircraft_type_id IS NOT NULL THEN 'aircraft'
        WHEN ac.aircraft_family_id IS NOT NULL THEN 'family'
        ELSE 'unmapped'
    END,
    COALESCE(
    	(
			SELECT ARRAY_AGG({'airline_id': sub.operating_airline_id, 'configurations': sub.aircraft_configuration_versions})
			FROM (
				SELECT
					fv.operating_airline_id,
					COALESCE(ARRAY_AGG(DISTINCT fv.aircraft_configuration_version), []) AS aircraft_configuration_versions
				FROM flight_variants fv
				WHERE fv.aircraft_id = ac.id
				GROUP BY fv.operating_airline_id
			) sub
		),
    	[]
    )
FROM aircraft ac
LEFT JOIN aircraft_types act
ON ac.aircraft_type_id = act.id
LEFT JOIN aircraft_families acf
ON ac.aircraft_family_id = acf.id
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
		err = rows.Scan(
			&ac.Id,
			&ac.ParentFamilyId,
			&ac.IataCode,
			&ac.IcaoCode,
			&ac.Wtc,
			&ac.EngineCount,
			&ac.EngineType,
			&ac.Name,
			&ac.Type,
			&configurationsRaw,
		)
		if err != nil {
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
			    WHEN UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)) = ? THEN 1
				WHEN icao.icao_code IS NOT NULL AND UPPER(CONCAT(icao.icao_code, fn.number, fn.suffix)) = ? THEN 2
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) = ? THEN 3
			    WHEN STARTS_WITH(UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)), ?) THEN 4
				WHEN icao.icao_code IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(icao.icao_code, fn.number, fn.suffix)), ?) THEN 5
			    WHEN airl.name IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(airl.name, fn.number, fn.suffix)), ?) THEN 6
			    WHEN UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)) GLOB ? THEN 7
				WHEN icao.icao_code IS NOT NULL AND UPPER(CONCAT(icao.icao_code, fn.number, fn.suffix)) GLOB ? THEN 8
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) GLOB ? THEN 9
				ELSE 100
			END
		) AS priority
	FROM flight_numbers fn
	INNER JOIN airlines airl
	ON fn.airline_id = airl.id
	LEFT JOIN airline_icao_codes icao
	ON fn.airline_id = icao.airline_id
	GROUP BY fn.airline_id, fn.number, fn.suffix
) sub
WHERE ? OR sub.priority < 100
ORDER BY sub.priority, sub.airline_id ASC, sub.number ASC, sub.suffix ASC
LIMIT ?
`,
		query,
		query,
		query,
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

func (fr *FlightRepo) RelatedFlightNumbers(ctx context.Context, fn FlightNumber, version time.Time) (common.Set[FlightNumber], error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
WITH filtered_flight_variant_history AS (
    SELECT *
	FROM flight_variant_history
	WHERE airline_id = ?
	AND number_mod_10 IN ((? % 10), (? % 10), (? % 10))
	AND created_at <= CAST(? AS TIMESTAMPTZ)
), self_flight_variant_history AS (
	SELECT *
	FROM filtered_flight_variant_history
	WHERE number = ?
	AND suffix = ?
), related_flight_variant_history AS (
	SELECT *
	FROM filtered_flight_variant_history
	WHERE (
	    ( number = ? AND suffix != ? )
	    OR number = ?
	    OR number = ?
	)
)
SELECT DISTINCT rel_fvh.airline_id, rel_fvh.number, rel_fvh.suffix
FROM related_flight_variant_history rel_fvh
INNER JOIN flight_variants rel_fv
ON rel_fvh.flight_variant_id = rel_fv.id
INNER JOIN (
	SELECT DISTINCT fvh.departure_airport_id, fv.arrival_airport_id
	FROM self_flight_variant_history fvh
	INNER JOIN flight_variants fv
	ON fvh.flight_variant_id = fv.id
) self
ON (
	( rel_fvh.departure_airport_id = self.departure_airport_id AND rel_fv.arrival_airport_id = self.arrival_airport_id )
	OR
	( rel_fvh.departure_airport_id = self.arrival_airport_id AND rel_fv.arrival_airport_id = self.departure_airport_id )
)
`,
		fn.AirlineId,
		fn.Number,
		fn.Number+1,
		fn.Number-1,
		version.Format(time.RFC3339),
		fn.Number,
		fn.Suffix,
		fn.Number,
		fn.Suffix,
		fn.Number+1,
		fn.Number-1,
	)
	if err != nil {
		return nil, err
	}

	result := make(common.Set[FlightNumber])
	for rows.Next() {
		var flightNumber FlightNumber
		if err = rows.Scan(&flightNumber.AirlineId, &flightNumber.Number, &flightNumber.Suffix); err != nil {
			return nil, err
		}

		result.Add(flightNumber)
	}

	return result, rows.Err()
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
			err = rows.Scan(
				&fsi.DepartureDateLocal,
				&fsi.DepartureAirportId,
				&fsi.FlightVariantId,
				&fsi.Version,
				&fsi.VersionCount,
			)
			if err != nil {
				return err
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

func (fr *FlightRepo) FlightSchedulesLatestRaw(ctx context.Context, filter Condition) (FlightSchedulesMany, error) {
	var combinedFilter Condition = NewIsNullCondition("fvh.replaced_at")
	if filter != nil {
		combinedFilter = AndCondition{combinedFilter, filter}
	}

	return fr.flightSchedulesRaw(ctx, combinedFilter)
}

func (fr *FlightRepo) flightSchedulesRaw(ctx context.Context, filter Condition) (FlightSchedulesMany, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return FlightSchedulesMany{}, err
	}
	defer conn.Close()

	result := make(map[FlightNumber][]FlightScheduleItem)
	variantIds := make(common.Set[uuid.UUID])
	err = func() error {
		var filterStr string
		var params []any

		if filter == nil {
			filterStr = `TRUE`
		} else {
			filterStr, params = filter.Condition()
		}

		rows, err := conn.QueryContext(
			ctx,
			fmt.Sprintf(
				`
SELECT
    fvh.airline_id,
    fvh.number,
    fvh.suffix,
    fvh.departure_date_local,
    fvh.departure_airport_id,
    FIRST(fvh.flight_variant_id ORDER BY created_at DESC),
    FIRST(fvh.created_at ORDER BY created_at DESC),
FROM flight_variant_history fvh
LEFT JOIN flight_variants fv
ON fvh.flight_variant_id = fv.id
WHERE %s
GROUP BY
	fvh.airline_id,
	fvh.number,
	fvh.suffix,
	fvh.departure_date_local,
	fvh.departure_airport_id
ORDER BY
    fvh.airline_id ASC,
	fvh.number ASC,
	fvh.suffix ASC,
	fvh.departure_date_local ASC
`,
				filterStr,
			),
			params...,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var fn FlightNumber
			var fsi FlightScheduleItem
			err = rows.Scan(
				&fn.AirlineId,
				&fn.Number,
				&fn.Suffix,
				&fsi.DepartureDateLocal,
				&fsi.DepartureAirportId,
				&fsi.FlightVariantId,
				&fsi.Version,
			)
			if err != nil {
				return err
			}

			result[fn] = append(result[fn], fsi)

			if fsi.FlightVariantId.Valid {
				variantIds.Add(fsi.FlightVariantId.V)
			}
		}

		return rows.Err()
	}()
	if err != nil {
		return FlightSchedulesMany{}, err
	}

	variants, err := fr.flightVariants(ctx, conn, variantIds)
	if err != nil {
		return FlightSchedulesMany{}, err
	}

	return FlightSchedulesMany{
		Schedules: result,
		Variants:  variants,
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
	filter, params := NewInCondition("id", maps.Keys(variantIds)).Condition()
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
    aircraft_registration,
    code_shares
FROM flight_variants
WHERE :filter
			`, ":filter", filter, 1),
		params...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	variants := make(map[uuid.UUID]FlightScheduleVariant)
	for rows.Next() {
		var fsv FlightScheduleVariant
		var codeShares xsql.SQLArray[FlightNumber, *FlightNumber]
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
			&codeShares,
		)
		if err != nil {
			return nil, err
		}

		if variantIds.Remove(fsv.Id) {
			fsv.CodeShares = make(common.Set[FlightNumber])
			for _, codeShareFn := range codeShares {
				fsv.CodeShares.Add(codeShareFn)
			}

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

func (fr *FlightRepo) Versions(ctx context.Context) ([]time.Time, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(ctx, `SELECT DISTINCT created_at FROM flight_variant_history`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make([]time.Time, 0)
	for rows.Next() {
		var t time.Time
		if err = rows.Scan(&t); err != nil {
			return nil, err
		}

		versions = append(versions, t)
	}

	return versions, rows.Err()
}

func (fr *FlightRepo) UpdatesForVersion(ctx context.Context, version time.Time) ([]FlightScheduleUpdate, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT DISTINCT
    base.airline_id,
    base.number,
    base.suffix,
    base.departure_date_local,
    base.departure_airport_id,
    base.flight_variant_id
FROM flight_variant_history base
WHERE base.created_at >= ?
AND base.created_at <= ?
AND EXISTS(
    FROM flight_variant_history prev
	WHERE base.airline_id = prev.airline_id
	AND base.number = prev.number
	AND base.suffix = prev.suffix
	AND base.departure_date_local = prev.departure_date_local
	AND base.departure_airport_id = prev.departure_airport_id
	AND base.created_at = prev.replaced_at
)
`,
		version.Format(time.RFC3339),
		version.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	updates := make([]FlightScheduleUpdate, 0)
	for rows.Next() {
		var update FlightScheduleUpdate
		if err := rows.Scan(&update.AirlineId, &update.Number, &update.Suffix, &update.DepartureDateLocal, &update.DepartureAirportId, &update.FlightVariantId); err != nil {
			return nil, err
		}

		updates = append(updates, update)
	}

	return updates, rows.Err()
}

func (fr *FlightRepo) Report(ctx context.Context, selectFields []SelectExpression, filter Condition, groupBy []ValueExpression, scanner func(rows *sql.Rows) error) error {
	if len(selectFields) < 1 {
		return errors.New("at least one select field required")
	}

	var params []any
	var selectStrs []string
	var filterStr string
	var groupByStrs []string

	for _, selectField := range selectFields {
		selectStr, selectParams := selectField.Select()
		selectStrs = append(selectStrs, selectStr)
		params = append(params, selectParams...)
	}

	if filter != nil {
		var filterParams []any
		filterStr, filterParams = filter.Condition()
		params = append(params, filterParams...)
	}

	for _, groupByExpr := range groupBy {
		groupByStr, groupByParams := groupByExpr.Value()
		groupByStrs = append(groupByStrs, groupByStr)
		params = append(params, groupByParams...)
	}

	query := "SELECT " + strings.Join(selectStrs, ",") + `
FROM report r
INNER JOIN aircraft ac
ON r.aircraft_id = ac.id
LEFT JOIN aircraft_types act
ON ac.aircraft_type_id = act.id
LEFT JOIN aircraft_families acf
ON ac.aircraft_family_id = acf.id
OR act.aircraft_family_id = acf.id
`
	if filterStr != "" {
		query += " WHERE " + filterStr
	}

	if len(groupByStrs) > 0 {
		query += " GROUP BY " + strings.Join(groupByStrs, ",")
	}

	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(ctx, query, params...)
	if err != nil {
		return err
	}
	defer rows.Close()

	if err = scanner(rows); err != nil {
		return err
	}

	return rows.Err()
}

func (fr *FlightRepo) FindConnection(ctx context.Context, minFlights, maxFlights int, seed string) ([2]uuid.UUID, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return [2]uuid.UUID{}, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT departure_airport_id, arrival_airport_id
FROM connections
WHERE min_flights >= ?
AND min_flights <= ?
ORDER BY (
    GREATEST(MD5_NUMBER(CONCAT(departure_airport_id, arrival_airport_id)), MD5_NUMBER(?))
    -
    LEAST(MD5_NUMBER(CONCAT(departure_airport_id, arrival_airport_id)), MD5_NUMBER(?))
)
LIMIT 1
`,
		minFlights,
		maxFlights,
		seed,
		seed,
	)
	if err != nil {
		return [2]uuid.UUID{}, err
	}
	defer rows.Close()

	if !rows.Next() {
		return [2]uuid.UUID{}, fmt.Errorf("no connection found: %w", ErrNotFound)
	}

	var connection [2]uuid.UUID
	if err = rows.Scan(&connection[0], &connection[1]); err != nil {
		return [2]uuid.UUID{}, err
	}

	return connection, rows.Err()
}
