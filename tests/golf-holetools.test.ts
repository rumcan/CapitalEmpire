// Tests for golf hole tools: marker validation and hole derivation updates
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHoles, validateMarkerPlacement } from '../src/game/golf/holes';
import type { CourseArea, Pin, TeeMark } from '../src/game/golf/types';

test('validateMarkerPlacement accepts pin on green and rejects pin on other surfaces', () => {
  const areas: CourseArea[] = [
    { id: 1, surface: 'fairway', pts: [0, 0, 100, 0, 100, 100, 0, 100] },
    { id: 2, surface: 'green', pts: [30, 30, 60, 30, 60, 60, 30, 60] },
  ];

  // Inside green
  const valid = validateMarkerPlacement(areas, 'pin', 45, 45);
  assert.equal(valid.ok, true);

  // Outside green (on fairway)
  const onFairway = validateMarkerPlacement(areas, 'pin', 15, 15);
  assert.equal(onFairway.ok, false);
  assert.equal(onFairway.reason, 'A pin must be placed on a green');

  // Off course (null)
  const offCourse = validateMarkerPlacement(areas, 'pin', 150, 150);
  assert.equal(offCourse.ok, false);
});

test('validateMarkerPlacement accepts tee marker on tee and rejects tee marker on other surfaces', () => {
  const areas: CourseArea[] = [
    { id: 1, surface: 'fairway', pts: [0, 0, 100, 0, 100, 100, 0, 100] },
    { id: 2, surface: 'tee', pts: [10, 10, 20, 10, 20, 20, 10, 20] },
  ];

  // Inside tee
  const valid = validateMarkerPlacement(areas, 'back', 15, 15);
  assert.equal(valid.ok, true);

  // Outside tee (on fairway)
  const onFairway = validateMarkerPlacement(areas, 'back', 50, 50);
  assert.equal(onFairway.ok, false);
  assert.equal(onFairway.reason, 'A back tee marker must be placed on a tee');
});

test('deriveHoles updates par and length when pin position is updated', () => {
  const areas: CourseArea[] = [
    { id: 1, surface: 'tee', pts: [0, 0, 20, 0, 20, 20, 0, 20] },
    { id: 2, surface: 'fairway', pts: [20, 0, 200, 0, 200, 50, 20, 50] },
    { id: 3, surface: 'green', pts: [200, 0, 250, 0, 250, 50, 200, 50] },
  ];

  const tees: TeeMark[] = [{ hole: 1, x: 10, y: 10, kind: 'back' }];
  const initialPins: Pin[] = [{ hole: 1, x: 210, y: 25 }];

  const h1 = deriveHoles(areas, tees, initialPins, []);
  assert.equal(h1.length, 1);
  const initialLen = h1[0]!.lengthM;

  // Move pin further back on green
  const movedPins: Pin[] = [{ hole: 1, x: 240, y: 25 }];
  const h2 = deriveHoles(areas, tees, movedPins, []);
  assert.ok(h2[0]!.lengthM > initialLen, 'length should increase when pin moves farther');
});

test('deriveHoles adds warnings if pin or tee are off target surfaces', () => {
  const areas: CourseArea[] = [
    { id: 1, surface: 'rough', pts: [0, 0, 100, 0, 100, 100, 0, 100] },
  ];

  const tees: TeeMark[] = [{ hole: 1, x: 10, y: 10, kind: 'back' }];
  const pins: Pin[] = [{ hole: 1, x: 50, y: 50 }];

  const holes = deriveHoles(areas, tees, pins, []);
  assert.ok(holes[0]!.warnings.includes('The pin is not on a green'));
  assert.ok(holes[0]!.warnings.includes('The back tee is not on a tee'));
});
