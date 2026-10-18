// Before and after a change (beforeafter.ts): the windows between the game hours' snapshots, the rush windows, and the comparison of two windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, lastRush, nextRush, windowOf, type HourStat, type Window } from '../src/game/beforeafter';
import { FREE } from '../src/game/sim/sim';

/** 48 game hours (two days) of cumulative counts: 100 s lost, 10 trips (ratio 1.2 over the free flow), 2 abandoned, and a lot started every 4 hours, an hour apart */
function hours48(): HourStat[] {
  const out: HourStat[] = [];
  for (let h = 0; h < 48; h++) out.push({ h, lost: 100 * h, arrived: 10 * h, ratioSum: 12 * h, ratioN: 10 * h, abandoned: 2 * h, builds: Math.floor(h / 4), pop: 50 + h, built: h });
  return out;
}

test('lastRush picks the latest rush window that ends by the time, with its hours', () => {
  const hs = hours48();
  // day 1 12:00: the morning rush of day 1 (07:00 to 09:00) is the last one on record
  const a = lastRush(hs, 24 + 12)!;
  assert.deepEqual([a.h0, a.h1, a.rush], [31, 33, true]);
  // day 1 08:00: the morning rush has not ended yet, so it is the evening rush of day 0 (16:00 to 18:00)
  const b = lastRush(hs, 24 + 8)!;
  assert.deepEqual([b.h0, b.h1, b.rush], [16, 18, true]);
  // day 1 23:00: the evening rush of day 1
  const c = lastRush(hs, 24 + 23)!;
  assert.deepEqual([c.h0, c.h1], [40, 42]);
});

test('with no rush on record, lastRush gives the last two game hours (not a rush), and null with no snapshots', () => {
  const w = lastRush(hours48().slice(0, 6), 5)!;
  assert.deepEqual([w.h0, w.h1, w.rush], [3, 5, false]);
  assert.equal(lastRush([], 5), null);
});

test('nextRush is the first rush window that starts at or after the hour', () => {
  assert.deepEqual(nextRush(32), [40, 42]);  // day 1 08:00: the evening rush
  assert.deepEqual(nextRush(40), [40, 42]);  // from the start of the evening rush itself
  assert.deepEqual(nextRush(41), [55, 57]);  // day 1 17:00: the next morning, day 2 07:00
  assert.deepEqual(nextRush(0), [7, 9]);
});

test('windowOf is the differences of the cumulative counts between two snapshots, and null without both', () => {
  const hs = hours48();
  const w = windowOf(hs, 10, 12, false)!;
  assert.equal(w.trips, 20);
  assert.equal(w.lostPerTrip, 10);  // 200 s over 20 trips
  assert.ok(Math.abs(w.ratio - 1.2 / FREE) < 1e-9, `ratio over free flow (${w.ratio})`);
  assert.deepEqual([w.abandoned, w.builds, w.popChange], [4, 1, 2]);
  const z = windowOf(hs, 10, 10, false)!;
  assert.deepEqual([z.trips, z.ratio, z.lostPerTrip], [0, 0, 0]);
  assert.equal(windowOf(hs, 10, 60, true), null);
});

test('compare: the changes, and better only when lower for time lost, trip time and abandoned, higher for trips and lots', () => {
  const win = (x: Partial<Window>): Window => ({ h0: 0, h1: 2, rush: true, lostPerTrip: 20, trips: 100, ratio: 1.5, abandoned: 10, builds: 3, popChange: 0, ...x });
  const before = win({}), after = win({ lostPerTrip: 10, trips: 120, ratio: 1.3, abandoned: 4, builds: 5 });
  const d = compare(before, after);
  assert.deepEqual(d.map(x => x.name), ['Time lost per trip', 'Trips completed', 'Trip time vs free flow', 'Trips abandoned', 'Lots started']);
  assert.deepEqual(d.map(x => x.better), [true, true, true, true, true]);
  assert.ok(Math.abs(d[0]!.pct + 50) < 1e-9, `20 s to 10 s is -50% (${d[0]!.pct})`);
  assert.ok(Math.abs(d[1]!.pct - 20) < 1e-9, `100 to 120 trips is +20% (${d[1]!.pct})`);
  assert.ok(Math.abs(d[3]!.pct + 60) < 1e-9, `10 to 4 abandoned is -60% (${d[3]!.pct})`);
  assert.deepEqual(compare(after, before).map(x => x.better), [false, false, false, false, false]);
  assert.equal(compare(before, before)[0]!.better, false);
});
