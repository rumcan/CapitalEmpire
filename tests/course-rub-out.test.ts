/** Rub out on the course grid (T125; the owner, 2026-10-25: "rubout 4x4 brush does not rub that size out. should be able to rub out
 * everything below it not just the fairway"): the square brush rubs out exactly its 1, 4, 9 or 16 cells, the same cells painting lays; it
 * takes every course surface (fairway, green, tee, bunker, water, waste, fescue) back to rough with no hole, whatever the brush and the hole
 * (the rough brush gives back the land's own grass); it keeps to your land, never touches the driving range plot or a painted cart path;
 * a drag never rubs through the rough it gives back; a stroke is one undo step; the per-hole limit is an option, off by default; and the
 * cells it takes are carved, so the drawn course (course-blobs' closing, fillets and collars) leaves the gap open at its full size.
 * Pure, Node: a PaintTool with a stand-in golf host (npm test). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, decodeGrid, encodeGrid, fillPolygon, isCarved, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { chunkOutlines } from '../src/game/ext/course-blobs';
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

// ---- carved cells (T125, the lead: "what the owner rubs out must always show") ----

/** the nonzero winding number of closed rings round (x, y) (course-blobs' fills: outer rings counter-clockwise, holes clockwise) */
function winding(rings: number[][], x: number, y: number): number {
  let w = 0;
  for (const p of rings) {
    const m = p.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, ax = p[2 * i]!, ay = p[2 * i + 1]!, bx = p[2 * j]!, by = p[2 * j + 1]!;
      const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y) { if (by > y && cross > 0) w++; } else if (by <= y && cross < 0) w--;
    }
  }
  return w;
}
/** what the drawn course shows at tile (x, y) for surface s, from its 64-tile chunk's outlines: its fill, or its collar band (first cut) */
function drawn(g: Grid, x: number, y: number, s = SURF.fairway): { fill: boolean; band: boolean } {
  const o = chunkOutlines(g, Math.floor(x / 64), Math.floor(y / 64)).find(q => q.surf === s);
  return { fill: !!o && winding(o.fill, x, y) !== 0, band: !!o?.collar && winding(o.collar.fill, x, y) !== 0 };
}
/** the centres (tiles) of the n x n cells from cell (ix, iy), and of the cells along its four sides just outside it (corners left out) */
function squareCentres(ix: number, iy: number, n: number) {
  const inside: [number, number][] = [], ring: [number, number][] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) inside.push([(ix + x + 0.5) * CELL_T, (iy + y + 0.5) * CELL_T]);
  for (let k = 0; k < n; k++) for (const [x, y] of [[ix + k, iy - 1], [ix + k, iy + n], [ix - 1, iy + k], [ix + n, iy + k]] as const) ring.push([(x + 0.5) * CELL_T, (y + 0.5) * CELL_T]);
  return { inside, ring };
}

