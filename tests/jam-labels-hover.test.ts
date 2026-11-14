// J7d (#1234; the owner, 2026-11-13: "pls make all the labels show on hover otherwise add a 50m artwork sign"): the jam's world labels show only while the
// pointer is over their thing (world-labels.ts hoverOnly); the hints, warnings and growth floats stay; distances are PNG yardage signs or nothing (J7e, yardage-signs.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldLabels } from '../src/game/world-labels';
import { PRI } from '../src/game/label-place';
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
test('J7e: the junk reads at the range zoom (the small piles drawn larger than the big ones) and gets no sign: its name and distance are its hover label', () => {
  assert.equal(junkScale('expansion:pallet-stack'), SMALL_JUNK_SCALE); assert.equal(junkScale('expansion:tyre-stack'), SMALL_JUNK_SCALE);
  assert.equal(junkScale('expansion:junk-car'), JUNK_SCALE);
  const s = { ...defaultRangeBiz(), junk: newRangeJunk(5) }, sc = rangeScene([200, 200, 70, 150], 2, s, { jam: true, signs: () => 'world:bench' });
  assert.equal(sc.junk.length, 9);
  for (const j of sc.junk) assert.ok(!sc.numbers.some(t => Math.hypot(t.x - j.x, t.y - j.y) < 8), `${j.name}: no distance drawn by it`);
});
// J7e (#1258; the owner: "no vector distance signs. only png sprites allowed")
const PLOT: [number, number, number, number] = [200, 200, 70, 150];
const greens = () => ({ ...defaultRangeBiz(), owned: ['greens', 'targets'] as never[] });
test('J7e: the jam range draws no distance as a number or a board: its scene has no numbers, with or without the sign pictures', () => {
  for (const signs of [() => null, () => 'world:bench']) assert.equal(rangeScene(PLOT, 2, greens(), { jam: true, signs }).numbers.length, 0);
});
test('J7e: until the pictures land there is no sign at all: no marker post, no stand-in board', () => {
  const sc = rangeScene(PLOT, 2, greens(), { jam: true, signs: () => null });
  assert.ok(!sc.pieces.some(p => p.key.startsWith('mark') || p.key.startsWith('board')), 'no sign pieces');
  assert.ok(!sc.pieces.some(p => p.id === 'ce:parking-sign' || p.id === 'poi:fishing-board'), 'no stand-ins');
  assert.equal(sc.pieces.filter(p => p.key.startsWith('flag')).length, 5, 'the greens keep their flags');
});
test('J7e: with the pictures in, each marker (both sides, 50 to 250 m) and each target green gets the PNG sign of its own distance', () => {
  const asked: number[] = [];
  const sc = rangeScene(PLOT, 2, greens(), { jam: true, signs: m => { asked.push(m); return `sign-${m}`; } });
  for (const m of [50, 100, 150, 200, 250]) assert.equal(sc.pieces.filter(p => p.id === `sign-${m}` && p.key.startsWith('mark')).length, 2, `${m} m markers`);
  for (const m of [50, 100, 150, 200, 240]) assert.ok(sc.pieces.some(p => p.id === `sign-${m}` && p.key.startsWith('board')), `the ${m} m green's sign`);
  assert.ok(asked.length > 0);
});
test('J7e: the normal game keeps its markers and number pills (the jam rule only in the jam)', () => {
  const sc = rangeScene(PLOT, 2, greens(), { jam: false });
  assert.ok(sc.numbers.length >= 10); assert.ok(sc.pieces.some(p => p.key.startsWith('mark')));
});
test('J7e: no code-drawn sign is left in the source: the vector board is gone and the range overlay draws no distance in the jam', async () => {
  const fs = await import('node:fs');
  assert.equal(fs.existsSync('src/game/golf/yardage-sign.ts'), false, 'the vector yardage board module is gone');
  const host = fs.readFileSync('src/game/golf/rangehost.ts', 'utf8');
  assert.ok(!/drawYardageSign|yardage-sign'/.test(host), 'the range overlay draws no yardage board');
  const jamBlock = host.slice(host.indexOf('if (JAM) {', host.indexOf('const px = Math.round(dpr * Math.max(9')), host.indexOf('} else for (const t of sc.numbers)'));
  assert.ok(jamBlock.length > 0 && !/sc\.numbers|fillText|roundRect|fillRect/.test(jamBlock), 'the jam branch draws no numbers or boards');
});
