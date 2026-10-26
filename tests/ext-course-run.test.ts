// Headless tests for Run (T122, plan P23 4.5, P1-G; ext/course-cursor/run.ts, the Paint tool's run on the course grid and the cursor's run
// footprint): a straight run of 40 m by 2 cells lays 80 cells, a bend joins without a gap, Shift keeps a leg straight, a run is one undo step
// (on the same stack as the Props tool's), Esc drops the run first and then leaves, a double-click, Enter or a right-click finishes it while a
// right-drag pans, the footprint and the price are exactly what the finished run lays and charges, the practice area's cells keep no hole,
// and a 200 m run stays under 4 ms. npm test (esbuild + node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CourseCursor, RunFootprint, cellOutline, type CursorView, type SpriteCanvas } from '../src/game/ext/course-cursor';
import { runCells, runLength, runPoint, straightTo, walk } from '../src/game/ext/course-cursor/run';
import { squareStart } from '../src/game/ext/course-cursor/snap';
import { CELL_T, SURF, cellAt, makeGrid, paintDisc, type Grid, type GridDiff } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { PaintTool } from '../src/game/paint-tool';
import { unitBuildCost } from '../src/game/golf/costs';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { defaultRangeBiz } from '../src/game/golf/rangebiz';
import { practiceArea } from '../src/game/golf/practice';
import type { Rect } from '../src/game/golf/mode';

const key = (cx: number, cy: number) => cy * 100000 + cx;
const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
const FAIRWAY = unitBuildCost('fairway', 'seed');

/** a golf game's Paint tool on Run over a course grid of 300 x 300 tiles (your land west of x = ownX), and a cursor wired to it as the engine
 *  wires it; changed: the engine's gridChanged (the range host's practice cells) */
