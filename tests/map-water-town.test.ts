/** T344 (#982; T338's leftovers; the owner, 2026-11-04: "fix the water that cant build on the maps river. they should connnect not build over
 * eachother"): the rest of the water joins the map's river and creeks too.
 *  - the town's painted water (the classic Paint's water area, the Fountain pond in town) is drawn off the map's water, and its border band runs only
 *    where the outline is clear of it (map-water.ts areaJoin: no bank over the river, none along the seam);
 *  - the pond's Stones edge (T231, golf/ponds.ts) treats the map's water as wet: no stone is laid along the seam, and no planting stands in it;
 *  - the seam's fade (fadeBands) keeps out of water too narrow to take it: a creek's middle stays the creek's (no faint tint of the pond across it).
 * Pure, Node: map-water.ts, golf/ponds.ts and coursePatch (npm test). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, fillPolygon, makeGrid } from '../src/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { CELL, pondAt, shorePieces, shoreRuns, type Wet } from '../src/game/golf/ponds';
import { FADE_MIN_WIDTH, JOIN_AREA, JOIN_FADE, JOIN_INSET, MapWater, areaJoin, fadeBands, waterRuns } from '../src/game/map-water';
import type { CourseLayer } from '../src/game/ground-protocol';

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};
const scale = (k: string) => (k === 'creek' ? 0.35 : 1);
/** a river along y = 50, 4 tiles wide (its water y 48 to 52) */
const RIVER = { kind: 'river', pts: [{ x: -10, y: 50, w: 4 }, { x: 50, y: 50, w: 4 }, { x: 110, y: 50, w: 4 }] };
const river = () => new MapWater(waterRuns([RIVER], scale));
/** a creek along y = y0 with a channel w tiles wide (its water 0.35 of it) */
const creekAt = (y0: number, w: number) => new MapWater(waterRuns([{ kind: 'creek', pts: [{ x: -10, y: y0, w }, { x: 50, y: y0, w }, { x: 110, y: y0, w }] }], scale));
/** the map's water as the ponds' lattice sees it (cell centres) */
const otherOf = (w: MapWater): Wet => (cx, cy) => w.at((cx + 0.5) * CELL, (cy + 0.5) * CELL);
/** a rectangular pond's cells: tiles [x0, x1) x [y0, y1) (cell centres in it) */
const rectCells = (x0: number, y0: number, x1: number, y1: number): Wet => (cx, cy) => { const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL; return x >= x0 && x < x1 && y >= y0 && y < y1; };

test('1. Stones edge: a pond beside the river is edged on its land sides only; no stone along the seam, none in the river', () => {
  // a pond painted up to the river (the Water brush skips the river's cells: its last row of cells ends at the river's edge, y 48)
  const river0 = river(), own = rectCells(40, 40, 50, 48), other = otherOf(river0);
  const joined = pondAt(45, 44, own, undefined, other)!, alone = pondAt(45, 44, own)!;
  assert.ok(joined && alone && joined.cells === alone.cells, 'the same pond');
  const pieces = shorePieces(joined);
  assert.ok(pieces.length > 4, `the land sides keep their stones (${pieces.length} pieces)`);
  assert.ok(pieces.some(q => q.y < 41 && q.x > 41 && q.x < 49), 'the far (north) side has its stones');
  // the seam: its side of the pond has no stone, plant or fill (they stood half in the river before)
  const seam = pieces.filter(q => q.y > 46.9 && q.x > 41 && q.x < 49);
  assert.deepEqual(seam, [], 'no stone along the seam');
  for (const q of pieces) assert.ok(!river0.at(q.x, q.y, 0.3), `nothing stands within 0.3 tile of the river (${q.id} at ${q.x}, ${q.y})`);
  // the outline the stones are strung along stops at the seam: open runs, none with a corner on the river's line
  const runs = shoreRuns(joined);
  assert.ok(runs.length > 0 && runs.every(r => !r.closed), 'the shore is open runs now');
  for (const r of runs) for (let i = 0; i < r.vx.length; i++) assert.ok(!(r.vy[i]! * CELL >= 47.9 && r.vx[i]! * CELL > 40.5 && r.vx[i]! * CELL < 49.5), 'no shore vertex on the seam');
  // the pond without the river as a neighbour is edged all round, as before
  assert.ok(shorePieces(alone).some(q => q.y > 46.9 && q.x > 41 && q.x < 49), 'alone, the south side is edged too');
});

