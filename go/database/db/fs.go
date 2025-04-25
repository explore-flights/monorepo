package db

import _ "embed"

//go:embed 11_load_raw_data.sql
var X11LoadRawData string

//go:embed 12_flatten_raw_data.sql
var X12FlattenRawData string

//go:embed 13_operating_flights.sql
var X13OperatingFlights string

//go:embed 14_insert_airlines.sql
var X14InsertAirlines string

//go:embed 15_insert_aircraft.sql
var X15InsertAircraft string

//go:embed 16_insert_flight_numbers.sql
var X16InsertFlightNumbers string

//go:embed 17_insert_flight_variants.sql
var X17InsertFlightVariants string

//go:embed 18_lh_flights_fresh.sql
var X18LhFlightsFresh string

//go:embed 19_insert_new_history.sql
var X19InsertNewHistory string

//go:embed 20_update_existing_history.sql
var X20UpdateExistingHistory string

//go:embed 21_create_removed_markers.sql
var X21CreateRemovedMarkers string

//go:embed 22_update_removed_markers.sql
var X22UpdateRemovedMarkers string
