import type {
  AirportDirectionStatistics,
  AirportMovementDirection,
  AirportRouteStatistics,
  AirportSummary,
} from '@/api/types';
import { daysBetween } from '@/lib/date';

export interface AggregatedAirportRoute {
  otherAirportId: string;
  scheduledLegs: number;
  firstDateLocal: string;
  lastDateLocal: string;
  airlineIds: readonly string[];
  aircraftIds: readonly string[];
  durationSecondsTotal: number;
  durationSecondsAverage: number;
  breakdown: readonly AirportRouteStatistics[];
}

export interface MonthlyActivity {
  month: number;
  departures: number;
  arrivals: number;
}

export interface EquipmentUtilization {
  aircraftId: string;
  scheduledLegs: number;
  share: number;
  routeCount: number;
  airlineIds: readonly string[];
}

export interface OffsetTimestampParts {
  date: string;
  time: string;
  offset: string;
}

export function directionStatistics(
  summary: AirportSummary,
  direction: AirportMovementDirection,
): AirportDirectionStatistics | undefined {
  return summary.directions.find((item) => item.direction === direction);
}

export function defaultDirection(summary: AirportSummary): AirportMovementDirection {
  if (directionStatistics(summary, 'departure')?.scheduledLegs) {
    return 'departure';
  }

  return 'arrival';
}

export function aggregateAirportRoutes(
  rows: readonly AirportRouteStatistics[],
): AggregatedAirportRoute[] {
  const grouped = new Map<string, AirportRouteStatistics[]>();
  for (const row of rows) {
    grouped.set(row.otherAirportId, [...(grouped.get(row.otherAirportId) ?? []), row]);
  }

  return [...grouped.entries()].map(([otherAirportId, breakdown]) => {
    const scheduledLegs = sum(breakdown.map((row) => row.scheduledLegs));
    const durationSecondsTotal = sum(breakdown.map((row) => row.durationSecondsTotal));

    return {
      otherAirportId,
      scheduledLegs,
      firstDateLocal: breakdown.reduce(
        (earliest, row) => (row.firstDateLocal < earliest ? row.firstDateLocal : earliest),
        breakdown[0].firstDateLocal,
      ),
      lastDateLocal: breakdown.reduce(
        (latest, row) => (row.lastDateLocal > latest ? row.lastDateLocal : latest),
        breakdown[0].lastDateLocal,
      ),
      airlineIds: [...new Set(breakdown.map((row) => row.operatingAirlineId))].sort(),
      aircraftIds: [...new Set(breakdown.map((row) => row.aircraftId))].sort(),
      durationSecondsTotal,
      durationSecondsAverage: scheduledLegs ? durationSecondsTotal / scheduledLegs : 0,
      breakdown,
    };
  });
}

export function monthlyActivity(summary: AirportSummary): MonthlyActivity[] {
  const departures = monthlyTotals(directionStatistics(summary, 'departure'));
  const arrivals = monthlyTotals(directionStatistics(summary, 'arrival'));

  return Array.from({ length: 12 }, (_, month) => ({
    month,
    departures: departures[month],
    arrivals: arrivals[month],
  }));
}

export function equipmentUtilization(
  rows: readonly AirportRouteStatistics[],
): EquipmentUtilization[] {
  const total = sum(rows.map((row) => row.scheduledLegs));
  const grouped = new Map<
    string,
    { scheduledLegs: number; routes: Set<string>; airlines: Set<string> }
  >();
  for (const row of rows) {
    const current = grouped.get(row.aircraftId) ?? {
      scheduledLegs: 0,
      routes: new Set<string>(),
      airlines: new Set<string>(),
    };
    current.scheduledLegs += row.scheduledLegs;
    current.routes.add(row.otherAirportId);
    current.airlines.add(row.operatingAirlineId);
    grouped.set(row.aircraftId, current);
  }

  return [...grouped.entries()]
    .map(([aircraftId, item]) => ({
      aircraftId,
      scheduledLegs: item.scheduledLegs,
      share: total ? item.scheduledLegs / total : 0,
      routeCount: item.routes.size,
      airlineIds: [...item.airlines].sort(),
    }))
    .sort((left, right) => right.scheduledLegs - left.scheduledLegs);
}

export function airportLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

export function defaultAirportDate(summary: AirportSummary, today: string): string | undefined {
  const dates = [
    ...new Set(
      summary.directions.flatMap((direction) =>
        direction.days.filter((day) => day.scheduledLegs > 0).map((day) => day.dateLocal),
      ),
    ),
  ].sort();
  if (dates.includes(today)) {
    return today;
  }

  return dates.sort((left, right) => {
    const leftDistance = Math.abs(daysBetween(today, left));
    const rightDistance = Math.abs(daysBetween(today, right));
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return right.localeCompare(left);
  })[0];
}

export function adjacentActiveDate(
  direction: AirportDirectionStatistics | undefined,
  selectedDate: string,
  offset: -1 | 1,
): string | undefined {
  const dates = direction?.days
    .filter((day) => day.scheduledLegs > 0)
    .map((day) => day.dateLocal)
    .sort();
  if (!dates?.length) {
    return;
  }

  if (offset < 0) {
    return [...dates].reverse().find((date) => date < selectedDate);
  }

  return dates.find((date) => date > selectedDate);
}

export function offsetTimestampParts(value: string): OffsetTimestampParts {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) {
    return { date: value.slice(0, 10), time: value, offset: '' };
  }

  return { date: match[1], time: match[2], offset: match[3] };
}

export function localDayOffset(referenceTimestamp: string, otherTimestamp: string): number {
  return daysBetween(
    offsetTimestampParts(referenceTimestamp).date,
    offsetTimestampParts(otherTimestamp).date,
  );
}

function monthlyTotals(direction: AirportDirectionStatistics | undefined): number[] {
  const totals = Array.from({ length: 12 }, () => 0);
  for (const day of direction?.days ?? []) {
    const month = Number(day.dateLocal.slice(5, 7)) - 1;
    if (month >= 0 && month < totals.length) {
      totals[month] += day.scheduledLegs;
    }
  }

  return totals;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
