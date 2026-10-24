// Headless tests for the Course brush's cursor (T081, ext/course-cursor): the footprint is exactly the dab's cells, its outline is closed,
// rounded and sits on those cells, the puck is the brush's size on screen, and a still frame makes nothing new. npm test (esbuild + node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CourseCursor, Footprints, dabCells, polyFootprint, puckAxes, type CursorView, type Shape, type SpriteCanvas } from '../src/game/ext/course-cursor';
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc } from '../src/game/ext/course-grid';
import { CELL as BRUSH_CELL, dab, type Mask } from '../src/game/brush';
import { HH, HW } from '../src/game/iso';
import { PaintTool } from '../src/game/paint-tool';

const RADII = [0.5, 0.9, 1, 2, 2.3, 5, 8, 20];
const SPOTS: [number, number][] = [[100.13, 200.07], [100, 200], [100.25, 200.25], [57.49, 32.51], [33.1, 32.3], [512.74, 1024.9]];
const ZOOMS = [0.3, 0.15, 0.05];

/** the world cells (cx, cy) a dab paints on a real course grid, by paintDisc itself, as sorted keys */
function refCells(x: number, y: number, r: number): number[] {
  const g = makeGrid(x - r - 3, y - r - 3, Math.ceil((2 * r + 6) / CELL_T) + 2, Math.ceil((2 * r + 6) / CELL_T) + 2);
  const d = paintDisc(g, x, y, r, SURF.fairway, 1, 0), ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T), out: number[] = [];
  for (let k = 0; k < d.n; k++) { const i = d.idx[k]!, cx = i % g.w; out.push(key(ox + cx, oy + (i - cx) / g.w)); }
  return out.sort((a, b) => a - b);
}
const key = (cx: number, cy: number) => cy * 100000 + cx;
/** the world cells of a footprint shape anchored at cell (ax, ay), as sorted keys */
function shapeCells(s: Shape, ax: number, ay: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.cells.length; i += 2) out.push(key(ax + s.cells[i]!, ay + s.cells[i + 1]!));
  return out.sort((a, b) => a - b);
}

/** a 2D context that does nothing and counts what it is asked to make */
function mockCtx(canvas: { width: number; height: number }) {
  const made = { radial: 0, linear: 0, pattern: 0 }, draws: { img: { width: number; height: number }; t: number[]; args: number[] }[] = [];
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
        default: return () => {};
      }
    },
    set(o, p: string, v) { o[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, made, draws };
}
/** a canvas factory of mock canvases, counting how many it made */
function mockCanvases() {
  const made: SpriteCanvas[] = [];
  const make = (w: number, h: number): SpriteCanvas => { const c = { width: w, height: h, getContext: () => mockCtx(c).ctx }; made.push(c); return c; };
  return { make, made };
}
const view = (z: number, dpr = 1): CursorView => ({ ze: z * dpr, camX: 0, camY: 0, cw: 1600 * dpr, ch: 1000 * dpr, dpr });
/** a Paint tool on its Course brush (kind, radius r) with the cursor at (x, y) */
function brushTool(kind: 'fairway' | 'green' | 'bunker' | 'water' | 'rough', r: number, x: number, y: number): PaintTool {
  const tool = new PaintTool({ setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] });
  tool.course = true; tool.setBrush(kind); tool.setBrushR(r); tool.cursor = { x, y };
  return tool;
}

