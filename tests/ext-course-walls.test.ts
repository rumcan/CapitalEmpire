/** Tests for T099 course walls (ext/course-walls): every course surface has a height, and each drawn edge of a course chunk is sorted into a
 * wall (the face shows only where it looks toward the camera: a raised surface's lower edges on screen, a sunken one's far edges), a joint
 * (a surface against its own collar), soft, or hidden, once per boundary; the wall hangs over the lower side with the height difference
 * of its two sides; and two chunks' walls meet exactly at their border (pure, Node). Tile units; heights in metres. Screen down is the
 * tile direction (1, 1), so "toward the camera" means a larger x + y. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOB_STYLE, chunkOutlines } from '../src/game/ext/course-blobs/index.js';
import { makeGrid, fillPolygon, SURF, CUSTOM0, MAX_GRASSES } from '../src/game/ext/course-grid/index.js';
import type { Grid } from '../src/game/ext/course-grid/index.js';
import { DRAW_ORDER, FaceForm, GREEN_BANK_RATIO, LayerStack, SURF_HEIGHT, WallMat, chunkWalls, collarAfter, coversOf, faceLight, layerCode, type ChunkWalls, type WallRun } from '../src/game/ext/course-walls/index.js';

const { rough: ROUGH, fescue: FESCUE, water: WATER, fairway: FAIRWAY, tee: TEE, bunker: BUNKER, green: GREEN } = SURF;
const code = layerCode;

/** a grid of 256 x 256 cells (128 x 128 tiles, chunks 0..1 each way) with its origin at (0, 0), rough over the middle */
function base(): Grid {
  const g = makeGrid(0, 0, 256, 256);
  fillPolygon(g, [{ x: 8, y: 8 }, { x: 120, y: 8 }, { x: 120, y: 120 }, { x: 8, y: 120 }], ROUGH, 1, 0);
  return g;
}
/** a polygon of n points round (cx, cy) with radii (rx, ry) (tiles) */
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 32) => Array.from({ length: n }, (_, k) => ({ x: cx + rx * Math.cos((2 * Math.PI * k) / n), y: cy + ry * Math.sin((2 * Math.PI * k) / n) }));
/** paints an ellipse of surface s over anything */
const blob = (g: Grid, s: number, cx: number, cy: number, rx: number, ry = rx) => fillPolygon(g, ellipse(cx, cy, rx, ry), s, 1, 0);
/** the walls and sorted edges of chunk (cx, cy) of size tiles, exactly as the chunk patches make them */
function walls(g: Grid, cx = 0, cy = 0, size = 64): ChunkWalls & { stack: LayerStack } {
  const outs = chunkOutlines(g, cx, cy, size, BLOB_STYLE, true), K = coversOf(outs);
  const cw = chunkWalls(g, outs.flatMap(o => [{ code: code(o.surf, false), edges: o.edges }, ...(o.collar ? [{ code: code(o.surf, true), edges: o.collar.edges }] : [])]), K);
  return { ...cw, stack: new LayerStack(K) };
}
/** a wall run's points as { x, y, dh } */
const pts = (w: WallRun) => Array.from({ length: w.p.length / 3 }, (_, i) => ({ x: w.p[3 * i]!, y: w.p[3 * i + 1]!, dh: w.p[3 * i + 2]! }));
/** the interior points of a run (its ends taper to the neighbouring edge's step) */
const inner = (w: WallRun) => pts(w).slice(1, -1);
/** how much of a run's length looks toward the camera (its faces' normals (dy, -dx) against (1, 1)), -1..1 weighted by length */
function facing(w: WallRun): number {
  const q = pts(w); let s = 0, l = 0;
  for (let i = 0; i + 1 < q.length; i++) { const dx = q[i + 1]!.x - q[i]!.x, dy = q[i + 1]!.y - q[i]!.y, d = Math.hypot(dx, dy); s += (dy - dx) * Math.SQRT1_2; l += d; }
  return l ? s / l : 0;
}
/** the total length of a list of runs */
const length = (ws: readonly WallRun[]) => ws.reduce((s, w) => { const q = pts(w); for (let i = 0; i + 1 < q.length; i++) s += Math.hypot(q[i + 1]!.x - q[i]!.x, q[i + 1]!.y - q[i]!.y); return s; }, 0);

