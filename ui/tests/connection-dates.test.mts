import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConnectionsData } from '../src/api/types.ts';
import {
  connectionDepartureDates,
  connectionsOnDepartureDate,
} from '../src/features/connections/connectionDates.ts';

function flight(departureTime: string): ConnectionsData['flights'][string] {
  return {
    flightNumber: { airlineId: 'LH', number: 400 },
    departureTime,
    arrivalTime: '2027-01-02T12:00:00+01:00',
    departureAirportId: 'HNL',
    arrivalAirportId: 'FRA',
    aircraftOwner: 'LH',
    aircraftId: '359',
    aircraftConfiguration: 'F4C38E24M201',
    codeShares: [],
  };
}

const data: ConnectionsData = {
  airlines: {},
  airports: {},
  aircraft: {},
  connections: [
    { flightId: 'late-hawaii', outgoing: [{ flightId: 'next-day', outgoing: [] }] },
    { flightId: 'early-kiritimati', outgoing: [{ flightId: 'shared-tail', outgoing: [] }] },
    { flightId: 'early-hawaii', outgoing: [{ flightId: 'shared-tail', outgoing: [] }] },
  ],
  flights: {
    'late-hawaii': flight('2026-12-31T23:30:00-10:00'),
    'early-kiritimati': flight('2027-01-01T00:30:00+14:00'),
    'early-hawaii': flight('2026-12-31T00:30:00-10:00'),
    'next-day': flight('2027-01-01T15:00:00-05:00'),
    'shared-tail': flight('2027-01-01T18:00:00Z'),
    unrelated: flight('2028-01-01T10:00:00Z'),
  },
};

test('dates are sorted and deduplicated by the first departure local date, not UTC or later legs', () => {
  assert.deepEqual(connectionDepartureDates(data), ['2026-12-31', '2027-01-01']);
});

test('daily results keep complete branching journeys and only their reachable flights', () => {
  const dated = connectionsOnDepartureDate(data, '2026-12-31');
  assert.deepEqual(dated.connections, [data.connections[0], data.connections[2]]);
  assert.deepEqual(Object.keys(dated.flights).sort(), [
    'early-hawaii',
    'late-hawaii',
    'next-day',
    'shared-tail',
  ]);
  assert.equal(dated.connections[0].outgoing[0].flightId, 'next-day');
  assert.equal(dated.airports, data.airports);
  assert.equal(dated.aircraft, data.aircraft);
  assert.equal(dated.airlines, data.airlines);
  assert.equal(data.connections.length, 3);
  assert.equal(Object.keys(data.flights).length, 6);
});

test('shared onward flights appear on each applicable departure day', () => {
  const dated = connectionsOnDepartureDate(data, '2027-01-01');
  assert.deepEqual(dated.connections, [data.connections[1]]);
  assert.deepEqual(Object.keys(dated.flights).sort(), ['early-kiritimati', 'shared-tail']);
});

test('missing days and empty results do not leak flights into graph or map results', () => {
  assert.deepEqual(connectionsOnDepartureDate(data, '2027-01-03').flights, {});
  assert.deepEqual(connectionsOnDepartureDate(data, '2027-01-03').connections, []);
  assert.deepEqual(connectionDepartureDates({ ...data, connections: [] }), []);
});

test('departure grouping remains identical in extreme browser timezones', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['Pacific/Honolulu', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      assert.deepEqual(connectionDepartureDates(data), ['2026-12-31', '2027-01-01']);
      assert.equal(connectionsOnDepartureDate(data, '2026-12-31').connections.length, 2);
    }
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
});
