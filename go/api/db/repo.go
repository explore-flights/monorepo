package db

import (
	"context"
	"database/sql"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"strings"
	"sync"
	"time"
)

type FlightRepo struct {
	db interface {
		Conn(ctx context.Context) (*sql.Conn, error)
	}
}

func NewFlightRepo(db *Database) *FlightRepo {
	return &FlightRepo{
		db: db,
	}
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
    ( SELECT identifier FROM aircraft_identifiers WHERE issuer = 'icao' AND aircraft_id = id )
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
		if err = rows.Scan(&ac.Id, &ac.EquipCode, &ac.Name, &ac.IataCode, &ac.IcaoCode); err != nil {
			return nil, err
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
