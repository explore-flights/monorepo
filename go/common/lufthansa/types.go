package lufthansa

import (
	"encoding/json"
)

type Coordinate struct {
	Latitude  float64 `json:"Latitude"`
	Longitude float64 `json:"Longitude"`
}

type Position struct {
	Coordinate Coordinate `json:"Coordinate"`
}

type Name struct {
	LanguageCode string
	Name         string
}

type Names struct {
	Name Array[Name] `json:"Name"`
}

type Airport struct {
	Code         string   `json:"AirportCode"`
	Position     Position `json:"Position"`
	CityCode     string   `json:"CityCode"`
	CountryCode  string   `json:"CountryCode"`
	LocationType string   `json:"LocationType"`
	Names        Names    `json:"Names"`
	UtcOffset    string   `json:"UtcOffset"`
	TimeZoneId   string   `json:"TimeZoneId"`
}

type Country struct {
	CountryCode string `json:"CountryCode"`
	Names       Names  `json:"Names"`
}

type Airports struct {
	AirportCode Array[string] `json:"AirportCode"`
}

type City struct {
	CountryCode string   `json:"CountryCode"`
	CityCode    string   `json:"CityCode"`
	Names       Names    `json:"Names"`
	UtcOffset   string   `json:"UtcOffset"`
	TimeZoneId  string   `json:"TimeZoneId"`
	Airports    Airports `json:"Airports"`
}

type Airline struct {
	AirlineId     string `json:"AirlineID"`
	AirlineIdICAO string `json:"AirlineID_ICAO"`
	Names         Names  `json:"Names"`
}

type Aircraft struct {
	AircraftCode     string `json:"AircraftCode"`
	Names            Names  `json:"Names"`
	AirlineEquipCode string `json:"AirlineEquipCode"`
}

type Array[T any] []T

func (a *Array[T]) UnmarshalJSON(data []byte) error {
	var err error
	*a, err = unmarshalArray[T](data)
	return err
}

func unmarshalArray[T any](data []byte) ([]T, error) {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}

	var values []any
	switch v := v.(type) {
	case []any:
		values = v
	case nil:
		values = nil
	default:
		values = []any{v}
	}

	s := make([]T, 0, len(values))
	for _, entry := range values {
		b, err := json.Marshal(entry)
		if err != nil {
			return nil, err
		}

		var value T
		if err = json.Unmarshal(b, &value); err != nil {
			return nil, err
		}

		s = append(s, value)
	}

	return s, nil
}