test('1. the draw order and the heights', () => {
  // T238: the long grass (id 9) draws between the rough and the fescue
  // T271: the eight custom grass ids (10..17: each its first cut band, then its fill) after the fescue
  const own = Array.from({ length: MAX_GRASSES }, (_, k) => [code(CUSTOM0 + k, true), code(CUSTOM0 + k, false)]).flat();
  assert.deepEqual(DRAW_ORDER, [code(ROUGH, false), code(SURF.longGrass, false), code(FESCUE, false), ...own, code(WATER, false), code(FAIRWAY, true), code(FAIRWAY, false), code(TEE, true), code(TEE, false), code(BUNKER, false), code(WATER, true), code(SURF.waste, false), code(BUNKER, true), code(GREEN, true), code(GREEN, false)]);
  assert.equal(collarAfter(BUNKER), SURF.waste, "the bunker's lip is laid before the green and its fringe, which lie over it");
  assert.ok(SURF_HEIGHT[WATER]! < SURF_HEIGHT[BUNKER]! && SURF_HEIGHT[BUNKER]! < 0 && SURF_HEIGHT[ROUGH] === 0 && SURF_HEIGHT[FAIRWAY]! > 0 && SURF_HEIGHT[FAIRWAY]! < SURF_HEIGHT[GREEN]! && SURF_HEIGHT[GREEN]! < SURF_HEIGHT[TEE]!, 'water < bunker < rough < fairway < green < tee');
  assert.ok(faceLight(-0.17, -0.99) > 0.95 && faceLight(0.17, 0.99) < 0.05, 'a face toward the upper right is lit, one toward the lower left in shade');
});

test('2. a raised green: a gentle grass bank (T127), over the rough, as tall as the green above it, showing all round', () => {
  const g = base(); blob(g, GREEN, 32, 32, 7, 5);
  const { walls: ws, runs } = walls(g);
  assert.ok(ws.length > 0, 'it has walls');
  for (const w of ws) {
    assert.equal(w.lo, code(ROUGH, false), 'it hangs over the rough (the fringe is on the platform)');
    assert.equal(w.m, WallMat.Turf);
    assert.equal(w.f, FaceForm.Bank, 'a grass bank, never a hard wall');
    assert.ok(Math.abs(w.r - GREEN_BANK_RATIO / 2) < 1e-9, `its run: ${GREEN_BANK_RATIO} m a metre (${w.r})`);
    for (const p of inner(w)) assert.ok(Math.abs(p.dh - SURF_HEIGHT[GREEN]!) < 1e-6, `as tall as the green above the rough (${p.dh})`);
  }
  // a gentle bank's foot lies farther out than its drop reaches down the screen, so it faces the camera all round the platform (a wall
  // showed only on the camera-facing half): about the whole perimeter of a 7 x 5 tile ellipse plus its 0.5-tile fringe (about 41 tiles)
  const L = length(ws); assert.ok(L > 30, `the bank runs right round the platform (${L.toFixed(1)} tiles)`);
  // the green meets its fringe in a joint, never a wall; the fringe's far edges are crisp (no feather), its near edges walls
  assert.ok((runs.get(code(GREEN, false))?.joint.length ?? 0) > 0, 'green and fringe meet in a joint line');
  assert.equal(runs.get(code(GREEN, false))?.soft.length ?? 0, 0, 'no feathered green edge');
  assert.equal(runs.get(code(GREEN, true))?.soft.length ?? 0, 0, 'no feathered fringe edge: walls or crisp crests');
});

