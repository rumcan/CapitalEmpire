// T218: the fairways' mowing stripes (src/game/course-stripes.ts, ext/course-grid/patch.ts stripeAreas): the range outfield's look, bands
// across each hole's line of play (each leg of a dogleg), the default direction for cells of no hole, the mow angle hook, and each hole's share
// of a chunk (agreeing across a chunk seam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOW_DIR, FAIRWAY_STRIPE_PRESET, bandAt, fairwayStripeLook, holeStripeLegs, legArea, legAt } from '../src/game/course-stripes';
import { PRESETS } from '../src/game/paint-presets';
import { RANGE_PRESET, outfieldStripes } from '../src/game/golf/rangehost';
import { SURF, fillPolygon, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { coursePatch, patchBuffers, stripeAreas, type CourseLooks } from '../src/game/ext/course-grid/patch';

const LOOK = fairwayStripeLook();
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;
/** fills a tile rectangle into the grid */
const box = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number, h: number) =>
  fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, h, 0);
/** whether a tile point lies in a share's boxes */
const inRuns = (runs: ArrayLike<number>, x: number, y: number) => { for (let k = 0; k + 3 < runs.length; k += 4) if (x >= runs[k]! && x < runs[k + 2]! && y >= runs[k + 1]! && y < runs[k + 3]!) return true; return false; };
/** the hole whose share holds a point (a single entry with no runs holds the whole chunk) */
const holeAt = (st: { hole: number; runs?: Float32Array }[], x: number, y: number) => { const hit = st.filter(e => !e.runs || inRuns(e.runs, x, y)); assert.equal(hit.length, 1, `one share at ${x},${y}`); return hit[0]!.hole; };

test('the fairways wear the range outfield\'s stripes: the same preset, the same numbers', () => {
  assert.equal(FAIRWAY_STRIPE_PRESET, RANGE_PRESET.outfield);
  const pre = PRESETS.find(p => p.id === RANGE_PRESET.outfield)!;
  const mw = outfieldStripes({ aim: { x: 0, y: -1 }, roadDir: { x: 1, y: 0 }, mowFrom: { x: 5, y: 5 } }, { ...pre.stripes, on: true })!;
  assert.deepEqual([LOOK.w, LOOK.l, LOOK.k, LOOK.lc, LOOK.dc, LOOK.t, LOOK.f], [mw.w, mw.l, mw.k, mw.lc, mw.dc, mw.t, mw.f]);
  assert.equal(LOOK.across, pre.stripes.dir !== 'y');
  // light ones: the light and dark washes stay faint
  assert.ok(LOOK.l + LOOK.t * 0.5 <= 0.3 && LOOK.k + LOOK.t * 0.5 <= 0.3);
});

test('the bands lie across a straight hole\'s line of play, whichever way it runs', () => {
  const look = { ...LOOK, across: true, w: 4 };
  for (const [dx, dy] of [[1, 0], [0.6, 0.8], [-0.8, 0.6], [0, -1]] as const) {
    const tx = 20, ty = 30, legs = holeStripeLegs([tx, ty, tx + 100 * dx, ty + 100 * dy], look);
    assert.equal(legs.length, 1); const m = legs[0]!.m;
    assert.ok(near(m.ux, dx) && near(m.uy, dy), 'the bands alternate down the hole');
    // down the line the bands alternate every band width, light first from the tee; across it (sideways) the band holds
    for (let k = 0; k < 10; k++) {
      const s = (k + 0.5) * look.w, x = tx + s * dx, y = ty + s * dy;
      assert.equal(bandAt(legs, x, y).light, k % 2 === 0);
      for (const side of [-12, -3, 3, 12]) assert.equal(bandAt(legs, x - side * dy, y + side * dx).band, k);
    }
  }
  // along (the preset's dir 'y'): the bands run down the line, alternating sideways, the line in the middle of a band
  const along = holeStripeLegs([0, 0, 100, 0], { ...look, across: false });
  assert.ok(near(along[0]!.m.ux, 0) && near(Math.abs(along[0]!.m.uy), 1));
  assert.equal(bandAt(along, 10, 0).band, bandAt(along, 90, 0).band);
  assert.notEqual(bandAt(along, 50, 0).band, bandAt(along, 50, look.w).band);
});

