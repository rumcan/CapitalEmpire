// T376 (#1032; the owner, 2026-11-08: "the buildings that are going onto the pavement ... the commercial buildings"): a shop's or venue's building stands with
// its base behind its lot's front line, on every road side, and inside its sides and back. The base is the footprint the composer stands the picture on and
// the ground contact of the picture itself (base-pad.ts: steps, door mats, planters, kerbs; an awning or a sign above head height may cross the line).
// The lots are the game's: the lot map's own sizes (lots.ts SIZE), every business, built, upgraded and declined, on the eight road headings and turned a few
// degrees off them (a hand-drawn road is hardly ever on an axis: the shop's picture stays axis-aligned while the lot's front line turns). Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, lotPresets, setLotRemix, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { setLotSetback } from '../src/game/lots/setback';
import { REACH } from '../src/game/lots/compose-core';
import { LU, LV } from '../src/game/lots/town';
import { axisViews, eightRingOf, footprintOf, sizeKey, sizeViews } from '../src/game/lots/preset-art';
import { basePad, hasBasePad } from '../src/game/lots/base-pad';
import { SHOP_PALETTE, VENUE_PALETTE } from '../src/game/lots/variety';
import { roadOf } from '../src/game/lots/preset-frame';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';

// (the remix swaps the other props of a preset: it moves no building, but the tests keep the presets' own pictures)
setLotRemix(false);
const BY = new Map(LIBRARY.map(i => [i.id, i] as const));
const ROADS = [0, 1, 2, 3, 4, 5, 6, 7];
/** how far a lot's street may be turned off its heading (degrees): an axis road takes five, a diagonal three (past 20 degrees off both map axes a lot is a green) */
const tiltsOf = (road: number): number[] => (road % 2 ? [0, 8, -8] : [0, 9, -9, 18, -18]);
/** the closeness the lot line is held to (tiles): the composer's own EPS plus a hair */
const TOL = 0.03;

/** a lot whose street lies along -n on road r (presets.ts Road), turned tilt degrees off it: lot-facing.test.ts builds them (tilt 0) */
function lotOn(road: number, w: number, d: number, tilt = 0): LotGeom {
  const a = road * Math.PI / 4 + tilt * Math.PI / 180, n = { x: -Math.sin(a), y: -Math.cos(a) };
  return { o: { x: 40, y: 60 }, u: { x: -n.y, y: n.x }, n, w, d };
}
const STRAIGHT = /:yaw8[NESW]$/;
interface Base { id: string; a0: number; a1: number; b0: number; b1: number; front: number }
/** a placed building's base in its lot's frame: the footprint polygon (its box, or the turned square of a straight-on picture) and its front, the
 *  nearest b of the footprint less the picture's ground contact toward the street */
