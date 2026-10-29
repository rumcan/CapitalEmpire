import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibratedViewScale, calibratedFootprintScale } from './view-calibration.mjs';

test('a repaired face gets its own door gauge while retained faces keep their prior native scale', () => {
  assert.equal(calibratedViewScale({ sha256: 'new', door: 70 }, 'new', 98, 0.5), 2.8);
  assert.equal(calibratedViewScale({ sha256: 'old', nativeScale: 1.371 }, 'old', 98, 0.5), 1.371);
  assert.equal(calibratedViewScale({ sha256: 'old', nativeScale: 1.371 }, 'regenerated', 98, 0.5), 0);
});

test('footprint retention is restricted to the reviewed source version', () => {
  const measure = { version: 'house-4views-v3', footprintScale: 1 };
  assert.equal(calibratedFootprintScale(measure, measure.version, 1.2), 1);
  assert.equal(calibratedFootprintScale(measure, 'house-4views-v4', 1.2), 1.2);
  assert.equal(calibratedFootprintScale(undefined, 'house-4views-v4', 1.2), 1.2);
});
