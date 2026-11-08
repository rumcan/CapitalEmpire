/** T338 (#965; the owner, 2026-11-04: "fix the water that cant build on the maps river. they should connnect not build over eachother"): the
 * course's water and the map's own water (the river, the creeks) join. The Water brush lays nothing on the map's water the course leaves bare
 * (painting over the river changes nothing and costs nothing); water painted beside it is one body with it: its outline runs on into the
 * river with no edge where the two meet (so no wall, bank or feather is drawn there), and the patch tells the renderer where the join is;
 * erasing the painted water leaves the river as it was; a course far from any map water is drawn exactly as before.
 * Pure, Node: a PaintTool with a stand-in golf host, map-water.ts and coursePatch (npm test). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, cellAt, fillPolygon, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { JOIN_REACH, MapWater, bareMapWater, joinCells, joinEdges, waterRuns } from '../src/game/map-water';
import { MAP_WATER_WHY, PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { CourseLayer } from '../src/game/ground-protocol';

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};
/** a river across the 100 x 100 tile grid along y = 50, 4 tiles wide (its water y 48 to 52), and a creek (8 tiles of channel, its water 0.35 of it) */
const RIVER = { kind: 'river', pts: [{ x: -10, y: 50, w: 4 }, { x: 20, y: 50, w: 4 }, { x: 50, y: 50, w: 4 }, { x: 80, y: 50, w: 4 }, { x: 110, y: 50, w: 4 }] };
const scale = (k: string) => (k === 'creek' ? 0.35 : 1);
const river = () => new MapWater(waterRuns([RIVER], scale));

/** a golf game on a 100 x 100 tile grid, all your land, the map's river through it (the host's mapWaterAt, as the engine wires it) */
function world(water: MapWater | null = river()) {
  const g = makeGrid(0, 0, 200, 200), spent = { n: 0 };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => 1e9, spend: n => { spent.n += n; },
    grid: () => g, gridChanged() {}, ...(water ? { mapWaterAt: (x: number, y: number) => water.at(x, y) } : {}),
  };
  const tool = new PaintTool(host);
  tool.enterCourse(); tool.setBrush('water'); tool.setHole(1); tool.setBrushCells(0); tool.setBrushR(1.5);
  return { g, tool, spent };
}
/** a press and release at tile (x, y): one dab */
const click = (tool: PaintTool, x: number, y: number) => { tool.cursor = { x, y }; tool.pointerDown({ x, y }, 0, 0); tool.pointerUp(0.5); };
/** dabs every half tile from (ax, ay) to (bx, by) */
const stroke = (tool: PaintTool, ax: number, ay: number, bx: number, by: number) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5); for (let k = 0; k <= n; k++) click(tool, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n); return n + 1; };
const snap = (g: Grid) => ({ surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice() });
const water = (l: CourseLayer[] | undefined) => l?.find(q => q.s === SURF.water);
/** whether tile (x, y) lies in the rings (even-odd) */
function inRings(rings: readonly ArrayLike<number>[], x: number, y: number): boolean {
  let inside = false;
  for (const p of rings) { const n = p.length >> 1; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = p[2 * i]!, yi = p[2 * i + 1]!, xj = p[2 * j]!, yj = p[2 * j + 1]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } }
  return inside;
}

test('1. MapWater is the map water as the ground draws it: the river its whole width, a creek 0.35 of it; waterRuns keeps whole segments near a box', () => {
  const w = river();
  assert.ok(w.at(30, 50) && w.at(30, 48.1) && w.at(30, 51.9), 'in the river');
  assert.ok(!w.at(30, 47.8) && !w.at(30, 52.2), 'past its edge');
  assert.ok(w.at(30, 47.8, 0.5) && !w.at(30, 49, -1.5), 'the edge moved out and in');
  const creek = new MapWater(waterRuns([{ kind: 'creek', pts: [{ x: 0, y: 20, w: 8 }, { x: 100, y: 20, w: 8 }] }], scale));
  assert.ok(creek.at(40, 21.3) && !creek.at(40, 21.5), 'a creek: 0.35 of its 8-tile channel, 1.4 tiles each side');
  // only the stretches near the box, each segment whole
  const runs = waterRuns([RIVER], scale, [40, 40, 45, 60], 2);
  assert.equal(runs.length, 1); assert.deepEqual(Array.from(runs[0]!).filter((_, k) => k % 3 === 0), [20, 50], 'the segment through the box (both its ends far off) with its both ends');
  assert.ok(new MapWater(runs).at(44, 50), 'the kept run holds the water there');
  // the shapes for the renderer's clip: a disc per point and a trapezoid per segment, convex, moved in by grow
  const sh = w.shapes(28, 46, 32, 54, -0.1);
  assert.ok(sh.length >= 1 && sh.every(q => q.length === 3 || q.length === 8));
  const trap = sh.find(q => q.length === 8)!; assert.ok(Math.abs(Math.abs(trap[1]! - trap[3]!) - 3.8) < 1e-9, 'a trapezoid 2 x (2 - 0.1) tiles across');
});

