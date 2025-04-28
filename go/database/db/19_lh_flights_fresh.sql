CREATE TEMP TABLE lh_flights_fresh AS
SELECT
  mrktg_airline_identifiers.airline_id AS airlineId,
  f.flightNumber AS flightNumber,
  f.suffix AS suffix,
  dep_airport_identifiers.airport_id AS departureAirportId,
  f.departureDateLocal AS departureDateLocal,
  LAST(op_airline_identifiers.airline_id ORDER BY f.departureTimeLocal) AS opAirlineId,
  LAST(f.opFlightNumber ORDER BY f.departureTimeLocal) AS opFlightNumber,
  LAST(f.opSuffix ORDER BY f.departureTimeLocal) AS opSuffix,
  LAST(f.queryDates ORDER BY f.departureTimeLocal) AS queryDates,
  LAST(arr_airport_identifiers.airport_id ORDER BY f.departureTimeLocal) AS arrivalAirportId,
  LAST(f.serviceType ORDER BY f.departureTimeLocal) AS serviceType,
  LAST(f.aircraftOwner ORDER BY f.departureTimeLocal) AS aircraftOwner,
  LAST(aircraft_identifiers.aircraft_id ORDER BY f.departureTimeLocal) AS aircraftId,
  LAST(f.aircraftConfigurationVersion ORDER BY f.departureTimeLocal) AS aircraftConfigurationVersion,
  LAST(f.registration ORDER BY f.departureTimeLocal) AS registration,
  LAST(f.departureTimeLocal ORDER BY f.departureTimeLocal) AS departureTimeLocal,
  LAST(f.departureUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS departureUTCOffsetSeconds,
  LAST(f.arrivalDateLocal ORDER BY f.departureTimeLocal) AS arrivalDateLocal,
  LAST(f.arrivalTimeLocal ORDER BY f.departureTimeLocal) AS arrivalTimeLocal,
  LAST(f.arrivalUTCOffsetSeconds ORDER BY f.departureTimeLocal) AS arrivalUTCOffsetSeconds,
  LAST(f.durationSeconds ORDER BY f.departureTimeLocal) AS durationSeconds,
  LAST(fv.id ORDER BY f.departureTimeLocal) AS flightVariantId,
  LAST(fvh.created_at ORDER BY f.departureTimeLocal) AS latestHistoryCreatedAt,
  LAST(fvh.flight_variant_id ORDER BY f.departureTimeLocal) AS latestHistoryVariantId,
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
LEFT JOIN airline_identifiers op_airline_identifiers
ON op_airline_identifiers.issuer = 'iata'
AND f.opAirline = op_airline_identifiers.identifier
LEFT JOIN airline_identifiers mrktg_airline_identifiers
ON mrktg_airline_identifiers.issuer = 'iata'
AND f.airline = mrktg_airline_identifiers.identifier
LEFT JOIN airport_identifiers dep_airport_identifiers
ON dep_airport_identifiers.issuer = 'iata'
AND f.origin = dep_airport_identifiers.identifier
LEFT JOIN airport_identifiers arr_airport_identifiers
ON arr_airport_identifiers.issuer = 'iata'
AND f.destination = arr_airport_identifiers.identifier
LEFT JOIN aircraft_identifiers
ON aircraft_identifiers.issuer = 'iata'
AND f.aircraftType = aircraft_identifiers.identifier
LEFT JOIN flight_variants fv
ON op_airline_identifiers.airline_id = fv.operating_airline_id
AND f.opFlightNumber = fv.operating_number
AND f.opSuffix = fv.operating_suffix
AND dep_airport_identifiers.airport_id = fv.departure_airport_id
AND f.departureTimeLocal = fv.departure_time_local
AND f.departureUTCOffsetSeconds = fv.departure_utc_offset_seconds
AND f.durationSeconds = fv.duration_seconds
AND arr_airport_identifiers.airport_id = fv.arrival_airport_id
AND f.arrivalUTCOffsetSeconds = fv.arrival_utc_offset_seconds
AND f.serviceType = fv.service_type
AND f.aircraftOwner = fv.aircraft_owner
AND aircraft_identifiers.aircraft_id = fv.aircraft_id
AND f.aircraftConfigurationVersion = fv.aircraft_configuration_version
AND f.registration = fv.aircraft_registration
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
ON mrktg_airline_identifiers.airline_id = fvh.airline_id
AND f.flightNumber = fvh.number
AND f.suffix = fvh.suffix
AND dep_airport_identifiers.airport_id = fvh.departure_airport_id
AND f.departureDateLocal = fvh.departure_date_local
GROUP BY mrktg_airline_identifiers.airline_id, f.flightNumber, f.suffix, dep_airport_identifiers.airport_id, f.departureDateLocal ;