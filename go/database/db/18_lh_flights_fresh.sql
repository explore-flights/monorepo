-- upsert history where it has changed since last update, update updated_at where it hasnt
CREATE TEMP TABLE lh_flights_fresh AS
SELECT
  f.airline AS airline,
  f.flightNumber AS flightNumber,
  f.suffix AS suffix,
  f.origin AS origin,
  f.departureDateLocal AS departureDateLocal,
  FIRST(f.id ORDER BY f.departureTimeLocal) AS id,
  FIRST(f.opAirline ORDER BY f.departureTimeLocal) AS opAirline,
  FIRST(f.opFlightNumber ORDER BY f.departureTimeLocal) AS opFlightNumber,
  FIRST(f.opSuffix ORDER BY f.departureTimeLocal) AS opSuffix,
  FIRST(f.queryDates ORDER BY f.departureTimeLocal) AS queryDates,
  FIRST(f.destination ORDER BY f.departureTimeLocal) AS destination,
  FIRST(f.serviceType ORDER BY f.departureTimeLocal) AS serviceType,
  FIRST(f.aircraftOwner ORDER BY f.departureTimeLocal) AS aircraftOwner,
  FIRST(f.aircraftType ORDER BY f.departureTimeLocal) AS aircraftType,
  FIRST(f.aircraftConfigurationVersion ORDER BY f.departureTimeLocal) AS aircraftConfigurationVersion,
  FIRST(f.registration ORDER BY f.departureTimeLocal) AS registration,
  FIRST(f.departureTimeLocal ORDER BY f.departureTimeLocal) AS departureTimeLocal,
  FIRST(f.departureUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS departureUTCOffsetSeconds,
  FIRST(f.arrivalDateLocal ORDER BY f.departureTimeLocal) AS arrivalDateLocal,
  FIRST(f.arrivalTimeLocal ORDER BY f.departureTimeLocal) AS arrivalTimeLocal,
  FIRST(f.arrivalUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS arrivalUTCOffsetSeconds,
  FIRST(f.durationSeconds ORDER BY f.departureTimeLocal) AS durationSeconds,
  FIRST(fv.id ORDER BY f.departureTimeLocal) AS flightVariantId,
  FIRST(fvh.created_at ORDER BY f.departureTimeLocal) AS latestHistoryCreatedAt,
  FIRST(fvh.flight_variant_id ORDER BY f.departureTimeLocal) AS latestHistoryVariantId,
  CAST(? AS TIMESTAMPTZ) AS createdAt
FROM (
  SELECT
    id,
    airline AS opAirline,
    flightNumber AS opFlightNumber,
    suffix AS opSuffix,
    airline,
    flightNumber,
    suffix,
    origin,
    queryDates,
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
    durationSeconds
  FROM lh_flight_schedules_operating
  UNION ALL
  SELECT
    id,
    airline AS opAirline,
    flightNumber AS opFlightNumber,
    suffix AS opSuffix,
    cs.airline AS airline,
    cs.flightNumber AS flightNumber,
    cs.suffix AS suffix,
    origin,
    queryDates,
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
    durationSeconds
  FROM (
    SELECT *, UNNEST(codeShares) cs
    FROM lh_flight_schedules_operating 
  )
) f
INNER JOIN flight_variants fv
ON f.opAirline = fv.operating_airline
AND f.opFlightNumber = fv.operating_number
AND f.opSuffix = fv.operating_suffix
AND f.origin = fv.departure_airport
AND f.departureTimeLocal = fv.departure_time_local
AND f.departureUTCOffsetSeconds = fv.departure_utc_offset_seconds
AND f.durationSeconds = fv.duration_seconds
AND f.destination = fv.arrival_airport
AND f.arrivalUTCOffsetSeconds = fv.arrival_utc_offset_seconds
AND f.serviceType = fv.service_type
AND f.aircraftOwner = fv.aircraft_owner
AND f.aircraftType = fv.aircraft_type
AND f.aircraftConfigurationVersion = fv.aircraft_configuration_version
AND f.registration = fv.aircraft_registration
LEFT JOIN (
  SELECT
    fvh_temp.airline,
    fvh_temp.number,
    fvh_temp.suffix,
    fvh_temp.departure_airport,
    fvh_temp.departure_date_local,
    MAX(fvh_temp.created_at) AS created_at,
    FIRST(fvh_temp.flight_variant_id ORDER BY fvh_temp.created_at DESC) AS flight_variant_id
  FROM flight_variant_history fvh_temp
  GROUP BY fvh_temp.airline, fvh_temp.number, fvh_temp.suffix, fvh_temp.departure_airport, fvh_temp.departure_date_local
) fvh
ON f.airline = fvh.airline
AND f.flightNumber = fvh.number
AND f.suffix = fvh.suffix
AND f.origin = fvh.departure_airport
AND f.departureDateLocal = fvh.departure_date_local
GROUP BY f.airline, f.flightNumber, f.suffix, f.origin, f.departureDateLocal