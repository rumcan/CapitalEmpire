/** The course grid in the golf game (plan P21 section 3.7, T078): gridAreas (one CourseArea per blob per surface and hole, collars
 * included, holes bridged in), the load migration (a generated course keeps its par and length per hole), the planting months, the merged
 * undo diff, and the course chunk patches (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, applyDiff, makeGrid, paintDisc, paintStroke, fillPolygon, type Grid } from '../src/game/ext/course-grid';
import { MONTH_BASE, SURF_GROW, SURF_SURFACE, areaRank, growShare, growStage, gridAreas, mergeMany, plantMonth, rasterAreas, surfOfSurface, type GridArea } from '../src/game/ext/course-grid/areas';
import { COURSE_CHUNK, COURSE_PATCH_REACH, chunkGrow, courseChunksIn, courseKey, coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { generateOldNine } from '../src/game/golf/coursegen';
import { courseAreas } from '../src/game/golf/paintcourse';
import { growInMonths, surfaceOfTex } from '../src/game/golf/costs';
import { deriveHoles } from '../src/game/golf/holes';
import { applyPlan, markerPlan, tagByHole } from '../src/game/golf/holeview';
import { insidePoly, polyArea, roundCorners } from '../src/game/paint';
import type { GolfSurface } from '../src/game/golf/types';

/** fills a tile rectangle into the grid */
const box = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number, h: number, m = 0) =>
  fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, h, m);
/** the areas of one surface (not collars) and hole */
const of = (as: GridArea[], s: GolfSurface, h: number) => as.filter(a => a.surface === s && a.hole === h && !a.collar);

test('1. one area per blob per surface and hole, with the right surface', () => {
  const g = makeGrid(0, 0, 200, 120);
  box(g, 5, 5, 45, 25, SURF.fairway, 1);        // hole 1's fairway (40 x 20 tiles)
  box(g, 45, 5, 85, 25, SURF.fairway, 2);       // hole 2's fairway, touching it
  box(g, 20, 12, 26, 18, SURF.bunker, 1);       // a bunker inside hole 1's fairway
  paintDisc(g, 60, 45, 4, SURF.green, 2, 0);    // two separate greens of hole 2
  paintDisc(g, 80, 45, 4, SURF.green, 2, 0);
  box(g, 10, 40, 14, 44, SURF.tee, 1);
  const as = gridAreas(g);
  assert.equal(of(as, 'fairway', 1).length, 1, 'hole 1 fairway: one blob');
  assert.equal(of(as, 'fairway', 2).length, 1, 'hole 2 fairway: its own blob, not merged into hole 1');
  assert.equal(of(as, 'green', 2).length, 2, 'two greens');
  assert.equal(of(as, 'bunker', 1).length, 1);
  assert.equal(of(as, 'tee', 1).length, 1);
  for (const a of as) {
    assert.equal(surfaceOfTex(a.tex), a.surface, `${a.surface}: its texture reads back as its surface`);
    if (!a.collar) assert.equal(SURF_SURFACE[a.s], a.surface);
  }
  // the bunker is a hole bridged into the fairway: not inside it, and its area is taken off
  const fw = of(as, 'fairway', 1)[0]!, bk = of(as, 'bunker', 1)[0]!;
  assert.ok(!insidePoly(fw.pts, 23, 15), 'the bunker is cut out of the fairway');
  assert.ok(insidePoly(fw.pts, 10, 10), 'the fairway holds its own cells');
  assert.ok(insidePoly(bk.pts, 23, 15));
  const fwA = Math.abs(polyArea(fw.pts)), outerA = Math.abs(polyArea(fw.outer));
  // (the fairway's closing may lay it under the bunker's corners, which the bunker hides: the hole is a little under the 36 tiles of cells)
  assert.ok(outerA - fwA > 28 && outerA - fwA < 37, `fairway area ${fwA} = outer ${outerA} - the bunker`);
  assert.ok(Math.abs(fwA - (800 - 36)) < 12, `fairway ${fwA} tiles² for 800 - 36 of cells`);
  // collars: a fringe round each green, a first cut round the fairways and the tee, a lip round the bunker; the band leaves its surface out
  const fringe = as.filter(a => a.collar === 'fringe');
  assert.equal(fringe.length, 2);
  assert.ok(fringe.every(a => a.surface === 'fringe' && a.hole === 2));
  assert.ok(!fringe.some(a => insidePoly(a.pts, 60, 45)), 'the green is cut out of its fringe');
  assert.ok(fringe.some(a => insidePoly(a.pts, 64.3, 45)), 'the fringe ring lies just outside the green');
  assert.ok(as.some(a => a.collar === 'first-cut' && a.surface === 'firstCut' && a.hole === 1));
  assert.ok(as.some(a => a.collar === 'lip' && a.surface === 'rough'));
  // draw order: collars before their surface, surfaces in id order; ids unique
  const r = as.map(areaRank);
  assert.deepEqual(r, r.slice().sort((p, q) => p - q));
  assert.equal(new Set(as.map(a => a.id)).size, as.length);
  // only some holes
  assert.ok(gridAreas(g, [2]).every(a => a.hole === 2));
});

