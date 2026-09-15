import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMapBounds } from '../src/components/mapBounds.ts';

test('map bounds add room around a single coordinate', () => {
  assert.deepEqual(getMapBounds([[8, 50]]), [
    [7, 49],
    [9, 51],
  ]);
});

test('map bounds follow the short side across the dateline', () => {
  assert.deepEqual(
    getMapBounds([
      [170, 10],
      [-170, 20],
    ]),
    [
      [170, 10],
      [190, 20],
    ],
  );
});
