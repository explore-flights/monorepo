-- insert new flight numbers 
INSERT OR IGNORE INTO flight_numbers
(airline, number, suffix)
SELECT DISTINCT airline, flightNumber, suffix
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
) ;