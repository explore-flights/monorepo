package model

import (
	"encoding/json"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/gofrs/uuid/v5"
	"iter"
)

type FlightNumber struct {
	AirlineId UUID   `json:"airlineId"`
	Number    int    `json:"number"`
	Suffix    string `json:"suffix,omitempty"`
}

func FlightNumberFromDb(fn db.FlightNumber) FlightNumber {
	return FlightNumber{
		AirlineId: UUID(fn.AirlineId),
		Number:    fn.Number,
		Suffix:    fn.Suffix,
	}
}

type Airline struct {
	Id       UUID   `json:"id"`
	IataCode string `json:"iataCode"`
	IcaoCode string `json:"icaoCode,omitempty"`
	Name     string `json:"name"`
}

func AirlineFromDb(airline db.Airline) Airline {
	return Airline{
		Id:       UUID(airline.Id),
		IataCode: airline.IataCode,
		IcaoCode: airline.IcaoCode.String,
		Name:     airline.Name.String,
	}
}

type GeoLocation struct {
	Lng float64 `json:"lng"`
	Lat float64 `json:"lat"`
}

type Airport struct {
	Id           UUID         `json:"id"`
	IataCode     string       `json:"iataCode"`
	IcaoCode     string       `json:"icaoCode,omitempty"`
	IataAreaCode string       `json:"iataAreaCode,omitempty"`
	CountryCode  string       `json:"countryCode,omitempty"`
	CityCode     string       `json:"cityCode,omitempty"`
	Type         string       `json:"type,omitempty"`
	Location     *GeoLocation `json:"location,omitempty"`
	Timezone     string       `json:"timezone,omitempty"`
	Name         string       `json:"name,omitempty"`
}

func AirportFromDb(airport db.Airport) Airport {
	var location *GeoLocation
	if airport.Lng.Valid && airport.Lat.Valid {
		location = &GeoLocation{
			Lng: airport.Lng.Float64,
			Lat: airport.Lat.Float64,
		}
	}

	return Airport{
		Id:           UUID(airport.Id),
		IataCode:     airport.IataCode,
		IcaoCode:     airport.IcaoCode.String,
		IataAreaCode: airport.IataAreaCode.String,
		CountryCode:  airport.CountryCode.String,
		CityCode:     airport.CityCode.String,
		Type:         airport.Type.String,
		Location:     location,
		Timezone:     airport.Timezone.String,
		Name:         airport.Name.String,
	}
}

type Aircraft struct {
	Id UUID
	*AircraftType
	*AircraftFamily
	Configurations map[UUID][]string
}

func (ac Aircraft) MarshalJSON() ([]byte, error) {
	v := map[string]any{
		"id":             ac.Id,
		"configurations": ac.Configurations,
	}

	if ac.AircraftType != nil {
		v["type"] = "aircraft"
		v["iataCode"] = ac.AircraftType.IataCode
		v["name"] = ac.AircraftType.Name

		if ac.AircraftType.ParentFamilyId != nil {
			v["parentFamilyId"] = *ac.AircraftType.ParentFamilyId
		}

		if ac.AircraftType.IcaoCode != "" {
			v["icaoCode"] = ac.AircraftType.IcaoCode
		}
	} else if ac.AircraftFamily != nil {
		v["type"] = "family"
		v["name"] = ac.AircraftFamily.Name

		if ac.AircraftFamily.ParentFamilyId != nil {
			v["parentFamilyId"] = *ac.AircraftFamily.ParentFamilyId
		}

		if ac.AircraftFamily.IataCode != "" {
			v["iataCode"] = ac.AircraftFamily.IataCode
		}
	} else {
		v["type"] = "unmapped"
	}

	return json.Marshal(v)
}

func (ac Aircraft) Name() string {
	if ac.AircraftType != nil {
		return ac.AircraftType.Name
	} else if ac.AircraftFamily != nil {
		return ac.AircraftFamily.Name
	}

	return ""
}

func (ac Aircraft) IataCode() string {
	if ac.AircraftType != nil {
		return ac.AircraftType.IataCode
	} else if ac.AircraftFamily != nil {
		return ac.AircraftFamily.IataCode
	}

	return ""
}

type AircraftType struct {
	ParentFamilyId *UUID  `json:"parentFamilyId,omitempty"`
	IataCode       string `json:"iataCode"`
	IcaoCode       string `json:"icaoCode,omitempty"`
	Name           string `json:"name"`
}

type AircraftFamily struct {
	ParentFamilyId *UUID  `json:"parentFamilyId,omitempty"`
	IataCode       string `json:"iataCode,omitempty"`
	Name           string `json:"name"`
}

func AircraftFromDb(dbAc db.Aircraft) Aircraft {
	configurations := make(map[UUID][]string)
	for airlineId, configs := range dbAc.Configurations {
		configurations[UUID(airlineId)] = configs
	}

	ac := Aircraft{
		Id:             UUID(dbAc.Id),
		Configurations: configurations,
	}

	switch dbAc.Type {
	case db.AircraftTypeAircraft:
		var parentFamilyId *UUID
		if dbAc.ParentFamilyId.Valid {
			id := UUID(dbAc.ParentFamilyId.V)
			parentFamilyId = &id
		}

		ac.AircraftType = &AircraftType{
			ParentFamilyId: parentFamilyId,
			IataCode:       dbAc.IataCode.String,
			IcaoCode:       dbAc.IcaoCode.String,
			Name:           dbAc.Name.String,
		}

	case db.AircraftTypeFamily:
		var parentFamilyId *UUID
		if dbAc.ParentFamilyId.Valid {
			id := UUID(dbAc.ParentFamilyId.V)
			parentFamilyId = &id
		}

		ac.AircraftFamily = &AircraftFamily{
			ParentFamilyId: parentFamilyId,
			IataCode:       dbAc.IataCode.String,
			Name:           dbAc.Name.String,
		}
	}

	return ac
}

func AddReferencedAircraft(referencedAircraft iter.Seq[uuid.UUID], aircraft map[uuid.UUID]db.Aircraft, dst map[UUID]Aircraft) {
	for aircraftId := range referencedAircraft {
		outId := UUID(aircraftId)
		if _, ok := dst[outId]; !ok {
			ac := aircraft[aircraftId]
			dst[outId] = AircraftFromDb(ac)

			if ac.ParentFamilyId.Valid {
				AddReferencedAircraft(xiter.Single(ac.ParentFamilyId.V), aircraft, dst)
			}
		}
	}
}
