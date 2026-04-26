-- flatten into one row per leg
CREATE TABLE lh_flight_schedules_flattened AS
SELECT
    CAST(? AS TIMESTAMPTZ) AS createdAt,
    CAST(REGEXP_REPLACE(filename, '^.*/([0-9]{4})/([0-9]{2})/([0-9]{2})\.json$', '\1-\2-\3') AS DATE) AS queryDate, -- extract querydate from filename
    airline,
    flightNumber,
    suffix,
    -- collect all relevant dataelements from this leg
    CAST(LIST_REDUCE(
        LIST_TRANSFORM(
            LIST_FILTER(dataElements, lambda de: sequenceNumber BETWEEN de.startLegSequenceNumber AND de.endLegSequenceNumber),
            lambda de: MAP([de.id], [de.value])
        ),
        lambda acc, e: MAP_CONCAT(acc, e),
        MAP()
    ) AS MAP(INTEGER, TEXT)) AS dataElements,
    origin,
    destination,
    COALESCE(serviceType, '') AS serviceType,
    COALESCE(aircraftOwner, '') AS aircraftOwner,
    aircraftType,
    COALESCE(EXTRACT_SEATS(aircraftConfigurationVersion).first, 0) AS seatsFirst,
    COALESCE(EXTRACT_SEATS(aircraftConfigurationVersion).business, 0) AS seatsBusiness,
    COALESCE(EXTRACT_SEATS(aircraftConfigurationVersion).premium, 0) AS seatsPremium,
    COALESCE(EXTRACT_SEATS(aircraftConfigurationVersion).economy, 0) AS seatsEconomy,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS DATE) AS departureDateLocal,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS TIME) AS departureTimeLocal,
    aircraftDepartureTimeVariation * 60 AS departureUTCOffsetSeconds,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS DATE) AS arrivalDateLocal,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS TIME) AS arrivalTimeLocal,
    aircraftArrivalTimeVariation * 60 AS arrivalUTCOffsetSeconds,
    op AS isOp
FROM (
    SELECT
        filename,
        airline,
        flightNumber,
        suffix,
        periodOfOperationUTC,
        dataElements,
        leg.*
    FROM (
        SELECT *, UNNEST(legs) AS leg
        FROM lh_flight_schedules_raw
    )
) ;

-- assign:lh_flight_schedules_flattened from:result
SELECT COUNT(*) FROM lh_flight_schedules_flattened ;

-- assert: lh_flight_schedules_flattened > lh_flight_schedules_raw

-- drop lh_flight_schedules_raw
DROP TABLE lh_flight_schedules_raw ;

-- create queried dates table
CREATE TABLE queried_dates AS
SELECT DISTINCT queryDate FROM lh_flight_schedules_flattened ;

-- assign:queried_dates from:result
SELECT COUNT(*) FROM queried_dates ;

