// Headless tests for the Paint tool's golf brush: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaintTool } from '../src/game/paint-tool';
import { polyArea } from '../src/game/paint';

/** a host that records the ground patches it is sent and the toasts */
function host(toasts: string[] = []) {
  return { setLotGround() {}, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); }, affine() {}, placeProps: () => 0 };
}

/** a press at (x0, y0), moves to (x1, y1) in steps, a release (tiles) */
function drag(tool: PaintTool, x0: number, y0: number, x1: number, y1: number, alt = false) {
  tool.pointerDown({ x: x0, y: y0 }, 0, 0, alt);
  for (let i = 1; i <= 10; i++) tool.pointerMove({ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }, 0, 0);
  tool.pointerUp(0.5);
}

test('a golf brush stroke paints one fairway area for hole 1, in the preset style', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 50, 50, 90, 50);
  assert.equal(tool.areas.length, 1);
  const a = tool.areas[0]!;
  assert.equal(a.kind, 'fairway'); assert.equal(a.hole, 1); assert.equal(a.tex, 'golfFairway'); assert.equal(a.border, 3);
});

test('a second overlapping stroke of the same kind and hole joins the first into one, larger area', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 50, 50, 90, 50);
  const before = Math.abs(polyArea(tool.areas[0]!.pts));
  drag(tool, 80, 50, 120, 50);
  assert.equal(tool.areas.length, 1);
  assert.ok(Math.abs(polyArea(tool.areas[0]!.pts)) > before);
});

test('a stroke for another hole makes a separate area tagged with that hole', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 50, 50, 90, 50);
  tool.brushHole = 2;
  drag(tool, 50, 200, 90, 200);
  assert.equal(tool.areas.length, 2);
  assert.deepEqual(tool.areas.map(a => a.hole), [1, 2]);
});

test('a green stroke over the fairway makes a green area drawn above the fairway', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 50, 50, 90, 50);
  tool.setBrush('green');
  drag(tool, 60, 50, 80, 50);
  const f = tool.areas.find(a => a.kind === 'fairway')!, g = tool.areas.find(a => a.kind === 'green')!;
  assert.ok(g, 'a green area');
  assert.ok((PaintTool.patch(g).paint?.z ?? 0) > (PaintTool.patch(f).paint?.z ?? 0));
});

test('Rub out across the middle of the fairway splits it into two areas', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 40, 50, 120, 50);
  assert.equal(tool.areas.length, 1);
  tool.rubOut = true;
  drag(tool, 80, 40, 80, 60);
  assert.equal(tool.areas.filter(a => a.kind === 'fairway').length, 2);
});

test('Alt held on the press erases across the fairway too', () => {
  const tool = new PaintTool(host());
  tool.setBrush('fairway');
  drag(tool, 40, 50, 120, 50);
  drag(tool, 80, 40, 80, 60, true);
  assert.equal(tool.areas.filter(a => a.kind === 'fairway').length, 2);
});

test('a press with no move dabs once: a round cart path area', () => {
  const tool = new PaintTool(host());
  tool.setBrush('path');
  tool.pointerDown({ x: 10, y: 10 }, 0, 0, false);
  tool.pointerUp(0.5);
  assert.equal(tool.areas.length, 1);
  assert.equal(tool.areas[0]!.kind, 'path');
  assert.equal(tool.areas[0]!.tex, 'asphalt');
});

test('the brush radius clamps to 0.5..20 tiles and setBrushR works without localStorage', () => {
  const tool = new PaintTool(host());
  tool.setBrushR(30);
  assert.equal(tool.brush.fairway.r, 20);
  tool.setBrushR(0);
  assert.equal(tool.brush.fairway.r, 0.5);
});
