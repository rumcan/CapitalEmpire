// J7d (#1234; the owner, 2026-11-13: "pls make all the labels show on hover otherwise add a 50m artwork sign"): the jam's world labels show only while the
// pointer is over their thing (world-labels.ts hoverOnly); the hints, warnings and growth floats stay; distances are PNG yardage signs or nothing (J7e, yardage-signs.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldLabels } from '../src/game/world-labels';
import { PRI } from '../src/game/label-place';
import { JUNK_SCALE, RANGE_ART, SMALL_JUNK_SCALE, junkScale, newRangeJunk, rangeScene, defaultRangeBiz } from '../src/game/golf/rangebiz';
import { YARDAGE_DISTANCES, yardageSign, yardageSlug } from '../src/game/golf/yardage-signs';
import { LIBRARY } from '../src/game/library';
import type { Rect } from '../src/game/golf/mode';

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
  const s = { ...defaultRangeBiz(), junk: newRangeJunk(5) }, sc = rangeScene([200, 200, 70, 150], 2, s, { jam: true });
  assert.equal(sc.junk.length, 9);
  for (const j of sc.junk) assert.ok(!sc.numbers.some(t => Math.hypot(t.x - j.x, t.y - j.y) < 8), `${j.name}: no distance drawn by it`);
});
// J7e (#1258; the owner: "no vector distance signs. only png sprites allowed"): the yardage signs are the ChatGPT pictures (range art slugs golf-range-yard-<m>),
// looked up through the range scene's own art lookup like the yardage board and the road sign: view 1 on the facings 0 and 1, view 2 on 2 and 3
const PLOTS: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const greens = () => ({ ...defaultRangeBiz(), owned: ['greens', 'targets'] as never[] });
const LIB = new Set(LIBRARY.map(it => it.id));
/** the markers' distances (every 50 m down both sides) and the target greens' (tee line to flag, m), as the scene lays them */
const MARKERS = [50, 100, 150, 200, 250], GREEN_M = [50, 100, 150, 200, 240];
/** the picture the scene should draw for a distance at a facing: its view by the facing (1 for 0 and 1, 2 for 2 and 3), every distance alike */
const wantId = (m: number, f: number) => `range:golf-range-yard-${m}-view${f < 2 ? 1 : 2}`;

