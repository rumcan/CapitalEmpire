// T180 (P23-UX D8.1, not by colour alone): refused cells and footprints are hatched and carry a small ✕; every coloured status has a mark.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CROSS_R, CROSS_RED, HATCH_PITCH, drawRefusedCross, hatchLines, polyCentre, refusedPatches, strokeHatch, type MarkCtx } from '../src/game/ext/refused-mark';
import { drawGhostPoly, drawGhostRing, drawRefusedMarks, type GhostCanvasCtx, type GhostView } from '../src/game/ext/ghost-preview';
import { drawRefused, type WizardView } from '../src/game/ext/hole-wizard/draw';
import { REFUSED, type WizardGhost } from '../src/game/ext/hole-wizard';
import { CELL_T } from '../src/game/ext/course-grid';
import { STATUS_ICON, STATUS_WORD, affordKind, balanceKind, statusIcon, trendKind, withIcon, type StatusKind } from '../src/ui/status-icon';

/** a canvas double that records its calls */
function recorder() {
  const ops: string[] = [];
  const ctx = {
    fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, lineCap: 'butt' as CanvasLineCap, globalAlpha: 1, lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic',
    beginPath() { ops.push('beginPath'); }, closePath() { ops.push('closePath'); },
    moveTo(x: number, y: number) { ops.push(`moveTo:${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`); },
    lineTo(x: number, y: number) { ops.push(`lineTo:${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`); },
    rect(x: number, y: number, w: number, h: number) { ops.push(`rect:${x},${y},${w},${h}`); },
    arc(x: number, y: number, r: number) { ops.push(`arc:${Math.round(x)},${Math.round(y)},${Math.round(r * 10) / 10}`); },
    fill() { ops.push(`fill:${String(ctx.fillStyle)}`); }, stroke() { ops.push(`stroke:${String(ctx.strokeStyle)}`); },
    clip() { ops.push('clip'); }, save() { ops.push('save'); }, restore() { ops.push('restore'); },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { ops.push(`transform:${a},${b},${c},${d},${e},${f}`); },
    setLineDash() {}, fillText() {}, strokeText() {},
  };
  return { ctx, ops };
}
const crossAt = (ops: string[], x: number, y: number, d: number) => ops.includes(`arc:${Math.round(x)},${Math.round(y)},${Math.round(CROSS_R * d * 10) / 10}`);
const hatchStrokes = (ops: string[]) => ops.filter(o => o.startsWith('stroke:rgba(255,196,180')).length;

describe('refused marks (T180)', () => {
  it('lays the hatch on a fixed lattice of 45° lines across the box', () => {
    const L = hatchLines(10, 20, 50, 40, 5);
    assert.ok(L.length >= 4 * 10);
    for (let i = 0; i < L.length; i += 4) {
      assert.equal(L[i + 3]! - L[i + 1]!, 20); // top to bottom of the box
      assert.equal(L[i + 2]! - L[i]!, L[i + 3]! - L[i + 1]!); // 45°
      assert.equal(((L[i]! - L[i + 1]!) % 5 + 5) % 5, 0); // x - y on the lattice: the stripes never crawl as the box moves
    }
    assert.deepEqual(hatchLines(0, 0, 0, 10, 5), []);
  });
  it('draws the ✕ badge: a red disc with a ring, then the two strokes of the ✕', () => {
    const { ctx, ops } = recorder();
    drawRefusedCross(ctx as unknown as MarkCtx, 100, 60, 2);
    assert.ok(crossAt(ops, 100, 60, 2));
    assert.ok(ops.includes(`fill:${CROSS_RED}`));
    const a = 2.5 * 2;
    for (const s of [`moveTo:${100 - a},${60 - a}`, `lineTo:${100 + a},${60 + a}`, `moveTo:${100 + a},${60 - a}`, `lineTo:${100 - a},${60 + a}`]) assert.ok(ops.includes(s), s);
    assert.equal(ctx.lineCap, 'butt'); // put back
    const h = recorder();
    strokeHatch(h.ctx as unknown as MarkCtx, 0, 0, 30, 30, 1);
    assert.equal(hatchStrokes(h.ops), 1);
    assert.ok(h.ops.filter(o => o.startsWith('moveTo')).length >= Math.floor(60 / HATCH_PITCH));
  });
  it('finds the centre of a footprint', () => {
    assert.deepEqual(polyCentre([0, 0, 10, 0, 10, 4, 0, 4]), { x: 5, y: 2 });
    assert.deepEqual(polyCentre([3, 3, 3, 3, 3, 3]), { x: 3, y: 3 });
  });
  it("puts one ✕ on each patch of New hole's left-out cells, on a refused cell, biggest first", () => {
    const S = 7, runs: number[] = [];
    // patch A: rows 0..4, columns 0..9 (50 cells); patch B: an L, rows 10..15 at column 20, and row 15 columns 20..30 (16 cells)
    for (let r = 0; r < 5; r++) runs.push(r, 0, 9, S);
    for (let r = 10; r < 15; r++) runs.push(r, 20, 20, S);
    runs.push(15, 20, 30, S);
    runs.push(20, 0, 1, S); // 2 cells: too small for a mark
    runs.push(6, 0, 9, 3); // another label: not refused
    const ps = refusedPatches(runs, S);
    assert.equal(ps.length, 2);
    assert.equal(ps[0]!.n, 50); assert.equal(ps[1]!.n, 16);
    assert.deepEqual([ps[0]!.cx, ps[0]!.cy], [5.5, 2.5]);
    const onCell = (cx: number, cy: number) => { for (let k = 0; k < runs.length; k += 4) if (runs[k + 3] === S && runs[k] === cy - 0.5 && cx - 0.5 >= runs[k + 1]! && cx - 0.5 <= runs[k + 2]!) return true; return false; };
    assert.ok(onCell(ps[1]!.cx, ps[1]!.cy), 'the L-shaped patch keeps its ✕ on a refused cell');
    assert.equal(refusedPatches(runs, S, 1).length, 1);
    assert.deepEqual(refusedPatches([], S), []);
  });
});

