// Headless tests for the brush's cursor (T081, redone in T108 and T109; ext/course-cursor): the footprint is exactly the cells a click paints,
// on the 1 m mini grid (the round brush on the nearest cell corner, the square brush of 1 to 4 cells, 2 x 2 being one town square), its edge is
// the cells' own outline, the chip is small and beside the pointer, the pointer stays, a still frame makes nothing new, the painted cells equal
// the footprint through the Paint tool (with the brush rules, the skipped cells and their reasons), a drag leaves no gap, and the price is
// live. npm test (esbuild + node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIP_CSS, CourseCursor, Footprints, cellOutline, dabCells, polyFootprint, snapDab, squareStart, type CursorView, type Shape, type SpriteCanvas } from '../src/game/ext/course-cursor';
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { CELL as BRUSH_CELL, dab, type Mask } from '../src/game/brush';
import { PaintTool } from '../src/game/paint-tool';
import { unitBuildCost } from '../src/game/golf/costs';

const RADII = [0.5, 0.9, 1, 2, 2.3, 5, 8, 20];
const SPOTS: [number, number][] = [[100.13, 200.07], [100, 200], [100.25, 200.25], [57.49, 32.51], [33.1, 32.3], [512.74, 1024.9]];
const ZOOMS = [0.3, 0.15, 0.06];

const key = (cx: number, cy: number) => cy * 100000 + cx;
/** the world cells (cx, cy) a dab paints on a real course grid, by paintDisc itself, as sorted keys */
function refCells(x: number, y: number, r: number): number[] {
  const g = makeGrid(x - r - 3, y - r - 3, Math.ceil((2 * r + 6) / CELL_T) + 2, Math.ceil((2 * r + 6) / CELL_T) + 2);
  const d = paintDisc(g, x, y, r, SURF.fairway, 1, 0), ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T), out: number[] = [];
  for (let k = 0; k < d.n; k++) { const i = d.idx[k]!, cx = i % g.w; out.push(key(ox + cx, oy + (i - cx) / g.w)); }
  return out.sort((a, b) => a - b);
}
/** the world cells of a footprint shape anchored at cell (ax, ay), as sorted keys */
function shapeCells(s: Shape, ax: number, ay: number, skip = false): number[] {
  const out: number[] = [], c = skip ? s.skip : s.cells;
  for (let i = 0; i < c.length; i += 2) out.push(key(ax + c[i]!, ay + c[i + 1]!));
  return out.sort((a, b) => a - b);
}
/** the n x n square's world cells from start cell (ix, iy) */
function squareCells(ix: number, iy: number, n: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push(key(ix + x, iy + y));
  return out.sort((a, b) => a - b);
}

/** a 2D context that does nothing and counts what it is asked to make */
function mockCtx(canvas: { width: number; height: number }) {
  const made = { radial: 0, linear: 0, pattern: 0 }, draws: { img: { width: number; height: number }; t: number[]; args: number[] }[] = [], texts: string[] = [];
  let t = [1, 0, 0, 1, 0, 0];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas } as Record<string, unknown>, {
    get(o, p: string) {
      if (p in o) return o[p];
      switch (p) {
        case 'createRadialGradient': return () => { made.radial++; return grad; };
        case 'createLinearGradient': return () => { made.linear++; return grad; };
        case 'createPattern': return () => { made.pattern++; return null; };
        case 'setTransform': return (...a: number[]) => { t = a; };
        case 'drawImage': return (img: { width: number; height: number }, ...args: number[]) => { draws.push({ img, t: t.slice(), args }); };
        case 'measureText': return (s: string) => ({ width: s.length * 6 });
        case 'fillText': return (s: string) => { texts.push(s); };
        default: return () => {};
      }
    },
    set(o, p: string, v) { o[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, made, draws, texts };
}
/** a canvas factory of mock canvases, counting how many it made */
function mockCanvases() {
  const made: SpriteCanvas[] = [];
  const make = (w: number, h: number): SpriteCanvas => { const c = { width: w, height: h, getContext: () => mockCtx(c).ctx }; made.push(c); return c; };
  return { make, made };
}
const view = (z: number, dpr = 1): CursorView => ({ ze: z * dpr, camX: 0, camY: 0, cw: 1600 * dpr, ch: 1000 * dpr, dpr });
const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
/** a Paint tool on its Course brush (kind, radius r) with the cursor at (x, y): no course grid, so the round brush */
function brushTool(kind: 'fairway' | 'green' | 'bunker' | 'water' | 'rough', r: number, x: number, y: number): PaintTool {
  const tool = new PaintTool({ ...HOST });
  tool.course = true; tool.setBrush(kind); tool.setBrushR(r); tool.cursor = { x, y };
  return tool;
}
/** a golf game's Paint tool on a course grid g (land east of x = ownX is not yours), and a cursor wired to it as the engine wires it */
function golfTool(g: Grid, ownX = Infinity, money = { cash: 1e6 }) {
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, ownedAt: (x: number) => x < ownX, money: () => money.cash, spend: (n: number) => { money.cash -= n; } });
  tool.course = true; tool.setBrush('fairway');
  const cur = new CourseCursor({ canvas: mockCanvases().make, why: () => tool.brushSkipWhy(), cost: () => tool.brushCellCost(), rev: () => g.rev * 64 + tool.brushHole * 2 + (tool.rubOut ? 1 : 0) });
  return { tool, cur, money };
}
/** the cells whose surface a press and release at the tool's cursor changes, as sorted world cell keys */
function clickChanges(g: Grid, tool: PaintTool): number[] {
  const before = g.surf.slice(), out: number[] = [];
  tool.pointerDown(tool.cursor!, 0, 0); tool.pointerUp(0.5);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) { const cx = i % g.w; out.push(key(Math.round(g.x0 / CELL_T) + cx, Math.round(g.y0 / CELL_T) + (i - cx) / g.w)); }
  return out.sort((a, b) => a - b);
}

