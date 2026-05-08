package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"iter"
	"maps"
	"strings"
	"sync"
	"time"

	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xsync"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
)

var ErrNotFound = errors.New("not found")

type aircraftConfigurationsAdapter struct {
	AirlineIataCode string
	Configurations  xsql.SQLArray[xsql.String, *xsql.String]
}

func (a *aircraftConfigurationsAdapter) Scan(src any) error {
	configurationsRaw, ok := src.(map[string]any)
	if !ok {
		return fmt.Errorf("AircraftConfigurationsAdapter.Scan: expected map[string]any, got %T", src)
	}

	var airlineIataCode xsql.String
	var configurations xsql.SQLArray[xsql.String, *xsql.String]

	if err := airlineIataCode.Scan(configurationsRaw["airline_iata_code"]); err != nil {
		return err
	}

	if err := configurations.Scan(configurationsRaw["configurations"]); err != nil {
		return err
	}

	*a = aircraftConfigurationsAdapter{
		AirlineIataCode: string(airlineIataCode),
		Configurations:  configurations,
	}
	return nil
}

type flightRepoDatabase interface {
	Conn(ctx context.Context) (*sql.Conn, error)
}

type FlightRepo struct {
	db       flightRepoDatabase
	airlines *xsync.Preload[map[string]Airline]
	airports *xsync.Preload[map[string]Airport]
	aircraft *xsync.Preload[map[string]Aircraft]
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

func (fr *FlightRepo) Airlines(ctx context.Context) (map[string]Airline, error) {
	return fr.airlines.Value(ctx)
}

func (fr *FlightRepo) airlinesInternal() (map[string]Airline, error) {
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
    iata_code,
    icao_code,
    name
FROM airlines
`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	airlines := make(map[string]Airline)
	for rows.Next() {
		var airline Airline
		if err = rows.Scan(&airline.IataCode, &airline.IcaoCode, &airline.Name); err != nil {
			return nil, err
		}

		airlines[airline.IataCode] = airline
	}

	return airlines, rows.Err()
}

func (fr *FlightRepo) Airports(ctx context.Context) (map[string]Airport, error) {
	return fr.airports.Value(ctx)
}

func (fr *FlightRepo) airportsInternal() (map[string]Airport, error) {
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

	airports := make(map[string]Airport)
	for rows.Next() {
		var airport Airport
		err = rows.Scan(
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

		airports[airport.IataCode] = airport
	}

	return airports, rows.Err()
}

func (fr *FlightRepo) Aircraft(ctx context.Context) (map[string]Aircraft, error) {
	return fr.aircraft.Value(ctx)
}

func (fr *FlightRepo) aircraftInternal() (map[string]Aircraft, error) {
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
    iata_code,
    parent_iata_code,
    icao_code,
    wtc,
    engine_count,
    engine_type,
    name,
    COALESCE(
    	(
			SELECT ARRAY_AGG({'airline_iata_code': sub.operating_airline_iata_code, 'configurations': sub.aircraft_configuration_versions})
			FROM (
				SELECT
					fv.operating_airline_iata_code,
					COALESCE(ARRAY_AGG(DISTINCT fv.aircraft_configuration_version), []) AS aircraft_configuration_versions
				FROM flight_variants fv
				WHERE fv.aircraft_iata_code = ac.iata_code
				GROUP BY fv.operating_airline_iata_code
			) sub
		),
    	[]
    ),
    EXISTS( FROM aircraft ac_child WHERE ac_child.parent_iata_code = ac.iata_code )
FROM aircraft ac
`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	aircraft := make(map[string]Aircraft)
	for rows.Next() {
		var ac Aircraft
		var configurationsRaw xsql.SQLArray[aircraftConfigurationsAdapter, *aircraftConfigurationsAdapter]
		err = rows.Scan(
			&ac.IataCode,
			&ac.ParentIataCode,
			&ac.IcaoCode,
			&ac.Wtc,
			&ac.EngineCount,
			&ac.EngineType,
			&ac.Name,
			&configurationsRaw,
			&ac.IsFamily,
		)
		if err != nil {
			return nil, err
		}

		ac.Configurations = make(map[string][]string)
		for _, configurationRaw := range configurationsRaw {
			for _, v := range configurationRaw.Configurations {
				ac.Configurations[configurationRaw.AirlineIataCode] = append(ac.Configurations[configurationRaw.AirlineIataCode], string(v))
			}
		}

		aircraft[ac.IataCode] = ac
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
    sub.airline_iata_code,
    sub.number,
    sub.suffix
FROM (
	SELECT
		fn.airline_iata_code,
		fn.number,
		fn.suffix,
		MIN(
			CASE
			    WHEN UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)) = ? THEN 1
				WHEN airl.icao_code IS NOT NULL AND UPPER(CONCAT(airl.icao_code, fn.number, fn.suffix)) = ? THEN 2
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) = ? THEN 3
			    WHEN STARTS_WITH(UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)), ?) THEN 4
				WHEN airl.icao_code IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(airl.icao_code, fn.number, fn.suffix)), ?) THEN 5
			    WHEN airl.name IS NOT NULL AND STARTS_WITH(UPPER(CONCAT(airl.name, fn.number, fn.suffix)), ?) THEN 6
			    WHEN UPPER(CONCAT(airl.iata_code, fn.number, fn.suffix)) GLOB ? THEN 7
				WHEN airl.icao_code IS NOT NULL AND UPPER(CONCAT(airl.icao_code, fn.number, fn.suffix)) GLOB ? THEN 8
			    WHEN airl.name IS NOT NULL AND UPPER(CONCAT(airl.name, fn.number, fn.suffix)) GLOB ? THEN 9
				ELSE 100
			END
		) AS priority
	FROM flight_numbers fn
	INNER JOIN airlines airl
	ON fn.airline_iata_code = airl.iata_code
	GROUP BY fn.airline_iata_code, fn.number, fn.suffix
) sub
WHERE ? OR sub.priority < 100
ORDER BY sub.priority, sub.airline_iata_code ASC, sub.number ASC, sub.suffix ASC
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
		if err = rows.Scan(&flightNumber.AirlineIataCode, &flightNumber.Number, &flightNumber.Suffix); err != nil {
			return nil, err
		}

		results = append(results, flightNumber)
	}

	return results, rows.Err()
}

