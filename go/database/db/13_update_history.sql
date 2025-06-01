-- create table of the entries which are going to be replaced
CREATE TABLE temp_replaced_history AS
SELECT
    fvh.*,
    fresh.createdAt AS new_replaced_at
FROM lh_all_flights_with_variants fresh
INNER JOIN flight_variant_history fvh
ON fresh.airlineId = fvh.airline_id
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.departureAirportId = fvh.departure_airport_id
AND fresh.departureDateLocal = fvh.departure_date_local
AND fvh.replaced_at IS NULL -- latest entry
WHERE fvh.flight_variant_id IS NULL
OR fvh.flight_variant_id != fresh.flightVariantId ;

-- delete entries which are going to be replaced
DELETE FROM flight_variant_history fvh
USING temp_replaced_history repl
WHERE fvh.airline_id = repl.airline_id
AND fvh.number = repl.number
AND fvh.suffix = repl.suffix
AND fvh.departure_airport_id = repl.departure_airport_id
AND fvh.departure_date_local = repl.departure_date_local
AND fvh.created_at = repl.created_at ;

-- insert history variants
INSERT INTO flight_variant_history (
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
)
SELECT
    fresh.airlineId,
    fresh.flightNumber,
    fresh.suffix,
    fresh.departureAirportId,
    fresh.departureDateLocal,
    fresh.createdAt,
    NULL,
    fresh.queryDates,
    fresh.isDerived,
    fresh.flightVariantId
FROM lh_all_flights_with_variants fresh
LEFT JOIN flight_variant_history fvh
ON fresh.airlineId = fvh.airline_id
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.departureAirportId = fvh.departure_airport_id
AND fresh.departureDateLocal = fvh.departure_date_local
AND fvh.replaced_at IS NULL -- latest entry
WHERE fvh.flight_variant_id IS NULL
OR fvh.flight_variant_id != fresh.flightVariantId ;

-- re-insert old entries with replaced_at
INSERT INTO flight_variant_history (
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
)
SELECT
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    new_replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
FROM temp_replaced_history ;

-- drop temp_replaced_history
DROP TABLE temp_replaced_history ;

-- create NULL (removed markers) copies of existing history for all query dates that are part of this update
-- create temp table of the entries which are going to be replaced
CREATE TABLE temp_replaced_history AS
SELECT
    fvh.*,
    ( SELECT createdAt FROM lh_all_flights_with_variants LIMIT 1 ) AS new_replaced_at
FROM flight_variant_history fvh
LEFT JOIN lh_all_flights_with_variants fresh
ON fvh.airline_id = fresh.airlineId
AND fvh.number = fresh.flightNumber
AND fvh.suffix = fresh.suffix
AND fvh.departure_airport_id = fresh.departureAirportId
AND fvh.departure_date_local = fresh.departureDateLocal
WHERE LIST_HAS_ALL( -- date was queried with this update
    (SELECT ARRAY_AGG(queryDate) FROM queried_dates),
    fvh.query_dates
)
AND fresh.createdAt IS NULL -- flight was not found in this update
AND fvh.replaced_at IS NULL -- latest entry
AND fvh.flight_variant_id IS NOT NULL ; -- is not already a removed marker

-- delete entries which are going to be replaced
DELETE FROM flight_variant_history fvh
USING temp_replaced_history repl
WHERE fvh.airline_id = repl.airline_id
AND fvh.number = repl.number
AND fvh.suffix = repl.suffix
AND fvh.departure_airport_id = repl.departure_airport_id
AND fvh.departure_date_local = repl.departure_date_local
AND fvh.created_at = repl.created_at ;

-- insert new entries
INSERT INTO flight_variant_history (
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
)
SELECT
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    new_replaced_at,
    NULL,
    query_dates,
    is_derived,
    NULL -- removed marker
FROM temp_replaced_history ;

-- re-insert old entries with replaced_at
INSERT INTO flight_variant_history (
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
)
SELECT
    airline_id,
    number,
    suffix,
    departure_airport_id,
    departure_date_local,
    created_at,
    new_replaced_at,
    query_dates,
    is_derived,
    flight_variant_id
FROM temp_replaced_history ;

-- drop temp table
DROP TABLE temp_replaced_history ;

-- drop lh_all_flights_with_variants
DROP TABLE lh_all_flights_with_variants ;

-- drop queried dates
DROP TABLE queried_dates ;