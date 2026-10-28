// T227: the concept's course finish (src/game/course-finish.ts): the knobs clamp and ride in the surfaces file; off (and each knob at 0) is the
// look before T227; the fairway and range outfield bands follow the line of play (each leg of a dogleg); the greens carry their hole's line for
// their fine stripes; the collar is wider and toned; and a bunker's lip lies on its far side (the sun at the upper right).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COURSE_FINISH, FINISH_OFF, FINISH_RANGES, clampCourseFinish, collarDefault, collarToneOf, edgeFacing, finishBorders, finishMow, finishOf,
  finishStripeLook, greenStripeLook, lipRuns, tonedCollar, LIP_BINS,
} from '../src/game/course-finish';
import { bandAt, fairwayStripeLook, holeStripeLegs } from '../src/game/course-stripes';
import { clampSurfaces } from '../src/game/painted-surfaces';
import { PRESETS } from '../src/game/paint-presets';
import { RANGE_PRESET, outfieldStripes } from '../src/game/golf/rangehost';
import { CELL_T, SURF, cellAt, fillPolygon, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { BORDER_MAX_M, BORDER_MIN_M, coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { SUN_TILE_DIR } from '../src/game/ext/course-height';

const BASE = fairwayStripeLook(), D = DEFAULT_COURSE_FINISH;
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;
const box = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number, h: number) =>
  fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, h, 0);
const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};

test('the knobs clamp: out of range, not numbers or missing take the range\'s end or the tuned look', () => {
  assert.deepEqual(clampCourseFinish(null), { ...D });
  assert.deepEqual(clampCourseFinish({}), { ...D });
  const c = clampCourseFinish({ on: 'yes', along: 0, bandWidth: 99, bandStrength: -1, greenWidth: Number.NaN, greenStrength: 'x', collarWidth: 0, collarTone: 5, lip: 9 });
  assert.deepEqual(c, { on: D.on, along: D.along, bandWidth: FINISH_RANGES.bandWidth[1], bandStrength: 0, greenWidth: D.greenWidth, greenStrength: D.greenStrength, collarWidth: FINISH_RANGES.collarWidth[0], collarTone: 1, lip: 2 });
  assert.equal(clampCourseFinish({ on: false }).on, false);
  assert.equal(clampCourseFinish({ along: false }).along, false);
  // the collar width is the Border slider's range
  assert.deepEqual([...FINISH_RANGES.collarWidth], [BORDER_MIN_M, BORDER_MAX_M]);
  // every default inside its range
  for (const [k, [lo, hi]] of Object.entries(FINISH_RANGES)) { const v = D[k as keyof typeof FINISH_RANGES]; assert.ok(v >= lo && v <= hi, k); }
});

test('the knobs ride in the surfaces file: kept (clamped) when there, absent when not (the tuned look), stable through a save', () => {
  const f = clampSurfaces({ v: 1, surfaces: {}, lawns: [], presets: {}, course: { bandWidth: 40, lip: 0.5 } });
  assert.deepEqual(f.course, { ...D, bandWidth: 16, lip: 0.5 });
  assert.deepEqual(clampSurfaces(JSON.parse(JSON.stringify(f))), f);
  const none = clampSurfaces({ v: 1, surfaces: {}, lawns: [], presets: {} });
  assert.equal('course' in none, false);
  assert.deepEqual(finishOf(none), { ...D });
  assert.equal(finishOf(f), finishOf(f), 'one finish a file');
  assert.equal(finishOf(clampSurfaces({ course: { on: false } })).on, false);
});

test('off is the look before T227: T218\'s stripes, BLOB_STYLE\'s collars, no tone, no green stripes, the outfield as it was', () => {
  assert.equal(finishStripeLook(FINISH_OFF, BASE), null);
  assert.equal(greenStripeLook(FINISH_OFF, BASE), null);
  assert.equal(collarToneOf(FINISH_OFF), null);
  for (const s of [SURF.fairway, SURF.green, SURF.tee, SURF.bunker]) assert.equal(collarDefault(s, FINISH_OFF), null);
  // T260: off, the fairway's first cut and the green's fringe are BLOB_STYLE's; a tee, a bunker and a pond have none; a set Border stays
  const border = [undefined, undefined, undefined, undefined, 1.5];
  const off = finishBorders(border, FINISH_OFF);
  assert.equal(off[SURF.fairway], 1.5); assert.equal(off[SURF.green], 1);
  for (const s of [SURF.tee, SURF.bunker, SURF.water]) assert.equal(off[s], 0);
  assert.equal(finishBorders([], FINISH_OFF)[SURF.fairway], 2);
  const pre = PRESETS.find(p => p.id === RANGE_PRESET.outfield)!;
  const mw = outfieldStripes({ aim: { x: 0, y: -1 }, roadDir: { x: 1, y: 0 }, mowFrom: { x: 5, y: 5 } }, { ...pre.stripes, on: true })!;
  assert.equal(finishMow(mw, FINISH_OFF, BASE), null);
  // a stripe set with no line of play keeps its own look even with the finish on
  assert.equal(finishMow({ ...mw, lx: undefined, ly: undefined }, D, BASE), null);
});

