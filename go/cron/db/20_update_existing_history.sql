UPDATE flight_variant_history fvh
SET updated_at = fresh.createdAt
FROM lh_flights_fresh fresh
WHERE fresh.airline = fvh.airline
AND fresh.flightNumber = fvh.number
AND fresh.suffix = fvh.suffix
AND fresh.origin = fvh.departure_airport
AND fresh.departureDateLocal = fvh.departure_date_local
AND fresh.latestHistoryCreatedAt = fvh.created_at
AND fresh.flightVariantId = fvh.flight_variant_id ;