test('6. a 4 x 4 rub-out in an established fairway shows as a 4 x 4 gap in the drawn course; painting it again closes it; undo restores it', () => {
  const { g, tool } = world();
  rect(g, 10, 10, 90, 90, SURF.rough, 1); rect(g, 20, 20, 80, 80, SURF.fairway, 1, 0); // sod: established (month 0)
  const { inside, ring } = squareCentres(88, 88, 4);
  assert.ok(inside.every(([x, y]) => drawn(g, x, y).fill), 'before: fairway everywhere');
  tool.setBrushCells(4); tool.rubOut = true; click(tool, 45, 45); // cells 88..91 (tiles 44..46)
  assert.ok(inside.every(([x, y]) => isCarved(g, Math.floor(y / CELL_T) * g.w + Math.floor(x / CELL_T))), 'the 16 cells are carved');
  for (const [x, y] of inside) { const d = drawn(g, x, y); assert.ok(!d.fill && !d.band, `the gap shows at ${x},${y}: neither fairway nor its first cut`); }
  for (const [x, y] of ring) assert.ok(drawn(g, x, y).fill, `the fairway still reaches the gap's edge at ${x},${y}`);
  // the gap is the square: a hole ring in the fairway's fill whose box is the 4 x 4 cells (2 x 2 tiles)
  const o = chunkOutlines(g, 0, 0).find(q => q.surf === SURF.fairway)!;
  const hole = o.fill.find(p => { let a = 0; for (let i = 0, m = p.length / 2; i < m; i++) { const j = (i + 1) % m; a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!; } return a < 0 && winding([p], 45, 45) !== 0; });
  assert.ok(hole, 'a hole ring round the gap');
  const xs = hole!.filter((_, i) => i % 2 === 0), ys = hole!.filter((_, i) => i % 2 === 1);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  for (const [v, want] of [[box[0], 44], [box[1], 44], [box[2], 46], [box[3], 46]] as const) assert.ok(Math.abs(v! - want) <= 0.25, `the gap's box ${box.map(b => b!.toFixed(2)).join(', ')} is the 4 x 4 cells`);
  // without the flag the closing would fill it (what the owner saw): the fix is the flag
  const plain: Grid = { ...g, carve: new Uint8Array(g.w * g.h) };
  assert.ok(inside.every(([x, y]) => drawn(plain, x, y).fill), 'uncarved, the fairway closes over a 4 x 4 gap');
  // painting it again clears the flag and closes the gap; undo carves it again, and undo again puts the fairway back
  tool.rubOut = false; click(tool, 45, 45);
  assert.ok(inside.every(([x, y]) => !isCarved(g, Math.floor(y / CELL_T) * g.w + Math.floor(x / CELL_T))), 'painting clears the flag');
  assert.ok(inside.every(([x, y]) => drawn(g, x, y).fill), 'repainted: fairway again');
  tool.undo();
  for (const [x, y] of inside) assert.ok(!drawn(g, x, y).fill, `undo: the gap is back at ${x},${y}`);
  tool.undo();
  assert.ok(inside.every(([x, y]) => drawn(g, x, y).fill && !isCarved(g, Math.floor(y / CELL_T) * g.w + Math.floor(x / CELL_T))), 'undo again: the fairway as it was');
  // rough painted over a carved cell clears the flag too (a change of the flag alone, one undo step)
  tool.redo(); tool.setBrush('rough'); tool.setBrushCells(1);
  const i = Math.floor(44.25 / CELL_T) * g.w + Math.floor(44.25 / CELL_T);
  assert.ok(isCarved(g, i));
  click(tool, 44.25, 44.25);
  assert.equal(isCarved(g, i), false, 'rough painted over it: no longer carved'); assert.equal(g.surf[i], SURF.rough);
  tool.undo(); assert.equal(isCarved(g, i), true, 'undo carves it again');
});

test('7. a carved gap on a chunk border: both chunks leave it open and their edges meet on the seam', () => {
  const { g, tool } = world();
  rect(g, 10, 10, 95, 90, SURF.rough, 1); rect(g, 40, 20, 90, 80, SURF.fairway, 1, 0);
  tool.setBrushCells(4); tool.rubOut = true; click(tool, 64, 45); // cells 126..129: tiles 63..65, across the seam x = 64
  const A = chunkOutlines(g, 0, 0).find(o => o.surf === SURF.fairway)!, B = chunkOutlines(g, 1, 0).find(o => o.surf === SURF.fairway)!;
  const { inside } = squareCentres(126, 88, 4);
  for (const [x, y] of inside) { const o = x < 64 ? A : B; assert.equal(winding(o.fill, x, y), 0, `the gap shows at ${x},${y} in chunk ${x < 64 ? 0 : 1}`); assert.equal(winding(o.collar!.fill, x, y), 0, 'no first cut in it'); }
  const ends = (o: { edges: number[][] }) => { const e: number[][] = []; for (const p of o.edges) for (const k of [0, p.length - 2]) if (Math.abs(p[k]! - 64) < 1e-9) e.push([p[k]!, p[k + 1]!]); return e; };
  const ea = ends(A), eb = ends(B);
  assert.ok(ea.length >= 2 && ea.length === eb.length, `edge ends on the seam: ${ea.length} and ${eb.length}`);
  let worst = 0;
  for (const [x, y] of ea) worst = Math.max(worst, Math.min(...eb.map(([u, v]) => Math.hypot(u! - x!, v! - y!))));
  assert.ok(worst <= 1e-6, `the two chunks' edges meet on the seam (worst ${worst})`);
  assert.ok(ea.some(([, y]) => Math.abs(y! - 44) < 0.3) && ea.some(([, y]) => Math.abs(y! - 46) < 0.3), "the gap's own edges cross the seam");
});

test('8. the carve flags are saved with the grid; an older save without them loads with none', () => {
  const { g, tool } = world();
  rect(g, 20, 20, 80, 80, SURF.fairway, 1);
  tool.setBrushCells(4); tool.rubOut = true; click(tool, 45, 45);
  const save = encodeGrid(g), back = decodeGrid(JSON.parse(JSON.stringify(save)))!;
  assert.ok(save.c, 'a carve layer in the save');
  assert.deepEqual(back.carve, g.carve);
  const { c: _c, ...old } = save;
  const plain = decodeGrid(old)!;
  assert.ok(plain && plain.carve!.every(v => v === 0), 'an old save: nothing carved');
  assert.equal(encodeGrid(makeGrid(0, 0, 4, 4)).c, undefined, 'no carve layer when nothing is carved');
});
