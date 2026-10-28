// Headless tests for the contact shadows (src/game/shadow-shape.ts; the GPU draws them and is checked in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { overrideOf, shadowAlpha, shadowShape } from '../src/game/shadow-shape';

const first = (kind: string) => LIBRARY.find(it => it.kind === kind)!;

test('shadows: every library sprite but the baked lots (and the overrides that say none, T141) casts one, with sane numbers', () => {
  for (const it of LIBRARY) {
    const s = shadowShape(it, 1, 0.8);
    // (T231: the kit's lily pads lie flat on the water and its jet is water: none either)
    if (it.kind === 'lot' || it.kind === 'decal' || it.kind === 'fountain' || overrideOf(it.id)?.o.contact === false) { assert.equal(s, null, it.id); continue; }
    assert.ok(s, it.id);
    for (const v of [s.hx, s.hy, s.core, s.feather]) assert.ok(Number.isFinite(v) && v > 0, `${it.id} ${JSON.stringify(s)}`);
    assert.ok(s.core <= 1, it.id);
  }
});

test('shadows: buildings follow their footprint, fences run thin, trees are round from the canopy, cars reach past the body', () => {
  const b = shadowShape(first('house'), 5, 3)!;
  assert.equal(b.round, false); assert.ok(Math.abs(b.hx - 4.85) < 1e-9 && Math.abs(b.hy - 2.91) < 1e-9);
  const fx = shadowShape(first('fencex'), 4, 0.2)!;
  assert.ok(fx.hx > 3.5 && fx.hy < 0.2);
  const t = shadowShape(first('tree'), 0.8, 0.6)!;
  assert.equal(t.round, true); assert.equal(t.hx, t.hy); assert.ok(t.hx >= 0.45 && t.hx <= 1.6); assert.equal(t.atAnchor, true);
  const c = shadowShape(first('car'), 2.2, 1)!;
  // a car heading diagonally (a nearly square map-axis box): a round pool the size of its body, not of the box
  const d = shadowShape(first('car'), 1.6, 1.5)!; assert.ok(d.round && d.hx < 1.6 && d.hx === d.hy, JSON.stringify(d));
  assert.ok(c.hx > 2.2 && c.hy > 1);
});

test('shadows: darkest at the base, gone well outside the edge', () => {
  const s = shadowShape(first('house'), 3, 3)!;
  const mid = shadowAlpha(s, 0, 0), edge = shadowAlpha(s, s.hx, 0), out = shadowAlpha(s, s.hx + s.feather * 1.3, 0);
  assert.ok(mid > edge && edge > out); assert.ok(Math.abs(mid - s.core) < 1e-9); assert.equal(out, 0);
});
