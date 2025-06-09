package model

import "github.com/explore-flights/monorepo/go/api/db"

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
	Id             UUID              `json:"id"`
	EquipCode      string            `json:"equipCode,omitempty"`
	Name           string            `json:"name,omitempty"`
	IataCode       string            `json:"iataCode,omitempty"`
	IcaoCode       string            `json:"icaoCode,omitempty"`
	Configurations map[UUID][]string `json:"configurations"`
}

func AircraftFromDb(ac db.Aircraft) Aircraft {
	configurations := make(map[UUID][]string)
	for airlineId, configs := range ac.Configurations {
		configurations[UUID(airlineId)] = configs
	}

	return Aircraft{
		Id:             UUID(ac.Id),
		EquipCode:      ac.EquipCode.String,
		Name:           ac.Name.String,
		IataCode:       ac.IataCode.String,
		IcaoCode:       ac.IcaoCode.String,
		Configurations: configurations,
	}
}
