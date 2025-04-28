-- insert new variants
INSERT INTO flight_variants (
  id,
  operating_airline_id,
  operating_number,
  operating_suffix,
  departure_airport_id,
  departure_time_local,
  departure_utc_offset_seconds,
  duration_seconds,
  arrival_airport_id,
  arrival_utc_offset_seconds,
  service_type,
  aircraft_owner,
  aircraft_id,
  aircraft_configuration_version,
  aircraft_registration
)
SELECT
  UUID(),
  airline_identifiers.airline_id,
  fresh.flightNumber,
  fresh.suffix,
  dep_airport_identifiers.airport_id,
  fresh.departureTimeLocal,
  fresh.departureUTCOffsetSeconds,
  fresh.durationSeconds,
  arr_airport_identifiers.airport_id,
  fresh.arrivalUTCOffsetSeconds,
  fresh.serviceType,
  fresh.aircraftOwner,
  aircraft_identifiers.aircraft_id,
  fresh.aircraftConfigurationVersion,
  fresh.registration
FROM lh_flight_schedules_operating fresh
LEFT JOIN airline_identifiers
ON airline_identifiers.issuer = 'iata'
AND fresh.airline = airline_identifiers.identifier
LEFT JOIN airport_identifiers dep_airport_identifiers
ON dep_airport_identifiers.issuer = 'iata'
AND fresh.origin = dep_airport_identifiers.identifier
LEFT JOIN airport_identifiers arr_airport_identifiers
ON arr_airport_identifiers.issuer = 'iata'
AND fresh.destination = arr_airport_identifiers.identifier
LEFT JOIN aircraft_identifiers
ON aircraft_identifiers.issuer = 'iata'
AND fresh.aircraftType = aircraft_identifiers.identifier
GROUP BY
    airline_identifiers.airline_id,
    fresh.flightNumber,
    fresh.suffix,
    dep_airport_identifiers.airport_id,
    fresh.departureTimeLocal,
    fresh.departureUTCOffsetSeconds,
    fresh.durationSeconds,
    arr_airport_identifiers.airport_id,
    fresh.arrivalUTCOffsetSeconds,
    fresh.serviceType,
    fresh.aircraftOwner,
    aircraft_identifiers.aircraft_id,
    fresh.aircraftConfigurationVersion,
    fresh.registration
ON CONFLICT (
  operating_airline_id,
  operating_number,
  operating_suffix,
  departure_airport_id,
  departure_time_local,
  departure_utc_offset_seconds,
  duration_seconds,
  arrival_airport_id,
  arrival_utc_offset_seconds,
  service_type,
  aircraft_owner,
  aircraft_id,
  aircraft_configuration_version,
  aircraft_registration
) DO NOTHING ;