function baseOf(p: { id: string; x: number; y: number; flip: boolean; scale: number }, lot: LotGeom): Base {
  const [x0, y0, x1, y1] = footprintOf(p.id, p.scale, p.flip), cx = p.x + (x0 + x1) / 2, cy = p.y + (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const diag = !!axisViews(p.id) || STRAIGHT.test(p.id), D = Math.max(hx, hy);
  const poly = diag ? [[cx - D, cy], [cx + D, cy], [cx, cy - D], [cx, cy + D]] : [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
  const as: number[] = [], bs: number[] = [];
  for (const [x, y] of poly) { const dx = x! - lot.o.x, dy = y! - lot.o.y; as.push(dx * lot.u.x + dy * lot.u.y); bs.push(dx * lot.n.x + dy * lot.n.y); }
  const b0 = Math.min(...bs);
  return { id: p.id, a0: Math.min(...as), a1: Math.max(...as), b0, b1: Math.max(...bs), front: b0 - basePad(p.id, roadOf(lot.n), p.scale) };
}
/** the failures counted by picture (the first words of each) */
const summary = (bad: string[]): string => { const m = new Map<string, number>(); for (const l of bad) { const k = l.split(': ')[0]!; m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`).join(', '); };
const where = (b: Base, what: string) => `${b.id}: ${what} (front ${b.front.toFixed(2)}, a ${b.a0.toFixed(2)}..${b.a1.toFixed(2)}, b ${b.b0.toFixed(2)}..${b.b1.toFixed(2)})`;

/** the shop and venue subjects and every picture a lot can draw them as: four views, the screen-axis set, the eight-view ring */
function pictures(): string[] {
  const ids = new Set<string>();
  for (const s of [...SHOP_PALETTE, ...VENUE_PALETTE]) { for (const v of sizeViews(sizeKey(s))) ids.add(v); for (const v of eightRingOf(s) ?? []) ids.add(v); ids.add(s); }
  return [...ids].filter(i => BY.has(i));
}

test('every picture of a shop or a venue has its base pad in the table (T376)', () => {
  const missing = pictures().filter(id => !hasBasePad(id));
  assert.deepEqual(missing, [], 'run node scripts/assets/base-pads.mjs --write after changing a shop\'s art');
  assert.ok(pictures().length >= 40, 'the palettes have their views');
});

test('the pad is metres of a picture at scale 1: it grows with the scale, shifts with the road, and is zero on the far roads (T376)', () => {
  const id = pictures().find(i => basePad(i, 0, 2) > 0);
  assert.ok(id, 'some picture has a pad');
  assert.ok(Math.abs(basePad(id, 0, 2) - 2 * basePad(id, 0, 1)) < 1e-9, 'twice the scale, twice the pad');
  for (const road of [3, 4, 5, 6, 7]) assert.equal(basePad(id, road, 1), 0, `road ${road} is on the far side`);
  assert.equal(basePad('no:such-picture', 0, 1), 0);
});

/** the lot sizes the lot map lays (lots.ts SIZE: gravel, lane and street 10 x 15; road 12.5 x 16; avenue 15 x 18; arterial 16.5 x 19; boulevard 20 x 20) */
const SIZES: [number, number][] = [[10, 15], [12.5, 16], [15, 18], [16.5, 19], [20, 20]];
/** a lot's look: built, upgraded, or declined (decline 2) */
const STATES: [number, number][] = [[LV.BUILT, 0], [LV.UPGRADED, 0], [LV.BUILT, 2]];

interface Result { checked: number; padded: number; over: number; deepest: number; bad: string[] }
/** composes the town's shop and venue lots as the game does (no forced preset) and measures every building's base against its lot */
function townLots(): Result {
  const r: Result = { checked: 0, padded: 0, over: 0, deepest: 0, bad: [] };
  // (a tour lot shows the venue its place's colour picks: no business to force, so one pass of seeds)
  for (const [use, bizs] of [[LU.COM, SHOP_PALETTE], [LU.TOUR, ['']]] as const) {
    for (const biz of bizs) for (const road of ROADS) for (const tilt of tiltsOf(road)) for (const [w, d] of SIZES) for (const seed of [23, 61]) for (const [level, decline] of STATES) {
      const lot = lotOn(road, w, d, tilt), st: ComposeState = { use, level, decline, seed, ...(biz ? { biz } : {}) };
      for (const q of compose(lot, st).props) {
        const it = BY.get(q.id); if (!it || !isBuilding(it) || q.street) continue; // (the street items stand on the verge by design)
        const b = baseOf(q, lot); r.checked++; if (b.front < b.b0 - 1e-9) r.padded++;
        const tag = `${biz || 'venue'} ${w}x${d} road ${road} tilt ${tilt} level ${level} decline ${decline} seed ${seed}`;
        if (b.front < -TOL) { r.over++; r.deepest = Math.max(r.deepest, -b.front); r.bad.push(where(b, `${tag}: the base reaches ${(-b.front).toFixed(2)} tiles over the line`)); }
        if (b.a0 < -REACH - TOL || b.a1 > lot.w + REACH + TOL || b.b1 > lot.d + REACH + TOL) r.bad.push(where(b, `${tag}: past the sides or the back`));
      }
    }
  }
  return r;
}

test('a shop or venue building stands behind the lot line on every road, straight or turned off it: the town\'s lots, every business, state and size (T376)', () => {
  const r = townLots();
  console.log(`T376 town lots: ${r.checked} buildings checked, ${r.padded} with a picture pad, ${r.bad.length} over the line`);
  assert.ok(r.checked > 1000, 'the lots have buildings');
  assert.deepEqual(r.bad.slice(0, 12), [], `${r.bad.length} buildings over the line: ${summary(r.bad)}`);
});

test('a shop or venue building stands behind the lot line on every road: frozen and approved presets, straight and turned (T376)', () => {
  let checked = 0, padded = 0; const bad: string[] = [];
  for (const p of lotPresets()) {
    if (p.use !== 'com' && p.use !== 'tour') continue;
    // (the frozen presets, no road, draw on every heading; a lab preset only when approved, on its own road)
    if (p.road !== undefined && p.approved !== true) continue;
    for (const road of p.road !== undefined ? [p.road] : ROADS) for (const tilt of tiltsOf(road).slice(0, 3)) {
      const lot = lotOn(road, p.w, p.d, tilt), st: ComposeState = { use: p.use === 'com' ? LU.COM : LU.TOUR, level: LV.BUILT, decline: 0, seed: 23, preset: p.id };
      for (const q of compose(lot, st).props) {
        const it = BY.get(q.id); if (!it || !isBuilding(it) || q.street) continue; // (the street items stand on the verge by design)
        const b = baseOf(q, lot); checked++; if (b.front < b.b0 - 1e-9) padded++;
        if (b.front < -TOL) bad.push(where(b, `${p.id} road ${road} tilt ${tilt}: the base reaches ${(-b.front).toFixed(2)} tiles over the line`));
        if (b.a0 < -REACH - TOL || b.a1 > lot.w + REACH + TOL || b.b1 > lot.d + REACH + TOL) bad.push(where(b, `${p.id} road ${road} tilt ${tilt}: past the sides or the back`));
      }
    }
  }
  console.log(`T376 presets: ${checked} buildings checked, ${padded} with a picture pad, ${bad.length} over the line`);
  assert.ok(checked > 1000, 'the presets have buildings');
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} buildings over the line: ${summary(bad)}`);
});

test('without the setback the shops do stand over the pavement (what the checks above would catch; setLotSetback(false) is the old look)', () => {
  setLotSetback(false);
  let r: Result;
  try { r = townLots(); } finally { setLotSetback(true); }
  console.log(`T376 without the setback: ${r.over} of ${r.checked} buildings over the line, the deepest ${r.deepest.toFixed(2)} tiles (${(2 * r.deepest).toFixed(1)} m)`);
  assert.ok(r.over > 0, `${r.over} of ${r.checked} over the line without the setback: the checks above see the fault`);
  assert.ok(r.deepest > 0.2, `the deepest is ${r.deepest.toFixed(2)} tiles`);
});
