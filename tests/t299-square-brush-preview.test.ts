// T299 (#884; the owner, 2026-11-02): "the transparent shape of the brush and the square dont match. when you click the square shape it shows a
// big transparent circle where you paint. that needs to be removed." The square brush's stroke preview drew the round brush's circle (radius r)
// at every dab; now it draws the n x n squares it paints, and the round brush keeps its circles. Headless: a recording canvas context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaintTool, type PaintView } from '../src/game/paint-tool';
import { makeGrid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { squarePoly, squareStart } from '../src/game/ext/course-cursor/snap';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };

const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
function golfTool() {
  const g = makeGrid(80, 180, 80, 80), money = { cash: 1e6 };
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, gridAreas: () => gridAreas(g), ownedAt: () => true, landWhy: () => '', money: () => money.cash, spend: (n: number) => { money.cash -= n; } });
  tool.course = true;
  return tool;
}

/** a recording context: arcs and the points of every lineTo/moveTo */
function draw(tool: PaintTool) {
  const arcs: number[] = [], pts: [number, number][] = [];
  let fills = 0, strokes = 0;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    beginPath() {}, closePath() {}, moveTo(x: number, y: number) { pts.push([x, y]); }, lineTo(x: number, y: number) { pts.push([x, y]); },
    arc(_x: number, _y: number, r: number) { arcs.push(r); }, ellipse() { arcs.push(-1); }, rect() {}, clip() {}, save() {}, restore() {},
    fill() { fills++; }, stroke() { strokes++; }, setTransform() {}, setLineDash() {}, fillText() {}, strokeText() {},
  };
  const view = { ctx, setIso() {}, screen: (x: number, y: number) => ({ x, y }), dpr: 1, hint() {} } as unknown as PaintView;
  tool.drawPreview(view);
  return { arcs, pts, fills, strokes };
}

for (const n of [1, 2, 3, 4]) {
  test(`square brush ${n}: the stroke preview draws the painted squares, never a circle`, () => {
    const tool = golfTool();
    tool.setBrush('fairway'); tool.setBrushR(6); tool.setBrushCells(n); tool.puckCursor = true;
    assert.equal(tool.brushSquare(), n);
    tool.pointerMove({ x: 100.3, y: 200.2 }, 0, 0);
    tool.pointerDown({ x: 100.3, y: 200.2 }, 0, 0);
    tool.pointerMove({ x: 103.1, y: 201.4 }, 30, 10);
    const d = draw(tool);
    assert.deepEqual(d.arcs, [], 'no circle while painting with the square brush');
    assert.ok(d.fills >= 1, 'the squares are filled');
    // the first square is the one under the press, exactly the cells it paints
    const q = squarePoly(squareStart(100.3, n), squareStart(200.2, n), n);
    assert.deepEqual(d.pts.slice(0, 4), q.map(p => [p.x, p.y]));
    assert.ok(d.pts.length >= 8, 'the drag laid more squares');
    for (const [x, y] of d.pts) { assert.ok(Math.abs(x * 2 - Math.round(x * 2)) < 1e-9 && Math.abs(y * 2 - Math.round(y * 2)) < 1e-9, 'corners on the cell grid'); }
    tool.pointerUp(0.5);
  });
}

test('square brush without the game cursor: the cursor is the square, not the round brush circle', () => {
  const tool = golfTool();
  tool.setBrush('green'); tool.setBrushR(6); tool.setBrushCells(2); tool.puckCursor = false;
  tool.pointerMove({ x: 100.3, y: 200.2 }, 0, 0);
  const d = draw(tool);
  assert.deepEqual(d.arcs, []);
  assert.equal(d.strokes, 1);
  assert.deepEqual(d.pts, squarePoly(squareStart(100.3, 2), squareStart(200.2, 2), 2).map(p => [p.x, p.y]));
});

test('round brush unchanged: its stroke preview and cursor are circles of the brush radius', () => {
  const tool = golfTool();
  tool.setBrush('green'); tool.setBrushShape('round'); tool.setBrushR(4); tool.puckCursor = false;
  assert.equal(tool.brushSquare(), 0);
  tool.pointerMove({ x: 100.3, y: 200.2 }, 0, 0);
  tool.pointerDown({ x: 100.3, y: 200.2 }, 0, 0);
  tool.pointerMove({ x: 102.3, y: 200.2 }, 30, 0);
  const d = draw(tool);
  assert.ok(d.arcs.length >= 3, 'a circle per dab and the cursor ring');
  for (const r of d.arcs) assert.equal(r, 4);
  tool.pointerUp(0.5);
});
