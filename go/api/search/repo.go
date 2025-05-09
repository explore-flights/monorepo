package search

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"
	"iter"
	"maps"
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

func NewFlightRepo(db *db.Database) *FlightRepo {
	return &FlightRepo{
		db: db,
	}
}

func (fr *FlightRepo) Flights(ctx context.Context, start, end xtime.LocalDate) (map[xtime.LocalDate][]*common.Flight, error) {
	var mtx sync.Mutex
	result := make(map[xtime.LocalDate][]*common.Flight)

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

func (fr *FlightRepo) flightsInternal(ctx context.Context, d xtime.LocalDate) ([]*common.Flight, error) {
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
	postProcessAirlineIds := make(map[uuid.UUID][]common.Tuple[*common.Flight, codeShareFlightNumber])
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

		for _, codeShareFn := range codeShares {
			postProcess := common.Tuple[*common.Flight, codeShareFlightNumber]{
				V1: f,
				V2: codeShareFn,
			}

			postProcessAirlineIds[codeShareFn.AirlineId] = append(postProcessAirlineIds[codeShareFn.AirlineId], postProcess)
		}

		flights = append(flights, f)
	}

	_ = rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}

	if len(postProcessAirlineIds) > 0 {
		rows, err = queryWithIter(
			ctx,
			conn,
			`SELECT airline_id, identifier FROM airline_identifiers WHERE issuer = 'iata' AND airline_id IN (:airline_id)`,
			":airline_id",
			maps.Keys(postProcessAirlineIds),
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var airlineId uuid.UUID
			var airlineCodeIata string
			if err = rows.Scan(&airlineId, &airlineCodeIata); err != nil {
				return nil, err
			}

			for _, tp := range postProcessAirlineIds[airlineId] {
				if tp.V1.CodeShares == nil {
					tp.V1.CodeShares = make(map[common.FlightNumber]common.CodeShare)
				}

				tp.V1.CodeShares[common.FlightNumber{
					Airline: common.AirlineIdentifier(airlineCodeIata),
					Number:  tp.V2.Number,
					Suffix:  tp.V2.Suffix,
				}] = common.CodeShare{}
			}
		}

		if err = rows.Err(); err != nil {
			return nil, err
		}
	}

	return flights, nil
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
