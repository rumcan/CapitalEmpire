/** Tests for T069a frontage snap: the road the cursor picks, where the footprint goes, and which way it faces (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapFrontage } from '../src/game/ext/frontage-snap/index.js';
import type { SnapSeg } from '../src/game/ext/frontage-snap/index.js';

/** a drive segment from (ax, ay) to (bx, by) with its verge (tiles) */
const seg = (ax: number, ay: number, bx: number, by: number, verge = 3): SnapSeg => ({ ax, ay, bx, by, verge, kind: 'drive' });
const A = [seg(0, 10, 40, 10)];
const FP = { w: 6, d: 4 };
const REACH = 6;

test('1. the cursor at (20, 14) gives the centre (20, 15), face (0, -1), rot false, dist 4', () => {
  const r = snapFrontage(20, 14, FP, A, REACH);
  assert.ok(r, 'in reach');
  assert.equal(r.cx, 20);
  assert.equal(r.cy, 15);
  assert.deepEqual(r.face, { x: 0, y: -1 });
  assert.equal(r.rot, false);
  assert.equal(r.dist, 4);
  assert.equal(r.seg, 0);
});

test('2. the cursor at (20, 6) gives the centre (20, 5), face (0, 1)', () => {
  const r = snapFrontage(20, 6, FP, A, REACH);
  assert.ok(r, 'in reach');
  assert.equal(r.cx, 20);
  assert.equal(r.cy, 5);
  assert.deepEqual(r.face, { x: 0, y: 1 });
  assert.equal(r.dist, 4);
});

test('3. a vertical segment at x 10: the cursor at (13, 20) gives the centre (15, 20), face (-1, 0), rot true', () => {
  const r = snapFrontage(13, 20, FP, [seg(10, 0, 10, 40)], REACH);
  assert.ok(r, 'in reach');
  assert.equal(r.cx, 15);
  assert.equal(r.cy, 20);
  assert.deepEqual(r.face, { x: -1, y: 0 });
  assert.equal(r.rot, true);
  assert.equal(r.dist, 3);
});

test('4. the cursor at (20, 24) is out of reach (gap 11 > 6): null', () => {
  assert.equal(snapFrontage(20, 24, FP, A, REACH), null);
});

test('5. near the end, the cursor at (1, 14) gives the centre x 3 (clamped to w / 2)', () => {
  const r = snapFrontage(1, 14, FP, A, REACH);
  assert.ok(r, 'in reach');
  assert.equal(r.cx, 3);
  assert.equal(r.cy, 15);
});

test('6. a short segment (0, 10) to (4, 10) and the cursor at (3, 13) give the centre x 2 (the middle)', () => {
  const r = snapFrontage(3, 13, FP, [seg(0, 10, 4, 10)], REACH);
  assert.ok(r, 'in reach');
  assert.equal(r.cx, 2);
  assert.equal(r.cy, 15);
});

test('7. two segments: the cursor nearer the second picks seg 1; equal distances pick seg 0', () => {
  const two = [seg(0, 10, 40, 10), seg(0, 20, 40, 20)];
  const near2 = snapFrontage(20, 17, FP, two, REACH);
  assert.ok(near2, 'in reach');
  assert.equal(near2.seg, 1);
  assert.equal(near2.dist, 3);
  assert.equal(near2.cy, 15);
  const tie = snapFrontage(20, 15, FP, two, REACH);
  assert.ok(tie, 'in reach');
  assert.equal(tie.seg, 0);
  assert.equal(tie.dist, 5);
  assert.equal(tie.cy, 15);
});

test('8. a diagonal segment is never picked (only it in the list gives null); nor a zero-length one', () => {
  assert.equal(snapFrontage(5, 5, FP, [seg(0, 0, 10, 10)], REACH), null);
  assert.equal(snapFrontage(5, 5, FP, [seg(5, 5, 5, 5)], REACH), null);
});
