/** Rub out on the course grid (T125; the owner, 2026-10-25: "rubout 4x4 brush does not rub that size out. should be able to rub out
 * everything below it not just the fairway"): the square brush rubs out exactly its 1, 4, 9 or 16 cells, the same cells painting lays; it
 * takes every course surface (fairway, green, tee, bunker, water, waste, fescue) back to rough with no hole, whatever the brush and the hole
 * (the rough brush gives back the land's own grass); it keeps to your land, never touches the driving range plot or a painted cart path;
 * a drag never rubs through the rough it gives back; a stroke is one undo step; and the per-hole limit is an option, off by default.
 * Pure, Node: a PaintTool with a stand-in golf host (npm test). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { snapDab, squareStart } from '../src/game/ext/course-cursor/snap';
import { LAND_WHY, PaintTool, RUB_WHY, type LandRefusal, type PaintHost } from '../src/game/paint-tool';

const key = (cx: number, cy: number) => cy * 100000 + cx;
/** the n x n square's world cells from start cell (ix, iy), as sorted keys */
function squareCells(ix: number, iy: number, n: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push(key(ix + x, iy + y));
  return out.sort((a, b) => a - b);
}
/** the cells whose surface, hole or month differ from a snapshot, as sorted world cell keys */
function changed(g: Grid, before: { surf: Uint8Array; hole: Uint8Array; month: Uint16Array }): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before.surf[i] || g.hole[i] !== before.hole[i] || g.month[i] !== before.month[i]) { const cx = i % g.w; out.push(key(Math.round(g.x0 / CELL_T) + cx, Math.round(g.y0 / CELL_T) + (i - cx) / g.w)); }
  return out.sort((a, b) => a - b);
}
const snap = (g: Grid) => ({ surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice() });
/** the cell at tile (x, y): [surface, hole, month] */
const at = (g: Grid, x: number, y: number) => { const i = Math.floor((y - g.y0) / CELL_T) * g.w + Math.floor((x - g.x0) / CELL_T); return [g.surf[i], g.hole[i], g.month[i]]; };
/** a rectangle of surface s for hole h (tiles), seeded in month m */
const rect = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number, h: number, m = 0) => fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, h, m);

/** a golf game on a 100 x 100 tile grid: your land west of x = ownX (east of it the driving range's plot, or not yours), and what the
 *  tool asks of the host besides the grid (lot ground cleared, plants removed) */
function world(ownX = Infinity, refusal: LandRefusal = 'range') {
  const g = makeGrid(0, 0, 200, 200), log = { cleared: 0, unplanted: 0, flushes: 0 };
  const host: PaintHost = {
    setLotGround: (_k, p) => { if (p === null) log.cleared++; }, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0,
    plant: () => 0, unplant: () => { log.unplanted++; return 0; }, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => 1e9, spend() {},
    grid: () => g, gridChanged: (_d, now) => { if (now) log.flushes++; },
    ownedAt: x => x < ownX, landWhy: x => (x < ownX ? '' : refusal),
  };
  const tool = new PaintTool(host);
  tool.enterCourse(); tool.setBrush('fairway'); tool.setHole(1);
  return { g, tool, log };
}
/** a press and release at tile (x, y) */
const click = (tool: PaintTool, x: number, y: number) => { tool.cursor = { x, y }; tool.pointerDown({ x, y }, 0, 0); tool.pointerUp(0.5); };