function world(o: { ownX?: number; cash?: number; n?: number; changed?: (g: Grid, d: GridDiff | null) => void; g?: Grid; zone?: (x: number, y: number) => string } = {}) {
  const g = o.g ?? makeGrid(0, 0, 600, 600), money = { cash: o.cash ?? 1e6 }, toasts: string[] = [], ownX = o.ownX ?? Infinity;
  const tool = new PaintTool({
    ...HOST, toast: (t: string) => { toasts.push(t); }, golfMode: () => true, grid: () => g, gridChanged: d => o.changed?.(g, d), gridAreas: () => gridAreas(g),
    ownedAt: (x: number) => x < ownX, landWhy: (x: number) => (x < ownX ? '' : 'off'), money: () => money.cash, spend: (n: number) => { money.cash -= n; },
  });
  tool.course = true; tool.setBrush('fairway'); tool.setBrushCells(o.n ?? 2); tool.setBrushRun(true);
  const cur = new CourseCursor({ canvas: mockCanvases(), why: () => tool.brushSkipWhy(), cost: () => tool.brushCellCost(), rev: () => g.rev * 64 + tool.brushHole * 2 + (tool.rubOut ? 1 : 0), money: () => money.cash, zone: o.zone ?? null });
  return { g, tool, cur, money, toasts };
}
/** a move to tile (x, y) (Shift held or not), then a click there */
function click(tool: PaintTool, x: number, y: number, shift = false) { tool.pointerMove({ x, y }, 0, 0, shift); tool.pointerDown({ x, y }, 0, 0); tool.pointerUp(0.5); }
function press(tool: PaintTool, k: string, o: Partial<KeyboardEvent> = {}): boolean {
  return tool.key({ key: k, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, ...o } as unknown as KeyboardEvent);
}
/** the world cells whose surface differs between two copies of g's surfaces, as sorted keys */
function changed(g: Grid, before: Uint8Array): number[] {
  const out: number[] = [], ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) { const cx = i % g.w; out.push(key(ox + cx, oy + (i - cx) / g.w)); }
  return out.sort((a, b) => a - b);
}
const keysOf = (cells: Int32Array) => { const out: number[] = []; for (let k = 0; k < cells.length; k += 2) out.push(key(cells[k]!, cells[k + 1]!)); return out.sort((a, b) => a - b); };
/** whether a cell set (world cells) is one piece by edges with no pinch: every two cells that touch at a corner share an edge neighbour too */
function gapFree(cells: Int32Array): { connected: boolean; pinched: number } {
  const set = new Set<number>(); for (let k = 0; k < cells.length; k += 2) set.add(key(cells[k]!, cells[k + 1]!));
  const seen = new Set<number>([key(cells[0]!, cells[1]!)]), todo = [[cells[0]!, cells[1]!]];
  while (todo.length) { const [x, y] = todo.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = key(x! + dx!, y! + dy!); if (set.has(k) && !seen.has(k)) { seen.add(k); todo.push([x! + dx!, y! + dy!]); } } }
  let pinched = 0;
  for (let k = 0; k < cells.length; k += 2) {
    const x = cells[k]!, y = cells[k + 1]!;
    for (const dy of [1, -1]) if (set.has(key(x + 1, y + dy)) && !set.has(key(x + 1, y)) && !set.has(key(x, y + dy))) pinched++;
  }
  return { connected: seen.size === set.size, pinched };
}
/** a canvas factory of mock canvases (the chip's sprites) */
function mockCanvases() { return (w: number, h: number): SpriteCanvas => ({ width: w, height: h, getContext: () => mockCtx() }); }
/** a 2D context that does nothing */
function mockCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  return new Proxy({} as Record<string, unknown>, {
    get(o, p: string) { if (p in o) return o[p]; if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => grad; if (p === 'measureText') return (s: string) => ({ width: s.length * 6 }); return () => {}; },
    set(o, p: string, v) { o[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}
const view = (z = 0.3): CursorView => ({ ze: z, camX: 0, camY: 0, cw: 1600, ch: 1000, dpr: 1 });

// ---- the strip ----

test('a straight run of 40 m by 2 cells lays 80 cells: two clicks 38 m apart (their squares make the 40 m), finished with Enter', () => {
  const { g, tool, money } = world();
  const before = g.surf.slice(), cash = money.cash;
  click(tool, 50.3, 60.2);
  click(tool, 69.3, 60.2); // the squares' middles 19 tiles (38 m) apart: the strip runs from the first square's far edge to the last's
  assert.equal(runLength(tool.runPts, 2), 40);
  assert.equal(tool.canUndo, false, 'nothing is laid while the run is drawn');
  assert.equal(press(tool, 'Enter'), true);
  const got = changed(g, before);
  assert.equal(got.length, 80, '40 m by 2 cells');
  // the strip: tiles 50 to 70 on x (cells 100..139), 60 to 61 on y (cells 120, 121)
  const want: number[] = []; for (let cy = 120; cy <= 121; cy++) for (let cx = 100; cx <= 139; cx++) want.push(key(cx, cy));
  assert.deepEqual(got, want.sort((a, b) => a - b));
  assert.equal(g.surf[cellAt(g, 60, 60.25)], SURF.fairway); assert.equal(g.hole[cellAt(g, 60, 60.25)], 1);
  assert.equal(cash - money.cash, 80 * FAIRWAY, 'priced as the brush: each cell at the surface price');
  assert.equal(tool.runPts.length, 0, 'the run is done');
  // runCells alone, every size: an axis run of L m by n cells lays L x n cells
  for (const n of [1, 2, 3, 4]) {
    const a = runPoint(10.2, 20.2, n), b = runPoint(10.2 + 30, 20.2, n), cells = runCells([a.x, a.y, b.x, b.y], n);
    assert.equal(cells.length / 2, runLength([a.x, a.y, b.x, b.y], n) * n, `size ${n}`);
  }
});

test('a bend joins without a gap, at every size, angle and turn: one piece by edges, no pinch at a corner, each bend\'s square laid whole', () => {
  const paths: [number, number][][] = [
    [[20, 20], [40, 20], [40, 35]], // an L
    [[20, 20], [40, 20], [30, 32]], // a sharp turn back
    [[20.3, 20.7], [33.1, 27.9], [27.4, 41.2], [45.8, 44.4]], // free angles
    [[60, 60], [80, 80], [100, 60], [120, 80]], // 45° zigzag
    [[10, 50], [11.2, 70.6], [30.5, 71.1]], // nearly straight legs
  ];
  for (const n of [1, 2, 3, 4]) for (const p of paths) {
    const pts: number[] = []; for (const [x, y] of p) { const q = runPoint(x, y, n); pts.push(q.x, q.y); }
    const cells = runCells(pts, n), f = gapFree(cells), set = new Set(keysOf(cells));
    assert.ok(f.connected, `size ${n} ${JSON.stringify(p)}: one piece`);
    assert.equal(f.pinched, 0, `size ${n} ${JSON.stringify(p)}: no corner-only touch`);
    for (let k = 0; k < pts.length; k += 2) {
      const ix = squareStart(pts[k]!, n), iy = squareStart(pts[k + 1]!, n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) assert.ok(set.has(key(ix + i, iy + j)), `size ${n}: bend ${k / 2}'s square`);
    }
    assert.equal(set.size, cells.length / 2, 'each cell once');
  }
  // the walk is one cell step at a time and keeps to the line
  for (const [bx, by] of [[17, 5], [-9, 13], [4, -21], [0, 8], [12, 12]] as [number, number][]) {
    let x = 0, y = 0, steps = 0, far = 0;
    walk(0, 0, bx, by, (ix, iy) => { assert.equal(Math.abs(ix - x) + Math.abs(iy - y), 1); x = ix; y = iy; steps++; far = Math.max(far, Math.abs(ix * by - iy * bx) / Math.hypot(bx, by)); });
    assert.deepEqual([x, y, steps], [bx, by, Math.abs(bx) + Math.abs(by)]);
    assert.ok(far <= 1, `the walk to ${bx},${by} keeps within a cell of the line (${far})`);
  }
  // through the Paint tool: the grid gets exactly runCells' cells
  const { g, tool } = world({ n: 3 }), before = g.surf.slice();
  click(tool, 20.3, 20.7); click(tool, 33.1, 27.9); click(tool, 27.4, 41.2);
  const want = keysOf(runCells(tool.runPts, 3));
  press(tool, 'Enter');
  assert.deepEqual(changed(g, before), want);
});

test('Shift keeps a leg straight: along the axis near it, else on the 45° diagonal; without Shift the leg goes where the pointer is', () => {
  const { tool } = world();
  click(tool, 40.2, 40.2);
  const [x0, y0] = tool.runPts as [number, number];
  // a shallow leg with Shift: flat on the axis
  tool.pointerMove({ x: 60.4, y: 43.1 }, 0, 0, true);
  let p = tool.runPath(); assert.equal(p[p.length - 1], y0, 'Shift: the leg stays on the row'); assert.equal(p[p.length - 2], runPoint(60.4, 43.1, 2).x);
  // without Shift: the pointer's own square
  tool.pointerMove({ x: 60.4, y: 43.1 }, 0, 0, false);
  p = tool.runPath(); assert.deepEqual(p.slice(-2), [runPoint(60.4, 43.1, 2).x, runPoint(60.4, 43.1, 2).y]);
  // Shift pressed with the pointer still: straight at once; the click lays the straight bend
  assert.equal(press(tool, 'Shift', { shiftKey: true }), false, 'the engine still sees Shift');
  p = tool.runPath(); assert.equal(p[p.length - 1], y0);
  click(tool, 60.4, 43.1, true);
  assert.deepEqual(tool.runPts.slice(-2), [runPoint(60.4, 43.1, 2).x, y0]);
  // a steep leg: on the column; a leg near 45°: on the diagonal, its two sides equal
  const [x1, y1] = tool.runPts.slice(-2) as [number, number];
  tool.pointerMove({ x: x1 + 1.3, y: y1 + 20 }, 0, 0, true); p = tool.runPath(); assert.equal(p[p.length - 2], x1);
  tool.pointerMove({ x: x1 + 14.2, y: y1 + 11.6 }, 0, 0, true); p = tool.runPath();
  assert.equal(Math.abs(p[p.length - 2]! - x1), Math.abs(p[p.length - 1]! - y1), 'diagonal'); assert.ok(p[p.length - 1]! > y1);
  // straightTo on odd sizes keeps the bends on cells; even sizes on the town grid
  for (const n of [1, 2, 3, 4]) {
    const a = runPoint(33.3, 21.8, n), b = runPoint(47.9, 35.1, n), s = straightTo(a.x, a.y, b.x, b.y, n);
    assert.deepEqual(runPoint(s.x, s.y, n), s, `size ${n}: a bend on the size's own lattice`);
    assert.equal(Math.abs(s.x - a.x), Math.abs(s.y - a.y), `size ${n}: 45°`);
  }
  void x0;
});

test('one undo step per run (on the same stack as the Props tool\'s steps): undo takes the whole run and its money back, redo lays it again', () => {
  const { g, tool, money } = world();
  tool.step('place bench', () => 25); // the Props tool's step
  const s0 = g.surf.slice(), h0 = g.hole.slice(), cash0 = money.cash;
  click(tool, 30, 30); click(tool, 50, 30); click(tool, 50, 45); click(tool, 70, 52);
  press(tool, 'Enter');
  const s1 = g.surf.slice(), spent = cash0 - money.cash;
  assert.ok(spent > 0);
  assert.equal(tool.undoLabel, 'run of fairway');
  tool.undo();
  assert.deepEqual(g.surf, s0); assert.deepEqual(g.hole, h0); assert.equal(money.cash, cash0, 'refunded');
  assert.equal(tool.undoLabel, 'place bench', 'the Props tool\'s step is next');
  tool.redo();
  assert.deepEqual(g.surf, s1); assert.equal(money.cash, cash0 - spent);
  // Ctrl+Z while a run is drawn takes back its last bend first (as the wizard's drags), and Backspace too; then the steps as usual
  click(tool, 90, 30); click(tool, 100, 30); click(tool, 100, 40);
  assert.equal(press(tool, 'z', { ctrlKey: true }), true); assert.equal(tool.runPts.length, 4);
  assert.equal(press(tool, 'Backspace'), true); assert.equal(tool.runPts.length, 2);
  assert.deepEqual(g.surf, s1, 'nothing laid or undone');
});

test('Esc drops the run in progress first (Run stays in hand), then leaves (the engine\'s, out to Select)', () => {
  const { g, tool } = world(), before = g.surf.slice();
  click(tool, 30, 30); click(tool, 50, 30);
  assert.equal(press(tool, 'Escape'), true, 'the run goes');
  assert.equal(tool.runPts.length, 0); assert.equal(tool.runOn(), true, 'still Run');
  assert.equal(press(tool, 'Escape'), false, 'nothing in hand: the engine puts the tool down');
  assert.deepEqual(g.surf, before, 'nothing laid');
  assert.equal(tool.canUndo, false);
});

test('a double-click, Enter or a right-click finishes the run; a right-drag pans and keeps it; switching surface keeps the bends', () => {
  // a double-click: its second press lands on the same bend (nothing new), then the double-click finishes
  let w = world(), b = w.g.surf.slice();
  click(w.tool, 30, 30); click(w.tool, 50, 30); click(w.tool, 50, 30);
  assert.equal(w.tool.runPts.length, 4, 'the same bend once');
  w.tool.doubleClick();
  assert.equal(changed(w.g, b).length, runCells([30.5, 30.5, 50.5, 30.5], 2).length / 2); assert.equal(w.tool.runPts.length, 0);
  // a right-click (press and release without a drag)
  w = world(); b = w.g.surf.slice();
  click(w.tool, 30, 30); click(w.tool, 50, 30);
  assert.equal(w.tool.secondary({ x: 60, y: 60 }, 400, 300), false, 'the engine may still pan');
  w.tool.pointerMove({ x: 60, y: 60 }, 401, 301); w.tool.pointerUp(0.5);
  assert.ok(changed(w.g, b).length > 0, 'laid'); assert.equal(w.tool.runPts.length, 0);
  // a right-drag pans: the run stays
  w = world(); b = w.g.surf.slice();
  click(w.tool, 30, 30); click(w.tool, 50, 30);
  w.tool.secondary({ x: 60, y: 60 }, 400, 300); w.tool.pointerMove({ x: 62, y: 60 }, 430, 300); w.tool.pointerUp(0.5);
  assert.equal(changed(w.g, b).length, 0); assert.equal(w.tool.runPts.length, 4);
  // keys 1-6 switch the surface: the bends stay, the run lays the new one
  assert.equal(press(w.tool, '5'), true); assert.equal(w.tool.brushKind, 'bunker'); assert.equal(w.tool.runPts.length, 4);
  press(w.tool, 'Enter'); assert.equal(w.g.surf[cellAt(w.g, 40, 30.5)], SURF.bunker);
  // the round brush has no run: picking it puts Run down
  w.tool.setBrushCells(0); assert.equal(w.tool.brushRun, false); assert.equal(w.tool.runOn(), false);
});

test('the footprint is what the run lays: the cells, the kept and refused ones, the price; the words carry its length, cells and price', () => {
  // a green in the way (it stays on top) and land you do not own east of x = 64
  const { g, tool, cur, money } = world({ ownX: 64 });
  paintDisc(g, 45, 30.5, 2, SURF.green, 1, 0);
  const ctx = mockCtx();
  tool.pointerMove({ x: 30.2, y: 30.2 }, 0, 0);
  cur.draw(ctx, view(), tool, 1000);
  assert.match(cur.hint, /^Run Fairway · Hole 1 · \$\d+(\.\d+)? a cell · click a start$/, 'the green there is hole 1\'s');
  assert.deepEqual(cur.state.label, [], 'no words by the disc before the first click');
  click(tool, 30.2, 30.2); tool.pointerMove({ x: 70.2, y: 30.2 }, 0, 0);
  cur.draw(ctx, view(), tool, 1016);
  const f = cur.runFeet, fp = f.shape!, len = runLength(tool.runPath(), 2);
  assert.equal(cur.state.kind, 'refused'); assert.equal(cur.state.dragging, true);
  assert.ok(fp.kept.length > 0 && fp.refused.length > 0);
  assert.match(cur.hint, new RegExp(`^Run Fairway · Hole 1 · ${len} m · .* refused: not your land · click each bend · double-click, Enter or right-click finishes$`));
  assert.equal(cur.state.label[0], `${len} m · ${f.fresh} cells · $${Math.round(f.price).toLocaleString()}`);
  assert.match(cur.state.label[1]!, /cells: not your land/);
  // the run to the pointer's bend: its footprint is exactly the cells it changes, and its price what it charges
  click(tool, 70.2, 30.2);
  cur.draw(ctx, view(), tool, 1032);
  const shown: number[] = []; for (let i = 0; i < fp.cells.length; i += 2) shown.push(key(f.ax + fp.cells[i]!, f.ay + fp.cells[i + 1]!));
  const price = Math.round(f.price), before = g.surf.slice(), cash = money.cash;
  press(tool, 'Enter');
  const laid = changed(g, before), keptGreen = laid.filter(k => !shown.includes(k));
  assert.deepEqual(keptGreen, []);
  assert.equal(laid.length, f.fresh, 'every fresh cell, no other');
  assert.equal(cash - money.cash, price);
  // money short: the price in red, a toast, nothing laid, the run kept to shorten
  const w = world({ cash: 50 });
  click(w.tool, 30, 30); click(w.tool, 80, 30);
  w.cur.draw(mockCtx(), view(), w.tool, 1000);
  assert.equal(w.cur.state.kind, 'short'); assert.match(w.cur.state.label[1]!, /you have \$50/);
  const wb = w.g.surf.slice();
  assert.equal(w.tool.finishRun(), false);
  assert.deepEqual(w.g.surf, wb); assert.equal(w.money.cash, 50); assert.match(w.toasts.at(-1)!, /^Not enough money: Fairway run · \$[\d,]+ · you have \$50$/);
  assert.equal(w.tool.runPts.length, 4); assert.equal(w.tool.canUndo, false);
  // Erase: the run rubs out to rough, free, dashed
  const e = world();
  click(e.tool, 30, 30); click(e.tool, 50, 30); press(e.tool, 'Enter');
  e.cur.draw(mockCtx(), view(), e.tool, 990); // a golf game's footprint is priced: the erase words say "no refund"
  e.tool.rubOut = true;
  click(e.tool, 40, 30); click(e.tool, 60, 30);
  e.cur.draw(mockCtx(), view(), e.tool, 1000);
  assert.equal(e.cur.state.kind, 'erase'); assert.match(e.cur.hint, /^Run · rub out · .* back to rough · no refund/);
  const cash1 = e.money.cash; press(e.tool, 'Enter');
  assert.equal(e.g.surf[cellAt(e.g, 45, 30.5)], SURF.rough); assert.equal(e.g.surf[cellAt(e.g, 35, 30.5)], SURF.fairway); assert.equal(e.money.cash, cash1);
});

test('a run in a range start\'s practice area keeps its cells at hole 0 (T130), through undo and redo; the pill says so', () => {
  const plot: Rect = [200, 200, 70, 150], g = makeGrid(190, 190, 300, 420), biz = defaultRangeBiz();
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => null,
    addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => ({ tier: 1, exits: 2, residents: 0 }), dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: () => {}, emit: () => {},
    grid: () => g, layTee: pts => pts.length === 8,
  };
  const h = new RangeHost(ctx, 1); h.sync(); h.step(); h.step();
  const [bx0, by0, bx1] = practiceArea(plot, 2).box;
  const { tool, cur } = world({ g, n: 2, changed: (gg, d) => h.practiceCells(gg, d), zone: (x, y) => h.zoneAt(x, y) });
  tool.setHole(3);
  const y = by0 + 6.2, xa = bx0 + 4.2, xb = Math.min(bx1 - 4, bx0 + 30.2);
  click(tool, xa, y); tool.pointerMove({ x: xb, y }, 0, 0);
  cur.draw(mockCtx(), view(), tool, 1000);
  assert.match(cur.hint, /^Run Fairway · practice area \(no hole\) · \d+ m/);
  click(tool, xb, y); press(tool, 'Enter');
  const i = cellAt(g, (xa + xb) / 2, runPoint(xa, y, 2).y);
  assert.equal(g.surf[i], SURF.fairway); assert.equal(g.hole[i], 0, 'no hole in the practice area');
  tool.undo(); assert.equal(g.surf[i], 0);
  tool.redo(); assert.equal(g.surf[i], SURF.fairway); assert.equal(g.hole[i], 0, 'redo keeps it');
  // outside the practice area (on the range's own plot here: this stand-in host owns it all) the run joins the current hole
  click(tool, 220, 300); click(tool, 240, 300); press(tool, 'Enter');
  assert.equal(g.surf[cellAt(g, 230, 300.5)], SURF.fairway); assert.equal(g.hole[cellAt(g, 230, 300.5)], 3);
});

test('the outline of a long run keeps its cells in maps (a diagonal run\'s box is far bigger than its cells), with the same loops', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 40; t++) {
    const pts: number[] = []; for (let k = 0; k < 4; k++) pts.push(10 + rnd() * 40, 10 + rnd() * 40);
    const cells = runCells(pts, 1 + (t % 4)); let ax = Infinity, ay = Infinity;
    for (let k = 0; k < cells.length; k += 2) { ax = Math.min(ax, cells[k]!); ay = Math.min(ay, cells[k + 1]!); }
    const rel = new Int16Array(cells.length); for (let k = 0; k < cells.length; k += 2) { rel[k] = cells[k]! - ax; rel[k + 1] = cells[k + 1]! - ay; }
    // and a ragged set with holes and corner touches
    const rag: number[] = []; for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) if (rnd() < 0.45) rag.push(x, y);
    for (const c of [rel, Int16Array.from(rag)]) assert.deepEqual(cellOutline(c, true), cellOutline(c, false));
  }
  // a 2 km diagonal run: its footprint is worked out without a box of cells
  const f = new RunFootprint(), t0 = performance.now(), s = f.at([20, 20, 727, 727], 4, SURF.fairway);
  assert.ok(s.cells.length / 2 > 10000 && s.loops.length === 1, `${s.cells.length / 2} cells`);
  console.log(`run outline: a 2 km diagonal run of 4 cells (${s.cells.length / 2} cells) in ${(performance.now() - t0).toFixed(1)} ms`);
});

