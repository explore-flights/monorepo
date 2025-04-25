-- insert new variants
INSERT INTO flight_variants (
  id,
  operating_airline,
  operating_number,
  operating_suffix,
  departure_airport,
  departure_time_local,
  departure_utc_offset_seconds,
  duration_seconds,
  arrival_airport,
  arrival_utc_offset_seconds,
  service_type,
  aircraft_owner,
  aircraft_type,
  aircraft_configuration_version,
  aircraft_registration
)
SELECT
  id,
  airline,
  flightNumber,
  suffix,
  origin,
  departureTimeLocal,
  departureUTCOffsetSeconds,
  durationSeconds,
  destination,
  arrivalUTCOffsetSeconds,
  serviceType,
  aircraftOwner,
  aircraftType,
  aircraftConfigurationVersion,
  registration
FROM lh_flight_schedules_operating
ON CONFLICT (
  operating_airline,
  operating_number,
  operating_suffix,
  departure_airport,
  departure_time_local,
  departure_utc_offset_seconds,
  duration_seconds,
  arrival_airport,
  arrival_utc_offset_seconds,
  service_type,
  aircraft_owner,
  aircraft_type,
  aircraft_configuration_version,
  aircraft_registration
) DO NOTHING ;