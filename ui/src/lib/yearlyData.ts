export type YearSelection = { mode: 'discover' } | { mode: 'single'; year: number };

export interface YearlyData<T> {
  data: T;
  year: number;
}

interface DiscoverYearlyDataOptions<T> {
  currentYear: number;
  load: (year: number) => Promise<T>;
  hasData: (data: T) => boolean;
  emptyMessage: (year: number) => string;
  notFoundMessage: string;
  earliestYear?: number;
}

export async function loadYearlyData<T>(
  year: number,
  load: (year: number) => Promise<T>,
): Promise<YearlyData<T>> {
  return { data: await load(year), year };
}

export async function discoverYearlyData<T>({
  currentYear,
  load,
  hasData,
  emptyMessage,
  notFoundMessage,
  earliestYear = 2024,
}: DiscoverYearlyDataOptions<T>): Promise<YearlyData<T>> {
  let lastError = new Error(notFoundMessage);

  for (const year of discoveryYears(currentYear, earliestYear)) {
    try {
      const result = await loadYearlyData(year, load);
      if (hasData(result.data)) {
        return result;
      }
      lastError = new Error(emptyMessage(year));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(notFoundMessage);
    }
  }

  throw lastError;
}

function discoveryYears(currentYear: number, earliestYear: number): number[] {
  const years = [currentYear];
  for (let year = currentYear - 1; year >= earliestYear; year -= 1) {
    years.push(year);
  }
  years.push(currentYear + 1);
  return years;
}
