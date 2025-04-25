-- create NULL (removed markers) copies of existing history for all query dates that are part of this update
INSERT INTO flight_variant_history (
  airline,
  number,
  suffix,
  departure_airport,
  departure_date_local,
  created_at,
  updated_at,
  query_dates,
  flight_variant_id
)
SELECT
  fvh.airline,
  fvh.number,
  fvh.suffix,
  fvh.departure_airport,
  fvh.departure_date_local,
  CAST(? AS TIMESTAMPTZ),
  CAST(? AS TIMESTAMPTZ),
  fvh.query_dates,
  NULL -- removed marker
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY airline, number, suffix, departure_airport, departure_date_local ORDER BY created_at DESC) AS rn
  FROM flight_variant_history
) fvh
WHERE LIST_HAS_ALL(
  (SELECT LIST_DISTINCT(FLATTEN(ARRAY_AGG(queryDates))) FROM lh_flights_fresh),
  fvh.query_dates
)
AND fvh.rn = 1
AND fvh.flight_variant_id IS NOT NULL
AND fvh.updated_at < CAST(? AS TIMESTAMPTZ) ;