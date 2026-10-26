// Unit tests for the tournament day timeline (P02 / T049): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_START_MIN,
  LATE_AFTER_MIN,
  minuteAt,
  simAt,
  arrivalMinute,
  leaveMinute,
  wantedArrivals,
  wantedLeaves,
  departMinute,
  travelEstimate,
  isLate,
  gateOpenFrom,
  featuredHole,
} from '../src/game/golf/daytimeline';
import { arrivalShare, exitShare } from '../src/game/golf/calendar';

describe('tournament day timeline (T049)', () => {
  it('1. minuteAt and simAt round-trip and reference offsets', () => {
    assert.equal(minuteAt(simAt(700, 5000), 5000), 700);
    assert.equal(simAt(DAY_START_MIN, 123), 123);
  });

  it('2. arrivalMinute inverse curve matches endpoints, median and shares', () => {
    assert.ok(Math.abs(arrivalMinute(0) - 420) <= 0.05, `arrivalMinute(0): ${arrivalMinute(0)}`);
    assert.ok(Math.abs(arrivalMinute(1) - 780) <= 0.05, `arrivalMinute(1): ${arrivalMinute(1)}`);
    const mid = arrivalMinute(0.5);
    assert.ok(mid >= 590 && mid <= 610, `arrivalMinute(0.5): ${mid}`);

    for (const u of [0.1, 0.5, 0.9]) {
      const computedU = arrivalShare(arrivalMinute(u));
      assert.ok(Math.abs(computedU - u) <= 0.01, `share for ${u} was ${computedU}`);
    }
  });

  it('3. leaveMinute inverse curve matches endpoints and shares', () => {
    assert.ok(Math.abs(leaveMinute(1) - 1170) <= 0.05, `leaveMinute(1): ${leaveMinute(1)}`);
    const computedU = exitShare(leaveMinute(0.5));
    assert.ok(Math.abs(computedU - 0.5) <= 0.01, `exitShare for 0.5 was ${computedU}`);
  });

  it('4. wantedArrivals produces sorted, bounded, deterministic arrivals matching arrival distribution', () => {
    const arr = wantedArrivals(300, 7);
    assert.equal(arr.length, 300);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]!;
      assert.ok(v >= 420 && v <= 780, `out of range at ${i}: ${v}`);
      if (i > 0) assert.ok(v >= arr[i - 1]!, `unsorted at ${i}: ${v} < ${arr[i - 1]}`);
    }
    assert.deepEqual(arr, wantedArrivals(300, 7));

    const median = (arr[149]! + arr[150]!) / 2;
    assert.ok(Math.abs(median - arrivalMinute(0.5)) <= 15, `median ${median} vs ${arrivalMinute(0.5)}`);

    // empty array for n <= 0
    assert.deepEqual(wantedArrivals(0, 7), []);
    assert.deepEqual(wantedLeaves(0, 7), []);
  });

  it('5. departMinute computes departure time and clamps to DAY_START_MIN', () => {
    assert.equal(departMinute(450, 200), 300);
    assert.equal(departMinute(700, 60), 640);
  });

  it('6. travelEstimate calculates travel in sim seconds', () => {
    const est = travelEstimate(1000, 10, 140, 1.4);
    assert.equal(est, 300);
  });

  it('7. isLate and gateOpenFrom logic', () => {
    assert.equal(isLate(LATE_AFTER_MIN), false);
    assert.equal(isLate(LATE_AFTER_MIN + 1), true);
    assert.equal(gateOpenFrom(400), 420);
    assert.equal(gateOpenFrom(500), 500);
  });

  it('8. featuredHole progression across tournament day', () => {
    assert.equal(featuredHole(449, 18), 0);
    assert.equal(featuredHole(450, 18), 1);
    assert.equal(featuredHole(1109, 18), 18);
    assert.equal(featuredHole(1110, 18), 0);

    let prev = 1;
    for (let m = 450; m <= 1109; m++) {
      const h = featuredHole(m, 18);
      assert.ok(h >= prev, `minute ${m}: hole ${h} decreased from ${prev}`);
      prev = h;
    }
    assert.equal(prev, 18);
  });
});