-- create flightnumber macro
CREATE OR REPLACE MACRO EXTRACT_FLIGHTNUMBER(flightNumberRaw, matchGroup) AS
REGEXP_EXTRACT(flightNumberRaw, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', matchGroup) ;

-- create filtered dataelements macro
CREATE OR REPLACE MACRO FILTER_DATAELEMENTS(dataElements) AS
MAP_FROM_ENTRIES(LIST_FILTER(MAP_ENTRIES(dataElements), lambda e: e.key IN (106, 109, 820))) ;

-- create all flights table
CREATE TABLE lh_all_flights (
    createdAt TIMESTAMPTZ NOT NULL,
    airline TEXT NOT NULL,
    flightNumber USMALLINT NOT NULL,
    suffix TEXT NOT NULL,
    operatingAirline TEXT NOT NULL,
    operatingFlightNumber USMALLINT NOT NULL,
    operatingSuffix TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    serviceType TEXT NOT NULL,
    aircraftOwner TEXT NOT NULL,
    aircraftType TEXT NOT NULL,
    seatsFirst UINTEGER,
    seatsBusiness UINTEGER,
    seatsPremium UINTEGER,
    seatsEconomy UINTEGER,
    departureDateLocal DATE NOT NULL,
    departureTimeLocal TIME NOT NULL,
    departureUTCOffsetSeconds INT NOT NULL,
    arrivalDateLocal DATE NOT NULL,
    arrivalTimeLocal TIME NOT NULL,
    arrivalUTCOffsetSeconds INT NOT NULL,
    queryDate DATE NOT NULL,
    codeSharesRaw TEXT[] NOT NULL,
    dataElements MAP(INTEGER, TEXT) NOT NULL,
    priority INT NOT NULL
) ;

-- insert base flights
INSERT INTO lh_all_flights (
    createdAt,
    airline,
    flightNumber,
    suffix,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    dataElements,
    priority
)
SELECT
    createdAt,
    airline,
    flightNumber,
    suffix,
    airline,
    flightNumber,
    suffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    LIST_FILTER(
        LIST_DISTINCT(STRING_SPLIT(COALESCE(dataElements[10], ''), '/')),
        lambda cs: LENGTH(cs) > 0
    ),
    FILTER_DATAELEMENTS(dataElements),
    IF(isOp, 10, 11)
FROM lh_flight_schedules_flattened
WHERE dataElements[50] IS NULL OR LENGTH(dataElements[50]) < 1 ;

-- insert operating based on data elements
INSERT INTO lh_all_flights (
    createdAt,
    airline,
    flightNumber,
    suffix,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    dataElements,
    priority
)
SELECT
    createdAt,
    airline,
    flightNumber,
    suffix,
    EXTRACT_FLIGHTNUMBER(operatingFlightNumberFull, 1),
    CAST(EXTRACT_FLIGHTNUMBER(operatingFlightNumberFull, 2) AS USMALLINT),
    EXTRACT_FLIGHTNUMBER(operatingFlightNumberFull, 3),
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    LIST_FILTER(
        LIST_DISTINCT(STRING_SPLIT(COALESCE(dataElements[10], ''), '/')),
        lambda cs: LENGTH(cs) > 0
    ),
    FILTER_DATAELEMENTS(dataElements),
    20
FROM (
    SELECT
        *,
        dataElements[50] AS operatingFlightNumberFull
    FROM lh_flight_schedules_flattened
    WHERE dataElements[50] IS NOT NULL AND LENGTH(dataElements[50]) > 0
) ;

-- insert codeshares based on data elements
INSERT INTO lh_all_flights (
    createdAt,
    airline,
    flightNumber,
    suffix,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    dataElements,
    priority
)
SELECT
    createdAt,
    EXTRACT_FLIGHTNUMBER(codeShareFlightNumberFull, 1),
    CAST(EXTRACT_FLIGHTNUMBER(codeShareFlightNumberFull, 2) AS USMALLINT),
    EXTRACT_FLIGHTNUMBER(codeShareFlightNumberFull, 3),
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    FILTER_DATAELEMENTS(dataElements),
    priority + 5
FROM (
    SELECT
        *,
        UNNEST(codeSharesRaw) AS codeShareFlightNumberFull
    FROM lh_all_flights
    WHERE LENGTH(codeSharesRaw) > 0
) ;

-- insert operating based on previous inserts
INSERT INTO lh_all_flights (
    createdAt,
    airline,
    flightNumber,
    suffix,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    dataElements,
    priority
)
SELECT
    createdAt,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    FILTER_DATAELEMENTS(dataElements),
    priority + 5
FROM lh_all_flights ;

-- drop lh_flight_schedules_flattened
DROP TABLE lh_flight_schedules_flattened ;

-- drop flightnumber macro
DROP MACRO EXTRACT_FLIGHTNUMBER ;

-- drop dataelements macro
DROP MACRO FILTER_DATAELEMENTS ;

-- create lh_operating_flight_data
CREATE TABLE lh_operating_flight_data AS
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY
                createdAt,
                operatingAirline,
                operatingFlightNumber,
                operatingSuffix,
                origin,
                departureDateLocal
            ORDER BY
                priority ASC,
                departureTimeLocal DESC,
                airline ASC
        ) AS rank
    FROM lh_all_flights
)
SELECT
    createdAt,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    departureDateLocal,
    destination,
    serviceType,
    IF(LENGTH(aircraftOwner) = 2, aircraftOwner, operatingAirline) AS aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalUTCOffsetSeconds,
    (
        EPOCH(arrivalDateLocal + arrivalTimeLocal - TO_SECONDS(arrivalUTCOffsetSeconds))
        - EPOCH(departureDateLocal + departureTimeLocal - TO_SECONDS(departureUTCOffsetSeconds))
    ) AS durationSeconds,
    dataElements
