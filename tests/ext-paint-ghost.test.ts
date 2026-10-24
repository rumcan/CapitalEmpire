// Headless tests for the Paint and Course outline's ghost (T024): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaintTool, type PaintView } from '../src/game/paint-tool';
import { GHOST_STYLE } from '../src/game/ext/ghost-preview';

/** the golf mode and the owned land, set by each test */
interface Env { golf: boolean; owned: boolean }

/** a host that answers the golf mode and the owned land from env */
function host(env: Env) {
  return { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => env.golf, ownedLand: () => env.owned };
}

/** a recording canvas context: the stroke colours and the dash sets, in order */
function recorder() {
  const ops: string[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, clip() {}, save() {}, restore() {},
    fill() { ops.push(`fill:${String(this.fillStyle)}`); },
    stroke() { ops.push(`stroke:${String(this.strokeStyle)}:${this.lineWidth}`); },
    setTransform() {},
    setLineDash(s: number[]) { ops.push(`dash:${s.join(',')}`); },
    fillText() {}, strokeText() {},
  };
  return { ctx, ops };
}

/** the stroke colours recorded, in order */
function strokeColours(ops: string[]): string[] { return ops.filter(o => o.startsWith('stroke:')).map(o => o.split(':')[1]!); }

/** a 4-corner square outline (tiles) in progress, its pointer at (mx, my) css px: draws the preview; returns the recorded ops and hints */
function previewSquare(env: Env, mouse = true) {
  const tool = new PaintTool(host(env));
  tool.pts = [0, 0, 4, 0, 4, 4, 0, 4];
  if (mouse) tool.pointerMove(null, 40, 40);
  const { ctx, ops } = recorder();
  const hints: [string, boolean][] = [];
  const view = { ctx, setIso() {}, screen: (x: number, y: number) => ({ x, y }), dpr: 1, hint: (_mx: number, _my: number, t: string, b: boolean) => { hints.push([t, b]); } } as unknown as PaintView;
  tool.drawPreview(view);
  return { ops, hints };
}

test('a valid outline outside golf mode is drawn in the shared valid ghost colour, dashed, with no hint', () => {
  const { ops, hints } = previewSquare({ golf: false, owned: false });
  assert.ok(strokeColours(ops).includes(GHOST_STYLE.validStroke), 'a stroke in the valid ghost colour');
  assert.ok(ops.includes('dash:6,4'), 'the dashed wireframe');
  assert.deepEqual(hints, []);
});

test('in golf mode an outline outside the owned course land is red, with the reason beside the pointer', () => {
  const { ops, hints } = previewSquare({ golf: true, owned: false });
  assert.ok(strokeColours(ops).includes(GHOST_STYLE.invalidStroke), 'a stroke in the invalid ghost colour');
  assert.ok(!strokeColours(ops).includes(GHOST_STYLE.validStroke), 'no valid stroke');
  assert.deepEqual(hints, [['Cannot paint outside owned course land', true]]);
});

test('in golf mode an outline inside the owned course land is green, with no hint', () => {
  const { ops, hints } = previewSquare({ golf: true, owned: true });
  assert.ok(strokeColours(ops).includes(GHOST_STYLE.validStroke), 'a stroke in the valid ghost colour');
  assert.ok(!strokeColours(ops).includes(GHOST_STYLE.invalidStroke), 'no invalid stroke');
  assert.deepEqual(hints, []);
});