test('2. a blob is seeded when most of its cells are, with their mean month', () => {
  const g = makeGrid(0, 0, 80, 80);
  box(g, 5, 5, 25, 25, SURF.fairway, 3, plantMonth('seed', 7));
  box(g, 5, 30, 25, 50, SURF.fairway, 4, 0);
  const as = gridAreas(g), a3 = of(as, 'fairway', 3)[0]!, a4 = of(as, 'fairway', 4)[0]!;
  assert.equal(a3.plantKind, 'seed'); assert.equal(a3.plantedMonth, 7);
  assert.equal(a4.plantKind, undefined, 'established cells');
});

test('3. planting months and grow-in', () => {
  assert.equal(plantMonth('seed', 0), MONTH_BASE);
  assert.equal(plantMonth('sod', 5), 0, 'sod is established at once');
  assert.equal(plantMonth(undefined, 5), 0);
  for (let s = 1; s <= 8; s++) assert.equal(SURF_GROW[s], growInMonths(SURF_SURFACE[s]!, 'seed'), `${SURF_SURFACE[s]} grow-in`);
  const m = plantMonth('seed', 10);
  assert.equal(growShare(SURF.green, m, 10), 0);
  assert.equal(growShare(SURF.green, m, 13), 0.5);
  assert.equal(growShare(SURF.green, m, 20), 1);
  assert.equal(growShare(SURF.green, 0, 0), 1, 'established');
  assert.equal(growShare(SURF.bunker, m, 10), 1, 'sand has no grow-in');
  assert.deepEqual([0, 0.1, 0.3, 0.5, 0.74, 1].map(growStage), [0, 0, 1, 2, 3, 4]);
  for (const s of ['rough', 'fescue', 'water', 'fairway', 'tee', 'bunker', 'waste', 'green'] as GolfSurface[]) assert.equal(SURF_SURFACE[surfOfSurface(s)], s);
  for (const s of ['fringe', 'firstCut', 'path', 'other'] as GolfSurface[]) assert.equal(surfOfSurface(s), 0);
});

test('4. a migrated generated course keeps its par and length per hole (within 1%)', () => {
  const site = { x0: 100, y0: 100, x1: 400, y1: 550 }, lay = generateOldNine(site, 1);
  const before = deriveHoles(lay.areas, lay.tees, lay.pins, lay.aims);
  // the game's load: the generated course as paint areas, tagged by hole, laid into a grid in paint order
  const paints = courseAreas(lay), tags = tagByHole(paints, lay.pins, lay.tees, lay.aims);
  const g = makeGrid(site.x0 - 32, site.y0 - 32, (site.x1 - site.x0 + 64) * 2, (site.y1 - site.y0 + 64) * 2);
  const n = rasterAreas(g, paints.map((a, i) => ({ pts: roundCorners(a.pts, a.radius), surface: surfaceOfTex(a.tex), hole: tags[i], month: 0 })));
  assert.ok(n > 10000, `${n} cells laid`);
  const as = gridAreas(g);
  const plan = applyPlan(lay.pins, lay.tees, markerPlan(as, lay.pins, lay.tees));
  const after = deriveHoles(as, plan.tees, plan.pins, lay.aims);
  assert.equal(after.length, before.length);
  for (const h of before) {
    const a = after.find(q => q.n === h.n)!;
    assert.equal(a.par, h.par, `hole ${h.n} par`);
    assert.ok(Math.abs(a.lengthM - h.lengthM) <= 0.01 * h.lengthM, `hole ${h.n}: ${a.lengthM} m vs ${h.lengthM} m`);
    assert.ok(!a.warnings.includes('The pin is not on a green') && !a.warnings.includes('The back tee is not on a tee'), `hole ${h.n}: ${a.warnings.join(', ')}`);
  }
  // every hole's green and tee came through with its hole
  for (const h of before) { assert.ok(of(as, 'green', h.n).length >= 1, `hole ${h.n} green`); assert.ok(of(as, 'tee', h.n).length >= 1, `hole ${h.n} tee`); }
});