FROM ranked
WHERE rank = 1 ;

-- create lh_all_flights_deduped
CREATE TABLE lh_all_flights_deduped AS
SELECT
    createdAt,
    airline,
    flightNumber,
    suffix,
    origin,
    departureDateLocal,
    FIRST(operatingAirline ORDER BY priority ASC, departureTimeLocal DESC) AS operatingAirline,
    FIRST(operatingFlightNumber ORDER BY priority ASC, departureTimeLocal DESC) AS operatingFlightNumber,
    FIRST(operatingSuffix ORDER BY priority ASC, departureTimeLocal DESC) AS operatingSuffix,
    ARRAY_AGG(DISTINCT queryDate) AS queryDates
FROM lh_all_flights
GROUP BY
    createdAt,
    airline,
    flightNumber,
    suffix,
    origin,
    departureDateLocal
;

-- assign:lh_all_flights_deduped from:result
SELECT COUNT(*) FROM lh_all_flights_deduped ;

-- assert: lh_all_flights_deduped > lh_flight_schedules_flattened

-- drop lh_all_flights
DROP TABLE lh_all_flights ;

-- create all flights with operating flight data
CREATE TABLE lh_all_flights_with_operating_flight_data AS
SELECT
    f.createdAt,
    f.airline,
    f.flightNumber,
    f.suffix,
    f.origin,
    f.departureDateLocal,
    f.operatingAirline,
    f.operatingFlightNumber,
    f.operatingSuffix,
    f.queryDates,
    opdata.destination,
    opdata.serviceType,
    opdata.aircraftOwner,
    opdata.aircraftType,
    opdata.seatsFirst,
    opdata.seatsBusiness,
    opdata.seatsPremium,
    opdata.seatsEconomy,
    opdata.departureTimeLocal,
    opdata.departureUTCOffsetSeconds,
    opdata.arrivalUTCOffsetSeconds,
    opdata.durationSeconds,
    opdata.dataElements
FROM lh_all_flights_deduped f
LEFT JOIN lh_operating_flight_data opdata
ON f.createdAt = opdata.createdAt
AND f.operatingAirline = opdata.operatingAirline
AND f.operatingFlightNumber = opdata.operatingFlightNumber
AND f.operatingSuffix = opdata.operatingSuffix
AND f.origin = opdata.origin
AND f.departureDateLocal = opdata.departureDateLocal ;

-- assign:lh_all_flights_with_operating_flight_data from:result
SELECT COUNT(*) FROM lh_all_flights_with_operating_flight_data ;

-- assert: lh_all_flights_with_operating_flight_data == lh_all_flights_deduped

-- add flights with same operating number which were not part of this update
-- assign:lh_all_flights_with_operating_flight_data_existing from:rows_affected
INSERT INTO lh_all_flights_with_operating_flight_data (
    createdAt,
    airline,
    flightNumber,
    suffix,
    origin,
    departureDateLocal,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    queryDates,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    seatsFirst,
    seatsBusiness,
    seatsPremium,
    seatsEconomy,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalUTCOffsetSeconds,
    durationSeconds,
    dataElements
)
WITH non_queried_flight_variant_history AS (
    SELECT fvh.*
    FROM flight_variant_history fvh
    LEFT JOIN lh_all_flights_with_operating_flight_data fresh
    ON fvh.airline_iata_code = fresh.airline
    AND fvh.number = fresh.flightNumber
    AND fvh.suffix = fresh.suffix
    AND fvh.departure_airport_iata_code = fresh.origin
    AND fvh.departure_date_local = fresh.departureDateLocal
    WHERE fvh.replaced_at IS NULL -- latest entry
    AND fvh.flight_variant_id IS NOT NULL -- is not removed
    AND fresh.createdAt IS NULL -- flight was NOT found in this update
    AND NOT LIST_HAS_ALL( -- dates were NOT fully queried with this update
        (SELECT ARRAY_AGG(queryDate) FROM queried_dates),
        fvh.query_dates
    )
)
SELECT
    fresh.createdAt,
    fvh.airline_iata_code,
    fvh.number,
    fvh.suffix,
    fresh.origin,
    fresh.departureDateLocal,
    FIRST(fresh.airline),
    FIRST(fresh.flightNumber),
    FIRST(fresh.suffix),
    FIRST(fvh.query_dates),
    FIRST(fresh.destination),
    FIRST(fresh.serviceType),
    FIRST(fresh.aircraftOwner),
    FIRST(fresh.aircraftType),
    FIRST(fresh.seatsFirst),
    FIRST(fresh.seatsBusiness),
    FIRST(fresh.seatsPremium),
    FIRST(fresh.seatsEconomy),
    FIRST(fresh.departureTimeLocal),
    FIRST(fresh.departureUTCOffsetSeconds),
    FIRST(fresh.arrivalUTCOffsetSeconds),
    FIRST(fresh.durationSeconds),
    FIRST(fresh.dataElements)