test('1. the square brush rubs out exactly 1, 4, 9 and 16 cells: square, cell-aligned, the same cells painting lays', () => {
  const { g, tool } = world();
  rect(g, 10, 10, 80, 80, SURF.fairway, 1);
  for (const n of [1, 2, 3, 4]) for (const [x, y] of [[40.3, 40.7], [41.6, 39.2], [45, 45], [33.1, 52.3]] as const) {
    tool.setBrushCells(n); tool.rubOut = true;
    const b = snap(g); click(tool, x, y);
    const gone = changed(g, b), square = squareCells(squareStart(x, n), squareStart(y, n), n);
    assert.equal(gone.length, n * n, `${n} x ${n} at ${x},${y}: ${n * n} cells`);
    assert.deepEqual(gone, square, `${n} x ${n} at ${x},${y}: exactly the square under the pointer`);
    for (const k of gone) { const cx = k % 100000, cy = Math.floor(k / 100000); assert.deepEqual(at(g, (cx + 0.5) * CELL_T, (cy + 0.5) * CELL_T), [SURF.rough, 0, 0], 'back to established rough, no hole'); }
    // painting at the same size and spot lays the same cells
    tool.undo(); tool.rubOut = false;
    const e = world(); e.tool.setBrushCells(n); const eb = snap(e.g); click(e.tool, x, y);
    assert.deepEqual(changed(e.g, eb), square, 'painting lays the same square');
  }
  // the round brush (Advanced) rubs out exactly the disc it paints
  tool.setBrushCells(0); tool.setBrushR(2.5); tool.rubOut = true;
  const b = snap(g); click(tool, 50.2, 50.4);
  const ref = makeGrid(0, 0, 200, 200), d = paintDisc(ref, snapDab(50.2), snapDab(50.4), 2.5, SURF.fairway, 1, 0), disc: number[] = [];
  for (let k = 0; k < d.n; k++) { const i = d.idx[k]!, cx = i % ref.w; disc.push(key(cx, (i - cx) / ref.w)); }
  assert.deepEqual(changed(g, b), disc.sort((p, q) => p - q), 'the round brush: its disc on the nearest cell corner');
});

test('2. it rubs out every course surface under it, whatever the brush and the hole: green, bunker, water, fairway, tee, waste, fescue', () => {
  const SURFS = [SURF.green, SURF.bunker, SURF.water, SURF.fairway, SURF.tee, SURF.waste, SURF.fescue, SURF.green];
  for (const brush of ['fairway', 'green', 'bunker', 'water', 'tee'] as const) {
    const { g, tool } = world();
    // a 4 x 4 square (cells 80..83 on both axes, tiles 40..42) of eight surfaces on holes 1 to 3, seeded in month 3
    for (let k = 0; k < 16; k++) { const cx = 80 + (k % 4), cy = 80 + (k >> 2); g.surf[cy * g.w + cx] = SURFS[k % 8]!; g.hole[cy * g.w + cx] = 1 + (k % 3); g.month[cy * g.w + cx] = 3 + 64; }
    tool.setBrush(brush); tool.setHole(2); tool.setBrushCells(4); tool.rubOut = true;
    const b = snap(g); click(tool, 41, 41); // 4 x 4 lies on the four town squares round the nearest tile corner: cells 80..83
    assert.deepEqual(changed(g, b), squareCells(80, 80, 4), `the ${brush} brush rubs out all 16 cells`);
    for (let k = 0; k < 16; k++) { const i = (80 + (k >> 2)) * g.w + 80 + (k % 4); assert.equal(g.surf[i], SURF.rough); assert.equal(g.hole[i], 0, 'the hole tag cleared'); }
  }
  // rough and the land's own grass are the base: left as they are (a rough cell keeps its hole)
  const { g, tool } = world();
  rect(g, 40, 40, 42, 41, SURF.rough, 4); rect(g, 40, 41, 41, 42, SURF.green, 4);
  tool.setBrushCells(4); tool.rubOut = true;
  const b = snap(g); click(tool, 41, 41);
  assert.equal(changed(g, b).length, 4, 'only the four green cells change');
  assert.deepEqual(at(g, 41.6, 40.2), [SURF.rough, 4, 0], 'rough stays rough, hole and all');
  assert.deepEqual(at(g, 41.6, 41.6), [SURF.none, 0, 0], 'the grass stays grass');
  // the rough brush gives back the land's own grass: every course surface, rough included
  tool.setBrush('rough'); click(tool, 41, 41);
  for (const [x, y] of [[40.2, 40.2], [41.6, 40.2], [40.2, 41.6]] as const) assert.deepEqual(at(g, x, y), [SURF.none, 0, 0]);
});

