import { Airline, Airport, FlightNumber } from '../api/api.model';

export function flightNumberToString(fn: FlightNumber, airline: Airline): string {
  return `${airline.iataCode ?? airline.icaoCode ?? (fn.airlineId + '-')}${fn.number}${fn.suffix ?? ''}`;
}

export function airportToString(airport: Airport): string {
  return airport.iataCode ?? airport.icaoCode ?? airport.name ?? airport.id;
}