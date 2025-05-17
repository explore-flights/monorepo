-- create temp table of the entries which are going to be replaced
CREATE TEMP TABLE temp_replaced_history AS
SELECT
    fvh.*,
    fresh.createdAt AS new_replaced_at
FROM lh_flights_fresh fresh
INNER JOIN flight_variant_history fvh
ON fresh.airlineId = fvh.airline_id
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.departureAirportId = fvh.departure_airport_id
AND fresh.departureDateLocal = fvh.departure_date_local
AND fresh.latestHistoryCreatedAt = fvh.created_at
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
  LIST_DISTINCT(
    LIST_CONCAT(
      COALESCE(fvh.query_dates, []),
      fresh.queryDates
    )
  ),
  fresh.flightVariantId
FROM lh_flights_fresh fresh
LEFT JOIN flight_variant_history fvh
ON fresh.airlineId = fvh.airline_id
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.departureAirportId = fvh.departure_airport_id
AND fresh.departureDateLocal = fvh.departure_date_local
AND fresh.latestHistoryCreatedAt = fvh.created_at
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
  flight_variant_id
FROM temp_replaced_history ;

-- drop temp table
DROP TABLE temp_replaced_history ;