test('2. Stones edge: a pond that is not by the map water is edged exactly as before (the sampler is only asked, never changes it)', () => {
  const own = rectCells(40, 40, 50, 48), never: Wet = () => false;
  const a = pondAt(45, 44, own)!, b = pondAt(45, 44, own, undefined, never)!;
  assert.deepEqual(shorePieces(b), shorePieces(a), 'the same pieces');
  assert.deepEqual(shoreRuns(b), shoreRuns(a), 'the same shore runs');
  // and a river a good way off (6 tiles) is no neighbour either
  const far = otherOf(new MapWater(waterRuns([{ kind: 'river', pts: [{ x: -10, y: 56, w: 4 }, { x: 110, y: 56, w: 4 }] }], scale)));
  assert.deepEqual(shorePieces(pondAt(45, 44, own, undefined, far)!), shorePieces(a));
  // a creek lying wholly under the pond's own water (a covered river: the pond is over it) is the pond's, no neighbour: the shore is as it was
  const under = otherOf(new MapWater(waterRuns([{ kind: 'creek', pts: [{ x: 42, y: 44, w: 6 }, { x: 48, y: 44, w: 6 }] }], scale)));
  assert.deepEqual(shorePieces(pondAt(45, 44, own, undefined, under)!), shorePieces(a));
});

test('3. Stones edge: a pond bridged to a creek by a one-cell bank is joined too; the creek is wet for the planting', () => {
  // a creek (channel 6: its water y 48.95 to 51.05) and a pond whose last cells end a cell short of it (y 48.5)
  const creek = creekAt(50, 6), own = rectCells(40, 40, 50, 48.5), pond = pondAt(45, 44, own, undefined, otherOf(creek))!;
  const pieces = shorePieces(pond);
  assert.ok(pieces.length > 4);
  assert.deepEqual(pieces.filter(q => q.y > 47.4 && q.x > 41 && q.x < 49), [], 'no stone on the strip of bank between the pond and the creek');
  for (const q of pieces) assert.ok(!creek.at(q.x, q.y, 0.3), `nothing within 0.3 tile of the creek (${q.id} at ${q.x}, ${q.y})`);
});

test('4. the seam fade keeps out of a creek too narrow to take it; a wider creek and the river take it, its middle left whole', () => {
  const box = [0, 0, 100, 100];
  // the map makes creeks 3 to 8 tiles of channel, their water 0.35 of it: 1.05 to 2.8 tiles (2.1 to 5.6 m); water narrower than the fade's
  // minimum (2 tiles: what the join spans from both banks) takes none
  for (const w of [3, 4, 5, 5.5]) {
    assert.ok(0.35 * w < FADE_MIN_WIDTH, `a ${w}-tile channel is narrower than the fade's minimum`);
    assert.deepEqual(fadeBands(creekAt(20, w), box), [], `no fade in a creek with a ${w}-tile channel (${(0.35 * w * 2).toFixed(1)} m of water)`);
  }
  for (const w of [6, 8]) assert.equal(fadeBands(creekAt(20, w), box).length, JOIN_FADE.length, `a ${w}-tile channel takes the fade`);
  assert.equal(fadeBands(river(), box).length, JOIN_FADE.length, 'the river takes it');
  // the bands are the T338 ones: JOIN_FADE's alphas, each reaching a step deeper than the last, inside JOIN_INSET
  const bands = fadeBands(river(), box);
  assert.deepEqual(bands.map(b => b.alpha), [...JOIN_FADE]);
  assert.ok(bands.every(b => b.within.length > 0 && b.cut.length > 0));
  // keep: the renderer leaves out the pieces a river the course covers lies under (hidden: no fade reaches into it)
  assert.deepEqual(fadeBands(river(), box, () => false), [], 'every piece refused: no band');
  const kept = fadeBands(river(), box, q => q.length === 8);
  assert.ok(kept.length === JOIN_FADE.length && kept.every(b => b.within.length > 0 && b.within.every(q => q.length === 8) && b.cut.every(q => q.length === 8)), 'only the pieces kept');
  const inside = (q: readonly number[], x: number, y: number) => (q.length === 3 ? Math.hypot(x - q[0]!, y - q[1]!) <= q[2]! : (() => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const xi = q[2 * i]!, yi = q[2 * i + 1]!, xj = q[2 * j]!, yj = q[2 * j + 1]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; })());
  const tinted = (bs: typeof bands, x: number, y: number) => bs.some(b => b.within.some(q => inside(q, x, y)) && !b.cut.some(q => inside(q, x, y)));
  // the narrowest water that takes the fade: the middle is cut out of every band (no tint), the fade lies near both banks
  const creek = creekAt(20, 6), cb = fadeBands(creek, box);
  assert.ok(!tinted(cb, 30, 20), "the creek's middle is untouched by the fade");
  assert.ok(tinted(cb, 30, 20 - 0.35 * 3 + JOIN_INSET + 0.1) && tinted(cb, 30, 20 + 0.35 * 3 - JOIN_INSET - 0.1), 'and the fade lies along both banks');
  // a wide river: the same
  assert.ok(!tinted(bands, 30, 50) && tinted(bands, 30, 48.2) && tinted(bands, 30, 51.8));
});

