import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleLiveRefresh } from '../src/features/live/refresh.ts';

const realtime = { speed: 1, now: () => Date.now() };

test('refresh fires at departure with the exact server timestamp', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-01-01T00:00:00Z') });
  const calls: string[] = [];
  const next = '2026-01-01T01:00:01.125+01:00';
  scheduleLiveRefresh(next, realtime, (timestamp) => calls.push(timestamp));
  t.mock.timers.tick(1124);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [next]);
});

test('overdue departure catches up and cancellation prevents stale refresh', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-01-01T00:00:00Z') });
  const calls: string[] = [];
  const cancel = scheduleLiveRefresh('2026-01-01T00:00:01Z', realtime, (value) =>
    calls.push(value),
  );
  cancel();
  scheduleLiveRefresh('2025-12-31T23:59:59Z', realtime, (value) => calls.push(value));
  t.mock.timers.tick(1000);
  assert.deepEqual(calls, [new Date().toISOString()]);
});

test('long delays rearm without refreshing early; empty schedules are rechecked', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-01-01T00:00:00Z') });
  const calls: string[] = [];
  const delay = 2_147_483_647 + 1000;
  const next = new Date(Date.now() + delay).toISOString();
  scheduleLiveRefresh(next, realtime, (value) => calls.push(value));
  t.mock.timers.tick(2_147_483_647);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1000);
  assert.deepEqual(calls, [next]);
  scheduleLiveRefresh(null, realtime, (value) => calls.push(value));
  t.mock.timers.tick(60_000);
  assert.equal(calls[1], new Date().toISOString());
});

test('historical playback at 60x refreshes at the simulated departure', (t) => {
  const wallStart = Date.parse('2026-09-12T12:00:00Z');
  const start = Date.parse('2025-01-01T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: wallStart });
  const calls: string[] = [];
  const clock = { speed: 60, now: () => start + (Date.now() - wallStart) * 60 };
  const next = '2025-01-01T00:01:00Z';
  scheduleLiveRefresh(next, clock, (value) => calls.push(value));
  t.mock.timers.tick(999);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [next]);
});

test('pausing cancels the old timer and prevents departure refreshes', (t) => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: start });
  const calls: string[] = [];
  const cancel = scheduleLiveRefresh('2026-01-01T00:01:00Z', realtime, (value) =>
    calls.push(value),
  );
  cancel();
  scheduleLiveRefresh('2026-01-01T00:01:00Z', { speed: 0, now: () => start }, (value) =>
    calls.push(value),
  );
  scheduleLiveRefresh(null, { speed: 0, now: () => start }, (value) => calls.push(value));
  t.mock.timers.tick(3_600_000);
  assert.deepEqual(calls, []);
});

test('fast playback catches up to simulated time instead of replaying missed departures', (t) => {
  const start = Date.parse('2025-01-01T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const calls: string[] = [];
  const clock = { speed: 300, now: () => start + Date.now() * 300 };
  t.mock.timers.tick(10_000);
  scheduleLiveRefresh('2025-01-01T00:01:00Z', clock, (value) => calls.push(value));
  t.mock.timers.tick(0);
  assert.deepEqual(calls, ['2025-01-01T00:50:00.000Z']);
});
