export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}
