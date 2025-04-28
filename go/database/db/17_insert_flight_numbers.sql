-- insert new flight numbers 
INSERT OR IGNORE INTO flight_numbers
(airline_id, number, suffix)
SELECT DISTINCT airline_identifiers.airline_id, fresh.flightNumber, fresh.suffix
FROM (
  SELECT
    airline,
    flightNumber,
    suffix
  FROM lh_flight_schedules_operating
  UNION ALL
  SELECT
    cs.airline AS airline,
    cs.flightNumber AS flightNumber,
    cs.suffix AS suffix,
  FROM (
    SELECT UNNEST(codeShares) cs
    FROM lh_flight_schedules_operating 
  )
) fresh
LEFT JOIN airline_identifiers
ON airline_identifiers.issuer = 'iata'
AND fresh.airline = airline_identifiers.identifier ;