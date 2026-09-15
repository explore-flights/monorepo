import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changePlaybackSpeed,
  parseSimulationInput,
  simulatedTime,
  simulationInputValue,
} from '../src/features/live/playback.ts';

const start = Date.parse('2026-01-01T00:00:00Z');

test('1x follows elapsed time; speed changes preserve the current instant', () => {
  const clock = { time: start, wallTime: 1000, speed: 1 };
  assert.equal(simulatedTime(clock, 2000), start + 1000);
  const fast = changePlaybackSpeed(clock, 60, 2000);
  assert.equal(simulatedTime(fast, 2000), start + 1000);
  assert.equal(simulatedTime(fast, 3000), start + 61_000);
  const paused = changePlaybackSpeed(fast, 0, 3000);
  assert.equal(simulatedTime(paused, 6000), start + 61_000);
  const resumed = changePlaybackSpeed(paused, 1, 6000);
  assert.equal(simulatedTime(resumed, 7000), start + 62_000);
});

test('manual time anchors remain historical after a long background interval', () => {
  const historical = Date.parse('2025-02-01T23:59:00Z');
  assert.equal(
    simulatedTime({ time: historical, wallTime: 0, speed: 2 }, 60_000),
    historical + 120_000,
  );
});

test('datetime input round-trips local time with seconds and rejects invalid dates', () => {
  const value = '2026-09-12T14:23:45';
  const time = parseSimulationInput(value);
  assert.equal(time, new Date(value).getTime());
  assert.equal(simulationInputValue(time ?? 0), value);
  assert.equal(parseSimulationInput('2026-09-12T14:23'), new Date('2026-09-12T14:23:00').getTime());
  for (const invalid of ['', '2026-02-30T14:23:00', '2026-09-12', 'invalid']) {
    assert.equal(parseSimulationInput(invalid), undefined);
  }
});