// ---- the footprint ----

test('the round brush: the footprint is exactly the cells the dab paints, on the half grid nearest cell corner, at every radius, spot and zoom', () => {
  for (const r of RADII) for (const [x, y] of SPOTS) {
    // course-cursor's dab helper and the Paint tool's brush mask agree with paintDisc at any point
    const ref = refCells(x, y, r), dc = dabCells(x, y, r), got: number[] = [];
    for (let i = 0; i < dc.length; i += 2) got.push(key(dc[i]!, dc[i + 1]!));
    assert.deepEqual(got.sort((a, b) => a - b), ref, `dabCells r ${r} at ${x},${y}`);
    const m: Mask = new Set(); dab(m, x, y, r);
    assert.equal(BRUSH_CELL, CELL_T);
    assert.deepEqual([...m].map(k => key(k % 8192, Math.floor(k / 8192))).sort((a, b) => a - b), ref, `brush mask r ${r} at ${x},${y}`);
    // the cursor shows the dab where a click lays it: on the nearest cell corner (T108)
    const snapped = refCells(snapDab(x), snapDab(y), r);
    for (const z of ZOOMS) {
      const cur = new CourseCursor({ canvas: mockCanvases().make }), tool = brushTool('fairway', r, x, y);
      cur.draw(mockCtx({ width: 1600, height: 1000 }).ctx, view(z), tool, 1000);
      assert.deepEqual(shapeCells(cur.feet.shape!, cur.feet.ax, cur.feet.ay), snapped, `footprint r ${r} at ${x},${y}, zoom ${z}`);
    }
  }
});

/** even-odd point in the loops (x, y pairs) */
function inside(loops: Float32Array[], x: number, y: number): boolean {
  let c = false;
  for (const p of loops) for (let i = 0, n = p.length >> 1, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i]!, yi = p[2 * i + 1]!, xj = p[2 * j]!, yj = p[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** checks loops outline exactly the cells: closed rings of axis-aligned edges on the cell lattice, their area the cells' area, every cell's
 *  centre inside and every neighbour's outside */
function outlinesExactly(loops: Float32Array[], cells: Int16Array, what: string) {
  let area = 0;
  for (const p of loops) {
    const n = p.length >> 1;
    assert.ok(n >= 4, `${what}: a ring of at least 4 corners`);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x = p[2 * i]!, y = p[2 * i + 1]!, x1 = p[2 * j]!, y1 = p[2 * j + 1]!;
      assert.ok(x === x1 || y === y1, `${what}: edges run along the grid`);
      assert.equal(Math.round(x / CELL_T) * CELL_T, x, `${what}: corners on the half grid`);
      assert.equal(Math.round(y / CELL_T) * CELL_T, y);
      area += x * y1 - x1 * y;
    }
  }
  const set = new Set<number>();
  for (let i = 0; i < cells.length; i += 2) set.add(key(cells[i]! + 1000, cells[i + 1]! + 1000));
  assert.ok(Math.abs(Math.abs(area / 2) - set.size * CELL_T * CELL_T) < 1e-9 || loops.length > 1, `${what}: the outline holds the cells' area`);
  for (let i = 0; i < cells.length; i += 2) {
    const dx = cells[i]!, dy = cells[i + 1]!;
    assert.ok(inside(loops, (dx + 0.5) * CELL_T, (dy + 0.5) * CELL_T), `${what}: cell ${dx},${dy} inside`);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (set.has(key(dx + ox + 1000, dy + oy + 1000))) continue;
      assert.ok(!inside(loops, (dx + ox + 0.5) * CELL_T, (dy + oy + 0.5) * CELL_T), `${what}: neighbour ${dx + ox},${dy + oy} outside`);
    }
  }
}

