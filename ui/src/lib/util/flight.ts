import { FlightNumber } from '../api/api.model';

export function flightNumberToString(fn: FlightNumber): string {
  return `${fn.airline}${fn.number}${fn.suffix ?? ''}`;
}