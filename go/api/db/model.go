package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xsql"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
)

type Airline struct {
	IataCode string
	IcaoCode sql.NullString
	Name     string
}

type Airport struct {
	IataCode     string
	IcaoCode     sql.NullString
	IataAreaCode sql.NullString
	CountryCode  string
	CityCode     string
	Type         string
	Lng          float64
	Lat          float64
	Timezone     string
	Name         string
}

type Aircraft struct {
	IataCode       string
	ParentIataCode sql.NullString
	IcaoCode       sql.NullString
	Wtc            sql.NullString
	EngineCount    sql.NullInt16
	EngineType     sql.NullString
	Name           string
	Configurations map[string][]string
	IsFamily       bool
}

type FlightNumber struct {
	AirlineIataCode string
	Number          int
	Suffix          string
}

func (csfn *FlightNumber) Scan(src any) error {
	codeShareRaw, ok := src.(map[string]any)
	if !ok {
		return fmt.Errorf("FlightNumber.Scan: expected map[string]any, got %T", src)
	}

	var sqlAirlineIataCode xsql.String
	var sqlNumber xsql.Int64
	var sqlString xsql.String

	if err := sqlAirlineIataCode.Scan(codeShareRaw["airline_iata_code"]); err != nil {
		return err
	}

	if err := sqlNumber.Scan(codeShareRaw["number"]); err != nil {
		return err
	}

	if err := sqlString.Scan(codeShareRaw["suffix"]); err != nil {
		return err
	}

	csfn.AirlineIataCode = string(sqlAirlineIataCode)
	csfn.Number = int(sqlNumber)
	csfn.Suffix = string(sqlString)

	return nil
}

type Flight struct {
	FlightNumber
	DepartureTime                time.Time
	DepartureAirportIataCode     string
	ArrivalTime                  time.Time
	ArrivalAirportIataCode       string
	ServiceType                  string
	AircraftOwner                string
	AircraftIataCode             string
	SeatsFirst                   int
	SeatsBusiness                int
	SeatsPremium                 int
	SeatsEconomy                 int
	AircraftConfigurationVersion string
	CodeShares                   common.Set[FlightNumber]
	DataElements                 map[int64]string
}

type FlightSchedules struct {
	Items    []FlightScheduleItem
	Variants map[uuid.UUID]FlightScheduleVariant
}

type FlightSchedulesMany struct {
	Schedules map[FlightNumber][]FlightScheduleItem
	Variants  map[uuid.UUID]FlightScheduleVariant
}

type FlightScheduleItem struct {
	DepartureDateLocal       xtime.LocalDate
	DepartureAirportIataCode string
	FlightVariantId          sql.Null[uuid.UUID]
	Version                  time.Time
	VersionCount             int
}

type FlightScheduleVariant struct {
	Id                           uuid.UUID
	OperatedAs                   FlightNumber
	DepartureTimeLocal           xtime.LocalTime
	DepartureUtcOffsetSeconds    int64
	DurationSeconds              int64
	ArrivalAirportIataCode       string
	ArrivalUtcOffsetSeconds      int64
	ServiceType                  string
	AircraftOwner                string
	AircraftIataCode             string
	SeatsFirst                   int
	SeatsBusiness                int
	SeatsPremium                 int
	SeatsEconomy                 int
	AircraftConfigurationVersion string
	CodeShares                   common.Set[FlightNumber]
	DataElements                 map[int64]string
}

type FlightScheduleVersions struct {
	Versions []FlightScheduleVersion
	Variants map[uuid.UUID]FlightScheduleVariant
}

type FlightScheduleVersion struct {
	Version         time.Time
	FlightVariantId sql.Null[uuid.UUID]
}

type FlightScheduleUpdate struct {
	FlightNumber
	DepartureDateLocal       xtime.LocalDate
	DepartureAirportIataCode string
	FlightVariantId          sql.Null[uuid.UUID]
}
