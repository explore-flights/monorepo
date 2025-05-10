package db

import (
	"database/sql"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
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
	Id        uuid.UUID
	EquipCode sql.NullString
	Name      sql.NullString
	IataCode  sql.NullString
	IcaoCode  sql.NullString
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