test('the footprint edge is the cells own outline on the half grid: closed, along cell edges, holding exactly the cells', () => {
  for (const r of RADII) for (const [x, y] of SPOTS.slice(0, 4)) {
    const f = new Footprints(), s = f.at(snapDab(x), snapDab(y), r, SURF.fairway);
    assert.equal(s.loops.length, 1, `r ${r}: one ring`);
    outlinesExactly(s.loops, s.cells, `r ${r} at ${x},${y}`);
  }
  // two blobs, a blob with a hole, and two cells touching only at a corner
  const two = Int16Array.of(0, 0, 1, 0, 5, 5), ring: number[] = [], diag = Int16Array.of(0, 0, 1, 1);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) ring.push(x, y);
  outlinesExactly(cellOutline(two), two, 'two blobs');
  assert.equal(cellOutline(two).length, 2);
  const holed = Int16Array.from(ring), hl = cellOutline(holed);
  assert.equal(hl.length, 2, 'the ring and its hole'); outlinesExactly(hl, holed, 'a hole');
  outlinesExactly(cellOutline(diag), diag, 'touching at a corner');
  // straight runs are merged: a 2 x 2 square is four corners
  assert.equal(cellOutline(Int16Array.of(0, 0, 1, 0, 0, 1, 1, 1))[0]!.length, 8);
});

