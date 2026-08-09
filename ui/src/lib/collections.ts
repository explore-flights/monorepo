export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

export interface CountedValue {
  key: string;
  count: number;
}

export function countBy<T>(values: readonly T[], keyFor: (value: T) => string): CountedValue[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyFor(value);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}
