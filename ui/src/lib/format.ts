import type { Airline, FlightNumber } from '@/api/types';

export function flightName(flight: FlightNumber, airlines?: Record<string, Airline>) {
  const airline = airlines?.[flight.airlineId];
  return `${airline?.iataCode ?? flight.airlineId}${flight.number}${flight.suffix ?? ''}`.toUpperCase();
}

export function normalizeFlightNumber(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '0m';
}

export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium' }).format(date);
}

export function dateRangeLabel(from: string, to: string) {
  const first = dateLabel(from, { month: 'short', day: 'numeric' });
  const last = dateLabel(to, { month: 'short', day: 'numeric' });
  return from === to ? first : `${first} – ${last}`;
}

export function timeLabel(value: string) {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
