package lufthansa

import (
	"encoding/json"
	"fmt"
	"reflect"
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

type Names []Name

func (n *Names) UnmarshalJSON(data []byte) error {
	var v struct {
		Name any `json:"Name"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}

	var names []any
	switch name := v.Name.(type) {
	case map[string]any:
		names = []any{name}
	case []any:
		names = name
	case nil:
		names = nil
	default:
		return fmt.Errorf("invalid type for name: %v (%v)", v.Name, reflect.TypeOf(v.Name))
	}

	for _, nEntry := range names {
		entry, ok := nEntry.(map[string]any)
		if !ok {
			return fmt.Errorf("invalid type for name entry: %v (%v)", nEntry, reflect.TypeOf(nEntry))
		}

		languageCode, ok := entry["@LanguageCode"].(string)
		if !ok {
			return fmt.Errorf("invalid type for Name.@LanguageCode: %v (%v)", entry["@LanguageCode"], reflect.TypeOf(entry["@LanguageCode"]))
		}

		name, ok := entry["$"].(string)
		if !ok {
			return fmt.Errorf("invalid type for Name.$: %v (%v)", entry["$"], reflect.TypeOf(entry["$"]))
		}

		*n = append(
			*n,
			Name{
				LanguageCode: languageCode,
				Name:         name,
			},
		)
	}

	return nil
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

type City struct {
	CountryCode string `json:"CountryCode"`
	CityCode    string `json:"CityCode"`
	Names       Names  `json:"Names"`
	UtcOffset   string `json:"UtcOffset"`
	TimeZoneId  string `json:"TimeZoneId"`
	Airports    Array[struct {
		AirportCode string `json:"AirportCode"`
	}] `json:"Airports"`
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
	case map[string]any:
		values = []any{v}
	case []any:
		values = v
	case nil:
		values = nil
	default:
		return nil, fmt.Errorf("invalid type: %v", reflect.TypeOf(v))
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
