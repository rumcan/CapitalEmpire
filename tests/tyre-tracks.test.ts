// T322 (#913): the tyre tracks' wear field (src/game/tyre-tracks.ts): wear builds along a vehicle's way, a little to its right, signed by its way
// (a two-way route leaves two tracks of opposite ways side by side), none where the tiles take none, a jump leaves none, and it fades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADE_MIN, LANE, MAX_JUMP, TyreTracks, W_SAT } from '../src/game/tyre-tracks';

const N = 64;
const drive = (t: TyreTracks, id: string, x0: number, y0: number, x1: number, y1: number, steps = 40) => {
  for (let s = 0; s <= steps; s++) t.move(id, x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, 'cart');
};
const cell = (t: TyreTracks, x: number, y: number) => t.cells.get(y * N + x);

test('a pass leaves wear along the way, to its right, its way recorded', () => {
  const t = new TyreTracks(N, () => true);
  drive(t, 'a', 5.5, 20.5, 45.5, 20.5); // along +x: the right is +y (LANE tiles)
  const row = Math.floor(20.5 + LANE);
  for (let x = 8; x < 44; x++) { const c = cell(t, x, row); assert.ok(c && c.w > 0.5, `wear at ${x}`); assert.ok(c.vx / c.w > 0.99); }
  assert.equal(cell(t, 20, 19), undefined); // nothing on the left
  const b = t.bytes!, at = (row * N + 20) * 4;
  assert.ok(b[at]! > 250 && Math.abs(b[at + 1]! - 128) <= 1, 'R the way +x, G none');
  assert.ok(b[at + 3]! > 0 && b[at + 3]! < 255 * (1 - Math.exp(-2 / W_SAT)), 'A: one pass is faint');
  assert.ok(t.dirty && t.box);
});

test('a two-way route: two tracks side by side, of opposite ways', () => {
  const t = new TyreTracks(N, () => true);
  for (let k = 0; k < 6; k++) { drive(t, 'a', 5.5, 30.5, 45.5, 30.5); drive(t, 'a', 45.5, 30.5, 5.5, 30.5); }
  const out = cell(t, 25, Math.floor(30.5 + LANE)), back = cell(t, 25, Math.floor(30.5 - LANE));
  assert.ok(out && back);
  assert.ok(out.vx / out.w > 0.9 && back.vx / back.w < -0.9);
  assert.ok(out.w > 5, "wear builds with passes (about a tile a pass)");
});

test('no wear where the tiles take none, none on a jump', () => {
  const t = new TyreTracks(N, x => x < 20 || x > 30);
  drive(t, 'a', 5.5, 10.5, 45.5, 10.5);
  for (let x = 20; x <= 30; x++) assert.equal(cell(t, x, 11), undefined);
  assert.ok(cell(t, 15, 11) && cell(t, 35, 11));
  const u = new TyreTracks(N, () => true);
  u.move('j', 2, 2, 'car'); u.move('j', 2 + MAX_JUMP + 1, 2, 'car');
  assert.equal(u.cells.size, 0);
});

test('the wear fades without traffic, and goes when its tile stops taking it', () => {
  let ok = true;
  const t = new TyreTracks(N, () => ok);
  drive(t, 'a', 5.5, 40.5, 45.5, 40.5);
  const w0 = cell(t, 25, 41)!.w;
  t.fade(1000); t.fade(1000 + FADE_MIN);
  assert.ok(Math.abs(cell(t, 25, 41)!.w - w0 / Math.E) < 1e-6);
  t.fade(1000 + 20 * FADE_MIN);
  assert.equal(t.cells.size, 0); assert.equal(t.box, null);
  drive(t, 'b', 5.5, 40.5, 45.5, 40.5); assert.ok(t.cells.size > 0);
  ok = false; t.forgetOk(); assert.equal(t.cells.size, 0);
});