test('each knob at 0 leaves its part as before: no green stripes, no collar tone, no bands', () => {
  assert.equal(greenStripeLook({ ...D, greenStrength: 0 }, BASE), null);
  assert.equal(collarToneOf({ ...D, collarTone: 0 }), null);
  const flat = finishStripeLook({ ...D, bandStrength: 0 }, BASE)!;
  assert.equal(flat.l, 0); assert.equal(flat.k, 0);
  // and stronger is stronger
  const a = finishStripeLook({ ...D, bandStrength: 0.3 }, BASE)!, b = finishStripeLook({ ...D, bandStrength: 0.9 }, BASE)!;
  assert.ok(b.l > a.l && b.k > a.k);
  assert.equal(b.w, D.bandWidth);
});

test('the fairway bands follow the line of play: along a straight hole, alternating sideways, band width apart', () => {
  const look = finishStripeLook(D, BASE)!;
  assert.equal(look.across, false); assert.equal(look.w, D.bandWidth);
  for (const [dx, dy] of [[1, 0], [0.6, 0.8], [-0.8, 0.6], [0, -1]] as const) {
    const tx = 20, ty = 30, legs = holeStripeLegs([tx, ty, tx + 100 * dx, ty + 100 * dy], look);
    // down the line: one band (the line in the middle of it)
    const b0 = bandAt(legs, tx + 5 * dx, ty + 5 * dy).band;
    for (const s of [10, 37, 64, 95]) assert.equal(bandAt(legs, tx + s * dx, ty + s * dy).band, b0, 'down the line, one band');
    // sideways: a new band every band width, light and dark in turn
    for (let k = 1; k < 5; k++) {
      const off = k * look.w, x = tx + 50 * dx - off * dy, y = ty + 50 * dy + off * dx;
      assert.equal(Math.abs(bandAt(legs, x, y).band - b0), k, `${k} bands to the side`);
      assert.equal(bandAt(legs, x, y).light, k % 2 === 0 ? bandAt(legs, tx, ty).light : !bandAt(legs, tx, ty).light);
    }
  }
  // the across knob lays them across the line, as T218 did
  const across = holeStripeLegs([0, 0, 100, 0], finishStripeLook({ ...D, along: false }, BASE)!);
  assert.notEqual(bandAt(across, 10, 0).band, bandAt(across, 10 + D.bandWidth, 0).band);
  assert.equal(bandAt(across, 10.5, -6).band, bandAt(across, 10.5, 6).band);
});

test('a dogleg: each leg its own bands along it, meeting on the bend\'s bisector (a mitre: the line\'s band runs round the bend)', () => {
  const look = finishStripeLook(D, BASE)!, legs = holeStripeLegs([0, 0, 100, 0, 100, 80], look);
  assert.equal(legs.length, 2);
  // leg 1 runs east: its bands lie east-west; leg 2 runs south: north-south
  assert.equal(bandAt(legs, 20, 1).band, bandAt(legs, 80, 1).band);
  assert.equal(bandAt(legs, 99, 30).band, bandAt(legs, 99, 70).band);
  assert.notEqual(bandAt(legs, 50, 0).band, bandAt(legs, 50, look.w).band);
  assert.notEqual(bandAt(legs, 100, 50).band, bandAt(legs, 100 - look.w, 50).band);
  // the line lies in the middle of a light band on both legs, so the bands meet round the bend
  assert.equal(bandAt(legs, 60, 0).light, bandAt(legs, 100, 40).light);
  assert.equal(bandAt(legs, 60, 0).leg, 0); assert.equal(bandAt(legs, 100, 40).leg, 1);
  // the same offset to the inside of the bend: the same kind of band on both legs
  const o = 1.5 * look.w;
  assert.equal(bandAt(legs, 60, o).light, bandAt(legs, 100 - o, 40).light);
});