test('a dogleg: each leg its own bands, split at the bend\'s bisector, the band count running on round the bend', () => {
  const look = { ...LOOK, across: true, w: 5 }, line = [0, 0, 100, 0, 100, 80], legs = holeStripeLegs(line, look);
  assert.equal(legs.length, 2);
  assert.ok(near(legs[0]!.m.ux, 1) && near(legs[0]!.m.uy, 0), 'leg 1 runs east');
  assert.ok(near(legs[1]!.m.ux, 0) && near(legs[1]!.m.uy, 1), 'leg 2 runs south');
  const c = legs[1]!.cut!; assert.ok(near(c.nx, Math.SQRT1_2) && near(c.ny, Math.SQRT1_2) && c.x === 100 && c.y === 0);
  // which leg mows a point: the fairway of leg 1 before the bend, of leg 2 past it
  assert.equal(legAt(legs, 50, 8), 0); assert.equal(legAt(legs, 92, 40), 1); assert.equal(legAt(legs, 108, 20), 1); assert.equal(legAt(legs, 80, -10), 0);
  // the band count runs on: just before and just past the bend, on the line, the same band (100 tiles walked = band 20)
  assert.equal(bandAt(legs, 99.9, 0).band, 19); assert.equal(bandAt(legs, 100, 0.2).band, 20); assert.equal(bandAt(legs, 100, 4.9).band, 20);
  // leg 2's bands alternate down it: light / dark every 5 tiles
  assert.equal(bandAt(legs, 100, 12).light, !bandAt(legs, 100, 17).light);
  // the legs' shares tile a box: every point lies in exactly the share of the leg that mows it
  const B = [40, -40, 160, 120], areas = legs.map((_, i) => legArea(legs, i, B));
  const inside = (p: number[], x: number, y: number) => { const n = p.length >> 1; let s = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, cr = (p[2 * j]! - p[2 * i]!) * (y - p[2 * i + 1]!) - (p[2 * j + 1]! - p[2 * i + 1]!) * (x - p[2 * i]!); if (Math.abs(cr) < 1e-9) continue; if (s === 0) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false; } return true; };
  for (let k = 0; k < 400; k++) {
    const x = B[0]! + ((k * 37) % 120) + 0.31, y = B[1]! + ((k * 53) % 160) + 0.17, want = legAt(legs, x, y);
    areas.forEach((p, i) => assert.equal(inside(p, x, y), i === want, `${x},${y} in leg ${i}'s share`));
  }
  // a three-leg hole and a hairpin keep one share per leg
  assert.equal(holeStripeLegs([0, 0, 50, 0, 80, 30, 80, 90], look).length, 3);
  assert.equal(holeStripeLegs([0, 0, 50, 0, 0, 0.01], look).length, 2);
});

test('fairway cells of no hole take the default direction; greenkeeping\'s mow angle turns a hole\'s bands (the hook)', () => {
  const look = { ...LOOK, across: true, w: 3 };
  for (const line of [[], [10, 10], [10, 10, 10, 10]]) {
    const legs = holeStripeLegs(line, look); assert.equal(legs.length, 1);
    assert.ok(near(legs[0]!.m.ux, DEFAULT_MOW_DIR.x) && near(legs[0]!.m.uy, DEFAULT_MOW_DIR.y));
    assert.ok(legs[0]!.m.ox === 0 && legs[0]!.m.oy === 0, 'seeded in world tiles');
  }
  // the mower drives along x (0 degrees): its passes, the bands, lie along x, alternating down y, over the whole dogleg
  const mown = holeStripeLegs([0, 0, 100, 0, 100, 80], look, 0);
  assert.equal(mown.length, 1);
  assert.equal(bandAt(mown, 5, 1).band, bandAt(mown, 95, 1).band);
  assert.notEqual(bandAt(mown, 5, 1).light, bandAt(mown, 5, 4).light);
  const diag = holeStripeLegs([0, 0, 100, 0], look, 45);
  assert.equal(bandAt(diag, 10, 10).band, bandAt(diag, 40, 40).band);
});