describe('the refused-cell overlay draws the hatch and the ✕ (T180)', () => {
  const view = (ctx: unknown, dpr = 1): GhostView => ({ ctx: ctx as GhostCanvasCtx, dpr, setIso(c) { c.setTransform(2, 1, -2, 1, 100, 50); }, screen(x, y) { return { x: 100 + (x - y) * 2, y: 50 + (x + y) }; } });
  it('a blocked building footprint: hatched inside its outline, with a ✕ at its centre', () => {
    const { ctx, ops } = recorder(), v = view(ctx, 2), pts = [10, 10, 20, 10, 20, 16, 10, 16];
    drawGhostPoly(v, pts, 'invalid');
    const clip = ops.indexOf('clip');
    assert.ok(clip > 0, 'the hatch is clipped to the footprint');
    assert.ok(hatchStrokes(ops.slice(clip)) >= 1);
    const c = v.screen(15, 13); assert.ok(crossAt(ops, c.x, c.y, 2));
    const ok = recorder(); drawGhostPoly(view(ok.ctx), pts, 'valid');
    assert.ok(!ok.ops.includes('clip') && !ok.ops.some(o => o.startsWith('arc')), 'a footprint that can go has neither');
    const r = recorder(); drawGhostRing(view(r.ctx), 5, 5, 1.5, 0, 'invalid');
    assert.ok(crossAt(r.ops, 100, 60, 1), "a refused marker's ring gets its ✕");
    const club = recorder(), cv = view(club.ctx), cc = cv.screen(15, 13); drawRefusedMarks(cv, pts);
    assert.ok(club.ops.includes('clip') && hatchStrokes(club.ops) === 1 && crossAt(club.ops, cc.x, cc.y, 1), "a refused rect: the hatch and the ✕");
    // the clubhouse's ghost: its ✕ by the front corner (the lowest on screen), 16 css px in towards the centre
    const big = [10, 10, 40, 10, 40, 34, 10, 34], fr = recorder(), fv = view(fr.ctx), bc = fv.screen(25, 22), f = fv.screen(40, 34), L = Math.hypot(bc.x - f.x, bc.y - f.y);
    drawRefusedMarks(fv, big, 'front');
    assert.ok(L > 16 && crossAt(fr.ops, f.x + ((bc.x - f.x) * 16) / L, f.y + ((bc.y - f.y) * 16) / L, 1), "the clubhouse's ✕ by its front corner");
  });
  it("New hole's left-out cells: the red hatch over them and a ✕ on the patch", () => {
    // the hatch is a canvas pattern: a tiny canvas double stands in for document
    const pattern = { pattern: true };
    const { ctx, ops } = recorder();
    (ctx as unknown as { createPattern: () => unknown }).createPattern = () => pattern;
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }) };
    try {
      const runs = new Int32Array([0, 0, 5, REFUSED, 1, 0, 5, REFUSED, 2, 0, 5, REFUSED]);
      const gh = { runs, gx0: 100, gy0: 200 } as unknown as WizardGhost;
      const v: WizardView = { ctx: ctx as unknown as CanvasRenderingContext2D, dpr: 1, setIso(c) { c.setTransform(1, 0, 0, 1, 0, 0); }, screen: (x, y) => ({ x: (x - y) * 4, y: (x + y) * 2 }), hint() {} };
      drawRefused(v, gh);
      assert.equal(ops.filter(o => o.startsWith('rect:')).length, 3, 'one rect a run, under the hatch');
      assert.ok(ops.includes('fill:[object Object]'), 'filled with the hatch pattern');
      const p = v.screen(100 + 3.5 * CELL_T, 200 + 1.5 * CELL_T);
      assert.ok(crossAt(ops, p.x, p.y, 1), 'the ✕ on the middle of the patch');
    } finally { g.document = had; }
  });
});

describe('status to icon (T180)', () => {
  it('maps each status to the marks the hole card uses', () => {
    const want: Record<StatusKind, string> = { ok: '✓', fail: '✗', warn: '!', growing: '◔', up: '▲', down: '▼', info: 'i' };
    assert.deepEqual({ ...STATUS_ICON }, want);
    for (const k of Object.keys(want) as StatusKind[]) { assert.equal(statusIcon(k), want[k]); assert.ok(STATUS_WORD[k].length > 0); }
    assert.equal(new Set(Object.values(STATUS_ICON)).size, 7, 'every mark is distinct');
  });
  it('picks the kind: a trend, a price against the treasury, a balance', () => {
    assert.equal(trendKind(5), 'up'); assert.equal(trendKind(-0.5), 'down'); assert.equal(trendKind(0), null); assert.equal(trendKind(0.4, 0.5), null); assert.equal(trendKind(NaN), null);
    assert.equal(affordKind(100, 100), 'ok'); assert.equal(affordKind(101, 100), 'fail');
    assert.equal(balanceKind(-1), 'warn'); assert.equal(balanceKind(0), null);
    assert.equal(withIcon('up', '+$1,200'), '▲ +$1,200'); assert.equal(withIcon(null, '$0'), '$0');
  });
});