test('2. painting water over the map river changes nothing and costs nothing; the footprint says why; other surfaces and a covered river as before', () => {
  const { g, tool, spent } = world(), b = snap(g);
  stroke(tool, 20, 50, 40, 50);
  assert.deepEqual(g.surf, b.surf, 'no cell of the river took water'); assert.deepEqual(g.hole, b.hole);
  assert.equal(spent.n, 0, 'nothing paid');
  assert.equal(tool.brushSkipWhy()!(30.2, 50.2), MAP_WATER_WHY);
  assert.equal(tool.brushSkipWhy()!(30.2, 45.2), '', 'off the river the brush paints');
  // the edge cells: a cell whose centre is in the water is the river's, the next one out is yours
  click(tool, 30, 46.6);
  assert.equal(g.surf[cellAt(g, 30.1, 48.1)], SURF.none, 'the cell centred 48.25, in the water: the river');
  assert.equal(g.surf[cellAt(g, 30.1, 47.9)], SURF.water, 'the cell centred 47.75, just past it: painted');
  // where the course covers the river (rough laid over it, the river hidden), the brush paints as before
  fillPolygon(g, [{ x: 60, y: 40 }, { x: 70, y: 40 }, { x: 70, y: 60 }, { x: 60, y: 60 }], SURF.rough, 1, 0);
  click(tool, 65, 50);
  assert.equal(g.surf[cellAt(g, 65.1, 50.1)], SURF.water, 'water over the rough-covered river');
  // and every other brush as before
  tool.setBrush('fairway'); click(tool, 15, 50);
  assert.equal(g.surf[cellAt(g, 15.1, 50.1)], SURF.fairway, 'a fairway brush still lays on the river (unchanged)');
  // a game with no map water (no host rule): the water brush as before
  const plain = world(null); click(plain.tool, 30, 50);
  assert.equal(plain.g.surf[cellAt(plain.g, 30.1, 50.1)], SURF.water);
});

test('3. water painted across and beside the river joins it: one connected water, no edge (so no wall, bank or feather) where they meet', () => {
  const { g, tool } = world(), w = river();
  stroke(tool, 30, 40, 30, 60);                          // across: a strip from 8 tiles off one shore to 8 off the other
  for (let x = 38; x <= 48; x += 1) click(tool, x, 46.6); // beside: a pond along the north shore, touching it
  // the grid: nothing on the river, water up to it on both sides of the crossing
  for (let y = 48.1; y < 52; y += 0.5) assert.equal(g.surf[cellAt(g, 30.1, y)], SURF.none, `the river's cell at y ${y.toFixed(2)} stays the river's`);
  assert.equal(g.surf[cellAt(g, 30.1, 47.6)], SURF.water); assert.equal(g.surf[cellAt(g, 30.1, 52.4)], SURF.water);
  const p = coursePatch(g, 0, 0, LOOKS, 0, undefined, undefined, undefined, w)!, L = water(p.course?.layers)!;
  assert.ok(L, 'a water layer');
  // no edge of the water runs in the river or along its shore: every edge point at least 0.2 tile clear of its water
  const near = L.edges.flatMap(e => { const o: number[][] = []; for (let k = 0; k + 3 < e.length; k += 2) for (let q = 0; q <= 10; q++) { const x = e[k]! + ((e[k + 2]! - e[k]!) * q) / 10, y = e[k + 1]! + ((e[k + 3]! - e[k + 1]!) * q) / 10; if (w.at(x, y, 0.2)) o.push([x, y]); } return o; });
  assert.deepEqual(near, [], 'no water edge on the seam');
  for (const wall of p.course!.walls ?? []) for (let k = 0; k + 2 < wall.p.length; k += 3) assert.ok(!w.at(wall.p[k]!, wall.p[k + 1]!, 0.2), `no wall on the seam (${wall.p[k]}, ${wall.p[k + 1]})`);
  // the shores against the land keep theirs: the strip's long sides and the pond's far side
  // (an edge passes through the box: its segments sampled every tenth of a tile, as a straight run is two points)
  const has = (x0: number, y0: number, x1: number, y1: number) => L.edges.some(e => {
    for (let k = 0; k + 3 < e.length; k += 2) { const n = Math.ceil(Math.hypot(e[k + 2]! - e[k]!, e[k + 3]! - e[k + 1]!) / 0.1); for (let q = 0; q <= n; q++) { const x = e[k]! + ((e[k + 2]! - e[k]!) * q) / n, y = e[k + 1]! + ((e[k + 3]! - e[k + 1]!) * q) / n; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; } }
    return false;
  });
  assert.ok(has(31, 41, 32.5, 46) && has(27.5, 54, 29, 59), 'the strip keeps its land shores');
  assert.ok(has(39, 44, 47, 45.5), "the pond keeps its far shore");
  // the fill runs on into the river (no gap of bank between): at the crossing and along the pond, just inside the river's edge
  assert.ok(inRings(L.fill, 30, 48.3) && inRings(L.fill, 30, 51.7), 'the strip reaches into the river on both sides');
  assert.ok(inRings(L.fill, 43, 48.3), 'the pond reaches into the river along its side');
  assert.ok(!inRings(L.fill, 43, 50.5), 'but no further than its reach: the river is its own water there');
  // (across a river or creek narrower than the water's closing the fill may close over it: the renderer keeps it off the map's water, CourseLayer.join)
  // the renderer's join box covers the seam
  const jb = L.join!; assert.ok(jb && jb[0]! <= 29.5 && jb[2]! >= 30.5 && jb[1]! <= 48.5 && jb[3]! >= 51.5, `the join box ${jb}`);
  // the grid itself is left as it was (the join's cells counted as water only while the outlines were made)
  for (let y = 48.1; y < 52; y += 0.5) assert.equal(g.surf[cellAt(g, 30.1, y)], SURF.none);
});