FROM non_queried_flight_variant_history fvh
INNER JOIN flight_variants fv
ON fvh.flight_variant_id = fv.id
INNER JOIN lh_all_flights_with_operating_flight_data fresh
ON fv.operating_airline_iata_code = fresh.airline
AND fv.operating_number = fresh.flightNumber
AND fv.operating_suffix = fresh.suffix
AND fvh.departure_airport_iata_code = fresh.origin
AND fvh.departure_date_local = fresh.departureDateLocal
GROUP BY
    fresh.createdAt,
    fvh.airline_iata_code,
    fvh.number,
    fvh.suffix,
    fresh.origin,
    fresh.departureDateLocal
;

-- drop lh_all_flights_deduped
DROP TABLE lh_all_flights_deduped ;

-- drop lh_operating_flight_data
DROP TABLE lh_operating_flight_data ;

-- create codeshares table
CREATE TABLE lh_operating_codeshares (
    operatingAirlineIataCode TEXT NOT NULL,
    operatingFlightNumber USMALLINT NOT NULL,
    operatingSuffix TEXT NOT NULL,
    departureAirportIataCode TEXT NOT NULL,
    departureDateLocal DATE NOT NULL,
    codeShares STRUCT(airline_iata_code TEXT, number USMALLINT, suffix TEXT)[] NOT NULL,
    CHECK ( TO_JSON(codeShares) = TO_JSON(LIST_SORT(LIST_DISTINCT(codeShares))) )
) ;

-- insert codeshares
-- assign:codeshares_by_operating from:rows_affected
INSERT INTO lh_operating_codeshares (
    operatingAirlineIataCode,
    operatingFlightNumber,
    operatingSuffix,
    departureAirportIataCode,
    departureDateLocal,
    codeShares
)
SELECT
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    departureDateLocal,
    LIST_SORT(
        LIST_DISTINCT(
            LIST_FILTER(-- aggregation filter does not work on linux https://github.com/duckdb/duckdb/issues/17757
                COALESCE(ARRAY_AGG({
                    'airline_iata_code': airline,
                    'number': flightNumber,
                    'suffix': suffix
                }), []),
                lambda cs: ( cs.airline_iata_code != operatingAirline OR cs.number != operatingFlightNumber OR cs.suffix != operatingSuffix )
            )
        )
    ) AS codeShares
FROM lh_all_flights_with_operating_flight_data
GROUP BY
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    departureDateLocal
;

-- insert new flight variants
-- assign:new_flight_variants from:rows_affected
INSERT INTO flight_variants (
    id,
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
    code_shares,
    data_elements_hash,
    data_elements
)
SELECT
    UUID(),
    fresh.operatingAirline,
    fresh.operatingFlightNumber,
    fresh.operatingSuffix,
    fresh.origin,
    fresh.departureTimeLocal,
    fresh.departureUTCOffsetSeconds,
    fresh.durationSeconds,
    fresh.destination,
    fresh.arrivalUTCOffsetSeconds,
    fresh.serviceType,
    fresh.aircraftOwner,
    fresh.aircraftType,
    fresh.seatsFirst,
    fresh.seatsBusiness,
    fresh.seatsPremium,
    fresh.seatsEconomy,
    MD5_NUMBER(TO_JSON(cs.codeShares)),
    cs.codeShares,
    MD5_NUMBER(TO_JSON(LIST_SORT(MAP_ENTRIES(fresh.dataElements)))),
    fresh.dataElements
