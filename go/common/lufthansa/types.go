package lufthansa

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
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

func (n *Name) UnmarshalJSON(b []byte) error {
	var v map[string]string
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}

	n.LanguageCode = v["@LanguageCode"]
	n.Name = v["$"]

	return nil
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
	var values []T
	if err1 := json.Unmarshal(data, &values); err1 != nil {
		var single T
		if err2 := json.Unmarshal(data, &single); err2 != nil {
			return fmt.Errorf("failed to unmarshal lufthansa.Array: %w", errors.Join(err1, err2))
		}

		values = []T{single}
	}

	if values == nil {
		values = make([]T, 0)
	}

	*a = values

	return nil
}

type JsonStrAsInt int

func (v *JsonStrAsInt) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}

	i, err := strconv.Atoi(s)
	if err != nil {
		return err
	}

	*v = JsonStrAsInt(i)
	return nil
}

func (v JsonStrAsInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(strconv.Itoa(int(v)))
}

type Code string

func (v *Code) UnmarshalJSON(data []byte) error {
	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	*v = Code(raw["Code"])
	return nil
}

func (v Code) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{"Code": string(v)})
}
