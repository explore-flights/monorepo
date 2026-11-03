import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDepartureWindow,
  updateDepartureWindow,
} from '../src/features/connections/departureWindow.ts';

test('moving the start beyond the end carries the default 23:59 duration across dates', () => {
  const initial = createDepartureWindow('2026-12-31T00:00', '2026-12-31T23:59');
  const next = updateDepartureWindow(initial, 'start', '2027-01-01T14:30');
  assert.equal(next.end, '2027-01-02T14:29');
  assert.equal(next.durationMs, (23 * 60 + 59) * 60_000);
  assert.equal(updateDepartureWindow(next, 'start', '2027-01-03T06:00').end, '2027-01-04T05:59');
});

test('valid manual changes to either endpoint replace the remembered duration', () => {
  const initial = createDepartureWindow('2026-11-03T00:00', '2026-11-03T23:59');
  const shorter = updateDepartureWindow(initial, 'start', '2026-11-03T20:00');
  assert.equal(shorter.end, initial.end);
  assert.equal(shorter.durationMs, (3 * 60 + 59) * 60_000);
  assert.equal(updateDepartureWindow(shorter, 'start', '2026-11-04T12:00').end, '2026-11-04T15:59');

  const longer = updateDepartureWindow(shorter, 'end', '2026-11-05T02:00');
  assert.equal(longer.durationMs, 30 * 3_600_000);
  assert.equal(updateDepartureWindow(longer, 'start', '2026-11-06T10:00').end, '2026-11-07T16:00');
});

test('confirming an end before the start moves the start backward by the remembered duration', () => {
  const initial = createDepartureWindow('2027-01-01T00:00', '2027-01-01T23:59');
  const next = updateDepartureWindow(initial, 'end', '2026-12-31T10:00');
  assert.equal(next.start, '2026-12-30T10:01');
  assert.equal(next.end, '2026-12-31T10:00');
  assert.equal(next.durationMs, initial.durationMs);
  assert.equal(updateDepartureWindow(next, 'end', '2026-12-29T10:00').start, '2026-12-28T10:01');
});

test('intermediate edits do not replace the duration used when the final value is confirmed', () => {
  const initial = createDepartureWindow('2026-11-03T10:00', '2026-11-03T12:00');
  const startDraft = { ...initial, start: '2026-11-03T11:00' };
  const confirmedStart = updateDepartureWindow(startDraft, 'start', '2026-11-04T10:00');
  assert.equal(confirmedStart.end, '2026-11-04T12:00');
  const endDraft = { ...initial, end: '2026-11-03T11:00' };
  const confirmedEnd = updateDepartureWindow(endDraft, 'end', '2026-11-02T10:00');
  assert.equal(confirmedEnd.start, '2026-11-02T08:00');
});

test('empty edits preserve the last valid duration until a complete range is confirmed', () => {
  const initial = createDepartureWindow('2026-11-03T10:00', '2026-11-03T12:00');
  const cleared = updateDepartureWindow(initial, 'start', '');
  assert.equal(cleared.start, '');
  assert.equal(cleared.end, initial.end);
  assert.equal(cleared.durationMs, initial.durationMs);
  const restored = updateDepartureWindow(cleared, 'start', '2026-11-04T10:00');
  assert.equal(restored.end, '2026-11-04T12:00');
});

test('shared searches seed the remembered duration and equal endpoints remain valid', () => {
  const shared = createDepartureWindow('2026-11-03T10:00', '2026-11-05T14:00');
  assert.equal(updateDepartureWindow(shared, 'start', '2026-11-06T10:00').end, '2026-11-08T14:00');
  const equal = updateDepartureWindow(shared, 'start', shared.end);
  assert.equal(equal.durationMs, 0);
  assert.equal(updateDepartureWindow(equal, 'start', '2026-11-06T10:00').end, '2026-11-06T10:00');
});

test('duration arithmetic stays in UTC across browser timezones and daylight-saving changes', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of [
      'Pacific/Honolulu',
      'America/Los_Angeles',
      'Europe/Berlin',
      'Pacific/Kiritimati',
    ]) {
      process.env.TZ = timezone;
      const initial = createDepartureWindow('2026-03-07T00:00', '2026-03-07T23:59');
      assert.equal(
        updateDepartureWindow(initial, 'start', '2026-03-08T00:00').end,
        '2026-03-08T23:59',
      );
    }
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
});
