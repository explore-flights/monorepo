-- load updated raw data
-- id:lh_flight_schedules_raw
CREATE TEMP TABLE lh_flight_schedules_raw AS
SELECT *
FROM read_json(
  ?,
  filename = true,
  columns = {
    airline: 'TEXT NOT NULL',
    flightNumber: 'USMALLINT NOT NULL',
    suffix: 'TEXT NOT NULL',
    periodOfOperationUTC: 'STRUCT(startDate TEXT, endDate TEXT, daysOfOperation TEXT)',
    legs: 'STRUCT(sequenceNumber USMALLINT, origin TEXT, destination TEXT, serviceType TEXT, aircraftOwner TEXT, aircraftType TEXT, aircraftConfigurationVersion TEXT, registration TEXT, op BOOL, aircraftDepartureTimeUTC UINTEGER, aircraftDepartureTimeDateDiffUTC INTEGER, aircraftDepartureTimeVariation INTEGER, aircraftArrivalTimeUTC UINTEGER, aircraftArrivalTimeDateDiffUTC INTEGER, aircraftArrivalTimeVariation INTEGER)[]',
    dataElements: 'STRUCT(startLegSequenceNumber USMALLINT, endLegSequenceNumber USMALLINT, id INTEGER, value TEXT)[]'
  }
) ;