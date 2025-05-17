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

//go:embed 15_insert_airports.sql
var X15InsertAirports string

//go:embed 16_insert_aircraft.sql
var X16InsertAircraft string

//go:embed 17_insert_flight_numbers.sql
var X17InsertFlightNumbers string

//go:embed 18_operating_flights_with_cs.sql
var X18OperatingFlightsWithCs string

//go:embed 19_insert_flight_variants.sql
var X19InsertFlightVariants string

//go:embed 20_lh_flights_fresh.sql
var X20LhFlightsFresh string

//go:embed 21_update_history.sql
var X21UpdateHistory string

//go:embed 22_create_removed_markers.sql
var X22CreateRemovedMarkers string
