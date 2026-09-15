import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  greatCirclePosition,
  routeGeometry,
  type Coordinate,
} from '../src/features/live/geometry.ts';

test('constant angular progress, endpoints and coincident airports', () => {
  assert.deepEqual(greatCirclePosition([0, 0], [90, 0], 0), [0, 0]);
  assert.deepEqual(greatCirclePosition([0, 0], [90, 0], 1), [90, 0]);
  assert.ok(Math.abs(greatCirclePosition([0, 0], [90, 0], 0.25)[0] - 22.5) < 1e-9);
  assert.deepEqual(greatCirclePosition([10, 20], [10, 20], 0.5), [10, 20]);
});

test('dateline crossing takes the short route and splits both line portions', () => {
  assert.ok(Math.abs(greatCirclePosition([170, 0], [-170, 0], 0.5)[0]) > 179.99);
  const route = routeGeometry([170, 10], [-170, 20], 0, 1);
  assert.equal(route.coordinates.length, 2);
  for (const line of route.coordinates) {
    for (let i = 1; i < line.length; i++) {
      assert.ok(Math.abs(line[i][0] - line[i - 1][0]) <= 180);
    }
  }
  const from: Coordinate = [8, 50];
  const to: Coordinate = [-73, 40];
  const flown = routeGeometry(from, to, 0, 0.4);
  const remaining = routeGeometry(from, to, 0.4, 1);
  assert.deepEqual(flown.coordinates.at(-1)?.at(-1), remaining.coordinates[0][0]);
});

test('polar and antipodal interpolation stays finite', () => {
  for (const to of [
    [180, 0],
    [179.999999, 0],
    [0, 90],
  ] satisfies Coordinate[]) {
    for (const fraction of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      const point = greatCirclePosition([0, 0], to, fraction);
      assert.ok(point.every(Number.isFinite));
      assert.ok(Math.abs(point[1]) <= 90);
    }
  }
});

test('a route on the dateline has only finite coordinates', () => {
  const geometry = routeGeometry([180, 0], [-180, 10], 0, 1);
  assert.ok(geometry.coordinates.flat(2).every(Number.isFinite));
});