FROM lh_all_flights_with_operating_flight_data fresh
LEFT JOIN lh_operating_codeshares cs
ON fresh.operatingAirline = cs.operatingAirlineIataCode
AND fresh.operatingFlightNumber = cs.operatingFlightNumber
AND fresh.operatingSuffix = cs.operatingSuffix
AND fresh.origin = cs.departureAirportIataCode
AND fresh.departureDateLocal = cs.departureDateLocal
GROUP BY
    fresh.operatingAirline,
    fresh.operatingFlightNumber,
    fresh.operatingSuffix,
    fresh.origin,
    fresh.departureTimeLocal,
    fresh.departureUTCOffsetSeconds,
    fresh.durationSeconds,
    fresh.destination,
    fresh.arrivalUTCOffsetSeconds,
    fresh.serviceType,
    fresh.aircraftOwner,
    fresh.aircraftType,
    fresh.seatsFirst,
    fresh.seatsBusiness,
    fresh.seatsPremium,
    fresh.seatsEconomy,
    cs.codeShares,
    fresh.dataElements
ON CONFLICT (
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
) DO NOTHING ;

-- create all flights with variants
CREATE TABLE lh_all_flights_with_variants AS
SELECT
    fresh.*,
    fv.id AS flightVariantId
FROM lh_all_flights_with_operating_flight_data fresh
LEFT JOIN lh_operating_codeshares cs
ON fresh.operatingAirline = cs.operatingAirlineIataCode
AND fresh.operatingFlightNumber = cs.operatingFlightNumber
AND fresh.operatingSuffix = cs.operatingSuffix
AND fresh.origin = cs.departureAirportIataCode
AND fresh.departureDateLocal = cs.departureDateLocal
LEFT JOIN flight_variants fv
ON fresh.operatingAirline = fv.operating_airline_iata_code
AND fresh.operatingFlightNumber = fv.operating_number
AND fresh.operatingSuffix = fv.operating_suffix
AND fresh.origin = fv.departure_airport_iata_code
AND fresh.departureTimeLocal = fv.departure_time_local
AND fresh.departureUTCOffsetSeconds = fv.departure_utc_offset_seconds
AND fresh.durationSeconds = fv.duration_seconds
AND fresh.destination = fv.arrival_airport_iata_code
AND fresh.arrivalUTCOffsetSeconds = fv.arrival_utc_offset_seconds
AND fresh.serviceType = fv.service_type
AND fresh.aircraftOwner = fv.aircraft_owner
AND fresh.aircraftType = fv.aircraft_iata_code
AND fresh.seatsFirst = fv.seats_first
AND fresh.seatsBusiness = fv.seats_business
AND fresh.seatsPremium = fv.seats_premium
AND fresh.seatsEconomy = fv.seats_economy
AND MD5_NUMBER(TO_JSON(cs.codeShares)) = fv.code_shares_hash
AND cs.codeShares = fv.code_shares
AND MD5_NUMBER(TO_JSON(LIST_SORT(MAP_ENTRIES(fresh.dataElements)))) = fv.data_elements_hash
AND fresh.dataElements = fv.data_elements ;

-- assign:lh_all_flights_with_variants from:result
SELECT COUNT(*) FROM lh_all_flights_with_variants ;

-- assert: lh_all_flights_with_variants == (lh_all_flights_with_operating_flight_data + lh_all_flights_with_operating_flight_data_existing)

-- drop lh_all_flights_with_operating_flight_data
DROP TABLE lh_all_flights_with_operating_flight_data ;

-- drop codeshares
DROP TABLE lh_operating_codeshares ;

-- assign:sanity_check_variant_ids_filled from:result
SELECT COUNT(*)
FROM lh_all_flights_with_variants
WHERE flightVariantId IS NULL ;

-- assert: sanity_check_variant_ids_filled == 0
