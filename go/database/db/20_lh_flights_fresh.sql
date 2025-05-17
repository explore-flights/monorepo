CREATE TEMP TABLE lh_flights_fresh AS
SELECT
  f.airlineId AS airlineId,
  f.flightNumber AS flightNumber,
  f.suffix AS suffix,
  f.departureAirportId AS departureAirportId,
  f.departureDateLocal AS departureDateLocal,
  LAST(f.opAirlineId ORDER BY f.departureTimeLocal) AS opAirlineId,
  LAST(f.opFlightNumber ORDER BY f.departureTimeLocal) AS opFlightNumber,
  LAST(f.opSuffix ORDER BY f.departureTimeLocal) AS opSuffix,
  LAST(f.queryDates ORDER BY f.departureTimeLocal) AS queryDates,
  LAST(f.arrivalAirportId ORDER BY f.departureTimeLocal) AS arrivalAirportId,
  LAST(f.serviceType ORDER BY f.departureTimeLocal) AS serviceType,
  LAST(f.aircraftOwner ORDER BY f.departureTimeLocal) AS aircraftOwner,
  LAST(f.aircraftId ORDER BY f.departureTimeLocal) AS aircraftId,
  LAST(f.aircraftConfigurationVersion ORDER BY f.departureTimeLocal) AS aircraftConfigurationVersion,
  LAST(f.registration ORDER BY f.departureTimeLocal) AS registration,
  LAST(f.departureTimeLocal ORDER BY f.departureTimeLocal) AS departureTimeLocal,
  LAST(f.departureUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS departureUTCOffsetSeconds,
  LAST(f.arrivalDateLocal ORDER BY f.departureTimeLocal) AS arrivalDateLocal,
  LAST(f.arrivalTimeLocal ORDER BY f.departureTimeLocal) AS arrivalTimeLocal,
  LAST(f.arrivalUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS arrivalUTCOffsetSeconds,
  LAST(f.durationSeconds ORDER BY f.departureTimeLocal) AS durationSeconds,
  LAST(f.codeShares ORDER BY f.departureTimeLocal) AS codeShares,
  LAST(fv.id ORDER BY f.departureTimeLocal) AS flightVariantId,
  LAST(fvh.created_at ORDER BY f.departureTimeLocal) AS latestHistoryCreatedAt,
  LAST(fvh.flight_variant_id ORDER BY f.departureTimeLocal) AS latestHistoryVariantId,
  CAST(? AS TIMESTAMPTZ) AS createdAt
FROM (
  SELECT
    airlineId AS opAirlineId,
    flightNumber AS opFlightNumber,
    suffix AS opSuffix,
    airlineId,
    flightNumber,
    suffix,
    departureAirportId,
    queryDates,
    arrivalAirportId,
    serviceType,
    aircraftOwner,
    aircraftId,
    aircraftConfigurationVersion,
    registration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    durationSeconds,
    codeShares
  FROM lh_flight_schedules_operating_with_cs
  UNION ALL
  SELECT
    airlineId AS opAirlineId,
    flightNumber AS opFlightNumber,
    suffix AS opSuffix,
    cs.airline_id AS airlineId,
    cs.number AS flightNumber,
    cs.suffix AS suffix,
    departureAirportId,
    queryDates,
    arrivalAirportId,
    serviceType,
    aircraftOwner,
    aircraftId,
    aircraftConfigurationVersion,
    registration,
    departureDateLocal,
    departureTimeLocal,
    departureUTCOffsetSeconds,
    arrivalDateLocal,
    arrivalTimeLocal,
    arrivalUTCOffsetSeconds,
    durationSeconds,
    codeShares
  FROM (
    SELECT *, UNNEST(codeShares) cs
    FROM lh_flight_schedules_operating_with_cs
  )
) f
LEFT JOIN flight_variants fv
ON f.opAirlineId = fv.operating_airline_id
AND f.opFlightNumber = fv.operating_number
AND f.opSuffix = fv.operating_suffix
AND f.departureAirportId = fv.departure_airport_id
AND f.departureTimeLocal = fv.departure_time_local
AND f.departureUTCOffsetSeconds = fv.departure_utc_offset_seconds
AND f.durationSeconds = fv.duration_seconds
AND f.arrivalAirportId = fv.arrival_airport_id
AND f.arrivalUTCOffsetSeconds = fv.arrival_utc_offset_seconds
AND f.serviceType = fv.service_type
AND f.aircraftOwner = fv.aircraft_owner
AND f.aircraftId = fv.aircraft_id
AND f.aircraftConfigurationVersion = fv.aircraft_configuration_version
AND f.registration = fv.aircraft_registration
AND HASH(f.codeShares) = fv.code_shares_hash
LEFT JOIN (
  SELECT
    fvh_temp.airline_id,
    fvh_temp.number,
    fvh_temp.suffix,
    fvh_temp.departure_airport_id,
    fvh_temp.departure_date_local,
    MAX(fvh_temp.created_at) AS created_at,
    LAST(fvh_temp.flight_variant_id ORDER BY fvh_temp.created_at) AS flight_variant_id
  FROM flight_variant_history fvh_temp
  GROUP BY fvh_temp.airline_id, fvh_temp.number, fvh_temp.suffix, fvh_temp.departure_airport_id, fvh_temp.departure_date_local
) fvh
ON f.airlineId = fvh.airline_id
AND f.flightNumber = fvh.number
AND f.suffix = fvh.suffix
AND f.departureAirportId = fvh.departure_airport_id
AND f.departureDateLocal = fvh.departure_date_local
GROUP BY
  f.airlineId,
  f.flightNumber,
  f.suffix,
  f.departureAirportId,
  f.departureDateLocal
;

DROP TABLE lh_flight_schedules_operating_with_cs ;