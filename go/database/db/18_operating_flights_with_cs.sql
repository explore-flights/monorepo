CREATE TEMP TABLE lh_flight_schedules_operating_with_cs AS
SELECT
    op_airline_identifiers.airline_id AS airlineId,
    f.flightNumber,
    f.suffix,
    dep_airport_identifiers.airport_id AS departureAirportId,
    f.departureDateLocal,
    FIRST(arr_airport_identifiers.airport_id) AS arrivalAirportId,
    FIRST(f.queryDates) AS queryDates,
    FIRST(f.serviceType) AS serviceType,
    FIRST(f.aircraftOwner) AS aircraftOwner,
    FIRST(aircraft_identifiers.aircraft_id) AS aircraftId,
    FIRST(f.aircraftConfigurationVersion) AS aircraftConfigurationVersion,
    FIRST(f.registration) AS registration,
    FIRST(f.departureTimeLocal) AS departureTimeLocal,
    FIRST(f.departureUTCOffsetSeconds) AS departureUTCOffsetSeconds,
    FIRST(f.arrivalDateLocal) AS arrivalDateLocal,
    FIRST(f.arrivalTimeLocal) AS arrivalTimeLocal,
    FIRST(f.arrivalUTCOffsetSeconds) AS arrivalUTCOffsetSeconds,
    FIRST(f.durationSeconds) AS durationSeconds,
    LIST_SORT(
        LIST_DISTINCT(
            COALESCE(
                ARRAY_AGG({
                    'airline_id': cs_airline_identifiers.airline_id,
                    'number': f.cs.flightNumber,
                    'suffix': f.cs.suffix
                }) FILTER ( cs_airline_identifiers.airline_id IS NOT NULL ),
                []
            )
        )
    ) AS codeShares
FROM (
    SELECT *, UNNEST(codeShares) AS cs
    FROM lh_flight_schedules_operating
) f
LEFT JOIN airline_identifiers op_airline_identifiers
ON op_airline_identifiers.issuer = 'iata'
AND f.airline = op_airline_identifiers.identifier
LEFT JOIN airline_identifiers cs_airline_identifiers
ON cs_airline_identifiers.issuer = 'iata'
AND f.cs.airline = cs_airline_identifiers.identifier
LEFT JOIN airport_identifiers dep_airport_identifiers
ON dep_airport_identifiers.issuer = 'iata'
AND f.origin = dep_airport_identifiers.identifier
LEFT JOIN airport_identifiers arr_airport_identifiers
ON arr_airport_identifiers.issuer = 'iata'
AND f.destination = arr_airport_identifiers.identifier
LEFT JOIN aircraft_identifiers
ON aircraft_identifiers.issuer = 'iata'
AND f.aircraftType = aircraft_identifiers.identifier
GROUP BY
    op_airline_identifiers.airline_id,
    f.flightNumber,
    f.suffix,
    dep_airport_identifiers.airport_id,
    f.departureDateLocal
;

DROP TABLE lh_flight_schedules_operating ;