test('the footprint is exactly the cells the dab paints: course-grid paintDisc and the Paint brush agree, at every radius, spot and zoom', () => {
  for (const r of RADII) for (const [x, y] of SPOTS) {
    const ref = refCells(x, y, r);
    assert.ok(ref.length > 0, `r ${r} at ${x},${y} paints cells`);
    // course-cursor's dab (paintDisc on its scratch grid)
    const dc = dabCells(x, y, r), got: number[] = [];
    for (let i = 0; i < dc.length; i += 2) got.push(key(dc[i]!, dc[i + 1]!));
    assert.deepEqual(got.sort((a, b) => a - b), ref, `dabCells r ${r} at ${x},${y}`);
    // the Paint tool's brush mask (brush.ts dab: what a click paints on main today) covers the same cells
    const m: Mask = new Set(); dab(m, x, y, r);
    assert.equal(BRUSH_CELL, CELL_T);
    assert.deepEqual([...m].map(k => key(k % 8192, Math.floor(k / 8192))).sort((a, b) => a - b), ref, `brush mask r ${r} at ${x},${y}`);
    // the cursor's footprint while drawn at each zoom
    for (const z of ZOOMS) {
      const cur = new CourseCursor({ canvas: mockCanvases().make }), tool = brushTool('fairway', r, x, y);
      cur.draw(mockCtx({ width: 1600, height: 1000 }).ctx, view(z), tool, 1000);
      const s = cur.feet.shape!;
      assert.deepEqual(shapeCells(s, cur.feet.ax, cur.feet.ay), ref, `footprint r ${r} at ${x},${y}, zoom ${z}`);
    }
  }
});

/** even-odd point in ring (x, y pairs) */
function inside(p: Float32Array, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, n = p.length >> 1, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i]!, yi = p[2 * i + 1]!, xj = p[2 * j]!, yj = p[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

test('the wireframe outline is closed, rounded and sits exactly on the dab cells', () => {
  for (const surf of [SURF.fairway, SURF.green, SURF.bunker, SURF.water, SURF.rough, SURF.tee]) for (const r of RADII) for (const [x, y] of SPOTS.slice(0, 4)) {
    const f = new Footprints(), s = f.at(x, y, r, surf), what = `surf ${surf} r ${r} at ${x},${y}`;
    assert.equal(s.rings.length, 1, `${what}: one ring`);
    const p = s.rings[0]!, n = p.length >> 1;
    assert.equal(s.sign[0], 1, `${what}: an outer ring`);
    assert.ok(n >= 16, `${what}: a smooth ring (${n} points)`);
    // closed: the last point joins the first with a segment no longer than the others, and the ring encloses the cells' area
    let maxSeg = 0, area = 0;
    for (let i = 0; i < n - 1; i++) maxSeg = Math.max(maxSeg, Math.hypot(p[2 * i + 2]! - p[2 * i]!, p[2 * i + 3]! - p[2 * i + 1]!));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!; }
    const closing = Math.hypot(p[0]! - p[2 * n - 2]!, p[1]! - p[2 * n - 1]!), cellArea = (s.cells.length / 2) * CELL_T * CELL_T;
    assert.ok(closing <= maxSeg + 1e-9, `${what}: closed (closing segment ${closing.toFixed(3)}, longest ${maxSeg.toFixed(3)})`);
    assert.ok(Math.abs(area / 2 - cellArea) < 0.12 * cellArea + 0.06, `${what}: area ${(area / 2).toFixed(2)} vs the cells' ${cellArea.toFixed(2)} tiles²`);
    // rounded: no sharp corner anywhere (every turn under 35 degrees)
    let maxTurn = 0;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const ux = p[2 * i]! - p[2 * a]!, uy = p[2 * i + 1]! - p[2 * a + 1]!, vx = p[2 * b]! - p[2 * i]!, vy = p[2 * b + 1]! - p[2 * i + 1]!;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); if (lu < 1e-6 || lv < 1e-6) continue;
      maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))));
    }
    assert.ok(maxTurn < (35 * Math.PI) / 180, `${what}: rounded (sharpest turn ${(maxTurn * 180 / Math.PI).toFixed(1)} degrees)`);
    // on the cells: every dab cell's centre lies inside, every cell next to the dab lies outside
    const cells = new Set<number>();
    for (let i = 0; i < s.cells.length; i += 2) cells.add(key(s.cells[i]! + 1000, s.cells[i + 1]! + 1000));
    for (let i = 0; i < s.cells.length; i += 2) {
      const dx = s.cells[i]!, dy = s.cells[i + 1]!;
      assert.ok(inside(p, (dx + 0.5) * CELL_T, (dy + 0.5) * CELL_T), `${what}: cell ${dx},${dy} inside`);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (cells.has(key(dx + ox + 1000, dy + oy + 1000))) continue;
        assert.ok(!inside(p, (dx + ox + 0.5) * CELL_T, (dy + oy + 0.5) * CELL_T), `${what}: neighbour ${dx + ox},${dy + oy} outside`);
      }
    }
  }
});

