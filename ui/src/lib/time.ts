import type { FlightScheduleVariant } from '@/api/types';

export interface LocalScheduleTime {
  date: string;
  time: string;
  offset: string;
  dayDelta: number;
}

export function formatUtcOffset(seconds: number) {
  const sign = seconds < 0 ? '−' : '+';
  const absoluteMinutes = Math.abs(Math.round(seconds / 60));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function departureScheduleTime(
  date: string,
  variant: FlightScheduleVariant,
): LocalScheduleTime {
  return {
    date,
    time: normalizeTime(variant.departureTimeLocal),
    offset: formatUtcOffset(variant.departureUtcOffsetSeconds),
    dayDelta: 0,
  };
}

export function arrivalScheduleTime(
  date: string,
  variant: FlightScheduleVariant,
): LocalScheduleTime {
  const localDeparture = parseLocal(date, variant.departureTimeLocal);
  if (localDeparture === null) {
    return {
      date,
      time: '—',
      offset: formatUtcOffset(variant.arrivalUtcOffsetSeconds),
      dayDelta: 0,
    };
  }

  const departureInstant = localDeparture - variant.departureUtcOffsetSeconds * 1000;
  const localArrival = new Date(
    departureInstant + variant.durationSeconds * 1000 + variant.arrivalUtcOffsetSeconds * 1000,
  );
  const arrivalDate = `${localArrival.getUTCFullYear()}-${pad(localArrival.getUTCMonth() + 1)}-${pad(localArrival.getUTCDate())}`;
  return {
    date: arrivalDate,
    time: `${pad(localArrival.getUTCHours())}:${pad(localArrival.getUTCMinutes())}`,
    offset: formatUtcOffset(variant.arrivalUtcOffsetSeconds),
    dayDelta: differenceInCalendarDays(date, arrivalDate),
  };
}

export function scheduleInstant(date: string, variant: FlightScheduleVariant) {
  const local = parseLocal(date, variant.departureTimeLocal);
  return local === null ? Number.NaN : local - variant.departureUtcOffsetSeconds * 1000;
}

export function dayDeltaLabel(delta: number) {
  if (delta === 0) {
    return '';
  }
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function parseLocal(date: string, time: string) {
  const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!dateParts || !timeParts) {
    return null;
  }
  return Date.UTC(
    +dateParts[1],
    +dateParts[2] - 1,
    +dateParts[3],
    +timeParts[1],
    +timeParts[2],
    +(timeParts[3] ?? 0),
  );
}

function differenceInCalendarDays(from: string, to: string) {
  const fromTime = parseLocal(from, '00:00') ?? 0;
  const toTime = parseLocal(to, '00:00') ?? 0;
  return Math.round((toTime - fromTime) / 86_400_000);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
