// Headless tests for the Course tool's click-to-place pieces (T030): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pieceAreas, pieceWhy, snapTargets } from '../src/game/ext/course-pieces';
import { computeSnapPiecePlacement } from '../src/game/ext/course-snap';
import { DEFAULT_STYLE } from '../src/game/paint';
import { PaintTool } from '../src/game/paint-tool';

/** a host that records the ground patches it is sent and the toasts */
function host(toasts: string[] = []) {
  return { setLotGround() {}, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
}

describe('course pieces (T030)', () => {
  it('pieceAreas lays one area per layer, the core alone carries the kind, every area the hole', () => {
    const pl = computeSnapPiecePlacement({ kind: 'fairway', archetype: 'fairway-corridor', cursor: { x: 100, y: 100 }, snapEnabled: false, defaultHole: 2 });
    const areas = pieceAreas(pl);
    assert.equal(areas.length, pl.layers.length);
    const withKind = areas.filter(a => a.kind);
    assert.equal(withKind.length, 1);
    assert.equal(withKind[0]!.kind, 'fairway');
    assert.deepEqual(withKind[0]!.pts, pl.pts);
    for (const a of areas) { assert.equal(a.hole, 2); assert.ok(a.border >= 0 && a.border <= 3); }
  });

  it('snapTargets keeps only the course areas with a piece kind (not rough, not kindless)', () => {
    const t = snapTargets([
      { id: 1, pts: [0, 0, 10, 0, 10, 10, 0, 10], kind: 'fairway', hole: 3 },
      { id: 2, pts: [20, 0, 30, 0, 30, 10, 20, 10], kind: 'rough' },
      { id: 3, pts: [40, 0, 50, 0, 50, 10, 40, 10] },
    ]);
    assert.equal(t.length, 1);
    assert.equal(t[0]!.id, 1); assert.equal(t[0]!.kind, 'fairway'); assert.equal(t[0]!.hole, 3);
  });

  it('pieceWhy refuses a self-crossing shape, and an owned-land test that fails', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    assert.notEqual(pieceWhy([{ pts: [0, 0, 10, 10, 10, 0, 0, 10] }]), '');
    assert.equal(pieceWhy([{ pts: square }], () => false), 'Cannot place outside owned course land');
    assert.equal(pieceWhy([{ pts: square }], () => true), '');
  });

  it('piece mode: a kidney green snaps to the fairway it touches and one click lays all its layers in one undo step', () => {
    const tool = new PaintTool(host());
    tool.enterCourse();
    tool.areas.push({ ...DEFAULT_STYLE, id: 1, pts: [100, 100, 124, 100, 124, 112, 100, 112], kind: 'fairway', hole: 4 });
    tool.nextId = 2;
    tool.setPiece('green-kidney');
    tool.pointerMove({ x: 125.5, y: 106 }, 0, 0);
    assert.equal(tool.piece!.pl.snapped, true);
    assert.equal(tool.piece!.pl.hole, 4);
    assert.equal(tool.piece!.why, '');
    const n = tool.piece!.areas.length;
    tool.pointerDown({ x: 125.5, y: 106 }, 0, 0);
    assert.equal(tool.areas.length, 1 + n);
    for (const a of tool.areas.slice(1)) {
      if (a.kind === 'green') assert.equal(a.hole, 4);
      if (!a.kind) assert.equal(typeof a.order, 'number');
    }
    tool.undo();
    assert.equal(tool.areas.length, 1);
  });
});
