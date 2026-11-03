export interface DepartureWindow {
  start: string;
  end: string;
  durationMs: number;
}

const defaultDurationMs = (24 * 60 - 1) * 60_000;

export function createDepartureWindow(start: string, end: string): DepartureWindow {
  const durationMs = Date.parse(`${end}Z`) - Date.parse(`${start}Z`);
  return {
    start,
    end,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : defaultDurationMs,
  };
}

export function updateDepartureWindow(
  current: DepartureWindow,
  field: 'start' | 'end',
  value: string,
): DepartureWindow {
  const next = { ...current, [field]: value };
  const start = Date.parse(`${next.start}Z`);
  const end = Date.parse(`${next.end}Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return next;
  }

  if (start > end) {
    if (field === 'start') {
      return { ...next, end: new Date(start + current.durationMs).toISOString().slice(0, 16) };
    }
    return { ...next, start: new Date(end - current.durationMs).toISOString().slice(0, 16) };
  }

  if (end >= start) {
    return { ...next, durationMs: end - start };
  }

  return next;
}