test('5. the merged diff of a stroke undoes and redoes as one step, across a chunk border', () => {
  const g = makeGrid(40, 40, 120, 120), before = g.surf.slice();
  const parts = [paintDisc(g, 62, 60, 3, SURF.fairway, 1, 0), paintStroke(g, 62, 60, 68, 66, 3, SURF.fairway, 1, 0), paintStroke(g, 68, 66, 60, 70, 3, SURF.green, 1, 0)];
  const after = g.surf.slice(), d = mergeMany(parts)!;
  assert.ok(d.n > 50);
  applyDiff(g, d, true); assert.deepEqual(g.surf, before, 'undo');
  applyDiff(g, d, false); assert.deepEqual(g.surf, after, 'redo');
  assert.equal(mergeMany([]), null);
  // the chunks the stroke touches: both sides of the 64-tile border at x = 64
  const ks = courseChunksIn(g, [58, 56, 72, 74], 0).map(([cx, cy]) => courseKey(cx, cy));
  assert.deepEqual(ks, ['cg:0:0', 'cg:1:0', 'cg:0:1', 'cg:1:1']);
});

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1.5, a: 30 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};

test('6. a course chunk patch: its layers in draw order, the collar, the mowing line, the quad and the grow mask', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 70, 70, 110, 90, SURF.fairway, 5, plantMonth('seed', 2));
  paintDisc(g, 112, 80, 5, SURF.green, 5, 0);
  const p = coursePatch(g, 1, 1, LOOKS, 2, new Map([[5, [60, 80, 115, 80]]]))!;
  assert.ok(p && p.course);
  const S = COURSE_CHUNK, R = COURSE_PATCH_REACH;
  assert.deepEqual(p.pts, [S - R, S - R, 2 * S + R, S - R, 2 * S + R, 2 * S + R, S - R, 2 * S + R]);
  assert.deepEqual(p.course.layers.map(l => l.s), [SURF.fairway, SURF.green]);
  const fw = p.course.layers[0]!, gr = p.course.layers[1]!;
  assert.equal(fw.e, 'turf'); assert.equal(gr.e, 'raised'); assert.equal(gr.tex, 'golfGreen'); assert.equal(gr.sc, 1.5); assert.equal(gr.a, 30);
  assert.equal(gr.collar?.n, 'fringe'); assert.equal(gr.collar?.tex, 'golfFringe'); assert.equal(fw.collar?.n, 'first-cut');
  assert.deepEqual(fw.stripes, [{ hole: 5, line: [60, 80, 115, 80] }]);
  assert.ok(fw.fill.length >= 1 && fw.edges.length >= 1);
  // growing: the fairway was seeded in month 2 (3 months to grow in): dirt everywhere at first, then quarters
  assert.ok(p.course.grow && p.course.grow.length === (S / 0.5) ** 2);
  const k0 = chunkGrow(g, 1, 1, 2), k1 = chunkGrow(g, 1, 1, 3), k5 = chunkGrow(g, 1, 1, 5);
  assert.notEqual(k0.key, k1.key, 'a month later the key moves');
  assert.equal(k5.key, 'static'); assert.equal(k5.mask, null, 'grown in');
  const i = ((80 - 64) * 2 + 1) * (S * 2) + (80 - 64) * 2 + 1;
  assert.equal(k0.mask![i], 255); assert.ok(k1.mask![i]! > 0 && k1.mask![i]! < 255);
  // an empty chunk has no patch
  assert.equal(coursePatch(g, 3, 3, LOOKS, 2), null);
});
