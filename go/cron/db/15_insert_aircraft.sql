-- insert new flight numbers 
INSERT OR IGNORE INTO aircraft
(code)
SELECT DISTINCT aircraftType
FROM lh_flight_schedules_operating ;