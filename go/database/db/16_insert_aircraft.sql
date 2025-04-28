-- create temp table with only new aircraft
CREATE TEMP TABLE temp_new_aircraft AS
SELECT
    UUID() AS id,
    fresh.aircraftType AS iata_code
FROM lh_flight_schedules_operating fresh
LEFT JOIN aircraft_identifiers
ON aircraft_identifiers.issuer = 'iata'
AND fresh.aircraftType = aircraft_identifiers.identifier
WHERE aircraft_identifiers.issuer IS NULL
GROUP BY fresh.aircraftType ;

-- insert aircraft ids
INSERT INTO aircraft
(id, equip_code, name)
SELECT id, NULL, NULL
FROM temp_new_aircraft ;

-- insert aircraft identifiers
INSERT INTO aircraft_identifiers
(issuer, identifier, aircraft_id)
SELECT 'iata', iata_code, id
FROM temp_new_aircraft ;

-- drop temp table
DROP TABLE temp_new_aircraft ;