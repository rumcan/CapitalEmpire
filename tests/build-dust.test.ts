import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildDust, DUST_CAP, DustPool, QUIET_MS, armTick, bucket, disarm, dustAllowed, edgeSpots, footSpots, gridSpots, grewTo, takeTokens } from '../src/game/build-dust';

test('the pool never grows past its cap and reuses its particles', () => {
  const p = new DustPool(10), first = p.items[0];
  for (let i = 0; i < 25; i++) p.spawn(0, 0, 0, 0, 1, 1, 0.3);
  assert.equal(p.n, 10);
  assert.equal(p.items.length, 10);
  p.step(2); // all dead
  assert.equal(p.n, 0);
  assert.ok(p.spawn(1, 2, 0, 0, 1, 1, 0.3));
  assert.ok(p.items.includes(first!), 'the same objects stay in the pool');
  assert.equal(new BuildDust().pool.cap, DUST_CAP);
});

test('a dead particle is swapped out and the rest keep moving', () => {
  const p = new DustPool(4);
  p.spawn(0, 0, 1, 0, 0, 0.5, 0.3); p.spawn(0, 0, 1, 0, 0, 2, 0.3); p.spawn(0, 0, 1, 0, 0, 2, 0.3);
  p.step(1);
  assert.equal(p.n, 2);
  for (let i = 0; i < p.n; i++) assert.ok(Math.abs(p.items[i]!.x - 1) < 1e-9);
});

test('the throttle gives a burst, then only its rate', () => {
  const b = bucket(10, 5);
  assert.equal(takeTokens(b, 0, 4), 4);
  assert.equal(takeTokens(b, 0, 20), 6, 'the rest of the burst');
  assert.equal(takeTokens(b, 0, 5), 0, 'empty');
  assert.equal(takeTokens(b, 1000, 20), 5, 'refilled at 5 a second');
  assert.equal(takeTokens(b, 100000, 50), 10, 'never past the burst');
});

test('a long brush stroke is throttled: a light trail, not a flood', () => {
  const d = new BuildDust();
  // 200 props placed over one second (a big natural-props brush stroke)
  for (let i = 0; i < 200; i++) d.rect(i * 5, i, 0, i + 0.5, 0.5, 'prop');
  const burst = d.buckets.prop.burst, rate = d.buckets.prop.rate;
  assert.ok(d.pool.n <= (burst + rate) * 4 + 4, `at most the burst and a second's rate of puffs (${d.pool.n})`);
  assert.ok(d.pool.n > 0);
});

test('nothing puffs while a load settles, on an undo or redo, or in the title card scene', () => {
  const a = { quietUntil: Infinity, armed: false };
  assert.equal(dustAllowed(a, false, false), false, 'never before the first load');
  disarm(a, 1000);
  armTick(a, 1000 + QUIET_MS + 1, false);
  assert.equal(dustAllowed(a, false, false), false, 'the lots are still composing (first bake)');
  armTick(a, 1000 + QUIET_MS - 1, true);
  assert.equal(dustAllowed(a, false, false), false, 'still in the quiet time');
  armTick(a, 1000 + QUIET_MS, true);
  assert.equal(dustAllowed(a, false, false), true);
  assert.equal(dustAllowed(a, false, true), false, 'an undo or redo');
  assert.equal(dustAllowed(a, true, false), false, 'the menu scene');
  disarm(a, 9000);
  assert.equal(dustAllowed(a, false, false), false, 'a second load disarms it again');
});

test('a lot puffs only when it grows, never when it is first seen (a load)', () => {
  assert.equal(grewTo(undefined, 3, 1), false);
  assert.equal(grewTo(0, 1, 1), true);
  assert.equal(grewTo(1, 2, 1), true);
  assert.equal(grewTo(2, 2, 1), false);
  assert.equal(grewTo(3, 2, 1), false, 'declining is not building');
  assert.equal(grewTo(0, 0, 1), false);
});

test('the dust scales to the footprint', () => {
  const out = new Float32Array(200);
  assert.equal(footSpots(0, 0, 0.6, 0.4, 48, out), 1, 'a bench: one spot');
  assert.deepEqual([out[0], out[1]], [0.30000001192092896, 0.20000000298023224]);
  const club = footSpots(0, 0, 12, 10, 48, out);
  assert.ok(club >= 20 && club <= 30, `a clubhouse: a ring (${club})`);
  for (let i = 0; i < club; i++) {
    const x = out[2 * i]!, y = out[2 * i + 1]!;
    assert.ok(Math.min(Math.abs(x), Math.abs(x - 12), Math.abs(y), Math.abs(y - 10)) < 1e-4, 'on the edge');
  }
  assert.equal(footSpots(0, 0, 400, 400, 48, out), 48, 'capped');
  assert.equal(edgeSpots([0, 0, 10, 0], 1, 100, out), 20, 'a line walks there and back');
});

test('a grid step puffs on the edges of what it laid only', () => {
  // a 6 x 6 grid; the step lays surface 3 on the middle 4 x 4
  const w = 6, surf = new Uint8Array(36), idx: number[] = [];
  for (let r = 1; r < 5; r++) for (let c = 1; c < 5; c++) { surf[r * w + c] = 3; idx.push(r * w + c); }
  const n = idx.length, d = { x0: 10, y0: 20, w, n, idx: Uint32Array.from(idx), s0: new Uint8Array(n), s1: new Uint8Array(n).fill(3) };
  const out = new Float32Array(100), k = gridSpots(d, surf, 0.5, 48, out);
  assert.ok(k >= 1 && k <= 12);
  for (let i = 0; i < k; i++) {
    const c = (out[2 * i]! - 10) / 0.5 - 0.5, r = (out[2 * i + 1]! - 20) / 0.5 - 0.5;
    assert.ok(c === 1 || c === 4 || r === 1 || r === 4, `an edge cell (${c}, ${r})`);
  }
  // only the hole number changed: nothing new to see
  assert.equal(gridSpots({ ...d, s0: new Uint8Array(n).fill(3) }, surf, 0.5, 48, out), 0);
  // erased (none): no dust
  assert.equal(gridSpots({ ...d, s1: new Uint8Array(n) }, new Uint8Array(36), 0.5, 48, out), 0);
});
