-- flattten legs into rows
CREATE TEMP TABLE lh_flight_schedules_flattened AS
SELECT
  CAST(REGEXP_REPLACE(filename, '^.*/([0-9]{4})/([0-9]{2})/([0-9]{2})\.json$', '\1-\2-\3') AS DATE) AS queryDate,
  airline,
  flightNumber,
  suffix,
  LIST_REDUCE(
    LIST_TRANSFORM(
      LIST_FILTER(dataElements, lambda de: sequenceNumber BETWEEN de.startLegSequenceNumber AND de.endLegSequenceNumber),
      lambda de: MAP {de.id: [de.value]}
    ),
    lambda acc, e: MAP_FROM_ENTRIES(LIST_TRANSFORM(
      LIST_DISTINCT(MAP_KEYS(acc) || MAP_KEYS(e)),
      lambda k: {k: k, v: LIST_DISTINCT(COALESCE(acc[k], []) || COALESCE(e[k], []))}
    ))
  ) AS dataElements,
  sequenceNumber,
  origin,
  destination,
  serviceType,
  aircraftOwner,
  aircraftType,
  aircraftConfigurationVersion,
  registration,
  CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS DATE) AS departureDateLocal,
  CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftDepartureTimeDateDiffUTC) + TO_MINUTES(aircraftDepartureTimeUTC) + TO_MINUTES(aircraftDepartureTimeVariation) AS TIME) AS departureTimeLocal,
  aircraftDepartureTimeVariation * 60 AS departureUTCOffsetSeconds,
  CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS DATE) AS arrivalDateLocal,
  CAST(STRPTIME(periodOfOperationUTC.startDate, '%d%b%y') + TO_DAYS(aircraftArrivalTimeDateDiffUTC) + TO_MINUTES(aircraftArrivalTimeUTC) + TO_MINUTES(aircraftArrivalTimeVariation) AS TIME) AS arrivalTimeLocal,
  aircraftArrivalTimeVariation * 60 AS arrivalUTCOffsetSeconds
FROM (
  SELECT
    filename,
    airline,
    flightNumber,
    suffix,
    periodOfOperationUTC,
    dataElements,
    leg.*
  FROM (
    SELECT *, UNNEST(legs) AS leg
    FROM lh_flight_schedules_raw
  )
) ;

DROP TABLE lh_flight_schedules_raw ;