test('the range outfield wears the fairways\' bands along its line of play (Grass the outfield)', () => {
  const pre = PRESETS.find(p => p.id === RANGE_PRESET.outfield)!;
  for (const aim of [{ x: 0, y: -1 }, { x: 0.6, y: -0.8 }]) {
    const sc = { aim, roadDir: { x: -aim.y, y: aim.x }, mowFrom: { x: 5, y: 5 } };
    const mw = outfieldStripes(sc, { ...pre.stripes, on: true })!, m = finishMow(mw, D, BASE)!;
    assert.ok(near(m.ux * aim.x + m.uy * aim.y, 0, 1e-6), 'the bands alternate across the range, so each lies along it');
    assert.equal(m.w, D.bandWidth); assert.equal(m.l, finishStripeLook(D, BASE)!.l); assert.equal(m.k, finishStripeLook(D, BASE)!.k);
    // the band through the mow origin is centred on it: the origin lies half a band in
    const s = (sc.mowFrom.x - m.ox) * m.ux + (sc.mowFrom.y - m.oy) * m.uy; assert.ok(near(s, m.w / 2, 1e-6));
    // across, as T218: the bands alternate down the range
    const a = finishMow(mw, { ...D, along: false }, BASE)!; assert.ok(near(a.ux, aim.x, 1e-6) && near(a.uy, aim.y, 1e-6));
  }
});

test('the collar: wider by default on fairways and greens (a Border the player set wins), toned on every first cut and fringe', () => {
  const b = finishBorders([], D);
  assert.equal(b[SURF.fairway], D.collarWidth); assert.equal(b[SURF.green], D.collarWidth / 2);
  assert.equal(b[SURF.tee], 0); assert.equal(b[SURF.bunker], 0); assert.equal(b[SURF.water], 0); // T260: none
  assert.equal(finishBorders([], { ...D, collarWidth: 1 })[SURF.green], 1, 'the fringe at least BLOB_STYLE\'s metre');
  const own: (number | undefined)[] = []; own[SURF.fairway] = 1.5;
  assert.equal(finishBorders(own, D)[SURF.fairway], 1.5);
  assert.deepEqual(collarToneOf(D), { tc: collarToneOf(D)!.tc, ta: D.collarTone });
  assert.ok(tonedCollar('first-cut') && tonedCollar('fringe') && !tonedCollar('lip') && !tonedCollar('bank'));
  // laid: the fairway's first cut is the finish's width, in tiles
  const g = makeGrid(0, 0, 300, 300); box(g, 10, 10, 40, 30, SURF.fairway, 1);
  const p = coursePatch(g, 0, 0, { ...LOOKS, border: finishBorders([], D) }, 0)!;
  assert.equal(p.course!.layers.find(l => l.s === SURF.fairway)!.collar!.w, D.collarWidth * CELL_T);
  const q = coursePatch(g, 0, 0, LOOKS, 0)!;
  assert.equal(q.course!.layers.find(l => l.s === SURF.fairway)!.collar!.w, 2 * CELL_T, 'BLOB_STYLE\'s without the finish');
});

test('coursePatch: the green carries its hole\'s line for its fine stripes; a bunker\'s lip band its first-cut grass when given', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 10, 10, 40, 30, SURF.fairway, 2); box(g, 42, 14, 52, 26, SURF.green, 2); box(g, 20, 32, 26, 36, SURF.bunker, 2);
  const line = [10, 20, 47, 20], fc = { tex: 'golfFirstCut', sc: 1, a: 0 };
  const p = coursePatch(g, 0, 0, { ...LOOKS, lipGrass: fc }, 0, new Map([[2, line]]))!;
  const green = p.course!.layers.find(l => l.s === SURF.green)!;
  assert.deepEqual(green.stripes, [{ hole: 2, line }]);
  assert.ok(greenStripeLook(D, BASE)!.w < D.bandWidth, 'fine: narrower than the fairway\'s');
  const bunker = p.course!.layers.find(l => l.s === SURF.bunker)!;
  assert.equal(bunker.collar!.n, 'lip'); assert.deepEqual(bunker.collar!.g, fc);
  // the fairway's first cut never takes it, and without it the lip keeps its own look
  assert.equal(p.course!.layers.find(l => l.s === SURF.fairway)!.collar!.g, undefined);
  assert.equal(coursePatch(g, 0, 0, LOOKS, 0)!.course!.layers.find(l => l.s === SURF.bunker)!.collar!.g, undefined);
});

