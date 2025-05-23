-- extract operating flights and aggregate codeshares
CREATE TEMP TABLE lh_flight_schedules_operating AS
SELECT
  UUID() AS id,
  airline,
  flightNumber,
  suffix,
  origin,
  ARRAY_AGG(DISTINCT queryDate) AS queryDates,
  MAP_FROM_ENTRIES(
    LIST_FILTER(
      MAP_ENTRIES(FIRST(dataElements ORDER BY priority ASC)),
      lambda e: e.key != 10 AND e.key != 50
    )
  ) AS dataElements,
  FIRST(sequenceNumber ORDER BY priority ASC) AS sequenceNumber,
  FIRST(destination ORDER BY priority ASC) AS destination,
  FIRST(serviceType ORDER BY priority ASC) AS serviceType,
  FIRST(IF(LENGTH(aircraftOwner) = 2, aircraftOwner, airline) ORDER BY priority ASC) AS aircraftOwner,
  FIRST(aircraftType ORDER BY priority ASC) AS aircraftType,
  COALESCE(FIRST(aircraftConfigurationVersion ORDER BY priority ASC), '') AS aircraftConfigurationVersion,
  FIRST(registration ORDER BY priority ASC) AS registration,
  departureDateLocal,
  FIRST(departureTimeLocal ORDER BY priority ASC) AS departureTimeLocal,
  FIRST(departureUTCOffsetSeconds ORDER BY priority ASC) AS departureUTCOffsetSeconds,
  FIRST(arrivalDateLocal ORDER BY priority ASC) AS arrivalDateLocal,
  FIRST(arrivalTimeLocal ORDER BY priority ASC) AS arrivalTimeLocal,
  FIRST(arrivalUTCOffsetSeconds ORDER BY priority ASC) AS arrivalUTCOffsetSeconds,
  FIRST(EPOCH(arrivalDateLocal + arrivalTimeLocal - TO_SECONDS(arrivalUTCOffsetSeconds)) - EPOCH(departureDateLocal + departureTimeLocal - TO_SECONDS(departureUTCOffsetSeconds)) ORDER BY priority ASC) AS durationSeconds,
  LIST_TRANSFORM(
    LIST_DISTINCT(FLATTEN(ARRAY_AGG(codeShares))),
    lambda cs: {
      'airline': REGEXP_EXTRACT(cs, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 1),
      'flightNumber': CAST(REGEXP_EXTRACT(cs, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 2) AS USMALLINT),
      'suffix': REGEXP_EXTRACT(cs, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 3)
    }
  ) AS codeShares
FROM (
  SELECT
    *,
    LIST_DISTINCT(FLATTEN(LIST_TRANSFORM(COALESCE(dataElements[10], []), lambda v: STRING_SPLIT(v, '/')))) AS codeShares,
    1 AS priority
  FROM lh_flight_schedules_flattened
  WHERE dataElements[50] IS NULL OR LENGTH(dataElements[50]) = 0
  UNION ALL
  SELECT
    queryDate,
    REGEXP_EXTRACT(operatingFlightNumber, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 1) AS airline,
    CAST(REGEXP_EXTRACT(operatingFlightNumber, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 2) AS USMALLINT) AS flightNumber,
    REGEXP_EXTRACT(operatingFlightNumber, '^([0-9A-Z]{2})([0-9]{1,4})([A-Z]?)$', 3) AS suffix,
    dataElements,
    sequenceNumber,
    origin,
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
    LIST_DISTINCT(
      LIST_APPEND(
        FLATTEN(LIST_TRANSFORM(COALESCE(dataElements[10], []), lambda v: STRING_SPLIT(v, '/'))),
        CONCAT(airline, flightNumber, suffix)
      )
    ) AS codeShares,
    2 AS priority
  FROM (
    SELECT *, UNNEST(dataElements[50]) AS operatingFlightNumber
    FROM lh_flight_schedules_flattened
    WHERE dataElements[50] IS NOT NULL AND LENGTH(dataElements[50]) > 0
  )
)
GROUP BY airline, flightNumber, suffix, origin, departureDateLocal ;

DROP TABLE lh_flight_schedules_flattened ;