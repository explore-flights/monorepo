import type { Aircraft, Airline, Airport, FlightNumber } from '@/api/types';

type ReferenceLookup<Item> = Readonly<Record<string, Item>>;
const numberFormatter = new Intl.NumberFormat();
const compactNumberFormatter = new Intl.NumberFormat(undefined, { notation: 'compact' });

export function airportCode(id: string, airports: ReferenceLookup<Airport>) {
  return airports[id]?.iataCode || id;
}

export function airportName(id: string, airports: ReferenceLookup<Airport>) {
  const airport = airports[id];
  return airport?.name || airport?.iataCode || id;
}

export function airportLabel(id: string, airports: ReferenceLookup<Airport>) {
  const code = airportCode(id, airports);
  const name = airportName(id, airports);
  return code === name ? code : `${code} · ${name}`;
}

export function aircraftName(id: string, aircraft: ReferenceLookup<Aircraft>) {
  const item = aircraft[id];
  return item?.name || item?.iataCode || item?.icaoCode || id;
}

export function airlineName(id: string, airlines: ReferenceLookup<Airline>) {
  const airline = airlines[id];
  return airline?.name || airline?.iataCode || airline?.icaoCode || id;
}

export function flightName(flight: FlightNumber, airlines?: Record<string, Airline>) {
  const airline = airlines?.[flight.airlineId];
  return `${airline?.iataCode || flight.airlineId}${flight.number}${flight.suffix ?? ''}`.toUpperCase();
}

export function normalizeFlightNumber(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '0m';
}

export function numberLabel(value: number) {
  return numberFormatter.format(value);
}

export function compactNumberLabel(value: number) {
  return compactNumberFormatter.format(value);
}

export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(calendarDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const resolvedOptions = options ?? { dateStyle: 'medium' };
  const stableOptions =
    calendarDate && resolvedOptions.timeZone === undefined
      ? { ...resolvedOptions, timeZone: 'UTC' }
      : resolvedOptions;
  return new Intl.DateTimeFormat(undefined, stableOptions).format(date);
}

export function fullDateLabel(value: string) {
  return dateLabel(value, { dateStyle: 'full' });
}

export function dateTimeLabel(value: string) {
  return dateLabel(value, { dateStyle: 'medium', timeStyle: 'short' });
}

export function scheduleDateTimeLabel(date: string, time: string) {
  return `${dateLabel(date)} ${time}`;
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
