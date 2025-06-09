-- flatten into one row per leg
-- id:lh_flight_schedules_flattened
CREATE TABLE lh_flight_schedules_flattened AS
SELECT
    CAST(? AS TIMESTAMPTZ) AS createdAt,
    CAST(REGEXP_REPLACE(filename, '^.*/([0-9]{4})/([0-9]{2})/([0-9]{2})\.json$', '\1-\2-\3') AS DATE) AS queryDate, -- extract querydate from filename
    airline,
    flightNumber,
    suffix,
    -- collect all relevant dataelements from this leg
    LIST_REDUCE(
        LIST_TRANSFORM(
            LIST_FILTER(dataElements, lambda de: sequenceNumber BETWEEN de.startLegSequenceNumber AND de.endLegSequenceNumber),
            lambda de: MAP {de.id: [de.value]}
        ),
        lambda acc, e: MAP_FROM_ENTRIES(
            LIST_TRANSFORM(
                LIST_DISTINCT(MAP_KEYS(acc) || MAP_KEYS(e)),
                lambda k: {k: k, v: LIST_DISTINCT(COALESCE(acc[k], []) || COALESCE(e[k], []))}
            )
        )
    ) AS dataElements,
    origin,
    destination,
    COALESCE(serviceType, '') AS serviceType,
    COALESCE(aircraftOwner, '') AS aircraftOwner,
    aircraftType,
    COALESCE(aircraftConfigurationVersion, '') AS aircraftConfigurationVersion,
    COALESCE(registration, '') AS registration,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS DATE) AS departureDateLocal,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS TIME) AS departureTimeLocal,
    aircraftDepartureTimeVariation * 60 AS departureUTCOffsetSeconds,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS DATE) AS arrivalDateLocal,
    CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS TIME) AS arrivalTimeLocal,
    aircraftArrivalTimeVariation * 60 AS arrivalUTCOffsetSeconds
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

-- assert: lh_flight_schedules_flattened > lh_flight_schedules_raw

-- drop lh_flight_schedules_raw
DROP TABLE lh_flight_schedules_raw ;

-- create queried dates table
-- id:queried_dates
CREATE TABLE queried_dates AS
SELECT DISTINCT queryDate FROM lh_flight_schedules_flattened ;

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
    aircraftConfigurationVersion TEXT NOT NULL,
    aircraftRegistration TEXT NOT NULL,
    departureDateLocal DATE NOT NULL,
    departureTimeLocal TIME NOT NULL,
    departureUTCOffsetSeconds INT NOT NULL,
    arrivalDateLocal DATE NOT NULL,
    arrivalTimeLocal TIME NOT NULL,
    arrivalUTCOffsetSeconds INT NOT NULL,
    queryDate DATE NOT NULL,
    codeSharesRaw TEXT[] NOT NULL,
    priority INT NOT NULL,
    isDerived BOOL NOT NULL
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
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority,
    isDerived
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
    aircraftConfigurationVersion,
    registration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    LIST_DISTINCT(FLATTEN(LIST_TRANSFORM(COALESCE(dataElements[10], []), lambda v: STRING_SPLIT(v, '/')))),
    10,
    FALSE,
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
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority,
    isDerived
)
SELECT
    createdAt,
    airline,
    flightNumber,
    suffix,
    REGEXP_EXTRACT(operatingFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 1),
    CAST(REGEXP_EXTRACT(operatingFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 2) AS USMALLINT),
    REGEXP_EXTRACT(operatingFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 3),
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    aircraftConfigurationVersion,
    registration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    LIST_DISTINCT(FLATTEN(LIST_TRANSFORM(COALESCE(dataElements[10], []), lambda v: STRING_SPLIT(v, '/')))),
    20,
    FALSE
FROM (
    SELECT
        *,
        UNNEST(dataElements[50]) operatingFlightNumberFull
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
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority,
    isDerived
)
SELECT
    createdAt,
    REGEXP_EXTRACT(codeShareFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 1),
    CAST(REGEXP_EXTRACT(codeShareFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 2) AS USMALLINT),
    REGEXP_EXTRACT(codeShareFlightNumberFull, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 3),
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    destination,
    serviceType,
    aircraftOwner,
    aircraftType,
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority + 5,
    TRUE
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
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority,
    isDerived
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
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    queryDate,
    codeSharesRaw,
    priority + 5,
    TRUE
