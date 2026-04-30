package data

import (
	_ "embed"
	"encoding/json"
)

//go:embed configurations.json
var configurationsRawJson []byte
var aircraftConfigurations map[string]map[string]map[string]AircraftConfigurationNames

type AircraftConfigurationNames struct {
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
}

func init() {
	err := json.Unmarshal(configurationsRawJson, &aircraftConfigurations)
	if err != nil {
		panic("failed to unmarshal aircraft configurations: " + err.Error())
	}
}

func AircraftConfigurationName(airlineIataCode, aircraftIataCode, configuration string) (AircraftConfigurationNames, bool) {
	namesByAircraft, ok := aircraftConfigurations[airlineIataCode]
	if !ok {
		return AircraftConfigurationNames{}, false
	}

	namesByConfiguration, ok := namesByAircraft[aircraftIataCode]
	if !ok {
		return AircraftConfigurationNames{}, false
	}

	name, ok := namesByConfiguration[configuration]
	if !ok {
		return AircraftConfigurationNames{}, false
	}

	return name, true
}
