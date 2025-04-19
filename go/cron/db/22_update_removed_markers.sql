-- update updated_at where the latest version is already a delete marker
UPDATE flight_variant_history fvh
SET updated_at = CAST(? AS TIMESTAMPTZ)
WHERE created_at = (
  SELECT MAX(ref.created_at)
  FROM flight_variant_history ref
  WHERE ref.airline = fvh.airline
  AND ref.number = fvh.number
  AND ref.suffix = fvh.suffix
  AND ref.departure_airport = fvh.departure_airport
  AND ref.departure_date_local = fvh.departure_date_local
)
AND LIST_HAS_ALL(
  (SELECT LIST_DISTINCT(FLATTEN(ARRAY_AGG(queryDates))) FROM lh_flights_fresh),
  fvh.query_dates
)
AND fvh.flight_variant_id IS NULL
AND fvh.updated_at < CAST(? AS TIMESTAMPTZ) ;