test('5. a creek too narrow for the fade, with water on both banks: the outline joins across it, and no fade is drawn into it', () => {
  // a creek along y = 20 with a 3-tile channel (1.05 tiles of water, y 19.475 to 20.525); a pond on each bank, touching its water
  const creek = creekAt(20, 3), g = makeGrid(0, 0, 200, 200);
  fillPolygon(g, [{ x: 20, y: 14 }, { x: 40, y: 14 }, { x: 40, y: 19.4 }, { x: 20, y: 19.4 }], SURF.water, 1, 0);
  fillPolygon(g, [{ x: 20, y: 20.6 }, { x: 40, y: 20.6 }, { x: 40, y: 26 }, { x: 20, y: 26 }], SURF.water, 1, 0);
  const p = coursePatch(g, 0, 0, LOOKS, 0, undefined, undefined, undefined, creek)!, L = p.course!.layers.find(l => l.s === SURF.water) as CourseLayer;
  assert.ok(L?.join, 'the water layer carries the join over the creek');
  assert.deepEqual(fadeBands(creek, L.join!), [], 'the renderer is told of no fade over it');
  // the same ponds by a river wide enough: the fade bands are there
  const wide = new MapWater(waterRuns([{ kind: 'river', pts: [{ x: -10, y: 20, w: 3 }, { x: 110, y: 20, w: 3 }] }], scale)), g2 = makeGrid(0, 0, 200, 200);
  fillPolygon(g2, [{ x: 20, y: 14 }, { x: 40, y: 14 }, { x: 40, y: 18.4 }, { x: 20, y: 18.4 }], SURF.water, 1, 0);
  const L2 = coursePatch(g2, 0, 0, LOOKS, 0, undefined, undefined, undefined, wide)!.course!.layers.find(l => l.s === SURF.water) as CourseLayer;
  assert.equal(fadeBands(wide, L2.join!).length, JOIN_FADE.length, 'a 3-tile river takes it');
});

test('6. town water over the river: the area is told where it meets the map water, and its border band is dropped there', () => {
  const w = river();
  // a strip across the river (x 30 to 34, from y 40 to 60) and a pond on its bank (touching it), a pond clear of it, a pond in a creek's bed
  const across = [30, 40, 34, 40, 34, 60, 30, 60];
  const j = areaJoin(across, w)!;
  assert.ok(j && j.cut, 'the strip meets the river');
  assert.ok(j.box[0] <= 30 - JOIN_AREA + 1e-9 && j.box[2] >= 34 + JOIN_AREA - 1e-9 && j.box[1] <= 40 - JOIN_AREA && j.box[3] >= 60 + JOIN_AREA, `the box ${j.box} holds the strip grown by JOIN_AREA`);
  // the border band's runs: none within JOIN_AREA of the river, the land sides kept
  assert.ok(j.runs.length >= 1);
  for (const r of j.runs) for (let k = 0; k + 1 < r.length; k += 2) assert.ok(!w.at(r[k]!, r[k + 1]!, JOIN_AREA - 0.05), `no band point within ${JOIN_AREA} of the river (${r[k]}, ${r[k + 1]})`);
  const has = (x0: number, y0: number, x1: number, y1: number) => j.runs.some(r => { for (let k = 0; k + 3 < r.length; k += 2) { const n = Math.ceil(Math.hypot(r[k + 2]! - r[k]!, r[k + 3]! - r[k + 1]!) / 0.1); for (let q = 0; q <= n; q++) { const x = r[k]! + ((r[k + 2]! - r[k]!) * q) / n, y = r[k + 1]! + ((r[k + 3]! - r[k + 1]!) * q) / n; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; } } return false; });
  assert.ok(has(29.9, 39.9, 34.1, 40.1), 'the strip keeps its band on the land (north) side');
  assert.ok(has(29.9, 54, 30.1, 59) && has(33.9, 54, 34.1, 59), 'and along its far (south) land sides');
  assert.ok(!has(29.9, 47.3, 34.1, 52.7), 'but none across the river');
  // a pond beside the river, its south edge half a tile from the water: it meets it, and its band stops short
  const beside = [40, 40, 50, 40, 50, 47.5, 40, 47.5], jb = areaJoin(beside, w)!;
  assert.ok(jb && jb.cut, 'a pond half a tile from the river joins it');
  for (const r of jb.runs) for (let k = 0; k + 1 < r.length; k += 2) assert.ok(!w.at(r[k]!, r[k + 1]!, JOIN_AREA - 0.05));
  // clear of it (two tiles): no join, the outline untouched
  assert.equal(areaJoin([40, 40, 50, 40, 50, 46, 40, 46], w), null, 'a pond two tiles from the river is its own');
  // a creek lying wholly inside a big pond: no outline near it, still a join (the pond is drawn off the creek)
  const creek = new MapWater(waterRuns([{ kind: 'creek', pts: [{ x: 30, y: 20, w: 6 }, { x: 70, y: 20, w: 6 }] }], scale)), big = [10, 5, 90, 5, 90, 35, 10, 35], jc = areaJoin(big, creek)!;
  assert.ok(jc && !jc.cut && jc.runs.length === 1, 'the creek inside the pond meets it, nothing dropped');
  // no map water: no join
  assert.equal(areaJoin(across, new MapWater([])), null);
  assert.equal(areaJoin(across, null), null);
});
