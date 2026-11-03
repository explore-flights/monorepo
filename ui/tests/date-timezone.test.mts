import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  daysBetween,
  utcDate,
  utcDateTime,
  utcDayBoundary,
  weekdayForDate,
} from '../src/lib/date.ts';
import { dateLabel, dateTimeLabel, timeLabel } from '../src/lib/format.ts';
import { parseSimulationInput, simulationInputValue } from '../src/features/live/playback.ts';

const options: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function utcLabel(value: string, formatOptions: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, { ...formatOptions, timeZone: 'UTC' }).format(
    new Date(value),
  );
}

for (const timezone of [
  'UTC',
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'Europe/Berlin',
  'Asia/Kathmandu',
  'Pacific/Kiritimati',
]) {
  test(`flight dates, calendars, global controls and playback are stable in ${timezone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = timezone;
    try {
      for (const [timestamp, wallTime] of [
        ['2027-01-01T00:15:00+14:00', '2027-01-01T00:15:00Z'],
        ['2026-12-31T23:45:00-10:00', '2026-12-31T23:45:00Z'],
        ['2026-03-08T02:30:00-10:00', '2026-03-08T02:30:00Z'],
        ['2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00Z'],
        ['2026-06-01T00:15:00+05:45', '2026-06-01T00:15:00Z'],
      ]) {
        assert.equal(dateLabel(timestamp, options), utcLabel(wallTime, options));
        assert.equal(
          dateTimeLabel(timestamp),
          utcLabel(wallTime, { dateStyle: 'medium', timeStyle: 'short' }),
        );
        assert.equal(timeLabel(timestamp), wallTime.slice(11, 16));
        assert.equal(
          dateLabel(timestamp, { ...options, timeZone: 'UTC' }),
          utcLabel(timestamp, options),
        );
      }
      for (let month = 0; month < 12; month += 1) {
        const date = `2026-${String(month + 1).padStart(2, '0')}-01`;
        assert.equal(
          dateLabel(date, { month: 'long' }),
          utcLabel(`${date}T00:00:00Z`, { month: 'long' }),
        );
      }
      assert.equal(
        dateLabel('2026-02-01'),
        utcLabel('2026-02-01T00:00:00Z', { dateStyle: 'medium' }),
      );
      assert.equal(
        dateTimeLabel('2027-01-01T00:15:00Z'),
        utcLabel('2027-01-01T00:15:00Z', { dateStyle: 'medium', timeStyle: 'short' }),
      );
      assert.equal(
        dateTimeLabel('2026-03-08T02:30'),
        utcLabel('2026-03-08T02:30:00Z', { dateStyle: 'medium', timeStyle: 'short' }),
      );
      assert.equal(dateLabel('invalid'), 'invalid');
      const now = new Date('2027-01-01T00:15:00Z');
      assert.equal(utcDate(now), '2027-01-01');
      assert.equal(utcDateTime(now), '2027-01-01T00:15');
      assert.equal(utcDayBoundary(now, false), '2027-01-01T00:00');
      assert.equal(utcDayBoundary(now, true), '2027-01-01T23:59');
      assert.equal(addDays('2026-12-31', 1), '2027-01-01');
      assert.equal(daysBetween('2026-03-08', '2026-03-09'), 1);
      assert.equal(weekdayForDate('2027-01-01'), 5);
      assert.equal(simulationInputValue(now.getTime()), '2027-01-01T00:15:00');
      assert.equal(parseSimulationInput('2026-03-08T02:30'), Date.parse('2026-03-08T02:30:00Z'));
    } finally {
      if (previous === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previous;
      }
    }
  });
}