test('3. a drag rubs out its whole path and never rubs through the rough it gave back; the stroke is one undo step', () => {
  const { g, tool } = world();
  rect(g, 10, 10, 80, 80, SURF.rough, 1); rect(g, 30, 30, 60, 60, SURF.fairway, 1, 2 + 64); rect(g, 44, 44, 48, 48, SURF.green, 1); rect(g, 36, 44, 40, 48, SURF.bunker, 1);
  tool.setBrushCells(4); tool.rubOut = true;
  const b = snap(g);
  tool.cursor = { x: 34, y: 45 }; tool.pointerDown(tool.cursor, 0, 0);
  for (let x = 34; x <= 52; x += 0.25) tool.pointerMove({ x, y: 45 }, 0, 0);
  tool.pointerUp(0.5);
  const after = snap(g), gone = changed(g, b);
  // the band the 4 x 4 square swept: rows 88..91, columns 66..105 (start cells 66 to 102)
  assert.deepEqual(gone, (() => { const o: number[] = []; for (let cy = 88; cy < 92; cy++) for (let cx = 66; cx < 106; cx++) o.push(key(cx, cy)); return o.sort((p, q) => p - q); })(), 'exactly the swept band');
  for (const k of gone) { const i = Math.floor(k / 100000) * g.w + (k % 100000); assert.equal(g.surf[i], SURF.rough, 'rough, not rubbed through to grass'); }
  // one undo puts every cell back (surface, hole and month); redo takes them again
  tool.undo();
  assert.deepEqual(snap(g), b, 'one undo restores the stroke');
  tool.redo();
  assert.deepEqual(snap(g), after, 'redo');
  tool.undo(); tool.undo();
  assert.deepEqual(snap(g), b, 'nothing else was in that step');
});

test('4. it keeps to your land: the driving range plot and land not yours are refused (with the reason), a cart path stays', () => {
  const { g, tool, log } = world(50, 'range');
  // course cells on both sides of the line (as before the range was placed), and a cart path (painted area) under the brush
  rect(g, 40, 40, 60, 60, SURF.fairway, 1);
  tool.setBrush('path'); tool.setBrushR(1); tool.cursor = { x: 44, y: 44 }; tool.pointerDown(tool.cursor, 0, 0); tool.pointerMove({ x: 47, y: 44 }, 0, 0); tool.pointerUp(0.5);
  const paths = tool.areas.length, cleared = log.cleared;
  assert.ok(paths > 0, 'a cart path area');
  tool.setBrush('fairway'); tool.setBrushCells(4); tool.rubOut = true;
  // the reasons the footprint shows
  const why = tool.brushSkipWhy()!;
  assert.equal(why(50.2, 45.2), LAND_WHY.range, 'the range plot is refused, with its reason');
  assert.equal(why(49.7, 45.2), '', 'your fairway is taken');
  assert.equal(why(20, 20), RUB_WHY.nothing, 'nothing to rub out on the grass');
  const b = snap(g); click(tool, 50, 45); // the 4 x 4 square straddles the line at x = 50 (cells 98..101)
  assert.deepEqual(changed(g, b), squareCells(98, 88, 2).concat(squareCells(98, 90, 2)).sort((p, q) => p - q), 'only the cells on your land');
  assert.deepEqual(at(g, 50.2, 45.2), [SURF.fairway, 1, 0], 'the range plot keeps its cells');
  // over the cart path: the path area stays, no lot ground is cleared, nothing is unplanted
  click(tool, 45, 44);
  assert.equal(tool.areas.length, paths, 'the cart path stays'); assert.equal(log.cleared, cleared, 'no painted ground was taken'); assert.equal(log.unplanted, 0);
  // off your land (not the range): the same, with its own words
  const w = world(50, 'off'); rect(w.g, 40, 40, 60, 60, SURF.green, 1); w.tool.setBrushCells(1); w.tool.rubOut = true;
  assert.equal(w.tool.brushSkipWhy()!(55, 45), LAND_WHY.off);
  const wb = snap(w.g); click(w.tool, 55, 45);
  assert.deepEqual(changed(w.g, wb), [], 'nothing off your land');
});

test('5. the per-hole limit is an option, off by default: on, it takes only the current hole\'s cells (any surface)', () => {
  const { g, tool } = world();
  rect(g, 40, 40, 41, 42, SURF.fairway, 1); rect(g, 41, 40, 42, 42, SURF.green, 2);
  tool.setBrushCells(4); tool.rubOut = true;
  assert.equal(tool.rubHoleOnly, false, 'off by default');
  tool.rubHoleOnly = true; tool.setHole(2);
  assert.equal(tool.brushSkipWhy()!(40.2, 40.2), RUB_WHY.hole);
  const b = snap(g); click(tool, 41, 41);
  assert.equal(changed(g, b).length, 8, "hole 2's green only");
  assert.deepEqual(at(g, 40.2, 40.2), [SURF.fairway, 1, 0], "hole 1's fairway stays");
  assert.deepEqual(at(g, 41.2, 40.2), [SURF.rough, 0, 0]);
  tool.rubHoleOnly = false; click(tool, 41, 41);
  assert.deepEqual(at(g, 40.2, 40.2), [SURF.rough, 0, 0], 'off: every hole');
});
