-- region airlines
CREATE TABLE airlines (
    code TEXT NOT NULL,
    PRIMARY KEY (code)
) ;

CREATE TABLE airline_data (
    id UUID NOT NULL,
    iata TEXT NOT NULL,
    icao TEXT,
    name TEXT NOT NULL,
    PRIMARY KEY (id)
) ;

CREATE TABLE airline_lookup (
    airline_code TEXT NOT NULL,
    airline_data_id UUID NOT NULL,
    priority USMALLINT NOT NULL,
    PRIMARY KEY (airline_code, airline_data_id),
    FOREIGN KEY (airline_code) REFERENCES airlines (code),
    FOREIGN KEY (airline_data_id) REFERENCES airline_data (id)
) ;
-- endregion
-- region airports
CREATE TABLE iata_area_codes (
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (code)
) ;

CREATE TABLE airports (
    iata TEXT NOT NULL,
    icao TEXT,
    iata_area_code TEXT,
    country_code TEXT NOT NULL,
    city_code TEXT NOT NULL,
    type TEXT NOT NULL,
    lng DOUBLE NOT NULL,
    lat DOUBLE NOT NULL,
    timezone TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (iata),
    FOREIGN KEY (iata_area_code) REFERENCES iata_area_codes (code)
) ;
-- endregion
-- region aircraft
CREATE TABLE aircraft (
    code TEXT NOT NULL,
    PRIMARY KEY (code)
) ;

CREATE TABLE aircraft_data (
    id UUID NOT NULL,
    iata TEXT NOT NULL,
    icao TEXT,
    equip_code TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (id)
) ;

CREATE TABLE aircraft_lookup (
    aircraft_code TEXT NOT NULL,
    aircraft_data_id UUID NOT NULL,
    priority USMALLINT NOT NULL,
    PRIMARY KEY (aircraft_code, aircraft_data_id),
    FOREIGN KEY (aircraft_code) REFERENCES aircraft (code),
    FOREIGN KEY (aircraft_data_id) REFERENCES aircraft_data (id)
) ;
-- endregion
-- region data
CREATE TABLE flight_numbers (
    airline TEXT NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    PRIMARY KEY (airline, number, suffix),
    FOREIGN KEY (airline) REFERENCES airlines (code)
) ;

CREATE TABLE flight_variants (
    id UUID NOT NULL,
    operating_airline TEXT NOT NULL,
    operating_number USMALLINT NOT NULL,
    operating_suffix TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    departure_time_local TIME NOT NULL,
    departure_utc_offset_seconds INT NOT NULL,
    duration_seconds UINTEGER NOT NULL,
    arrival_airport TEXT NOT NULL,
    arrival_utc_offset_seconds INT NOT NULL,
    service_type TEXT NOT NULL,
    aircraft_owner TEXT NOT NULL,
    aircraft_type TEXT NOT NULL,
    aircraft_configuration_version TEXT NOT NULL,
    aircraft_registration TEXT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (
        operating_airline,
        operating_number,
        operating_suffix,
        departure_airport,
        departure_time_local,
        departure_utc_offset_seconds,
        duration_seconds,
        arrival_airport,
        arrival_utc_offset_seconds,
        service_type,
        aircraft_owner,
        aircraft_type,
        aircraft_configuration_version,
        aircraft_registration
    ),
    FOREIGN KEY (operating_airline, operating_number, operating_suffix) REFERENCES flight_numbers (airline, number, suffix),
    FOREIGN KEY (operating_airline) REFERENCES airlines (code),
    FOREIGN KEY (departure_airport) REFERENCES airports (iata),
    FOREIGN KEY (arrival_airport) REFERENCES airports (iata),
    FOREIGN KEY (aircraft_type) REFERENCES aircraft (code)
) ;

CREATE TABLE flight_variant_history (
    airline TEXT NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    departure_date_local DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    query_dates DATE[] NOT NULL,
    flight_variant_id UUID,
    PRIMARY KEY (airline, number, suffix, departure_airport, departure_date_local, created_at),
    FOREIGN KEY (airline, number, suffix) REFERENCES flight_numbers (airline, number, suffix),
    FOREIGN KEY (flight_variant_id) REFERENCES flight_variants (id),
    FOREIGN KEY (airline) REFERENCES airlines (code),
    FOREIGN KEY (departure_airport) REFERENCES airports (iata)
) ;
-- endregion