test('stripeAreas: one entry per hole in the chunk, each with its share; hole 0 for cells of no hole or no line yet', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 5, 5, 30, 20, SURF.fairway, 3); box(g, 34, 5, 60, 20, SURF.fairway, 5);
  box(g, 5, 40, 25, 55, SURF.fairway, 0); box(g, 35, 40, 55, 55, SURF.fairway, 7);
  box(g, 40, 10, 44, 14, SURF.green, 5); // another surface inside a fairway: still that hole's share
  const lines = new Map([[3, [5, 12, 30, 12]], [5, [34, 12, 60, 12]]]), st = stripeAreas(g, 0, 0, lines)!;
  assert.deepEqual(st.map(e => e.hole), [0, 3, 5]);
  assert.deepEqual(st[1]!.line, [5, 12, 30, 12]); assert.deepEqual(st[0]!.line, []);
  for (const e of st) assert.ok(e.runs instanceof Float32Array && e.runs.length % 4 === 0 && e.runs.length > 0);
  assert.equal(holeAt(st, 17, 12), 3); assert.equal(holeAt(st, 29.7, 19.7), 3); assert.equal(holeAt(st, 50, 12), 5); assert.equal(holeAt(st, 42, 12), 5);
  assert.equal(holeAt(st, 15, 47), 0); assert.equal(holeAt(st, 45, 47), 0);
  // the gap between two fairways splits about halfway; the shares tile the chunk and its edge with no overlap
  assert.equal(holeAt(st, 31, 12), 3); assert.equal(holeAt(st, 33, 12), 5);
  let area = 0; for (const e of st) for (let k = 0; k < e.runs!.length; k += 4) area += (e.runs![k + 2]! - e.runs![k]!) * (e.runs![k + 3]! - e.runs![k + 1]!);
  assert.ok(near(area, (64 + 3) ** 2, 1e-6), `area ${area}`);
  // one hole alone: no shares (the whole chunk); no fairway: none; no line: hole 0
  const one = makeGrid(0, 0, 300, 300); box(one, 5, 5, 30, 20, SURF.fairway, 3);
  assert.deepEqual(stripeAreas(one, 0, 0, lines), [{ hole: 3, line: [5, 12, 30, 12] }]);
  assert.deepEqual(stripeAreas(one, 0, 0), [{ hole: 0, line: [] }]);
  assert.equal(stripeAreas(one, 1, 1, lines), null);
});

test('stripeAreas: two chunks agree on who mows the ground round their seam', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 40, 10, 90, 20, SURF.fairway, 3); box(g, 40, 21, 90, 30, SURF.fairway, 5); box(g, 55, 32, 75, 40, SURF.fairway, 0);
  const lines = new Map([[3, [40, 15, 90, 15]], [5, [40, 25, 90, 25]]]);
  const a = stripeAreas(g, 0, 0, lines)!, b = stripeAreas(g, 1, 0, lines)!;
  assert.deepEqual(a.map(e => e.hole), [0, 3, 5]); assert.deepEqual(b.map(e => e.hole), [0, 3, 5]);
  for (let x = 62.75; x <= 65.25; x += 0.5) for (let y = 6.25; y < 44; y += 0.5) assert.equal(holeAt(a, x, y), holeAt(b, x, y), `${x},${y}`);
});

test('coursePatch: the fairway carries its stripe shares, and they travel as transferable memory', () => {
  const LOOKS: CourseLooks = {
    surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
    collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
  };
  const g = makeGrid(0, 0, 300, 300);
  box(g, 5, 5, 30, 20, SURF.fairway, 3); box(g, 34, 5, 60, 20, SURF.fairway, 5);
  const p = coursePatch(g, 0, 0, LOOKS, 0, new Map([[3, [5, 12, 30, 12]], [5, [34, 12, 60, 12]]]))!;
  const fw = p.course!.layers.find(l => l.s === SURF.fairway)!;
  assert.deepEqual(fw.stripes!.map(e => e.hole), [3, 5]);
  const bufs = patchBuffers(p);
  for (const e of fw.stripes!) assert.ok(bufs.includes(e.runs!.buffer as ArrayBuffer));
  // a hand-painted fairway with no hole: stripes in the default direction
  const h = makeGrid(0, 0, 300, 300); box(h, 5, 5, 30, 20, SURF.fairway, 0);
  assert.deepEqual(coursePatch(h, 0, 0, LOOKS, 0)!.course!.layers.find(l => l.s === SURF.fairway)!.stripes, [{ hole: 0, line: [] }]);
});
