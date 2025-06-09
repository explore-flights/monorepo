-- region airlines
CREATE TABLE IF NOT EXISTS airlines (
    id UUID NOT NULL,
    lh_api_id TEXT NOT NULL,
    iata_code TEXT NOT NULL,
    name TEXT,
    PRIMARY KEY (id),
    UNIQUE (lh_api_id),
    UNIQUE (iata_code),
    CHECK ( LENGTH(iata_code) = 2 )
) ;

CREATE TABLE IF NOT EXISTS airline_icao_codes (
    icao_code TEXT NOT NULL,
    airline_id UUID NOT NULL,
    PRIMARY KEY (icao_code),
    FOREIGN KEY (airline_id) REFERENCES airlines (id),
    CHECK ( LENGTH(icao_code) = 3 )
) ;
-- endregion
-- region airports
CREATE TABLE IF NOT EXISTS airports (
    id UUID NOT NULL,
    lh_api_id TEXT NOT NULL,
    iata_code TEXT NOT NULL,
    icao_code TEXT,
    iata_area_code TEXT,
    country_code TEXT,
    city_code TEXT,
    type TEXT,
    lng DOUBLE,
    lat DOUBLE,
    timezone TEXT,
    name TEXT,
    PRIMARY KEY (id),
    UNIQUE (lh_api_id),
    UNIQUE (iata_code),
    CHECK ( LENGTH(iata_code) = 3 ),
    CHECK ( iata_area_code IS NULL OR LENGTH(iata_area_code) = 3 ),
    CHECK ( icao_code IS NULL OR LENGTH(icao_code) = 4 )
) ;
-- endregion
-- region aircraft
CREATE TABLE IF NOT EXISTS aircraft (
    id UUID NOT NULL,
    equip_code TEXT,
    name TEXT,
    PRIMARY KEY (id)
) ;

CREATE TABLE IF NOT EXISTS aircraft_identifiers (
    issuer TEXT NOT NULL,
    identifier TEXT NOT NULL,
    aircraft_id UUID NOT NULL,
    PRIMARY KEY (issuer, identifier),
    FOREIGN KEY (aircraft_id) REFERENCES aircraft (id)
) ;
-- endregion
-- region data
CREATE TABLE IF NOT EXISTS flight_numbers (
    airline_id UUID NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    PRIMARY KEY (airline_id, number, suffix),
    FOREIGN KEY (airline_id) REFERENCES airlines (id)
) ;

CREATE TABLE IF NOT EXISTS flight_variants (
    id UUID NOT NULL,
    operating_airline_id UUID NOT NULL,
    operating_number USMALLINT NOT NULL,
    operating_suffix TEXT NOT NULL,
    departure_airport_id UUID NOT NULL,
    departure_time_local TIME NOT NULL,
    departure_utc_offset_seconds INT NOT NULL,
    duration_seconds UINTEGER NOT NULL,
    arrival_airport_id UUID NOT NULL,
    arrival_utc_offset_seconds INT NOT NULL,
    service_type TEXT NOT NULL,
    aircraft_owner TEXT NOT NULL,
    aircraft_id UUID NOT NULL,
    aircraft_configuration_version TEXT NOT NULL,
    aircraft_registration TEXT NOT NULL,
    code_shares_hash UHUGEINT NOT NULL,
    code_shares STRUCT(airline_id UUID, number USMALLINT, suffix TEXT)[] NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (
        operating_airline_id,
        operating_number,
        operating_suffix,
        departure_airport_id,
        departure_time_local,
        departure_utc_offset_seconds,
        duration_seconds,
        arrival_airport_id,
        arrival_utc_offset_seconds,
        service_type,
        aircraft_owner,
        aircraft_id,
        aircraft_configuration_version,
        aircraft_registration,
        code_shares_hash
    ),
    -- code_shares must be distinct and sorted (effectively a set) and match the provided hash
    CHECK ( TO_JSON(code_shares) = TO_JSON(LIST_SORT(LIST_DISTINCT(code_shares))) AND MD5_NUMBER(TO_JSON(code_shares)) = code_shares_hash ),
    FOREIGN KEY (operating_airline_id, operating_number, operating_suffix) REFERENCES flight_numbers (airline_id, number, suffix),
    FOREIGN KEY (operating_airline_id) REFERENCES airlines (id),
    FOREIGN KEY (departure_airport_id) REFERENCES airports (id),
    FOREIGN KEY (arrival_airport_id) REFERENCES airports (id),
    FOREIGN KEY (aircraft_id) REFERENCES aircraft (id)
) ;

CREATE TABLE IF NOT EXISTS flight_variant_history (
    airline_id UUID NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    departure_airport_id UUID NOT NULL,
    departure_date_local DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    replaced_at TIMESTAMPTZ,
    query_dates DATE[] NOT NULL,
    is_derived BOOL NOT NULL,
    flight_variant_id UUID,
    PRIMARY KEY (airline_id, number, suffix, departure_airport_id, departure_date_local, created_at),
    UNIQUE (airline_id, number, suffix, departure_airport_id, departure_date_local, replaced_at),
    FOREIGN KEY (airline_id) REFERENCES airlines (id),
    FOREIGN KEY (airline_id, number, suffix) REFERENCES flight_numbers (airline_id, number, suffix),
    FOREIGN KEY (flight_variant_id) REFERENCES flight_variants (id),
    FOREIGN KEY (departure_airport_id) REFERENCES airports (id)
    -- not yet supported (COPY fails): https://github.com/duckdb/duckdb/issues/16785
    -- FOREIGN KEY (airline_id, number, suffix, departure_airport_id, departure_date_local, replaced_at) REFERENCES flight_variant_history (airline_id, number, suffix, departure_airport_id, departure_date_local, created_at)
) ;
-- endregion