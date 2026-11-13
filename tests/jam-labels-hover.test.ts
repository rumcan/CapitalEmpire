// J7d (#1234; the owner, 2026-11-13: "pls make all the labels show on hover otherwise add a 50m artwork sign"): the jam's world labels show only while the
// pointer is over their thing (world-labels.ts hoverOnly); the hints, warnings and growth floats stay; distances are painted yardage boards (yardage-sign.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldLabels } from '../src/game/world-labels';
import { PRI } from '../src/game/label-place';
import { signSize } from '../src/game/golf/yardage-sign';
import { JUNK_SCALE, SMALL_JUNK_SCALE, junkScale, newRangeJunk, rangeScene, defaultRangeBiz } from '../src/game/golf/rangebiz';

/** a canvas with measureText only (the labels measure their text) */
const ctx = { font: '', measureText: (t: string) => ({ width: t.length * 7 }) } as unknown as CanvasRenderingContext2D;
function frame(hover: { x: number; y: number } | null, on = true) {
  const L = new WorldLabels(); L.begin(ctx, 1); L.hoverOnly = on; L.hoverAt = hover;
  const pallets = L.text('pallets', PRI.name, 'Pallets', 400, 300, '12px x', 12, '#fff');
  const lot = L.text('lot', PRI.count, 'P · 3/24', 100, 100, '12px x', 12, '#fff');
  const hint = L.text('hint', PRI.hint, 'Not your land', 700, 500, '12px x', 12, '#fff');
  const warn = L.pill('room', PRI.warn, 'Ball room · OUT OF BALLS', 200, 400, '12px x', 160, 18, '#000', 4, '#fff');
  const grow = L.pair('grow', PRI.growth, '+3', '#0f0', '', '#f00', 600, 200, '12px x', 12, '#000', 2);
  L.place(1000, 800);
  return { pallets, lot, hint, warn, grow, L };
}

test('off (every normal build): every label shows wherever the pointer is', () => {
  const f = frame(null, false);
  for (const l of [f.pallets, f.lot, f.hint, f.warn, f.grow]) assert.equal(l.shown, true, l.text);
});
test('on: with the pointer off the map, no name label shows; the hint, the warning and the growth float stay', () => {
  const f = frame(null);
  assert.equal(f.pallets.shown, false); assert.equal(f.lot.shown, false);
  assert.equal(f.hint.shown, true); assert.equal(f.warn.shown, true); assert.equal(f.grow.shown, true);
});
test('on: the pointer over the pallets (on the pile, under its name) shows their name alone', () => {
  const f = frame({ x: 405, y: 360 });
  assert.equal(f.pallets.shown, true); assert.equal(f.lot.shown, false);
});
test('on: the pointer a little way off the thing shows nothing; over the car park shows its count', () => {
  assert.equal(frame({ x: 400, y: 520 }).pallets.shown, false, 'far below');
  assert.equal(frame({ x: 520, y: 300 }).pallets.shown, false, 'far to the side');
  const f = frame({ x: 100, y: 150 }); assert.equal(f.lot.shown, true); assert.equal(f.pallets.shown, false);
});
test('on: a selected thing (keep) keeps its label without the pointer', () => {
  const L = new WorldLabels(); L.begin(ctx, 1); L.hoverOnly = true; L.hoverAt = null; L.keep = new Set(['sel']);
  const a = L.text('sel', PRI.name, 'Clubhouse', 300, 300, '12px x', 12, '#fff'), b = L.text('other', PRI.name, 'Shop', 600, 300, '12px x', 12, '#fff');
  L.place(1000, 800); assert.equal(a.shown, true); assert.equal(b.shown, false);
});
test('the yardage board: the figures never below the legible size, the board wider than its text, the post standing it off the ground', () => {
  const w = (px: number) => 3 * px * 0.6;
  const far = signSize(4, w, 8), near = signSize(40, w, 8);
  assert.equal(far.px, 8, 'zoomed out: the least legible size'); assert.ok(near.px > far.px, 'zoomed in: larger');
  for (const s of [far, near]) { assert.ok(s.w > w(s.px)); assert.ok(s.h > s.px); assert.ok(s.post > 0); }
});
test('the junk reads at the range zoom: the small piles drawn larger than the big ones, and each pile has its own yardage board beside it', () => {
  assert.equal(junkScale('expansion:pallet-stack'), SMALL_JUNK_SCALE); assert.equal(junkScale('expansion:tyre-stack'), SMALL_JUNK_SCALE);
  assert.equal(junkScale('expansion:junk-car'), JUNK_SCALE);
  const s = { ...defaultRangeBiz(), junk: newRangeJunk(5) }, sc = rangeScene([200, 200, 70, 150], 2, s);
  for (const j of sc.junk) {
    const n = sc.numbers.find(t => t.text === `${j.m} m` && Math.hypot(t.x - j.x, t.y - j.y) < 6);
    assert.ok(n, `${j.name}: its board within reach`); assert.ok(Math.hypot(n!.x - j.x, n!.y - j.y) > 1.5, `${j.name}: beside, not on it`);
    assert.ok(!sc.numbers.some(t => t.text.includes(j.name)), 'no name painted on the board');
  }
});
