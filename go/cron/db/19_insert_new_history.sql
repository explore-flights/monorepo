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
  fresh.airline,
  fresh.flightNumber,
  fresh.suffix,
  fresh.origin,
  fresh.departureDateLocal,
  fresh.createdAt,
  fresh.createdAt,
  LIST_DISTINCT(
    LIST_CONCAT(
      COALESCE(fvh.query_dates, []),
      fresh.queryDates
    )
  ),
  fresh.flightVariantId
FROM lh_flights_fresh fresh
LEFT JOIN flight_variant_history fvh
ON fresh.airline = fvh.airline
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.origin = fvh.departure_airport
AND fresh.departureDateLocal = fvh.departure_date_local
AND fresh.latestHistoryCreatedAt = fvh.created_at
WHERE fvh.flight_variant_id IS NULL
OR fvh.flight_variant_id != fresh.flightVariantId ;