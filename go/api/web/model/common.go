package model

import (
	"encoding/json"
	"errors"
	"iter"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xiter"
)

type FlightNumber struct {
	AirlineIataCode string `json:"airlineId"`
	Number          int    `json:"number"`
	Suffix          string `json:"suffix,omitempty"`
}

func FlightNumberFromDb(fn db.FlightNumber) FlightNumber {
	return FlightNumber{
		AirlineIataCode: fn.AirlineIataCode,
		Number:          fn.Number,
		Suffix:          fn.Suffix,
	}
}

type Airline struct {
	Id       string `json:"id"`
	IataCode string `json:"iataCode"`
	IcaoCode string `json:"icaoCode,omitempty"`
	Name     string `json:"name"`
}

func AirlineFromDb(airline db.Airline) Airline {
	return Airline{
		Id:       airline.IataCode,
		IataCode: airline.IataCode,
		IcaoCode: airline.IcaoCode.String,
		Name:     airline.Name,
	}
}

type GeoLocation struct {
	Lng float64 `json:"lng"`
	Lat float64 `json:"lat"`
}

type Airport struct {
	Id           string      `json:"id"`
	IataCode     string      `json:"iataCode"`
	IcaoCode     string      `json:"icaoCode,omitempty"`
	IataAreaCode string      `json:"iataAreaCode,omitempty"`
	CountryCode  string      `json:"countryCode"`
	CityCode     string      `json:"cityCode"`
	Type         string      `json:"type"`
	Location     GeoLocation `json:"location"`
	Timezone     string      `json:"timezone"`
	Name         string      `json:"name"`
}

func AirportFromDb(airport db.Airport) Airport {
	return Airport{
		Id:           airport.IataCode,
		IataCode:     airport.IataCode,
		IcaoCode:     airport.IcaoCode.String,
		IataAreaCode: airport.IataAreaCode.String,
		CountryCode:  airport.CountryCode,
		CityCode:     airport.CityCode,
		Type:         airport.Type,
		Location: GeoLocation{
			Lng: airport.Lng,
			Lat: airport.Lat,
		},
		Timezone: airport.Timezone,
		Name:     airport.Name,
	}
}

type Aircraft struct {
	Id string
	*AircraftType
	*AircraftFamily
	Configurations map[string][]string
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
		v["iataCode"] = ac.AircraftFamily.IataCode
		v["name"] = ac.AircraftFamily.Name

		if ac.AircraftFamily.ParentFamilyId != nil {
			v["parentFamilyId"] = *ac.AircraftFamily.ParentFamilyId
		}
	} else {
		return nil, errors.New("aircraft has neither aircraft type nor aircraft family")
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
	ParentFamilyId *string `json:"parentFamilyId,omitempty"`
	IataCode       string  `json:"iataCode"`
	IcaoCode       string  `json:"icaoCode,omitempty"`
	Name           string  `json:"name"`
}

type AircraftFamily struct {
	ParentFamilyId *string `json:"parentFamilyId,omitempty"`
	IataCode       string  `json:"iataCode"`
	Name           string  `json:"name"`
}

func AircraftFromDb(dbAc db.Aircraft) Aircraft {
	configurations := make(map[string][]string)
	for airlineIataCode, configs := range dbAc.Configurations {
		configurations[airlineIataCode] = configs
	}

	ac := Aircraft{
		Id:             dbAc.IataCode,
		Configurations: configurations,
	}

	var parentFamilyId *string
	if dbAc.ParentIataCode.Valid {
		id := dbAc.ParentIataCode.String
		parentFamilyId = &id
	}

	if dbAc.IsFamily {
		ac.AircraftFamily = &AircraftFamily{
			ParentFamilyId: parentFamilyId,
			IataCode:       dbAc.IataCode,
			Name:           dbAc.Name,
		}
	} else {
		ac.AircraftType = &AircraftType{
			ParentFamilyId: parentFamilyId,
			IataCode:       dbAc.IataCode,
			IcaoCode:       dbAc.IcaoCode.String,
			Name:           dbAc.Name,
		}
	}

	return ac
}

func AddReferencedAircraft(referencedAircraft iter.Seq[string], aircraft map[string]db.Aircraft, dst map[string]Aircraft) {
	for aircraftIataCode := range referencedAircraft {
		if _, ok := dst[aircraftIataCode]; !ok {
			ac := aircraft[aircraftIataCode]
			dst[aircraftIataCode] = AircraftFromDb(ac)

			if ac.ParentIataCode.Valid {
				AddReferencedAircraft(xiter.Single(ac.ParentIataCode.String), aircraft, dst)
			}
		}
	}
}
