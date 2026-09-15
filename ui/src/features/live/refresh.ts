export function scheduleLiveRefresh(
  nextDeparture: string | null,
  clock: { speed: number; now: () => number },
  refresh: (timestamp: string) => void,
) {
  if (clock.speed === 0) {
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout>;
  const currentTime = clock.now;
  // If a fast simulation has overtaken a response, catch up in one request.
  // Otherwise query the exact departure timestamp when the simulated clock reaches it.
  const overdue = nextDeparture !== null && Date.parse(nextDeparture) < currentTime();
  function schedule() {
    if (!nextDeparture || overdue) {
      const delay = overdue ? 0 : Math.min(60_000, 60_000 / clock.speed);
      timer = setTimeout(() => refresh(new Date(currentTime()).toISOString()), delay);
      return;
    }
    const remaining = (Date.parse(nextDeparture) - currentTime()) / clock.speed;
    timer = setTimeout(
      () => {
        if (currentTime() < Date.parse(nextDeparture)) {
          schedule();
          return;
        }
        refresh(nextDeparture);
      },
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
  }
  schedule();
  return () => clearTimeout(timer);
}
