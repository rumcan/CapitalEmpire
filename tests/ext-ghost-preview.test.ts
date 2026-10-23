import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GHOST_STYLE,
  colorsForStatus,
  corridorQuad,
  drawGhostBlueprint,
  drawGhostHint,
  drawGhostPoly,
  drawGhostRect,
  drawGhostRing,
  drawGhostSnap,
  drawGhostStrip,
  ghostStatus,
  rectCorners,
  rgbaOf,
  type GhostCanvasCtx,
  type GhostView,
} from '../src/game/ext/ghost-preview';

function makeMockView(dpr = 2): { view: GhostView; ops: string[] } {
  const ops: string[] = [];
  const ctx: GhostCanvasCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    beginPath() { ops.push('beginPath'); },
    closePath() { ops.push('closePath'); },
    moveTo(x, y) { ops.push(`moveTo:${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`); },
    lineTo(x, y) { ops.push(`lineTo:${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`); },
    rect(x, y, w, h) { ops.push(`rect:${x},${y},${w},${h}`); },
    arc(x, y, r) { ops.push(`arc:${Math.round(x)},${Math.round(y)},${Math.round(r * 10) / 10}`); },
    fill() { ops.push(`fill:${String(this.fillStyle)}`); },
    stroke() { ops.push(`stroke:${String(this.strokeStyle)}:${this.lineWidth}`); },
    clip() { ops.push('clip'); },
    save() { ops.push('save'); },
    restore() { ops.push('restore'); },
    setTransform(a, b, c, d, e, f) { ops.push(`transform:${a},${b},${c},${d},${e},${f}`); },
    setLineDash(s) { ops.push(`dash:${s.join(',')}`); },
    fillText(t, x, y) { ops.push(`fillText:${t}@${Math.round(x)},${Math.round(y)}:${String(this.fillStyle)}`); },
    strokeText(t, x, y) { ops.push(`strokeText:${t}@${Math.round(x)},${Math.round(y)}`); },
  };
  const view: GhostView = {
    ctx,
    dpr,
    setIso(c) { c.setTransform(2, 1, -2, 1, 100, 50); },
    screen(x, y) { return { x: 100 + (x - y) * 2, y: 50 + (x + y) }; },
  };
  return { view, ops };
}

describe('ext/ghost-preview (T018)', () => {
  it('converts #rrggbb colours and clamps alpha in rgbaOf', () => {
    assert.equal(rgbaOf('#416114', 0.35), 'rgba(65,97,20,0.35)');
    assert.equal(rgbaOf('#ff8000', 2), 'rgba(255,128,0,1)');
    assert.equal(rgbaOf('bad', 0.5), 'rgba(136,136,136,0.5)');
  });

  it('resolves valid, refused, and unaffordable states in ghostStatus', () => {
    const ok = ghostStatus('', 1200, 5000, '24 bays');
    assert.deepEqual(ok, { ok: true, status: 'valid', label: '24 bays · $1,200', bad: false });
    const blocked = ghostStatus('A road runs through it', 1200, 5000, '24 bays');
    assert.deepEqual(blocked, { ok: false, status: 'invalid', label: 'A road runs through it', bad: true });
    const broke = ghostStatus('', 6000, 5000, '24 bays');
    assert.deepEqual(broke, { ok: false, status: 'invalid', label: 'Not enough money: $6,000', bad: true });
  });

  it('computes axis-aligned and rotated rectangle corners in tiles', () => {
    const axis = rectCorners({ x: 10, y: 20, w: 6, h: 4 });
    assert.deepEqual(axis, [
      { x: 10, y: 20 },
      { x: 16, y: 20 },
      { x: 16, y: 24 },
      { x: 10, y: 24 },
    ]);
    const rot90 = rectCorners({ x: 10, y: 20, w: 6, h: 4, angleDeg: 90 });
    assert.ok(Math.abs(rot90[1]!.x - 10) < 1e-9 && Math.abs(rot90[1]!.y - 26) < 1e-9);
    assert.ok(Math.abs(rot90[2]!.x - 6) < 1e-9 && Math.abs(rot90[2]!.y - 26) < 1e-9);
  });

  it('builds extruded corridor quads with and without end caps', () => {
    const capped = corridorQuad({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, true);
    assert.deepEqual(capped, [-2, 2, 12, 2, 12, -2, -2, -2]);
    const uncapped = corridorQuad({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, false);
    assert.deepEqual(uncapped, [0, 2, 10, 2, 10, -2, 0, -2]);
  });

  it('draws polygons, collar borders, rects, strips, rings, snaps, and hints on GhostView', () => {
    const { view, ops } = makeMockView(2);
    drawGhostPoly(view, [0, 0, 10, 0, 10, 10, 0, 10], 'valid', { borderWidthTiles: 0.5, borderColor: 'rgba(64,95,22,0.75)' });
    assert.ok(ops.includes(`fill:${GHOST_STYLE.validFill}`));
    assert.ok(ops.includes('clip'));
    assert.ok(ops.includes(`stroke:${GHOST_STYLE.validStroke}:3`));
    ops.length = 0;
    drawGhostRect(view, { x: 5, y: 5, w: 8, h: 4 }, 'invalid');
    assert.ok(ops.includes(`fill:${GHOST_STYLE.invalidFill}`));
    assert.ok(ops.includes(`stroke:${GHOST_STYLE.invalidStroke}:3`));
    ops.length = 0;
    drawGhostStrip(view, [{ a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }], 1.5, 'replace', { dashed: true });
    assert.ok(ops.includes(`fill:${GHOST_STYLE.replaceFill}`));
    assert.ok(ops.includes('dash:12,8'));
    ops.length = 0;
    drawGhostRing(view, 20, 20, 10, 6, 'neutral');
    assert.ok(ops.some(o => o.startsWith('arc:20,20,10')));
    assert.ok(ops.some(o => o.startsWith('arc:20,20,6')));
    ops.length = 0;
    drawGhostSnap(view, { x: 10, y: 10, kind: 'node' });
    drawGhostSnap(view, { x: 10, y: 10, kind: 'road', nx: 0, ny: 1, halfSpan: 2 });
    assert.ok(ops.some(o => o.includes(GHOST_STYLE.snapColor)));
    ops.length = 0;
    drawGhostHint(view, 50, 60, 'Cannot place on water', true);
    assert.ok(ops.some(o => o.startsWith('fillText:Cannot place on water@128,96:#fecaca')));
  });

  it('renders a composite GhostBlueprint with detail lines, entrances, snaps, and cursor label', () => {
    const { view, ops } = makeMockView(1);
    drawGhostBlueprint(
      view,
      {
        status: 'valid',
        rects: [{ rect: { x: 10, y: 10, w: 12, h: 8 } }],
        detailLines: [{ pts: [12, 10, 12, 18, 14, 10, 14, 18] }],
        entrances: [{ x: 16, y: 10 }],
        snaps: [{ x: 16, y: 10, kind: 'end' }],
        label: '16 bays · $800',
        bad: false,
      },
      200,
      150,
    );
    assert.ok(ops.includes(`fill:${GHOST_STYLE.validFill}`));
    assert.ok(ops.includes(`fill:${GHOST_STYLE.entranceColor}`));
    assert.ok(ops.some(o => o.includes('16 bays · $800')));
    assert.deepEqual(colorsForStatus('invalid'), { fill: GHOST_STYLE.invalidFill, stroke: GHOST_STYLE.invalidStroke });
  });
});
