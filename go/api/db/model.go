package db

import (
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"time"
)

type Airline struct {
	Id       uuid.UUID
	Name     sql.NullString
	IataCode sql.NullString
	IcaoCode sql.NullString
}

type Airport struct {
	Id           uuid.UUID
	IataAreaCode sql.NullString
	CountryCode  sql.NullString
	CityCode     sql.NullString
	Type         sql.NullString
	Lng          sql.NullFloat64
	Lat          sql.NullFloat64
	Timezone     sql.NullString
	Name         sql.NullString
	IataCode     sql.NullString
	IcaoCode     sql.NullString
}

type Aircraft struct {
	Id             uuid.UUID
	EquipCode      sql.NullString
	Name           sql.NullString
	IataCode       sql.NullString
	IcaoCode       sql.NullString
	Configurations map[uuid.UUID][]string
}

type FlightNumber struct {
	AirlineId uuid.UUID
	Number    int
	Suffix    string
}

func (csfn *FlightNumber) Scan(src any) error {
	codeShareRaw, ok := src.(map[string]any)
	if !ok {
		return fmt.Errorf("FlightNumber.Scan: expected map[string]any, got %T", src)
	}

	var sqlNumber xsql.Int64
	var sqlString xsql.String

	if err := csfn.AirlineId.Scan(codeShareRaw["airline_id"]); err != nil {
		return err
	}

	if err := sqlNumber.Scan(codeShareRaw["number"]); err != nil {
		return err
	}

	if err := sqlString.Scan(codeShareRaw["suffix"]); err != nil {
		return err
	}

	csfn.Number = int(sqlNumber)
	csfn.Suffix = string(sqlString)

	return nil
}

type Flight struct {
	FlightNumber
	DepartureTime                time.Time
	DepartureAirportId           uuid.UUID
	ArrivalTime                  time.Time
	ArrivalAirportId             uuid.UUID
	ServiceType                  string
	AircraftOwner                string
	AircraftId                   uuid.UUID
	AircraftConfigurationVersion string
	AircraftRegistration         string
	CodeShares                   common.Set[FlightNumber]
}

type FlightSchedules struct {
	Items    []FlightScheduleItem
	Variants map[uuid.UUID]FlightScheduleVariant
}

type FlightScheduleItem struct {
	DepartureDateLocal xtime.LocalDate
	DepartureAirportId uuid.UUID
	FlightVariantId    sql.Null[uuid.UUID]
	Version            time.Time
	VersionCount       int
}

type FlightScheduleVariant struct {
	Id                           uuid.UUID
	OperatedAs                   FlightNumber
	DepartureTimeLocal           xtime.LocalTime
	DepartureUtcOffsetSeconds    int64
	DurationSeconds              int64
	ArrivalAirportId             uuid.UUID
	ArrivalUtcOffsetSeconds      int64
	ServiceType                  string
	AircraftOwner                string
	AircraftId                   uuid.UUID
	AircraftConfigurationVersion string
	AircraftRegistration         string
	CodeShares                   common.Set[FlightNumber]
}

type FlightScheduleVersions struct {
	Versions []FlightScheduleVersion
	Variants map[uuid.UUID]FlightScheduleVariant
}

type FlightScheduleVersion struct {
	Version         time.Time
	FlightVariantId sql.Null[uuid.UUID]
}