func (fr *FlightRepo) IterFlightNumbers(ctx context.Context, airlineIataCode string, outErr *error) iter.Seq2[FlightNumber, time.Time] {
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
    fn.airline_iata_code,
    fn.number,
    fn.suffix,
    MAX(fvh.created_at)
FROM flight_numbers fn
INNER JOIN flight_variant_history fvh
ON fn.airline_iata_code = fvh.airline_iata_code
AND fn.number = fvh.number
AND fn.suffix = fvh.suffix
WHERE fn.airline_iata_code = ?
AND fvh.airline_iata_code = ?
GROUP BY fn.airline_iata_code, fn.number, fn.suffix
ORDER BY fn.airline_iata_code ASC, fn.number ASC, fn.suffix ASC
`,
			airlineIataCode,
			airlineIataCode,
		)
		if err != nil {
			*outErr = err
			return
		}
		defer rows.Close()

		for rows.Next() {
			var flightNumber FlightNumber
			var maxCreatedAt time.Time
			if err = rows.Scan(&flightNumber.AirlineIataCode, &flightNumber.Number, &flightNumber.Suffix, &maxCreatedAt); err != nil {
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
	WHERE airline_iata_code = ?
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
SELECT DISTINCT rel_fvh.airline_iata_code, rel_fvh.number, rel_fvh.suffix
FROM related_flight_variant_history rel_fvh
INNER JOIN flight_variants rel_fv
ON rel_fvh.flight_variant_id = rel_fv.id
INNER JOIN (
	SELECT DISTINCT fvh.departure_airport_iata_code, fv.arrival_airport_iata_code
	FROM self_flight_variant_history fvh
	INNER JOIN flight_variants fv
	ON fvh.flight_variant_id = fv.id
) self
ON (
	( rel_fvh.departure_airport_iata_code = self.departure_airport_iata_code AND rel_fv.arrival_airport_iata_code = self.arrival_airport_iata_code )
	OR
	( rel_fvh.departure_airport_iata_code = self.arrival_airport_iata_code AND rel_fv.arrival_airport_iata_code = self.departure_airport_iata_code )
)
`,
		fn.AirlineIataCode,
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
		if err = rows.Scan(&flightNumber.AirlineIataCode, &flightNumber.Number, &flightNumber.Suffix); err != nil {
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
		departure_airport_iata_code,
		flight_variant_id,
		created_at
    FROM flight_variant_history
	WHERE airline_iata_code = ?
	AND number_mod_10 = (? % 10)
	AND number = ?
	AND suffix = ?
	AND created_at <= CAST(? AS TIMESTAMPTZ)
)
SELECT
    departure_date_local,
    departure_airport_iata_code,
    FIRST(flight_variant_id ORDER BY created_at DESC),
    FIRST(created_at ORDER BY created_at DESC),
    COUNT(DISTINCT created_at)
FROM filtered_flight_variant_history
GROUP BY departure_date_local, departure_airport_iata_code
ORDER BY departure_date_local ASC
`,
			fn.AirlineIataCode,
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
				&fsi.DepartureAirportIataCode,
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

func (fr *FlightRepo) FlightNumberUpdateReport(ctx context.Context, fn FlightNumber, version time.Time) ([]FlightNumberUpdateReportItem, error) {
	items := make([]FlightNumberUpdateReportItem, 0)
	return items, fr.flightNumberUpdateReport(
		ctx,
		[]SelectExpression{
			LiteralValueExpression("created_at"),
			AggregationValueExpression{
				Function: "SUM",
				Expr:     LiteralValueExpression("added"),
			},
			AggregationValueExpression{
				Function: "SUM",
				Expr:     LiteralValueExpression("updated"),
			},
			AggregationValueExpression{
				Function: "SUM",
				Expr:     LiteralValueExpression("removed"),
			},
		},
		AndCondition{
			BaseCondition{
				Filter: "airline_iata_code = ?",
				Params: []any{fn.AirlineIataCode},
			},
			BaseCondition{
				Filter: "number = ?",
				Params: []any{fn.Number},
			},
			BaseCondition{
				Filter: "suffix = ?",
				Params: []any{fn.Suffix},
			},
			BaseCondition{
				Filter: "created_at <= CAST(? AS TIMESTAMPTZ)",
				Params: []any{version.Format(time.RFC3339)},
			},
		},
		[]ValueExpression{
			LiteralValueExpression("airline_iata_code"),
			LiteralValueExpression("number"),
			LiteralValueExpression("suffix"),
			LiteralValueExpression("created_at"),
		},
		func(rows *sql.Rows) error {
			for rows.Next() {
				var ri FlightNumberUpdateReportItem
				if err := rows.Scan(&ri.Version, &ri.Added, &ri.Updated, &ri.Removed); err != nil {
					return err
				}

				items = append(items, ri)
			}

			return nil
		},
	)
}

func (fr *FlightRepo) flightNumberUpdateReport(ctx context.Context, selectFields []SelectExpression, filter Condition, groupBy []ValueExpression, scanner func(rows *sql.Rows) error) error {
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
FROM flight_number_update_report
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
    fvh.airline_iata_code,
    fvh.number,
    fvh.suffix,
    fvh.departure_date_local,
    fvh.departure_airport_iata_code,
    FIRST(fvh.flight_variant_id ORDER BY created_at DESC),
    FIRST(fvh.created_at ORDER BY created_at DESC),
    COUNT(*)
FROM flight_variant_history fvh
LEFT JOIN flight_variants fv
ON fvh.flight_variant_id = fv.id
WHERE %s
GROUP BY
	fvh.airline_iata_code,
	fvh.number,
	fvh.suffix,
	fvh.departure_date_local,
	fvh.departure_airport_iata_code
ORDER BY
    fvh.airline_iata_code ASC,
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
				&fn.AirlineIataCode,
				&fn.Number,
				&fn.Suffix,
				&fsi.DepartureDateLocal,
				&fsi.DepartureAirportIataCode,
				&fsi.FlightVariantId,
				&fsi.Version,
				&fsi.VersionCount,
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

func (fr *FlightRepo) FlightScheduleVersions(ctx context.Context, fn FlightNumber, departureAirportIataCode string, departureDate xtime.LocalDate) (FlightScheduleVersions, error) {
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
WHERE airline_iata_code = ?
AND number_mod_10 = (? % 10)
AND number = ?
AND suffix = ?
AND departure_airport_iata_code = ?
AND departure_date_local = ?
ORDER BY created_at ASC
`,
			fn.AirlineIataCode,
			fn.Number,
			fn.Number,
			fn.Suffix,
			departureAirportIataCode,
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
    operating_airline_iata_code,
    operating_number,
    operating_suffix,
    departure_time_local,
    departure_utc_offset_seconds,
    duration_seconds,
    arrival_airport_iata_code,
    arrival_utc_offset_seconds,
    service_type,
    aircraft_owner,
    aircraft_iata_code,
    seats_first,
    seats_business,
    seats_premium,
    seats_economy,
    aircraft_configuration_version,
    code_shares,
    data_elements
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
		var dataElements DuckDBMap[xsql.Int64, *xsql.Int64, xsql.String, *xsql.String]
		err = rows.Scan(
			&fsv.Id,
			&fsv.OperatedAs.AirlineIataCode,
			&fsv.OperatedAs.Number,
			&fsv.OperatedAs.Suffix,
			&fsv.DepartureTimeLocal,
			&fsv.DepartureUtcOffsetSeconds,
			&fsv.DurationSeconds,
			&fsv.ArrivalAirportIataCode,
			&fsv.ArrivalUtcOffsetSeconds,
			&fsv.ServiceType,
			&fsv.AircraftOwner,
			&fsv.AircraftIataCode,
			&fsv.SeatsFirst,
			&fsv.SeatsBusiness,
			&fsv.SeatsPremium,
			&fsv.SeatsEconomy,
			&fsv.AircraftConfigurationVersion,
			&codeShares,
			&dataElements,
		)
		if err != nil {
			return nil, err
		}

		if variantIds.Remove(fsv.Id) {
			fsv.CodeShares = make(common.Set[FlightNumber])
			for _, codeShareFn := range codeShares {
				fsv.CodeShares.Add(codeShareFn)
			}

			fsv.DataElements = make(map[int64]string)
			for k, v := range dataElements {
				fsv.DataElements[int64(k)] = string(v)
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
    airline_iata_code,
    number,
    suffix,
    departure_timestamp_utc,
    departure_utc_offset_seconds,
    departure_airport_iata_code,
    duration_seconds,
    arrival_utc_offset_seconds,
    arrival_airport_iata_code,
    service_type,
    aircraft_owner,
    aircraft_iata_code,
    seats_first,
    seats_business,
    seats_premium,
    seats_economy,
    aircraft_configuration_version,
    code_shares,
    data_elements
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
		var dataElements DuckDBMap[xsql.Int64, *xsql.Int64, xsql.String, *xsql.String]
		err = rows.Scan(
			&f.AirlineIataCode,
			&f.Number,
			&f.Suffix,
			&f.DepartureTime,
			&departureUtcOffsetSeconds,
			&f.DepartureAirportIataCode,
			&durationSeconds,
			&arrivalUtcOffsetSeconds,
			&f.ArrivalAirportIataCode,
			&f.ServiceType,
			&f.AircraftOwner,
			&f.AircraftIataCode,
			&f.SeatsFirst,
			&f.SeatsBusiness,
			&f.SeatsPremium,
			&f.SeatsEconomy,
			&f.AircraftConfigurationVersion,
			&codeShares,
			&dataElements,
		)
		if err != nil {
			return nil, err
		}

		f.DepartureTime = f.DepartureTime.In(time.FixedZone("", departureUtcOffsetSeconds))
		f.ArrivalTime = f.DepartureTime.Add(time.Duration(durationSeconds) * time.Second)
		f.ArrivalTime = f.ArrivalTime.In(time.FixedZone("", arrivalUtcOffsetSeconds))
		f.CodeShares = make(common.Set[FlightNumber])
		f.DataElements = make(map[int64]string)

		for _, codeShareFn := range codeShares {
			f.CodeShares.Add(codeShareFn)
		}

		for k, v := range dataElements {
			f.DataElements[int64(k)] = string(v)
		}

		flights = append(flights, f)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return flights, rows.Err()
}

func (fr *FlightRepo) UpdatesForVersion(ctx context.Context, version time.Time, page int) ([]FlightScheduleUpdate, error) {
	const limit = 10_000

	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT DISTINCT
    base.airline_iata_code,
    base.number,
    base.suffix,
    base.departure_date_local,
    base.departure_airport_iata_code,
    base.flight_variant_id
FROM flight_variant_history base
WHERE base.created_at >= ?
AND base.created_at <= ?
AND EXISTS(
    FROM flight_variant_history prev
	WHERE base.airline_iata_code = prev.airline_iata_code
	AND base.number = prev.number
	AND base.suffix = prev.suffix
	AND base.departure_date_local = prev.departure_date_local
	AND base.departure_airport_iata_code = prev.departure_airport_iata_code
	AND base.created_at = prev.replaced_at
)
ORDER BY
    base.airline_iata_code,
    base.number,
    base.suffix,
    base.departure_date_local,
    base.departure_airport_iata_code,
    base.flight_variant_id
LIMIT ?
OFFSET ?
`,
		version.Format(time.RFC3339),
		version.Format(time.RFC3339),
		limit,
		limit*page,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	updates := make([]FlightScheduleUpdate, 0)
	for rows.Next() {
		var update FlightScheduleUpdate
		if err := rows.Scan(&update.AirlineIataCode, &update.Number, &update.Suffix, &update.DepartureDateLocal, &update.DepartureAirportIataCode, &update.FlightVariantId); err != nil {
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
ON r.aircraft_iata_code = ac.iata_code
LEFT JOIN aircraft acp
ON ac.parent_iata_code = acp.iata_code
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

func (fr *FlightRepo) FindConnection(ctx context.Context, minFlights, maxFlights int, seed string) ([2]string, error) {
	conn, err := fr.db.Conn(ctx)
	if err != nil {
		return [2]string{}, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`
SELECT departure_airport_iata_code, arrival_airport_iata_code
FROM connections
WHERE min_flights >= ?
AND min_flights <= ?
ORDER BY (
    GREATEST(MD5_NUMBER(CONCAT(departure_airport_iata_code, arrival_airport_iata_code)), MD5_NUMBER(?))
    -
    LEAST(MD5_NUMBER(CONCAT(departure_airport_iata_code, arrival_airport_iata_code)), MD5_NUMBER(?))
)
LIMIT 1
`,
		minFlights,
		maxFlights,
		seed,
		seed,
	)
	if err != nil {
		return [2]string{}, err
	}
	defer rows.Close()

	if !rows.Next() {
		return [2]string{}, fmt.Errorf("no connection found: %w", ErrNotFound)
	}

	var connection [2]string
	if err = rows.Scan(&connection[0], &connection[1]); err != nil {
		return [2]string{}, err
	}

	return connection, rows.Err()
}