test('a bunker\'s lip lies on its far side: the dark crescent along the rim facing the sun (upper right), the light lip along the near rim', () => {
  const g = makeGrid(0, 0, 200, 200), cx = 40, cy = 40;
  paintDisc(g, cx, cy, 6, SURF.bunker, 1, 0);
  const p = coursePatch(g, 0, 0, LOOKS, 0)!, sand = p.course!.layers.find(l => l.s === SURF.bunker)!;
  // the edges run with the sand on their left: (dy, -dx) points out of the sand (edgeFacing's normal)
  let checked = 0;
  for (const q of sand.edges) for (let i = 0; i + 3 < q.length; i += 2) {
    const dx = q[i + 2]! - q[i]!, dy = q[i + 3]! - q[i + 1]!, l = Math.hypot(dx, dy); if (l < 0.2) continue;
    const mx = (q[i]! + q[i + 2]!) / 2 + 0.6 * dy / l, my = (q[i + 1]! + q[i + 3]!) / 2 - 0.6 * dx / l;
    assert.notEqual(g.surf[cellAt(g, mx, my)], SURF.bunker, 'the outward normal leaves the sand'); checked++;
  }
  assert.ok(checked > 10);
  const runs = lipRuns(sand.edges);
  assert.equal(runs.far.length, LIP_BINS); assert.equal(runs.far[0]!.length, 0, 'side-on segments are left out');
  // in tile space every far segment lies on the sun's side of the bunker (SUN_TILE_DIR, the game's light), every near one away from it
  const towardSun = (segs: number[], i: number) => ((segs[i]! + segs[i + 2]!) / 2 - cx) * SUN_TILE_DIR.x + ((segs[i + 1]! + segs[i + 3]!) / 2 - cy) * SUN_TILE_DIR.y;
  let far = 0, nearN = 0;
  for (let k = 1; k < LIP_BINS; k++) {
    const f = runs.far[k]!, n = runs.near[k]!; far += f.length / 4; nearN += n.length / 4;
    for (let i = 0; i + 3 < f.length; i += 4) assert.ok(towardSun(f, i) > 0, `far segment (step ${k}) on the sun's side`);
    for (let i = 0; i + 3 < n.length; i += 4) assert.ok(towardSun(n, i) < 0, `near segment (step ${k}) away from the sun`);
  }
  assert.ok(far > 4 && nearN > 4, `${far} far and ${nearN} near segments`);
  // the strongest step holds the rim square to the sun; on screen (X = x - y, Y = (x + y) / 2, y down) its middle is the bunker's upper right
  // rim (the sun up and to the right, opposite the shadows at 145 degrees) and the near lip's the lower left
  const strong = runs.far[LIP_BINS - 1]!, weak = runs.near[LIP_BINS - 1]!, sun = { x: Math.cos(-35 * Math.PI / 180), y: Math.sin(-35 * Math.PI / 180) };
  assert.ok(strong.length >= 8 && weak.length >= 8);
  for (let i = 0; i + 3 < strong.length; i += 4) assert.ok(edgeFacing(strong[i + 2]! - strong[i]!, strong[i + 3]! - strong[i + 1]!) > 0.45);
  const onScreen = (segs: number[]) => { let x = 0, y = 0, n = 0; for (let i = 0; i + 3 < segs.length; i += 4) { x += (segs[i]! + segs[i + 2]!) / 2 - cx; y += (segs[i + 1]! + segs[i + 3]!) / 2 - cy; n++; } x /= n; y /= n; return { X: x - y, Y: (x + y) / 2 }; };
  const f = onScreen(strong), n = onScreen(weak);
  assert.ok(f.X * sun.x + f.Y * sun.y > 0 && f.Y < 0, `the crescent's middle up and to the right on screen (${f.X.toFixed(2)}, ${f.Y.toFixed(2)})`);
  assert.ok(n.X * sun.x + n.Y * sun.y < 0 && n.Y > 0, `the near lip's middle down and to the left (${n.X.toFixed(2)}, ${n.Y.toFixed(2)})`);
});