test('3. a sunken bunker: only its far wall shows, hanging into the sand, as deep as the bunker below the lip', () => {
  const g = base(); blob(g, BUNKER, 32, 32, 5, 3);
  const { walls: ws, runs } = walls(g);
  assert.ok(ws.length > 0);
  for (const w of ws) {
    assert.equal(w.lo, code(BUNKER, false), 'it hangs over the sand');
    assert.equal(w.m, WallMat.Sand);
    assert.ok(facing(w) > 0, 'the face looks toward the camera');
    for (const p of pts(w)) assert.ok(p.x + p.y < 64 + 4.5, `on the far side of the bunker (x + y = ${(p.x + p.y).toFixed(1)})`);
    for (const p of inner(w)) assert.ok(Math.abs(p.dh + SURF_HEIGHT[BUNKER]!) < 1e-6, `as deep as the sand below the lip on the rough (${p.dh})`);
  }
  // (the screen silhouette of a 5 x 3 tile ellipse reaches 2.7 tiles past its middle along (1, 1); a run may end in a sliver running
  // straight down the screen past it, which has no width)
  // the higher side on the left of travel: just left of each run is higher ground than just right of it
  const st = walls(g).stack;
  for (const w of ws) for (let i = 1, q = pts(w); i < Math.min(4, q.length - 1); i++) {
    const p = q[i]!, a = q[i - 1]!, b = q[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l;
    const hL = st.height((p.x - 0.3 * nx) / 0.5, (p.y - 0.3 * ny) / 0.5), hR = st.height((p.x + 0.3 * nx) / 0.5, (p.y + 0.3 * ny) / 0.5);
    assert.ok(hL > hR, `higher on the left (${hL} vs ${hR})`);
  }
  // the lip meets the rough at the same height: soft, no wall
  assert.ok((runs.get(code(BUNKER, true))?.soft.length ?? 0) > 0, "the lip's outer edge is soft");
});

test('4. a bunker inside a green: one wall from the green down to the sand, never a second one beside it', () => {
  const g = base(); blob(g, GREEN, 32, 32, 9, 7); blob(g, BUNKER, 33, 31, 2.6, 1.8);
  const { walls: ws } = walls(g);
  const sand = ws.filter(w => w.lo === code(BUNKER, false)), turf = ws.filter(w => w.lo !== code(BUNKER, false));
  assert.ok(sand.length > 0 && length(sand) > 2.5, `the bunker's far wall (${length(sand).toFixed(1)} tiles)`);
  const full = SURF_HEIGHT[GREEN]! - SURF_HEIGHT[BUNKER]!;
  for (const w of sand) for (const p of inner(w)) assert.ok(Math.abs(p.dh - full) < 1e-6, `green down to the sand in one wall (${p.dh}, want ${full})`);
  // no turf wall anywhere near the bunker (the green's own edge round the bunker lies under the lip and is hidden)
  for (const w of turf) for (const p of pts(w)) assert.ok(Math.hypot(p.x - 33, p.y - 31) > 4, `no second wall by the bunker (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  // and the green never claims the bunker's cells (its fillets stop at the sand)
  const outs = chunkOutlines(g, 0, 0, 64, BLOB_STYLE, true), gc = outs.find(o => o.surf === GREEN)!.cover!.s;
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) if (g.surf[j * 256 + i] === BUNKER) {
    const k = (j - gc.cj0) * gc.cw + (i - gc.ci0);
    assert.ok(i < gc.ci0 || j < gc.cj0 || i >= gc.ci0 + gc.cw || j >= gc.cj0 + gc.ch || !gc.occ[k], `bunker cell (${i}, ${j}) not under the green`);
  }
});

test('5. the wall height is the difference of the two sides: tee on fairway, water by a fairway, island green, bunker by water', () => {
  const near = (ws: readonly WallRun[], lo: number, dh: number) => ws.some(w => w.lo === lo && inner(w).some(p => Math.abs(p.dh - dh) < 1e-6));
  {
    const g = base(); fillPolygon(g, [{ x: 10, y: 24 }, { x: 54, y: 24 }, { x: 54, y: 40 }, { x: 10, y: 40 }], FAIRWAY, 1, 0); fillPolygon(g, [{ x: 26, y: 29 }, { x: 38, y: 29 }, { x: 38, y: 35 }, { x: 26, y: 35 }], TEE, 1, 0);
    const ws = walls(g).walls;
    assert.ok(near(ws, code(FAIRWAY, false), SURF_HEIGHT[TEE]! - SURF_HEIGHT[FAIRWAY]!), 'a tee on a fairway stands 0.4 m above it');
  }
  {
    const g = base(); fillPolygon(g, [{ x: 10, y: 20 }, { x: 54, y: 20 }, { x: 54, y: 30 }, { x: 10, y: 30 }], FAIRWAY, 1, 0); blob(g, WATER, 32, 34, 8, 5);
    const ws = walls(g).walls;
    assert.ok(near(ws, code(WATER, false), SURF_HEIGHT[FAIRWAY]! - SURF_HEIGHT[WATER]!), 'the fairway drops straight into the pond');
    assert.ok(ws.filter(w => w.lo === code(WATER, false)).every(w => w.m === WallMat.Water), 'a wet wall');
  }
  {
    const g = base(); blob(g, WATER, 32, 32, 12, 10); blob(g, GREEN, 32, 32, 5, 4);
    const ws = walls(g).walls, isl = ws.filter(w => w.lo === code(WATER, false) && inner(w).some(p => Math.abs(p.dh - (SURF_HEIGHT[GREEN]! - SURF_HEIGHT[WATER]!)) < 1e-6));
    assert.ok(isl.length > 0, 'the island green drops 1.05 m into the water');
    for (const w of isl) for (const p of pts(w)) assert.ok(p.x + p.y > 64 - 2, "on the island's near side");
  }
  {
    const g = base(); blob(g, WATER, 32, 34, 7, 4); blob(g, BUNKER, 31, 28.5, 3, 2);
    const ws = walls(g).walls;
    // the pond's bank lies between them (the bunker's sand keeps off it): the water drops from the bank's ground, as from any grass
    assert.ok(near(ws, code(WATER, false), -SURF_HEIGHT[WATER]!), 'a bunker by the water: the bank between, the water 0.8 m below it');
  }
});

test('6. no wall between equal heights', () => {
  const g = base(); blob(g, FESCUE, 32, 32, 8, 6);
  assert.equal(walls(g).walls.length, 0, 'fescue on rough: none');
  const h = base(); blob(h, SURF.waste, 32, 32, 6, 4);
  assert.equal(walls(h).walls.length, 0, 'waste on rough: none');
});

test('7. paint over and rub out: the walls heal to exactly what a fresh paint gives', () => {
  const a = base(); blob(a, GREEN, 32, 32, 7, 5);
  const b = base(); blob(b, GREEN, 32, 32, 7, 5); blob(b, BUNKER, 30, 33, 3, 2); blob(b, WATER, 34, 31, 1.5); blob(b, GREEN, 32, 32, 7, 5);
  assert.deepEqual(walls(b).walls.map(w => Array.from(w.p)), walls(a).walls.map(w => Array.from(w.p)), 'green painted back over a bunker and a pond');
});

test('8. chunk borders: the two chunks give the walls of one uncut chunk, and meet end to end with the same drop', () => {
  // a green, a bunker and a pond across the border x = 64 (and the green across y = 64 too)
  const g = makeGrid(0, 0, 256, 256);
  fillPolygon(g, [{ x: 30, y: 30 }, { x: 100, y: 30 }, { x: 100, y: 100 }, { x: 30, y: 100 }], ROUGH, 1, 0);
  blob(g, GREEN, 64, 64, 7, 6); blob(g, BUNKER, 64.3, 67, 2.4, 1.6); blob(g, WATER, 56, 72, 5, 3); fillPolygon(g, [{ x: 66, y: 50 }, { x: 74, y: 50 }, { x: 74, y: 54 }, { x: 66, y: 54 }], TEE, 1, 0);
  const parts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => ({ cx: cx!, cy: cy!, ws: walls(g, cx!, cy!).walls }));
  const whole = walls(g, 0, 0, 128).walls;
  // every border end of one chunk's runs is an end of a neighbour's run, at the same point with the same drop
  let ends = 0;
  for (const { cx, cy, ws } of parts) for (const w of ws) for (const e of [pts(w)[0]!, pts(w)[pts(w).length - 1]!]) {
    const onX = Math.abs(e.x - 64) < 1e-9 && (cx === 0 ? true : true), onY = Math.abs(e.y - 64) < 1e-9;
    if (!onX && !onY) continue;
    ends++;
    const other = parts.filter(q => q.cx !== cx || q.cy !== cy).flatMap(q => q.ws.flatMap(v => [pts(v)[0]!, pts(v)[pts(v).length - 1]!]));
    assert.ok(other.some(o => o.x === e.x && o.y === e.y && Math.abs(o.dh - e.dh) < 1e-9), `a border end (${e.x}, ${e.y.toFixed(3)}) meets its neighbour's`);
  }
  assert.ok(ends >= 2, `walls cross the borders (${ends} border ends)`);
  // the cut chunks' walls trace the uncut chunk's: every point lies on an uncut run with the same drop
  const segs = whole.flatMap(w => { const q = pts(w); return q.slice(1).map((b, i) => [q[i]!, b] as const); });
  const dist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  let worst = 0;
  for (const { ws } of parts) for (const w of ws) for (const p of inner(w)) { let d = Infinity; for (const [a, b] of segs) d = Math.min(d, dist(p, a, b)); worst = Math.max(worst, d); }
  assert.ok(worst < 0.06, `the cut walls follow the uncut ones (worst ${worst.toFixed(3)} tiles)`);
  const lc = parts.reduce((s, q) => s + length(q.ws), 0), lw = length(whole);
  assert.ok(Math.abs(lc - lw) < 0.05 * lw + 0.5, `the same length of wall (${lc.toFixed(1)} cut vs ${lw.toFixed(1)} whole)`);
});

test('9. the edges are each sorted once: a tee on a fairway carries the wall, the fairway hides that boundary', () => {
  const g = base(); fillPolygon(g, [{ x: 10, y: 24 }, { x: 54, y: 24 }, { x: 54, y: 40 }, { x: 10, y: 40 }], FAIRWAY, 1, 0); fillPolygon(g, [{ x: 26, y: 29 }, { x: 38, y: 29 }, { x: 38, y: 35 }, { x: 26, y: 35 }], TEE, 1, 0);
  const { walls: ws } = walls(g), tw = ws.filter(w => w.lo === code(FAIRWAY, false));
  // the tee's walls (near side: its edges with x + y above the tee's middle) are not drawn twice: no two runs lie on each other
  let overlap = 0;
  for (let i = 0; i < tw.length; i++) for (let j = i + 1; j < tw.length; j++) for (const p of inner(tw[i]!)) for (const q of inner(tw[j]!)) if (Math.hypot(p.x - q.x, p.y - q.y) < 0.05) overlap++;
  assert.equal(overlap, 0, 'no double wall');
});

test('10. a shape centred on a chunk corner keeps its edges (and walls) in all four chunks', () => {
  // its outline crosses the borders through contour points that sit on the border lines (lattice lines): such a stretch used to be dropped
  const g = makeGrid(0, 0, 256, 256);
  fillPolygon(g, [{ x: 30, y: 30 }, { x: 100, y: 30 }, { x: 100, y: 100 }, { x: 30, y: 100 }], ROUGH, 1, 0);
  blob(g, GREEN, 64, 64, 7, 6);
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const o = chunkOutlines(g, cx!, cy!, 64, BLOB_STYLE).find(q => q.surf === GREEN)!;
    assert.ok(o.edges.length > 0 && (o.collar?.edges.length ?? 0) > 0, `chunk (${cx}, ${cy}) has the green's and the fringe's edges`);
  }
  const near = [[0, 1], [1, 1], [1, 0]].map(([cx, cy]) => walls(g, cx!, cy!).walls.length);
  assert.ok(near.every(n => n > 0), `the camera-facing quarters have walls (${near.join(', ')})`);
});
