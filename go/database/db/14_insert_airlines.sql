-- create temp table with only new airlines
CREATE TEMP TABLE temp_new_airlines AS
SELECT
    UUID() AS id,
    fresh.airline AS iata_code
FROM (
    SELECT airline
    FROM lh_flight_schedules_operating
    UNION ALL
    SELECT cs.airline AS airline
    FROM (
        SELECT UNNEST(codeShares) cs
        FROM lh_flight_schedules_operating
    )
) fresh
LEFT JOIN airline_identifiers
ON airline_identifiers.issuer = 'iata'
AND fresh.airline = airline_identifiers.identifier
WHERE airline_identifiers.issuer IS NULL
GROUP BY fresh.airline ;

-- insert airline ids
INSERT INTO airlines
(id, name)
SELECT id, NULL
FROM temp_new_airlines ;

-- insert airline identifiers
INSERT INTO airline_identifiers
(issuer, identifier, airline_id)
SELECT 'iata', iata_code, id
FROM temp_new_airlines ;

-- drop temp table
DROP TABLE temp_new_airlines ;