test('a small dab at a cell corner is a rounded iso square on its four cells', () => {
  const s = new Footprints().at(100, 200, 0.5, SURF.fairway), p = s.rings[0]!;
  assert.equal(s.cells.length / 2, 4, 'four cells');
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, corner = Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!);
    corner = Math.min(corner, Math.hypot(p[i]! - -0.5, p[i + 1]! - -0.5));
  }
  // the four cells span -0.5..0.5 tiles round the anchor's corner: the outline hugs that square's sides within 0.1 tile...
  for (const [v, want] of [[x0, -0.5], [x1, 0.5], [y0, -0.5], [y1, 0.5]] as const) assert.ok(Math.abs(v - want) < 0.1, `side ${v.toFixed(3)} near ${want}`);
  // ...and rounds its corners off
  assert.ok(corner > 0.08, `the corner is rounded (${corner.toFixed(3)} tiles in)`);
});

test('the puck is the brush size on screen: its ellipse is the brush circle seen in iso, at every zoom and dpr', () => {
  for (const [r, z, dpr] of [[5, 0.3, 1], [2, 0.15, 1], [0.5, 0.3, 2], [8, 0.3, 2], [20, 0.3, 1], [4, 0.05, 1]] as const) {
    const ze = z * dpr, { rx, ry } = puckAxes(r, ze);
    // the brush circle's screen extents, sampled
    let sx = 0, sy = 0;
    for (let k = 0; k < 3600; k++) { const a = (k / 3600) * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a); sx = Math.max(sx, Math.abs((x - y) * HW * ze)); sy = Math.max(sy, Math.abs((x + y) * HH * ze)); }
    assert.ok(Math.abs(rx - sx) < 1e-3 * rx + 1e-6 && Math.abs(ry - sy) < 1e-3 * ry + 1e-6, `r ${r} z ${z}: axes ${rx.toFixed(2)} x ${ry.toFixed(2)} vs ${sx.toFixed(2)} x ${sy.toFixed(2)}`);
    // the drawn sprite's top face spans exactly 2 rx (the sprite is bucketed, then scaled to the exact size)
    const cv = mockCanvases(), cur = new CourseCursor({ canvas: cv.make }), m = mockCtx({ width: 1600 * dpr, height: 1000 * dpr });
    cur.draw(m.ctx, view(z, dpr), brushTool('fairway', r, 300.2, 400.7), 1000);
    assert.ok(Math.abs(cur.last.rx - rx) < 1e-9, 'the cursor sizes the puck by the brush');
    if (rx < 6 * dpr) { assert.equal(m.draws.length, 0, 'a puck too small to read is a ring, not a sprite'); continue; }
    const spr = m.draws.find(dr => dr.img === cv.made[0])!;
    assert.ok(spr, 'the sprite is drawn');
    const pad = Math.ceil(3 * dpr + 2), sr = (spr.img.width - 2 * pad) / 2, k = spr.t[0]!;
    assert.ok(Math.abs(2 * sr * k - 2 * rx) <= k + 0.5, `r ${r} z ${z} dpr ${dpr}: top face ${(2 * sr * k).toFixed(1)} px vs ${(2 * rx).toFixed(1)}`);
  }
});

