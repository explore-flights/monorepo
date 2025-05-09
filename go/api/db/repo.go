package db

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"iter"
	"strings"
	"sync"
	"time"
)

type codeShareFlightNumber struct {
	AirlineId uuid.UUID
	Number    int
	Suffix    string
}

func (csfn *codeShareFlightNumber) Scan(src any) error {
	codeShareRaw, ok := src.(map[string]any)
	if !ok {
		return fmt.Errorf("codeShareFlightNumber.Scan: expected map[string]any, got %T", src)
	}

	var sqlNumber sql.NullInt64
	var sqlString sql.NullString

	if err := csfn.AirlineId.Scan(codeShareRaw["airline_id"]); err != nil {
		return err
	}

	if err := sqlNumber.Scan(codeShareRaw["number"]); err != nil {
		return err
	}

	if err := sqlString.Scan(codeShareRaw["suffix"]); err != nil {
		return err
	}

	csfn.Number = int(sqlNumber.Int64)
	csfn.Suffix = sqlString.String

	return nil
}

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

func (fr *FlightRepo) Flights(ctx context.Context, start, end xtime.LocalDate) (map[xtime.LocalDate][]*common.Flight, error) {
	airlines, err := fr.Airlines(ctx)
	if err != nil {
		return nil, err
	}

	var mtx sync.Mutex
	result := make(map[xtime.LocalDate][]*common.Flight)

	g, ctx := errgroup.WithContext(ctx)
	curr := start

	for curr <= end {
		d := curr
		g.Go(func() error {
			flights, err := fr.flightsInternal(ctx, d, airlines)
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
		var id uuid.UUID
		var name sql.NullString
		var iataCode sql.NullString
		var icaoCode sql.NullString
		if err = rows.Scan(&id, &name, &iataCode, &icaoCode); err != nil {
			return nil, err
		}

		airlines[id] = Airline{
			Name:     name.String,
			IataCode: iataCode.String,
			IcaoCode: icaoCode.String,
		}
	}

	return airlines, rows.Err()
}

func (fr *FlightRepo) flightsInternal(ctx context.Context, d xtime.LocalDate, airlines map[uuid.UUID]Airline) ([]*common.Flight, error) {
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
    airl_id.identifier,
    fvh.number,
    fvh.suffix,
    fvh.departure_timestamp_utc,
    fvh.departure_utc_offset_seconds,
    dep_airp_id.identifier,
    fvh.duration_seconds,
    fvh.arrival_utc_offset_seconds,
    arr_airp_id.identifier,
    fvh.service_type,
    fvh.aircraft_owner,
    airc_id.identifier,
    fvh.aircraft_configuration_version,
    fvh.aircraft_registration,
    fvh.code_shares
FROM flight_variant_history_latest fvh
INNER JOIN airline_identifiers airl_id
ON fvh.airline_id = airl_id.airline_id
INNER JOIN airport_identifiers dep_airp_id
ON fvh.departure_airport_id = dep_airp_id.airport_id
INNER JOIN airport_identifiers arr_airp_id
ON fvh.arrival_airport_id = arr_airp_id.airport_id
INNER JOIN aircraft_identifiers airc_id
ON fvh.aircraft_id = airc_id.aircraft_id
WHERE fvh.year_utc = ?
AND fvh.month_utc = ?
AND fvh.day_utc = ?
AND airl_id.issuer = 'iata'
AND dep_airp_id.issuer = 'iata'
AND arr_airp_id.issuer = 'iata'
AND airc_id.issuer = 'iata'
`,
		year,
		int(month),
		day,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	flights := make([]*common.Flight, 0)
	for rows.Next() {
		f := &common.Flight{}
		var departureUtcOffsetSeconds, arrivalUtcOffsetSeconds, durationSeconds int
		var codeShares xsql.SQLArray[codeShareFlightNumber, *codeShareFlightNumber]
		err = rows.Scan(
			&f.Airline,
			&f.FlightNumber,
			&f.Suffix,
			&f.DepartureTime,
			&departureUtcOffsetSeconds,
			&f.DepartureAirport,
			&durationSeconds,
			&arrivalUtcOffsetSeconds,
			&f.ArrivalAirport,
			&f.ServiceType,
			&f.AircraftOwner,
			&f.AircraftType,
			&f.AircraftConfigurationVersion,
			&f.Registration,
			&codeShares,
		)
		if err != nil {
			return nil, err
		}

		f.DepartureTime = f.DepartureTime.In(time.FixedZone("", departureUtcOffsetSeconds))
		f.ArrivalTime = f.DepartureTime.Add(time.Duration(durationSeconds) * time.Second)
		f.ArrivalTime = f.ArrivalTime.In(time.FixedZone("", arrivalUtcOffsetSeconds))
		f.CodeShares = make(map[common.FlightNumber]common.CodeShare)

		for _, codeShareFn := range codeShares {
			if airline, ok := airlines[codeShareFn.AirlineId]; ok && airline.IataCode != "" {
				f.CodeShares[common.FlightNumber{
					Airline: common.AirlineIdentifier(airline.IataCode),
					Number:  codeShareFn.Number,
					Suffix:  codeShareFn.Suffix,
				}] = common.CodeShare{}
			}
		}

		flights = append(flights, f)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return flights, rows.Err()
}

func queryWithIter[T any](ctx context.Context, conn *sql.Conn, query, placeholder string, seq iter.Seq[T]) (*sql.Rows, error) {
	placeholders := make([]string, 0)
	values := make([]any, 0)

	for v := range seq {
		placeholders = append(placeholders, "?")
		values = append(values, v)
	}

	query = strings.Replace(query, placeholder, strings.Join(placeholders, ","), 1)

	return conn.QueryContext(ctx, query, values...)
}