test('4. erasing the painted water next to the river leaves the river as it was, and the join goes with the water', () => {
  const { g, tool } = world(), w = river(), river0 = snap(g);
  stroke(tool, 30, 40, 30, 60);
  tool.rubOut = true; const dabs = stroke(tool, 30, 40, 30, 60);
  for (let i = 0; i < g.surf.length; i++) if (bareMapWater({ ...g, surf: river0.surf }, i, w)) assert.equal(g.surf[i], SURF.none, 'every cell of the river still the river');
  assert.ok(!g.surf.includes(SURF.water), 'no water left');
  assert.equal(joinCells(g, [0, 0, 64, 64], w), null, 'no join');
  const p = coursePatch(g, 0, 0, LOOKS, 0, undefined, undefined, undefined, w);
  assert.ok(!water(p?.course?.layers), 'no water layer');
  // undo the rub out: the water and its join come back as they were
  for (let k = 0; k < dabs; k++) tool.undo();
  const q = coursePatch(g, 0, 0, LOOKS, 0, undefined, undefined, undefined, w)!;
  assert.ok(water(q.course?.layers)?.join, 'the join is back with the water');
});

test('5. a course far from the map water is drawn exactly as before; the join reaches only JOIN_REACH cells into the river', () => {
  const g = makeGrid(0, 0, 200, 200);
  fillPolygon(g, [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], SURF.water, 1, 0);
  fillPolygon(g, [{ x: 22, y: 8 }, { x: 40, y: 8 }, { x: 40, y: 22 }, { x: 22, y: 22 }], SURF.fairway, 1, 0);
  const a = coursePatch(g, 0, 0, LOOKS, 0), b = coursePatch(g, 0, 0, LOOKS, 0, undefined, undefined, undefined, river());
  assert.deepEqual(b, a, 'the river 28 tiles away changes nothing');
  // beside the river: the join's cells are the river's cells within reach of the water, no further in
  fillPolygon(g, [{ x: 50, y: 44 }, { x: 56, y: 44 }, { x: 56, y: 47.9 }, { x: 50, y: 47.9 }], SURF.water, 1, 0);
  const j = joinCells(g, [0, 0, 64, 64], river())!;
  assert.ok(j && j.ext.length > 0);
  for (const c of j.ext) { const cx = c % g.w, cy = (c - cx) / g.w, y = (cy + 0.5) * CELL_T; assert.ok(y > 47.75 && y < 47.75 + JOIN_REACH * CELL_T + 0.01, `a join cell at y ${y}`); assert.equal(j.hole[j.ext.indexOf(c)], 1, "the pond's hole"); }
});

test("6. joinEdges drops the seam's points and keeps the rest as whole runs: a closed shore that loses its seam is one open run, not two", () => {
  const g = makeGrid(0, 0, 200, 200), w = river();
  fillPolygon(g, [{ x: 40, y: 40 }, { x: 46, y: 40 }, { x: 46, y: 47.9 }, { x: 40, y: 47.9 }], SURF.water, 1, 0);
  const j = joinCells(g, [0, 0, 64, 64], w)!;
  // a closed ring round the pond, its south side on the seam, starting in the middle of that side
  const ring = [43, 47.9, 46, 47.9, 46, 40, 40, 40, 40, 47.9, 43, 47.9];
  const out = joinEdges(g, [ring], j);
  assert.equal(out.length, 1, 'one run');
  const r = out[0]!;
  assert.ok(r.every((v, k) => k % 2 === 0 || v <= 47.5), 'no point on the seam');
  assert.ok(Math.abs(r[r.length - 2]! - 40) < 1e-9 && Math.abs(r[0]! - 46) < 1e-9, 'it runs from the east side round the north to the west side');
  // a long straight run into the seam keeps its share up to it
  const long = joinEdges(g, [[46, 30, 46, 47.9]], j);
  assert.equal(long.length, 1); assert.ok(long[0]![long[0]!.length - 1]! > 46.5, 'the side runs on to within a tile of the seam');
});
