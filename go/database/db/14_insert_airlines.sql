-- insert new flight numbers 
INSERT OR IGNORE INTO airlines
(code)
SELECT DISTINCT airline
FROM (
  SELECT airline
  FROM lh_flight_schedules_operating
  UNION ALL
  SELECT cs.airline AS airline
  FROM (
    SELECT UNNEST(codeShares) cs
    FROM lh_flight_schedules_operating 
  )
) ;