test('J7e: every painted distance has its two pictures packed in the library (50 to 250 m, no 240), each its own slug', () => {
  assert.deepEqual([...YARDAGE_DISTANCES], [50, 75, 100, 125, 150, 175, 200, 250]);
  for (const m of YARDAGE_DISTANCES) {
    const v = RANGE_ART[`golf-range-yard-${m}`]; assert.ok(v, `${m} m: packed`); assert.equal(v!.length, 2, `${m} m: two views`);
    assert.deepEqual(v, [`range:golf-range-yard-${m}-view1`, `range:golf-range-yard-${m}-view2`]);
    for (const id of v!) assert.ok(LIB.has(id), `${id} is in the library`);
  }
  // only an exactly painted distance has a slug: never the nearest one's picture (a wrong distance), and nothing for the 240 m green
  assert.equal(yardageSlug(240), null); assert.equal(yardageSlug(60), null); assert.equal(yardageSlug(50.4), null); assert.equal(yardageSlug(0), null);
  assert.equal(yardageSlug(250), 'golf-range-yard-250');
  const art = (slug: string) => `pic:${slug}`;
  assert.equal(yardageSign(240, 0, art), null); assert.equal(yardageSign(100, 2, art), 'pic:golf-range-yard-100');
  assert.equal(yardageSign(100, 0, () => null), null, 'no picture, no sign');
});
test('J7e: the jam range draws no distance as a number or a board: its scene has no numbers, with the pictures or without them, at every facing', () => {
  for (const f of FACINGS) for (const art of [{}, RANGE_ART]) assert.equal(rangeScene(PLOTS[f], f, greens(), { jam: true, art }).numbers.length, 0, `facing ${f}`);
});
test('J7e: until the pictures land there is no sign at all: no marker post, no stand-in board, no number', () => {
  for (const f of FACINGS) {
    const sc = rangeScene(PLOTS[f], f, greens(), { jam: true, art: {} });
    assert.ok(!sc.pieces.some(p => p.key.startsWith('mark') || p.key.startsWith('board')), `facing ${f}: no sign pieces`);
    assert.ok(!sc.pieces.some(p => p.id === 'ce:parking-sign' || p.id === 'poi:fishing-board'), `facing ${f}: no stand-ins`);
    assert.equal(sc.pieces.filter(p => p.key.startsWith('flag')).length, 5, 'the greens keep their flags');
  }
});
test('J7e: with the real library every marker (both sides, 50 to 250 m) and every target green with a picture gets the sign of its own distance, at all four facings', () => {
  for (const f of FACINGS) {
    const sc = rangeScene(PLOTS[f], f, greens(), { jam: true });
    assert.deepEqual(sc.targets.map(t => t.m), GREEN_M, 'the greens\' distances');
    for (const [k, m] of MARKERS.entries()) {
      const marks = sc.pieces.filter(p => p.key.startsWith(`mark${k + 1}-`));
      assert.equal(marks.length, 2, `facing ${f}: the ${m} m marker on both sides`);
      for (const p of marks) assert.equal(p.id, wantId(m, f), `facing ${f}: ${p.key}`);
      assert.notDeepEqual([marks[0]!.x, marks[0]!.y], [marks[1]!.x, marks[1]!.y], `facing ${f}: ${m} m, two sides`);
    }
    sc.targets.forEach((t, i) => {
      const board = sc.pieces.filter(p => p.key === `board${i}`);
      if (yardageSlug(t.m)) { assert.equal(board.length, 1, `facing ${f}: the ${t.m} m green's sign`); assert.equal(board[0]!.id, wantId(t.m, f)); }
      else assert.equal(board.length, 0, `facing ${f}: the ${t.m} m green has no picture, so no sign (never a wrong distance)`);
    });
    assert.equal(sc.pieces.filter(p => p.key.startsWith('board')).length, 4, 'the 50, 100, 150 and 200 m greens; not the 240 m one');
    assert.equal(sc.pieces.filter(p => p.key.startsWith('mark')).length, 10, 'five markers a side');
  }
});
test('J7e: each sign faces the way the range faces: view 1 at the facings 0 and 1, view 2 at 2 and 3 (as the yardage board), placed as painted: never turned, mirrored, scaled or labelled', () => {
  for (const f of FACINGS) {
    const signs = rangeScene(PLOTS[f], f, greens(), { jam: true }).pieces.filter(p => p.id.startsWith('range:golf-range-yard-'));
    assert.equal(signs.length, 14);
    for (const p of signs) {
      assert.equal(p.q, 0, `${p.key}: never turned (the view is the facing's)`); assert.equal(p.scale, undefined); assert.equal(p.fit, undefined); assert.equal(p.label, undefined, `${p.key}: no stand-in label`);
      assert.ok(p.id.endsWith(f < 2 ? '-view1' : '-view2'), `facing ${f}: ${p.id}`); // (every distance alike: the 100 m sign's view 1 is repainted, no exception)
    }
  }
  // the same lookup as the yardage board's: the board's slug has its view 1 first and view 2 second, as the signs'
  for (const f of FACINGS) assert.ok(RANGE_ART['golf-range-yardage-board']![f < 2 ? 0 : 1]!.endsWith(f < 2 ? '-view1' : '-view2'));
});
test('J7e: the 100 m sign is its own view 1 on the facings 0 and 1 (its first painting came out facing the other way and was swapped for its view 2; repainted, no exception left)', () => {
  for (const f of [0, 1] as const) {
    const hundreds = rangeScene(PLOTS[f], f, greens(), { jam: true }).pieces.filter(p => /yard-100-/.test(p.id));
    assert.equal(hundreds.length, 3, `facing ${f}: both markers and the 100 m green`);
    assert.ok(hundreds.every(p => p.id === 'range:golf-range-yard-100-view1'), `facing ${f}: the 100 m signs are view 1`);
  }
  for (const f of [2, 3] as const) assert.ok(rangeScene(PLOTS[f], f, greens(), { jam: true }).pieces.filter(p => /yard-100-/.test(p.id)).every(p => p.id === 'range:golf-range-yard-100-view2'));
  assert.equal(yardageSign(100, 0, (slug, q) => `${slug}:${q}`), 'golf-range-yard-100:0', 'the lookup is the facing\'s, nothing swapped');
});
test('J7e: the normal game keeps its markers and number pills (the jam rule only in the jam), and draws none of the yardage signs', () => {
  for (const f of FACINGS) {
    const sc = rangeScene(PLOTS[f], f, greens(), { jam: false });
    assert.equal(sc.numbers.length, 15, `facing ${f}: ten marker pills and five board pills`); assert.ok(sc.pieces.some(p => p.key.startsWith('mark')));
    assert.deepEqual(sc.numbers.slice(0, 10).map(n => n.text).sort(), ['100 m', '100 m', '150 m', '150 m', '200 m', '200 m', '250 m', '250 m', '50 m', '50 m']);
    assert.ok(!sc.pieces.some(p => p.id.startsWith('range:golf-range-yard-')), 'no yardage sign picture outside the jam');
  }
});
test('J7e: no code-drawn sign is left in the source: the vector board is gone and the range overlay draws no distance in the jam', async () => {
  const fs = await import('node:fs');
  assert.equal(fs.existsSync('src/game/golf/yardage-sign.ts'), false, 'the vector yardage board module is gone');
  const host = fs.readFileSync('src/game/golf/rangehost.ts', 'utf8');
  assert.ok(!/drawYardageSign|yardage-sign'/.test(host), 'the range overlay draws no yardage board');
  const jamBlock = host.slice(host.indexOf('if (JAM) {', host.indexOf('const px = Math.round(dpr * Math.max(9')), host.indexOf('} else for (const t of sc.numbers)'));
  assert.ok(jamBlock.length > 0 && !/sc\.numbers|fillText|roundRect|fillRect/.test(jamBlock), 'the jam branch draws no numbers or boards');
});
