-- create temp table with only new airports
CREATE TEMP TABLE temp_new_airports AS
SELECT
    UUID() AS id,
    fresh.airport AS iata_code
FROM (
    SELECT UNNEST([origin, destination]) AS airport
    FROM lh_flight_schedules_operating
) fresh
LEFT JOIN airport_identifiers
ON airport_identifiers.issuer = 'iata'
AND fresh.airport = airport_identifiers.identifier
WHERE airport_identifiers.issuer IS NULL
GROUP BY fresh.airport ;

-- insert airport ids
INSERT INTO airports
(id, iata_area_code, country_code, city_code, type, lng, lat, timezone, name)
SELECT id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM temp_new_airports ;

-- insert airport identifiers
INSERT INTO airport_identifiers
(issuer, identifier, airport_id)
SELECT 'iata', iata_code, id
FROM temp_new_airports ;

-- drop temp table
DROP TABLE temp_new_airports ;