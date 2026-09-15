export interface PlaybackClock {
  time: number;
  wallTime: number;
  speed: number;
}

const minimumTime = Date.parse('0001-01-01T00:00:00Z');
const maximumTime = Date.parse('9999-12-31T23:59:59Z');

export function simulatedTime(clock: PlaybackClock, wallTime: number): number {
  return Math.max(
    minimumTime,
    Math.min(maximumTime, clock.time + (wallTime - clock.wallTime) * clock.speed),
  );
}

export function changePlaybackSpeed(
  clock: PlaybackClock,
  speed: number,
  wallTime: number,
): PlaybackClock {
  return { time: simulatedTime(clock, wallTime), wallTime, speed };
}

export function simulationInputValue(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseSimulationInput(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return;
  }
  const time = new Date(value).getTime();
  const normalized = value.length === 16 ? `${value}:00` : value;
  if (
    !Number.isFinite(time) ||
    time < minimumTime ||
    time > maximumTime ||
    simulationInputValue(time) !== normalized
  ) {
    return;
  }
  return time;
}