FROM lh_all_flights ;

-- drop lh_flight_schedules_flattened
DROP TABLE lh_flight_schedules_flattened ;

-- create lh_operating_flight_data
CREATE TABLE lh_operating_flight_data AS
SELECT
    createdAt,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    FIRST(destination ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS destination,
    FIRST(IF(LENGTH(aircraftOwner) = 2, aircraftOwner, operatingAirline) ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS aircraftOwner,
    FIRST(aircraftType ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS aircraftType,
    FIRST(aircraftConfigurationVersion ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS aircraftConfigurationVersion,
    FIRST(aircraftRegistration ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS aircraftRegistration,
    departureDateLocal,
    FIRST(departureTimeLocal ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS departureTimeLocal,
    FIRST(departureUTCOffsetSeconds ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS departureUTCOffsetSeconds,
    FIRST(arrivalUTCOffsetSeconds ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS arrivalUTCOffsetSeconds,
    FIRST(EPOCH(arrivalDateLocal + arrivalTimeLocal - TO_SECONDS(arrivalUTCOffsetSeconds)) - EPOCH(departureDateLocal + departureTimeLocal - TO_SECONDS(departureUTCOffsetSeconds)) ORDER BY priority ASC, departureTimeLocal DESC, airline ASC) AS durationSeconds
FROM lh_all_flights
GROUP BY
    createdAt,
    operatingAirline,
    operatingFlightNumber,
    operatingSuffix,
    origin,
    departureDateLocal
;

-- create lh_all_flights_deduped
-- id:lh_all_flights_deduped
CREATE TABLE lh_all_flights_deduped AS
SELECT
    createdAt,
    airline,
    flightNumber,
    suffix,
    FIRST(operatingAirline ORDER BY priority ASC, departureTimeLocal DESC) AS operatingAirline,
    FIRST(operatingFlightNumber ORDER BY priority ASC, departureTimeLocal DESC) AS operatingFlightNumber,
    FIRST(operatingSuffix ORDER BY priority ASC, departureTimeLocal DESC) AS operatingSuffix,
    origin,
    departureDateLocal,
    FIRST(serviceType ORDER BY priority ASC, departureTimeLocal DESC) AS serviceType,
    ARRAY_AGG(DISTINCT queryDate) AS queryDates,
    BOOL_AND(isDerived) AS isDerived
FROM lh_all_flights
GROUP BY
    createdAt,
    airline,
    flightNumber,
    suffix,
    origin,
    departureDateLocal
;

-- assert: lh_all_flights_deduped > lh_flight_schedules_flattened

-- drop lh_all_flights
DROP TABLE lh_all_flights ;

-- insert new airlines
-- id:new_airlines
INSERT INTO airlines
(id, lh_api_id, iata_code, name)
SELECT UUID(), airline, airline, NULL
FROM (
    SELECT DISTINCT fresh.airline
    FROM lh_all_flights_deduped fresh
    WHERE NOT EXISTS( FROM airlines airl WHERE airl.lh_api_id = fresh.airline )
) ;

-- prepare new airports
CREATE TABLE temp_new_airports AS
SELECT
    UUID() AS id,
    fresh.airport AS iata_code
FROM (
    SELECT UNNEST([origin, destination]) AS airport
    FROM lh_operating_flight_data
) fresh
LEFT JOIN airport_identifiers aid
ON aid.issuer = 'iata'
AND fresh.airport = aid.identifier
WHERE aid.issuer IS NULL
GROUP BY fresh.airport ;

-- insert airport ids
-- id:new_airports
INSERT INTO airports
(id, iata_area_code, country_code, city_code, type, lng, lat, timezone, name)
SELECT id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM temp_new_airports ;

-- insert airport identifiers
INSERT INTO airport_identifiers
(issuer, identifier, airport_id)
SELECT 'iata', iata_code, id
FROM temp_new_airports ;

-- drop temp_new_airports
DROP TABLE temp_new_airports ;

-- prepare new aircraft
CREATE TABLE temp_new_aircraft AS
SELECT
    UUID() AS id,
    fresh.aircraftType AS iata_code
FROM lh_operating_flight_data fresh
LEFT JOIN aircraft_identifiers aid
ON aid.issuer = 'iata'
AND fresh.aircraftType = aid.identifier
WHERE aid.issuer IS NULL
GROUP BY fresh.aircraftType ;

-- insert aircraft ids
-- id:new_aircraft
INSERT INTO aircraft
(id, equip_code, name)
SELECT id, NULL, NULL
FROM temp_new_aircraft ;

-- insert aircraft identifiers
INSERT INTO aircraft_identifiers
(issuer, identifier, aircraft_id)
SELECT 'iata', iata_code, id
FROM temp_new_aircraft ;

-- drop temp_new_aircraft
DROP TABLE temp_new_aircraft ;

-- create all flights with ids
-- id:lh_all_flights_with_ids
CREATE TABLE lh_all_flights_with_ids AS
SELECT
    fresh.createdAt,
    mrktg_airl.id AS airlineId,
    fresh.flightNumber,
    fresh.suffix,
    op_airl.id AS operatingAirlineId,
    fresh.operatingFlightNumber,
    fresh.operatingSuffix,
    dep_airp_id.airport_id AS departureAirportId,
    arr_airp_id.airport_id AS arrivalAirportId,
    fresh.serviceType,
    opdata.aircraftOwner,
    airc_id.aircraft_id AS aircraftId,
    opdata.aircraftConfigurationVersion,
    opdata.aircraftRegistration,
    opdata.departureDateLocal,
    opdata.departureTimeLocal,
    opdata.departureUTCOffsetSeconds,
    opdata.arrivalUTCOffsetSeconds,
    opdata.durationSeconds,
    fresh.queryDates,
    fresh.isDerived
FROM lh_all_flights_deduped fresh
LEFT JOIN lh_operating_flight_data opdata
ON fresh.createdAt = opdata.createdAt
AND fresh.operatingAirline = opdata.operatingAirline
AND fresh.operatingFlightNumber = opdata.operatingFlightNumber
AND fresh.operatingSuffix = opdata.operatingSuffix
AND fresh.origin = opdata.origin
AND fresh.departureDateLocal = opdata.departureDateLocal
LEFT JOIN airlines mrktg_airl -- marketing airline
ON mrktg_airl.lh_api_id = fresh.airline
LEFT JOIN airlines op_airl -- operating airline
ON op_airl.lh_api_id = fresh.airline
LEFT JOIN airport_identifiers dep_airp_id -- departure airport id
ON dep_airp_id.issuer = 'iata'
AND fresh.origin = dep_airp_id.identifier
LEFT JOIN airport_identifiers arr_airp_id -- arrival airport id
ON arr_airp_id.issuer = 'iata'
AND opdata.destination = arr_airp_id.identifier
LEFT JOIN aircraft_identifiers airc_id -- aircraft id
ON airc_id.issuer = 'iata'
AND opdata.aircraftType = airc_id.identifier ;

-- assert: lh_all_flights_with_ids == lh_all_flights_deduped

-- add flights with same operating number which were not part of this update
-- id:lh_all_flights_with_ids_existing
INSERT INTO lh_all_flights_with_ids (
    createdAt,
    airlineId,
    flightNumber,
    suffix,
    operatingAirlineId,
    operatingFlightNumber,
    operatingSuffix,
    departureAirportId,
    arrivalAirportId,
    serviceType,
    aircraftOwner,
    aircraftId,
    aircraftConfigurationVersion,
    aircraftRegistration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalUTCOffsetSeconds,
    durationSeconds,
    queryDates,
    isDerived
)
WITH non_queried_flight_variant_history AS (
    SELECT fvh.*
    FROM flight_variant_history fvh
    LEFT JOIN lh_all_flights_with_ids fresh
    ON fvh.airline_id = fresh.airlineId
    AND fvh.number = fresh.flightNumber
    AND fvh.suffix = fresh.suffix
    AND fvh.departure_airport_id = fresh.departureAirportId
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
    fvh.airline_id,
    fvh.number,
    fvh.suffix,
    FIRST(fresh.airlineId),
    FIRST(fresh.flightNumber),
    FIRST(fresh.suffix),
    fresh.departureAirportId,
    FIRST(fresh.arrivalAirportId),
    FIRST(fv.service_type),
    FIRST(fresh.aircraftOwner),
    FIRST(fresh.aircraftId),
    FIRST(fresh.aircraftConfigurationVersion),
    FIRST(fresh.aircraftRegistration),
    fresh.departureDateLocal,
    FIRST(fresh.departureTimeLocal),
    FIRST(fresh.departureUTCOffsetSeconds),
    FIRST(fresh.arrivalUTCOffsetSeconds),
    FIRST(fresh.durationSeconds),
    FIRST(fvh.query_dates),
    FIRST(fvh.is_derived)
FROM non_queried_flight_variant_history fvh
INNER JOIN flight_variants fv
ON fvh.flight_variant_id = fv.id
INNER JOIN lh_all_flights_with_ids fresh
ON fv.operating_airline_id = fresh.airlineId
AND fv.operating_number = fresh.flightNumber
AND fv.operating_suffix = fresh.suffix
AND fvh.departure_airport_id = fresh.departureAirportId
AND fvh.departure_date_local = fresh.departureDateLocal
GROUP BY
    fresh.createdAt,
    fvh.airline_id,
    fvh.number,
    fvh.suffix,
    fresh.departureAirportId,
    fresh.departureDateLocal
;

-- drop lh_all_flights_deduped
DROP TABLE lh_all_flights_deduped ;

-- drop lh_operating_flight_data
DROP TABLE lh_operating_flight_data ;

-- insert new flight numbers
-- id:new_flight_numbers
INSERT OR IGNORE INTO flight_numbers
(airline_id, number, suffix)
SELECT DISTINCT airlineId, flightNumber, suffix
FROM lh_all_flights_with_ids ;

-- create codeshares table
CREATE TABLE lh_operating_codeshares (
    operatingAirlineId UUID NOT NULL,
    operatingFlightNumber USMALLINT NOT NULL,
    operatingSuffix TEXT NOT NULL,
    departureAirportId UUID NOT NULL,
    departureDateLocal DATE NOT NULL,
    codeShares STRUCT(airline_id UUID, number USMALLINT, suffix TEXT)[] NOT NULL,
    CHECK ( TO_JSON(codeShares) = TO_JSON(LIST_SORT(LIST_DISTINCT(codeShares))) )
) ;

-- insert codeshares
-- id:codeshares_by_operating
INSERT INTO lh_operating_codeshares (
    operatingAirlineId,
    operatingFlightNumber,
    operatingSuffix,
    departureAirportId,
    departureDateLocal,
    codeShares
)
SELECT
    operatingAirlineId,
    operatingFlightNumber,
    operatingSuffix,
    departureAirportId,
    departureDateLocal,
    LIST_SORT(
        LIST_DISTINCT(
            LIST_FILTER(-- aggregation filter does not work on linux https://github.com/duckdb/duckdb/issues/17757
                COALESCE(ARRAY_AGG({
                    'airline_id': airlineId,
                    'number': flightNumber,
                    'suffix': suffix
                }), []),
                lambda cs: ( cs.airline_id != operatingAirlineId OR cs.number != operatingFlightNumber OR cs.suffix != operatingSuffix )
            )
        )
    ) AS codeShares
FROM lh_all_flights_with_ids
GROUP BY
    operatingAirlineId,
    operatingFlightNumber,
    operatingSuffix,
    departureAirportId,
    departureDateLocal
;

-- harden codeshares, for some reason the filter doesnt work on all platforms(?) https://github.com/duckdb/duckdb/issues/17757
-- id:harden_codeshares
UPDATE lh_operating_codeshares
SET codeShares = LIST_SORT(LIST_DISTINCT(LIST_FILTER(
    codeShares,
    lambda cs: ( cs.airline_id != operatingAirlineId OR cs.number != operatingFlightNumber OR cs.suffix != operatingSuffix )
)))
WHERE LENGTH(LIST_FILTER(
    codeShares,
    lambda cs: ( cs.airline_id = operatingAirlineId AND cs.number = operatingFlightNumber AND cs.suffix = operatingSuffix )
)) > 0 ;

-- assert: harden_codeshares == 0

-- insert new flight variants
-- id:new_flight_variants
INSERT INTO flight_variants (
    id,
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
    code_shares_hash,
    code_shares
)
SELECT
    UUID(),
    fresh.operatingAirlineId,
    fresh.operatingFlightNumber,
    fresh.operatingSuffix,
    fresh.departureAirportId,
    fresh.departureTimeLocal,
    fresh.departureUTCOffsetSeconds,
    fresh.durationSeconds,
    fresh.arrivalAirportId,
    fresh.arrivalUTCOffsetSeconds,
    fresh.serviceType,
    fresh.aircraftOwner,
    fresh.aircraftId,
    fresh.aircraftConfigurationVersion,
    fresh.aircraftRegistration,
    MD5_NUMBER(TO_JSON(cs.codeShares)),
    cs.codeShares
FROM lh_all_flights_with_ids fresh
LEFT JOIN lh_operating_codeshares cs
ON fresh.operatingAirlineId = cs.operatingAirlineId
AND fresh.operatingFlightNumber = cs.operatingFlightNumber
AND fresh.operatingSuffix = cs.operatingSuffix
AND fresh.departureAirportId = cs.departureAirportId
AND fresh.departureDateLocal = cs.departureDateLocal
GROUP BY
    fresh.operatingAirlineId,
    fresh.operatingFlightNumber,
    fresh.operatingSuffix,
    fresh.departureAirportId,
    fresh.departureTimeLocal,
    fresh.departureUTCOffsetSeconds,
    fresh.durationSeconds,
    fresh.arrivalAirportId,
    fresh.arrivalUTCOffsetSeconds,
    fresh.serviceType,
    fresh.aircraftOwner,
    fresh.aircraftId,
    fresh.aircraftConfigurationVersion,
    fresh.aircraftRegistration,
    cs.codeShares
ON CONFLICT (
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
) DO NOTHING ;

-- create all flights with variants
-- id:lh_all_flights_with_variants
CREATE TABLE lh_all_flights_with_variants AS
SELECT
    fresh.*,
    fv.id AS flightVariantId
FROM lh_all_flights_with_ids fresh
LEFT JOIN lh_operating_codeshares cs
ON fresh.operatingAirlineId = cs.operatingAirlineId
AND fresh.operatingFlightNumber = cs.operatingFlightNumber
AND fresh.operatingSuffix = cs.operatingSuffix
AND fresh.departureAirportId = cs.departureAirportId
AND fresh.departureDateLocal = cs.departureDateLocal
LEFT JOIN flight_variants fv
ON fresh.operatingAirlineId = fv.operating_airline_id
AND fresh.operatingFlightNumber = fv.operating_number
AND fresh.operatingSuffix = fv.operating_suffix
AND fresh.departureAirportId = fv.departure_airport_id
AND fresh.departureTimeLocal = fv.departure_time_local
AND fresh.departureUTCOffsetSeconds = fv.departure_utc_offset_seconds
AND fresh.durationSeconds = fv.duration_seconds
AND fresh.arrivalAirportId = fv.arrival_airport_id
AND fresh.arrivalUTCOffsetSeconds = fv.arrival_utc_offset_seconds
AND fresh.serviceType = fv.service_type
AND fresh.aircraftOwner = fv.aircraft_owner
AND fresh.aircraftId = fv.aircraft_id
AND fresh.aircraftConfigurationVersion = fv.aircraft_configuration_version
AND fresh.aircraftRegistration = fv.aircraft_registration
AND MD5_NUMBER(TO_JSON(cs.codeShares)) = fv.code_shares_hash
AND cs.codeShares = fv.code_shares ;

-- assert: lh_all_flights_with_variants == (lh_all_flights_with_ids + lh_all_flights_with_ids_existing)

-- drop lh_all_flights_with_ids
DROP TABLE lh_all_flights_with_ids ;

-- drop codeshares
DROP TABLE lh_operating_codeshares ;