test('a still frame makes nothing new: no dab, outline, sprite, gradient, pattern or canvas after the first', () => {
  const cv = mockCanvases(), cur = new CourseCursor({ canvas: cv.make }), m = mockCtx({ width: 1600, height: 1000 }), tool = brushTool('fairway', 5, 120.3, 80.6), v = view(0.3);
  cur.draw(m.ctx, v, tool, 1000);
  const first = { ...m.made, canvases: cv.made.length, sprites: cur.stats.sprites, gradients: cur.stats.gradients, dabs: cur.feet.dabs, contours: cur.feet.contours, shape: cur.feet.shape };
  assert.equal(first.sprites, 1); assert.equal(first.canvases, 2, 'the puck and its shadow');
  for (let f = 1; f <= 300; f++) cur.draw(m.ctx, v, tool, 1000 + f * 16.7);
  assert.equal(cv.made.length, first.canvases, 'no new canvas');
  assert.equal(cur.stats.sprites, first.sprites, 'no new sprite');
  assert.equal(cur.stats.gradients, first.gradients, 'no new grid gradient');
  assert.equal(m.made.radial, first.radial); assert.equal(m.made.linear, first.linear); assert.equal(m.made.pattern, first.pattern);
  assert.equal(cur.feet.dabs, first.dabs, 'the dab ran once'); assert.equal(cur.feet.contours, first.contours, 'contoured once');
  assert.equal(cur.feet.shape, first.shape, 'the same shape object');
  // a zoom within the sprite's 6% bucket keeps the sprite; moving by whole cells keeps the shape (the dab re-runs, the outline does not)
  cur.draw(m.ctx, view(0.3 * 1.004), tool, 7000);
  assert.equal(cur.stats.sprites, first.sprites, 'same bucket, same sprite');
  tool.cursor = { x: 120.3 + 3, y: 80.6 - 1.5 };
  cur.draw(m.ctx, v, tool, 7020);
  assert.equal(cur.feet.dabs, first.dabs + 1); assert.equal(cur.feet.contours, first.contours, 'a whole-cell move reuses the outline');
  assert.equal(cur.feet.shape, first.shape);
});

test('a big dab re-contours at most every 45 ms while it moves, and is exact again once the cursor rests', () => {
  const cur = new CourseCursor({ canvas: mockCanvases().make }), m = mockCtx({ width: 1600, height: 1000 }), tool = brushTool('rough', 20, 300.2, 400.3), v = view(0.3);
  cur.draw(m.ctx, v, tool, 1000);
  assert.equal(cur.feet.contours, 1);
  tool.cursor = { x: 300.37, y: 400.41 }; cur.draw(m.ctx, v, tool, 1016);
  tool.cursor = { x: 300.52, y: 400.58 }; cur.draw(m.ctx, v, tool, 1033);
  assert.equal(cur.feet.contours, 1, 'moving: the last outline rides along');
  cur.draw(m.ctx, v, tool, 1050);
  assert.equal(cur.feet.contours, 2, 'resting: contoured again');
  assert.deepEqual(shapeCells(cur.feet.shape!, cur.feet.ax, cur.feet.ay), refCells(300.52, 400.58, 20), 'and exact');
});

test('a click squashes the puck, flashes the footprint and splashes; the OS cursor hides only on the Course brush', () => {
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
  // the cursor style: none over the map on the Course brush (when the engine draws the puck), back elsewhere
  assert.equal(tool.cursorStyle, 'crosshair', 'no puck cursor until the engine turns it on');
  tool.puckCursor = true;
  assert.equal(tool.cursorStyle, 'none');
  tool.setMode('draw');
  assert.equal(tool.cursorStyle, 'crosshair');
  assert.equal(cur.draw(m.ctx, v, tool, 3000), false, 'no puck outside the brush');
});

