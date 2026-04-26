-- region airlines
CREATE TABLE IF NOT EXISTS airlines (
    iata_code TEXT NOT NULL,
    icao_code TEXT,
    name TEXT NOT NULL,
    PRIMARY KEY (iata_code),
    UNIQUE (icao_code),
    CHECK ( LENGTH(iata_code) = 2 AND iata_code = UPPER(iata_code) ),
    CHECK ( icao_code IS NULL OR (LENGTH(icao_code) = 3 AND icao_code = UPPER(icao_code)) )
) ;
-- endregion
-- region airports
CREATE TABLE IF NOT EXISTS airports (
    iata_code TEXT NOT NULL,
    icao_code TEXT,
    iata_area_code TEXT,
    country_code TEXT NOT NULL,
    city_code TEXT NOT NULL,
    type TEXT NOT NULL,
    lng DOUBLE NOT NULL,
    lat DOUBLE NOT NULL,
    timezone TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (iata_code),
    UNIQUE (icao_code),
    CHECK ( LENGTH(iata_code) = 3 AND iata_code = UPPER(iata_code) ),
    CHECK ( icao_code IS NULL OR (LENGTH(icao_code) = 4 AND icao_code = UPPER(icao_code)) ),
    CHECK ( iata_area_code IS NULL OR (LENGTH(iata_area_code) = 3 AND iata_area_code = UPPER(iata_area_code)) ),
    CHECK ( LENGTH(country_code) = 2 AND country_code = UPPER(country_code) ),
    CHECK ( LENGTH(city_code) = 3 AND city_code = UPPER(city_code) ),
    CHECK ( lng BETWEEN -180 AND 180 ),
    CHECK ( lat BETWEEN -90 AND 90 )
) ;
-- endregion
-- region aircraft
CREATE TABLE IF NOT EXISTS aircraft (
    iata_code TEXT NOT NULL,
    parent_iata_code TEXT,
    icao_code TEXT,
    wtc TEXT,
    engine_count USMALLINT,
    engine_type TEXT,
    name TEXT NOT NULL,
    PRIMARY KEY (iata_code),
    -- icao codes are not unique (i.e. icao B744 = iata [744, 74B, 74E, 74J])
    -- not yet supported (COPY fails): https://github.com/duckdb/duckdb/issues/16785
    -- FOREIGN KEY (parent_iata_code) REFERENCES aircraft (iata_code),
    CHECK ( LENGTH(iata_code) = 3 AND iata_code = UPPER(iata_code) ),
    CHECK ( icao_code IS NULL OR ( (LENGTH(icao_code) BETWEEN 2 AND 4) AND icao_code = UPPER(icao_code) ) )
) ;
-- endregion
-- region data
CREATE TABLE IF NOT EXISTS flight_variants (
    id UUID NOT NULL,
    operating_airline_iata_code TEXT NOT NULL,
    operating_number USMALLINT NOT NULL,
    operating_suffix TEXT NOT NULL,
    departure_airport_iata_code TEXT NOT NULL,
    departure_time_local TIME NOT NULL,
    departure_utc_offset_seconds INT NOT NULL,
    duration_seconds UINTEGER NOT NULL,
    arrival_airport_iata_code TEXT NOT NULL,
    arrival_utc_offset_seconds INT NOT NULL,
    service_type TEXT NOT NULL,
    aircraft_owner TEXT NOT NULL,
    aircraft_iata_code TEXT NOT NULL,
    seats_first USMALLINT NOT NULL,
    seats_business USMALLINT NOT NULL,
    seats_premium USMALLINT NOT NULL,
    seats_economy USMALLINT NOT NULL,
    code_shares_hash UHUGEINT NOT NULL,
    code_shares STRUCT(airline_iata_code TEXT, number USMALLINT, suffix TEXT)[] NOT NULL,
    data_elements_hash UHUGEINT NOT NULL,
    data_elements MAP(INTEGER, TEXT) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (
        operating_airline_iata_code,
        operating_number,
        operating_suffix,
        departure_airport_iata_code,
        departure_time_local,
        departure_utc_offset_seconds,
        duration_seconds,
        arrival_airport_iata_code,
        arrival_utc_offset_seconds,
        service_type,
        aircraft_owner,
        aircraft_iata_code,
        seats_first,
        seats_business,
        seats_premium,
        seats_economy,
        code_shares_hash,
        data_elements_hash
    ),
    -- code_shares must be distinct and sorted (effectively a set) and match the provided hash
    CHECK ( TO_JSON(code_shares) = TO_JSON(LIST_SORT(LIST_DISTINCT(code_shares))) AND MD5_NUMBER(TO_JSON(code_shares)) = code_shares_hash ),
    CHECK ( MD5_NUMBER(TO_JSON(LIST_SORT(MAP_ENTRIES(data_elements)))) = data_elements_hash ),
    FOREIGN KEY (operating_airline_iata_code) REFERENCES airlines (iata_code),
    FOREIGN KEY (departure_airport_iata_code) REFERENCES airports (iata_code),
    FOREIGN KEY (arrival_airport_iata_code) REFERENCES airports (iata_code),
    FOREIGN KEY (aircraft_iata_code) REFERENCES aircraft (iata_code)
) ;

CREATE TABLE IF NOT EXISTS flight_variant_history (
    airline_iata_code TEXT NOT NULL,
    number USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    departure_airport_iata_code TEXT NOT NULL,
    departure_date_local DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    replaced_at TIMESTAMPTZ,
    query_dates DATE[] NOT NULL,
    flight_variant_id UUID,
    PRIMARY KEY (airline_iata_code, number, suffix, departure_airport_iata_code, departure_date_local, created_at),
    UNIQUE (airline_iata_code, number, suffix, departure_airport_iata_code, departure_date_local, replaced_at),
    FOREIGN KEY (airline_iata_code) REFERENCES airlines (iata_code),
    FOREIGN KEY (departure_airport_iata_code) REFERENCES airports (iata_code),
    FOREIGN KEY (flight_variant_id) REFERENCES flight_variants (id)
    -- not yet supported (COPY fails): https://github.com/duckdb/duckdb/issues/16785
    -- FOREIGN KEY (airline_iata_code, number, suffix, departure_airport_iata_code, departure_date_local, replaced_at) REFERENCES flight_variant_history (airline_iata_code, number, suffix, departure_airport_iata_code, departure_date_local, created_at)
) ;
-- endregion