test('speed: a 200 m run lays in under 4 ms of main thread, and its footprint is worked out in under 4 ms', () => {
  const { g, tool, cur } = world({ n: 4 });
  // 200 m: 60 m east, a 45° leg of about 57 m, 83 m south (the squares' middles), as the worst kind (a diagonal walk has the most steps)
  const path = [20, 20, 50, 20, 70, 40, 70, 81.5];
  const len = runLength(path, 4);
  assert.ok(len >= 200 && len < 215, `${len} m`);
  const layMs: number[] = [], footMs: number[] = [];
  for (let k = 0; k < 15; k++) {
    tool.runPts = path.slice();
    const t0 = performance.now(); tool.finishRun(); layMs.push(performance.now() - t0);
    tool.undo();
    // the footprint for a path just changed (the pointer moved into a new cell)
    const p = path.slice(); p[p.length - 1] = 81.5 + (k % 2) * 2;
    const t1 = performance.now(); cur.runFeet.at(p, 4, SURF.fairway, () => tool.brushSkipWhy(), k, null, () => tool.brushCellCost()); footMs.push(performance.now() - t1);
  }
  const best = (a: number[]) => Math.min(...a), mid = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1]!;
  console.log(`run speed (200 m, 4 cells, ${runCells(path, 4).length / 2} cells): lay best ${best(layMs).toFixed(2)} ms, median ${mid(layMs).toFixed(2)} ms; footprint best ${best(footMs).toFixed(2)} ms, median ${mid(footMs).toFixed(2)} ms`);
  assert.ok(best(layMs) < 4, `lay ${best(layMs)} ms`);
  assert.ok(best(footMs) < 4, `footprint ${best(footMs)} ms`);
  void g;
});