test('a small round dab at a cell corner is the 2 x 2 square of its four cells', () => {
  const s = new Footprints().at(100, 200, 0.5, SURF.fairway);
  assert.equal(s.cells.length / 2, 4);
  assert.deepEqual([...s.loops[0]!].map(v => Math.abs(v)).sort(), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
});

test('the square brush (T109): 1 cell, 2 x 2 (exactly one town square, on the road tiles), 3 x 3 and 4 x 4, snapped cell by cell', () => {
  for (const n of [1, 2, 3, 4]) for (const [x, y] of SPOTS) {
    const ix = squareStart(x, n), iy = squareStart(y, n), want = squareCells(ix, iy, n);
    const f = new Footprints(), s = f.at(x, y, 3, SURF.fairway, null, 0, null, n);
    assert.deepEqual(shapeCells(s, f.ax, f.ay), want, `${n} x ${n} at ${x},${y}`);
    assert.equal(s.loops.length, 1); assert.equal(s.loops[0]!.length, 8, 'a square: four corners');
    // the pointer lies in (an odd size) or in the town square of (an even size) the square
    const x0 = ix * CELL_T, x1 = (ix + n) * CELL_T;
    assert.ok(x0 <= x + 1e-9 && x < x1 + (n % 2 ? 0 : 0.5), `${n}: under the pointer`);
    if (n === 1) assert.deepEqual(want, [key(Math.floor(x / CELL_T), Math.floor(y / CELL_T))], 'one cell: the cell under the pointer');
    if (n === 2) { assert.equal(x0, Math.floor(x)); assert.equal(x1, Math.floor(x) + 1); assert.equal(iy * CELL_T, Math.floor(y)); }
    if (n === 4) { assert.equal(x0 % 1, 0, '4 x 4: two by two town squares'); assert.equal((iy * CELL_T) % 1, 0); }
  }
  // moving inside the same cell (or town square) keeps the footprint; it moves cell by cell
  const f = new Footprints(), a = f.at(100.05, 200.05, 1, SURF.fairway, null, 0, null, 1), dabs = f.dabs;
  f.at(100.45, 200.4, 1, SURF.fairway, null, 0, null, 1);
  assert.equal(f.dabs, dabs, 'the same cell: no new dab'); assert.equal(f.shape, a);
  f.at(100.55, 200.4, 1, SURF.fairway, null, 0, null, 1);
  assert.equal(f.ax, Math.floor(100.55 / CELL_T), 'the next cell');
});

// ---- the chip ----

test('the chip is small and beside the pointer: the same size at every zoom and dpr, to its lower right, never over the painted spot', () => {
  for (const [z, dpr] of [[0.3, 1], [0.15, 1], [0.06, 1], [0.3, 2], [0.06, 2]] as const) {
    const cv = mockCanvases(), cur = new CourseCursor({ canvas: cv.make }), m = mockCtx({ width: 1600 * dpr, height: 1000 * dpr }), v = view(z, dpr);
    const tool = brushTool('fairway', 6, 10, 12);
    cur.draw(m.ctx, v, tool, 1000);
    assert.equal(cur.last.rx * 2, CHIP_CSS * dpr, `z ${z} dpr ${dpr}: ${CHIP_CSS} css px across`);
    assert.ok(CHIP_CSS >= 36 && CHIP_CSS <= 48);
    const px = (10 - 12) * 64 * v.ze + v.cw / 2, py = (10 + 12) * 32 * v.ze + v.ch / 2;
    assert.ok(cur.last.x - px > cur.last.rx && cur.last.y > py, 'to the lower right of the pointer, clear of it');
    const spr = m.draws.find(dr => dr.img === cv.made[0])!;
    assert.ok(spr && spr.t[0] === 1 && spr.t[3] === 1, 'drawn at its own pixels (no scaling)');
  }
  // near the screen's right edge it flips to the pointer's left
  const cur = new CourseCursor({ canvas: mockCanvases().make }), v = view(0.3), tool = brushTool('fairway', 2, 0, 0);
  tool.cursor = { x: 20, y: -20 }; // far right on screen
  const px = (20 - -20) * 64 * 0.3 + 800;
  assert.ok(px > 1550, 'the pointer is near the right edge');
  cur.draw(mockCtx({ width: 1600, height: 1000 }).ctx, v, tool, 1000);
  assert.ok(cur.last.x < px, 'flipped to the left');
});

test('a still frame makes nothing new: no dab, outline, sprite, gradient, pattern or canvas after the first', () => {
  const cv = mockCanvases(), cur = new CourseCursor({ canvas: cv.make }), m = mockCtx({ width: 1600, height: 1000 }), tool = brushTool('fairway', 5, 120.3, 80.6), v = view(0.3);
  cur.draw(m.ctx, v, tool, 1000);
  const first = { ...m.made, canvases: cv.made.length, sprites: cur.stats.sprites, gradients: cur.stats.gradients, dabs: cur.feet.dabs, contours: cur.feet.contours, shape: cur.feet.shape };
  assert.equal(first.sprites, 1); assert.equal(first.canvases, 2, 'the chip and its shadow');
  for (let f = 1; f <= 300; f++) cur.draw(m.ctx, v, tool, 1000 + f * 16.7);
  assert.equal(cv.made.length, first.canvases, 'no new canvas');
  assert.equal(cur.stats.sprites, first.sprites, 'no new sprite');
  assert.equal(cur.stats.gradients, first.gradients, 'no new grid gradient');
  assert.equal(m.made.radial, first.radial); assert.equal(m.made.linear, first.linear); assert.equal(m.made.pattern, first.pattern);
  assert.equal(cur.feet.dabs, first.dabs, 'the dab ran once'); assert.equal(cur.feet.contours, first.contours, 'outlined once');
  assert.equal(cur.feet.shape, first.shape, 'the same shape object');
  // a zoom keeps the chip (its size never changes); moving inside the cell runs nothing; a whole-cell move reuses the outline
  cur.draw(m.ctx, view(0.1), tool, 7000);
  assert.equal(cur.stats.sprites, first.sprites, 'any zoom, the same chip');
  tool.cursor = { x: 120.4, y: 80.7 }; cur.draw(m.ctx, v, tool, 7010);
  assert.equal(cur.feet.dabs, first.dabs, 'inside the cell: no dab');
  tool.cursor = { x: 120.3 + 3, y: 80.6 - 1.5 };
  cur.draw(m.ctx, v, tool, 7020);
  assert.equal(cur.feet.dabs, first.dabs + 1); assert.equal(cur.feet.contours, first.contours, 'a whole-cell move reuses the outline');
  assert.equal(cur.feet.shape, first.shape);
});

test('a click squashes the chip and splashes; the pointer stays a normal pointer', () => {
  const cv = mockCanvases(), cur = new CourseCursor({ canvas: cv.make }), m = mockCtx({ width: 1600, height: 1000 }), tool = brushTool('bunker', 3, 50.5, 60.5), v = view(0.3);
  for (let f = 0; f < 30; f++) cur.draw(m.ctx, v, tool, 1000 + f * 16);
  const before = m.draws.length;
  cur.press(tool, false, 1500); cur.draw(m.ctx, v, tool, 1540);
  const spr = m.draws.slice(before).find(dr => dr.img === cv.made[0])!;
  assert.ok(spr.t[0]! / spr.t[3]! > 1.05, 'squashed: wider than tall about its foot');
  cur.release(1600);
  for (let f = 0; f < 60; f++) cur.draw(m.ctx, v, tool, 1600 + f * 16);
  const after = m.draws.slice(-1)[0]!;
  assert.ok(Math.abs(after.t[0]! / after.t[3]! - 1) < 0.01, 'settled back to round');
  tool.puckCursor = true;
  assert.equal(tool.cursorStyle, 'crosshair', 'the OS pointer is never hidden (T108)');
  tool.setMode('draw');
  assert.equal(cur.draw(m.ctx, v, tool, 3000), false, 'no chip outside the brush');
});

// ---- on the golf course grid: what a click paints ----

test('on the golf course grid the footprint is exactly the cells a click paints: every square size and the round brush, skips and their reasons', () => {
  // a grid of empty cells with a green in the middle; the land east of x = 102 is not yours
  const g = makeGrid(80, 180, 80, 80);
  paintDisc(g, 100, 200, 1.2, SURF.green, 1, 0);
  const { tool, cur } = golfTool(g, 102), m = mockCtx({ width: 1600, height: 1000 }), v = view(0.3);
  const foot = () => { cur.draw(m.ctx, v, tool, 1000); return shapeCells(cur.feet.shape!, cur.feet.ax, cur.feet.ay); };
  assert.equal(tool.brushCells, 1, 'the default brush is one cell');
  for (const n of [1, 2, 3, 4, 0]) for (const [x, y] of [[96.3, 196.8], [101.6, 199.2], [99.9, 200.4], [90.2, 210.7]] as const) {
    tool.setBrushCells(n); tool.setBrushR(3); tool.cursor = { x, y }; tool.rubOut = false;
    const f1 = foot();
    assert.ok(cur.feet.grid, 'the footprint follows the grid rules');
    assert.deepEqual(f1, clickChanges(g, tool), `${n || 'round'} at ${x},${y}: the footprint is exactly the cells the click painted`);
    if (n) assert.ok(f1.length <= n * n);
    // painted: the footprint re-runs and still holds those cells (over its own surface)
    assert.deepEqual(foot(), f1, 'over its own surface the footprint stays whole');
    tool.undo();
  }
  // a big round dab over the green and the land line skips cells, each with its reason: the main one is shown
  tool.setBrushCells(0); tool.setBrushR(3); tool.cursor = { x: 100.13, y: 200.07 };
  foot();
  const s = cur.feet.shape!;
  assert.ok(s.skip.length > 0 && s.cells.length > 20, 'some cells painted, some skipped');
  assert.ok(['Green stays on top', 'Not your land'].includes(s.why), `the reason: ${s.why}`);
  assert.ok(m.texts.includes(s.why), 'the reason is shown by the chip');
  const notMine = shapeCells(s, cur.feet.ax, cur.feet.ay, true).filter(k => (k % 100000) * CELL_T >= 102);
  assert.ok(notMine.length > 0, 'the cells past the land line are among the skipped');
  // rub out: only this hole's fairway, which is what the rub changes; nothing shown in red
  tool.pointerDown(tool.cursor!, 0, 0); tool.pointerUp(0.5);
  tool.rubOut = true; tool.cursor = { x: 99.4, y: 201.3 };
  const f2 = foot();
  assert.ok(f2.length > 0);
  assert.deepEqual(f2, clickChanges(g, tool), 'the rub-out footprint is exactly the cells the rub changed');
  // a cart path paints areas, not cells: no grid rules
  tool.rubOut = false; tool.setBrush('path'); foot();
  assert.equal(cur.feet.grid, false);
});

test('a drag with the one-cell brush paints a run of cells with no gap, not even a corner, at 30% and 15% zoom', () => {
  for (const z of [0.3, 0.15]) {
    const g = makeGrid(80, 180, 80, 80), { tool } = golfTool(g);
    const before = g.surf.slice(), a = { x: 100.2, y: 200.2 }, b = { x: 104.7, y: 203.4 };
    tool.pointerDown(a, 0, 0);
    // the pointer jumps a few cells a frame, as a quick drag at this zoom does
    const steps = Math.ceil(12 * z / 0.3);
    for (let k = 1; k <= steps; k++) tool.pointerMove({ x: a.x + (b.x - a.x) * k / steps, y: a.y + (b.y - a.y) * k / steps }, 0, 0);
    tool.pointerUp(0.5);
    const cells = new Set<number>();
    for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) { const cx = i % g.w; cells.add(key(Math.round(g.x0 / CELL_T) + cx, Math.round(g.y0 / CELL_T) + (i - cx) / g.w)); }
    const s0 = key(Math.floor(a.x / CELL_T), Math.floor(a.y / CELL_T)), s1 = key(Math.floor(b.x / CELL_T), Math.floor(b.y / CELL_T));
    assert.ok(cells.has(s0) && cells.has(s1), `z ${z}: the first and last cells`);
    const dx = Math.abs(Math.floor(b.x / CELL_T) - Math.floor(a.x / CELL_T)), dy = Math.abs(Math.floor(b.y / CELL_T) - Math.floor(a.y / CELL_T));
    assert.equal(cells.size, dx + dy + 1, `z ${z}: one cell wide, edge to edge`);
    // edge-connected from the first cell
    const seen = new Set([s0]), todo = [s0];
    while (todo.length) { const c = todo.pop()!; for (const n of [c + 1, c - 1, c + 100000, c - 100000]) if (cells.has(n) && !seen.has(n)) { seen.add(n); todo.push(n); } }
    assert.equal(seen.size, cells.size, `z ${z}: no gaps`);
  }
});

