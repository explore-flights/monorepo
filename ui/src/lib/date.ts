export type ScheduleScope = 'upcoming' | 'historical';
export const dateBases = ['local', 'utc'] as const;
export const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type DateBasis = (typeof dateBases)[number];

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekdayForDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function daysBetween(left: string, right: string): number {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY_MS);
}

export function rangeForYearScope(
  scope: ScheduleScope,
  year: number,
  today: string,
): DateRange | undefined {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  if (scope === 'upcoming') {
    return today > end ? undefined : { from: today < start ? start : today, to: end };
  }

  if (today <= start) {
    return undefined;
  }

  return { from: start, to: today > end ? end : addDays(today, -1) };
}

export function matchingScheduleScope(
  from: string,
  to: string,
  upcoming: DateRange | undefined,
  historical: DateRange | undefined,
): ScheduleScope | undefined {
  if (upcoming && from === upcoming.from && to === upcoming.to) {
    return 'upcoming';
  }
  if (historical && from === historical.from && to === historical.to) {
    return 'historical';
  }
  return undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
