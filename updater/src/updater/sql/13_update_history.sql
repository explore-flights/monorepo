-- insert new history variants
INSERT INTO flight_variant_history (
    airline_iata_code,
    number,
    suffix,
    departure_airport_iata_code,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    flight_variant_id
)
SELECT
    fresh.airline,
    fresh.flightNumber,
    fresh.suffix,
    fresh.origin,
    fresh.departureDateLocal,
    fresh.createdAt,
    NULL,
    fresh.queryDates,
    fresh.flightVariantId
FROM lh_all_flights_with_variants fresh
LEFT JOIN flight_variant_history fvh
ON fresh.airline = fvh.airline_iata_code
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.origin = fvh.departure_airport_iata_code
AND fresh.departureDateLocal = fvh.departure_date_local
AND fvh.replaced_at IS NULL -- is currently the latest entry
WHERE fvh.flight_variant_id IS NULL -- no current entry (or deletion marker)
OR fvh.flight_variant_id != fresh.flightVariantId ; -- or entry has changed

-- update replaced history with replaced_at
UPDATE flight_variant_history fvh
SET replaced_at = fresh.createdAt
FROM lh_all_flights_with_variants fresh
WHERE fresh.createdAt > fvh.created_at -- dont update the records we just inserted
AND fresh.airline = fvh.airline_iata_code
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.origin = fvh.departure_airport_iata_code
AND fresh.departureDateLocal = fvh.departure_date_local
AND fvh.replaced_at IS NULL -- was previously the latest entry
AND (
    fvh.flight_variant_id IS NULL -- was a deletion marker
    OR fvh.flight_variant_id != fresh.flightVariantId -- or entry has changed with this update
) ;

-- create NULL (deletion markers) copies of existing history for all query dates that are part of this update
-- create temp table of the entries which are going to be replaced
CREATE TABLE temp_replaced_history AS
SELECT
    fvh.*,
    ( SELECT createdAt FROM lh_all_flights_with_variants LIMIT 1 ) AS new_replaced_at
FROM flight_variant_history fvh
LEFT JOIN lh_all_flights_with_variants fresh
ON fvh.airline_iata_code = fresh.airline
AND fvh.number = fresh.flightNumber
AND fvh.suffix = fresh.suffix
AND fvh.departure_airport_iata_code = fresh.origin
AND fvh.departure_date_local = fresh.departureDateLocal
WHERE LIST_HAS_ALL( -- date was queried with this update
    (SELECT ARRAY_AGG(queryDate) FROM queried_dates),
    fvh.query_dates
)
AND fresh.createdAt IS NULL -- flight was not found in this update
AND fvh.replaced_at IS NULL -- latest entry
AND fvh.flight_variant_id IS NOT NULL ; -- is not already a deletion marker

-- insert new deletion marker entries
INSERT INTO flight_variant_history (
    airline_iata_code,
    number,
    suffix,
    departure_airport_iata_code,
    departure_date_local,
    created_at,
    replaced_at,
    query_dates,
    flight_variant_id
)
SELECT
    airline_iata_code,
    number,
    suffix,
    departure_airport_iata_code,
    departure_date_local,
    new_replaced_at,
    NULL, -- latest entry
    query_dates,
    NULL -- deletion marker
FROM temp_replaced_history ;

-- update old history entries with replaced_at for new deletion marker entries
UPDATE flight_variant_history fvh
SET replaced_at = fresh.new_replaced_at
FROM temp_replaced_history fresh
WHERE fresh.new_replaced_at > fvh.created_at -- dont update the records we just inserted
AND fresh.airline_iata_code = fvh.airline_iata_code
AND fresh.number = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.departure_airport_iata_code = fvh.departure_airport_iata_code
AND fresh.departure_date_local = fvh.departure_date_local
AND fvh.replaced_at IS NULL ; -- was previously the latest entry

-- drop temp table
DROP TABLE temp_replaced_history ;

-- drop lh_all_flights_with_variants
DROP TABLE lh_all_flights_with_variants ;

-- drop queried dates
DROP TABLE queried_dates ;