test('prices per cell, live: the footprint shows its cells and price, and a drag charges each cell once', () => {
  const g = makeGrid(80, 180, 80, 80), money = { cash: 100000 }, { tool, cur } = golfTool(g, Infinity, money), m = mockCtx({ width: 1600, height: 1000 }), v = view(0.3);
  const unit = unitBuildCost('fairway', tool.plantKind);
  assert.ok(unit > 0);
  tool.setBrushCells(2); tool.cursor = { x: 100.3, y: 200.6 };
  cur.draw(m.ctx, v, tool, 1000);
  assert.equal(cur.feet.count, 4); assert.equal(cur.feet.price, 4 * unit);
  assert.ok(m.texts.includes(`4 cells · $${(4 * unit).toLocaleString()}`), `the price pill: ${m.texts.join(' | ')}`);
  // a drag along three town squares: 12 cells charged once each
  tool.pointerDown({ x: 100.3, y: 200.6 }, 0, 0);
  tool.pointerMove({ x: 101.3, y: 200.6 }, 0, 0); tool.pointerMove({ x: 102.4, y: 200.6 }, 0, 0);
  assert.equal(tool.strokeSpent, 12 * unit, 'the run so far');
  tool.pointerUp(0.5);
  assert.equal(money.cash, 100000 - 12 * unit);
  // over cells already painted the price is 0
  tool.cursor = { x: 101.3, y: 200.6 }; cur.draw(m.ctx, v, tool, 2000);
  assert.equal(cur.feet.price, 0);
  // undo gives the money back
  tool.undo(); assert.equal(money.cash, 100000);
});

test('a stamp (an old course piece, now under Advanced): its footprint is the cells fillPolygon lays for its layers, outlined on them', () => {
  const kidney = [100, 200, 106, 199.5, 109, 203, 105, 207.2, 101.3, 206, 99.2, 203.4], pot = [110.2, 201, 112.6, 201.3, 112.1, 203.7, 110.4, 203.2];
  const { shape, ax, ay } = polyFootprint([kidney, pot]);
  const g = makeGrid(90, 190, 60, 60), toPts = (P: number[]) => { const o: { x: number; y: number }[] = []; for (let i = 0; i < P.length; i += 2) o.push({ x: P[i]!, y: P[i + 1]! }); return o; };
  fillPolygon(g, toPts(kidney), 1, 0, 0); fillPolygon(g, toPts(pot), 1, 0, 0);
  const ref: number[] = [], ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i]) { const cx = i % g.w; ref.push(key(ox + cx, oy + (i - cx) / g.w)); }
  assert.deepEqual(shapeCells(shape, ax, ay), ref.sort((a, b) => a - b), 'the same cells as the stamp lays');
  assert.ok(shape.loops.length >= 2, 'two blobs');
  outlinesExactly(shape.loops, shape.cells, 'the stamp');
});