test('on the golf course grid (T078) the footprint is exactly the cells a real dab changes, and a rub out takes only its own surface', () => {
  // a grid of empty cells with a green in the middle; the land east of x = 102 is not yours
  const g = makeGrid(80, 180, 80, 80);
  paintDisc(g, 100, 200, 1.2, SURF.green, 1, 0);
  const tool = new PaintTool({ setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, grid: () => g, gridChanged() {}, ownedAt: (x: number) => x < 102 });
  tool.course = true; tool.setBrush('fairway'); tool.setBrushR(3); tool.cursor = { x: 100.13, y: 200.07 };
  const cur = new CourseCursor({ canvas: mockCanvases().make, refuse: () => tool.brushSkip(), rev: () => g.rev * 64 + tool.brushHole * 2 + (tool.rubOut ? 1 : 0) });
  const m = mockCtx({ width: 1600, height: 1000 }), v = view(0.3);
  /** the footprint now, as sorted world cell keys */
  const foot = () => { cur.draw(m.ctx, v, tool, 1000); return shapeCells(cur.feet.shape!, cur.feet.ax, cur.feet.ay); };
  /** the cells whose surface a press and release at the cursor changes, as sorted world cell keys */
  const changed = () => {
    const before = g.surf.slice(), out: number[] = [];
    tool.pointerDown(tool.cursor!, 0, 0); tool.pointerUp(0.5);
    for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) { const cx = i % g.w; out.push(key(Math.round(g.x0 / CELL_T) + cx, Math.round(g.y0 / CELL_T) + (i - cx) / g.w)); }
    return out.sort((a, b) => a - b);
  };
  const f1 = foot(), whole = refCells(100.13, 200.07, 3);
  assert.ok(cur.feet.grid, 'the footprint follows the grid rules');
  assert.ok(f1.length > 20 && f1.length < whole.length, `it skips the green and the land that is not yours (${f1.length} of ${whole.length} cells)`);
  assert.deepEqual(f1, changed(), 'the footprint is exactly the cells the dab painted');
  // painting changed the grid: the footprint re-runs, and over its own fairway it keeps every cell (the dab still covers them)
  assert.deepEqual(foot(), f1, 'over its own surface the footprint stays whole');
  // rub out: only this hole's fairway cells, which is what the rub changes
  tool.rubOut = true; tool.cursor = { x: 99.4, y: 201.3 };
  const f2 = foot();
  assert.ok(f2.length > 0 && f2.every(k => f1.includes(k)), 'a rub out only takes fairway cells');
  assert.deepEqual(f2, changed(), 'the rub-out footprint is exactly the cells the rub changed');
  // a cart path paints areas, not cells: no grid rules
  tool.rubOut = false; tool.setBrush('path'); foot();
  assert.equal(cur.feet.grid, false);
});

test('a course piece: its footprint is the cells fillPolygon lays for its layers, outlined on them', () => {
  const kidney = [100, 200, 106, 199.5, 109, 203, 105, 207.2, 101.3, 206, 99.2, 203.4], pot = [110.2, 201, 112.6, 201.3, 112.1, 203.7, 110.4, 203.2];
  const { shape, ax, ay } = polyFootprint([kidney, pot]);
  const g = makeGrid(90, 190, 60, 60), toPts = (P: number[]) => { const o: { x: number; y: number }[] = []; for (let i = 0; i < P.length; i += 2) o.push({ x: P[i]!, y: P[i + 1]! }); return o; };
  fillPolygon(g, toPts(kidney), 1, 0, 0); fillPolygon(g, toPts(pot), 1, 0, 0);
  const ref: number[] = [], ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i]) { const cx = i % g.w; ref.push(key(ox + cx, oy + (i - cx) / g.w)); }
  assert.deepEqual(shapeCells(shape, ax, ay), ref.sort((a, b) => a - b), 'the same cells as the piece lays');
  assert.equal(shape.rings.length, 2, 'two blobs, two rings');
  for (let i = 0; i < shape.cells.length; i += 2) {
    const x = (shape.cells[i]! + 0.5) * CELL_T, y = (shape.cells[i + 1]! + 0.5) * CELL_T;
    assert.ok(shape.rings.some(p => inside(p, x, y)), 'every laid cell lies inside its outline');
  }
});
