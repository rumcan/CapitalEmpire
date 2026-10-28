/** T261 (#766; the owner, 2026-10-29, Course › Shape by hand, Waste area: "the tone also no longer applies. it should also be a filter that
 *  increases and decreases exposure and not a flat shape on top that changes transparency"). Pure, Node: the course looks the grid lays
 *  (course-look.ts courseLookSet), the chunk patches (ext/course-grid coursePatch), the exposure maths and the old saves' tones as exposure
 *  (exposure.ts), and how exposure is drawn (a stand-in 2D context). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_PRESETS, DEFAULT_STYLE, clampStyle, fromTuples, toTuple, type BrushKind } from '../src/game/paint';
import { courseBandOf, courseLookSet, courseTexOf, type LookStyle } from '../src/game/course-look';
import { exposeClip, exposeDraw, exposureAtStops, exposureGrey, exposureLabel, exposureOf, exposureStops, toneOfExposure } from '../src/game/exposure';
import { SURF, makeGrid, paintDisc } from '../src/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';

const pre = (_s: string, old: string) => ({ tex: old, sc: 1, a: 0 });
const dflt = Object.fromEntries(BRUSH_PRESETS.map(p => [p.kind, { style: p.style }])) as Partial<Record<BrushKind, { style: LookStyle }>>;
const looksOf = (b: Partial<Record<BrushKind, { style: LookStyle }>>): CourseLooks => { const s = courseLookSet(b, pre); return { surf: s.surf, collar: s.collar, band: s.band }; };

test('the waste area wears its brush look on the course (its texture, scale, angle, tone): the style editor reaches it', () => {
  const waste = dflt.waste!.style;
  // untouched: exactly the preset it wore before (the waste brush's default is the course preset at scale 1, angle 0)
  assert.deepEqual(courseLookSet(dflt, pre).surf[SURF.waste], { tex: waste.tex, sc: 1, a: 0 });
  // the style editor's look: another texture, scale and angle, Darker
  const st = clampStyle({ ...waste, tex: 'dirt', scale: 2, angle: 30, tone: 1, toneAmt: 0.3 });
  const surf = courseLookSet({ ...dflt, waste: { style: st } }, pre).surf[SURF.waste]!;
  assert.equal(surf.tex, 'dirt'); assert.equal(surf.sc, 2); assert.equal(surf.a, 30);
  assert.ok(surf.x !== undefined && Math.abs(surf.x - 0.7) < 1e-9, `Darker 30% is exposure 0.7 (got ${surf.x})`);
  // and it reaches the chunk the waste cells lie in
  const g = makeGrid(0, 0, 256, 256); paintDisc(g, 30, 30, 5, SURF.waste, 1, 0);
  const l = coursePatch(g, 0, 0, looksOf({ ...dflt, waste: { style: st } }), 0)!.course!.layers.find(q => q.s === SURF.waste)!;
  assert.equal(l.tex, 'dirt'); assert.ok(l.x !== undefined && Math.abs(l.x - 0.7) < 1e-9, 'the layer carries the exposure');
});

test('exposure: old saves map across (Darker a: 1 - a, at least 0.5; Lighter a: 1 + a; the tint ignored); the slider and its words', () => {
  // the saved tone fields as exposure
  assert.equal(exposureOf(0, 0.35), 1);
  assert.equal(exposureOf(1, 0.3), 0.7); assert.equal(exposureOf(1, 0.35), 0.65); assert.equal(exposureOf(1, 0.8), 0.5, 'at least 0.5');
  assert.equal(exposureOf(2, 0.2), 1.2); assert.equal(exposureOf(2, 1), 2); assert.equal(exposureOf(2, 3), 2, 'at most 2');
  assert.equal(exposureOf(undefined, undefined), 1); assert.equal(exposureOf(1, Number.NaN), 1);
  // an old look's every field loads as it was (the save format is unchanged), and only the tone and its strength are read
  const old = clampStyle({ ...DEFAULT_STYLE, tex: 'dirt', tone: 1, toneAmt: 0.4, tint: '#402010' });
  assert.deepEqual([old.tone, old.toneAmt, old.tint], [1, 0.4, '#402010']);
  assert.equal(courseTexOf(old).x, 0.6); assert.equal(courseTexOf({ ...old, tint: '#ffffff' }).x, 0.6, 'the tint is not read');
  const area = fromTuples([toTuple({ ...old, id: 1, pts: [0, 0, 4, 0, 4, 4, 0, 4] })])[0]!;
  assert.equal(exposureOf(area.tone, area.toneAmt), 0.6, 'a painted area round-trips its tone as the same exposure');
  // the slider writes the same fields back
  assert.deepEqual(toneOfExposure(0.7), { tone: 1, toneAmt: 0.3 }); assert.deepEqual(toneOfExposure(1.2), { tone: 2, toneAmt: 0.2 });
  assert.deepEqual(toneOfExposure(1), { tone: 0, toneAmt: DEFAULT_STYLE.toneAmt }, 'none saves as the default does');
  assert.deepEqual(toneOfExposure(0.1), { tone: 1, toneAmt: 0.5 }); assert.deepEqual(toneOfExposure(9), { tone: 2, toneAmt: 1 });
  for (const f of [0.5, 0.65, 0.8, 1, 1.25, 1.7, 2]) { const t = toneOfExposure(f); assert.ok(Math.abs(exposureOf(t.tone, t.toneAmt) - f) < 1e-9, `${f} round-trips`); }
  // the slider is in stops: -1 one stop darker (half), 0 none, 1 one stop lighter (twice)
  assert.equal(exposureStops(0.5), -1); assert.equal(exposureStops(1), 0); assert.equal(exposureStops(2), 1);
  assert.equal(exposureAtStops(-1), 0.5); assert.equal(exposureAtStops(0), 1); assert.equal(exposureAtStops(1), 2); assert.equal(exposureAtStops(5), 2);
  // plain words
  assert.equal(exposureLabel(1), 'none'); assert.equal(exposureLabel(0.7), 'darker 30%'); assert.equal(exposureLabel(1.2), 'lighter 20%');
  assert.equal(exposureLabel(0.5), 'darker 50%'); assert.equal(exposureLabel(2), 'lighter 100%'); assert.equal(exposureLabel(1.002), 'none');
  assert.equal(exposureGrey(0.5), 'rgb(128,128,128)'); assert.equal(exposureGrey(0.7), 'rgb(179,179,179)');
  // the band: the Border tone as exposure, else the band's own
  const green = BRUSH_PRESETS.find(b => b.kind === 'green')!.style;
  assert.equal(courseBandOf('green', clampStyle({ ...green, btone: 1, btoneAmt: 0.25 }), { tex: 'preset:fringe', sc: 1, a: 0 }).x, 0.75);
  assert.equal(courseBandOf('green', green, { tex: 'preset:fringe', sc: 1, a: 0 }).x, undefined);
});

type T6 = { a: number; b: number; c: number; d: number; e: number; f: number };
/** a stand-in 2D context: records each draw with the composite, alpha and style it ran under */
function fakeCtx(W = 100, H = 80) {
  const ops: { op: string; alpha: number; style: unknown; what: string; args?: number[] }[] = [];
  const g = {
    globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000' as unknown, strokeStyle: '#000' as unknown, canvas: { width: W, height: H },
    T: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as T6, stack: [] as { op: string; alpha: number; fs: unknown; ss: unknown; T: T6 }[],
    save() { this.stack.push({ op: this.globalCompositeOperation, alpha: this.globalAlpha, fs: this.fillStyle, ss: this.strokeStyle, T: this.T }); },
    restore() { const s = this.stack.pop()!; this.globalCompositeOperation = s.op; this.globalAlpha = s.alpha; this.fillStyle = s.fs; this.strokeStyle = s.ss; this.T = s.T; },
    getTransform() { return this.T; }, setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.T = { a, b, c, d, e, f }; },
    fillRect(...args: number[]) { ops.push({ op: this.globalCompositeOperation, alpha: this.globalAlpha, style: this.fillStyle, what: 'fillRect', args }); },
    stroke() { ops.push({ op: this.globalCompositeOperation, alpha: this.globalAlpha, style: this.strokeStyle, what: 'stroke' }); },
    drawImage(src: unknown, ...args: number[]) { ops.push({ op: this.globalCompositeOperation, alpha: this.globalAlpha, style: src === this.canvas ? 'self' : 'other', what: 'drawImage', args }); },
  };
  return { g, ops, c: g as unknown as CanvasRenderingContext2D };
}

test('exposure is drawn from the texture itself: darker a multiply of grey, lighter the pixels added to themselves; no tint, no flat wash', () => {
  // over a fill already in the clip: darker multiplies the grey of f over the box at full alpha
  let { g, ops, c } = fakeCtx();
  exposeClip(c, 0.7, 2, 3, 12, 8);
  assert.deepEqual(ops, [{ op: 'multiply', alpha: 1, style: 'rgb(179,179,179)', what: 'fillRect', args: [2, 3, 10, 5] }]);
  assert.equal(g.globalCompositeOperation, 'source-over'); assert.equal(g.globalAlpha, 1);
  // lighter: the canvas drawn onto itself ('lighter' at f - 1) over the box's device rectangle, kept on the canvas
  ({ g, ops, c } = fakeCtx(100, 80)); g.setTransform(4, 0, 0, 4, 10, 0);
  exposeClip(c, 1.4, 2, 3, 30, 8);
  assert.equal(ops.length, 1); const d = ops[0]!;
  assert.equal(d.what, 'drawImage'); assert.equal(d.style, 'self'); assert.equal(d.op, 'lighter'); assert.ok(Math.abs(d.alpha - 0.4) < 1e-9);
  assert.deepEqual(d.args, [18, 12, 82, 20, 18, 12, 82, 20], 'the box on the canvas (x 18..100, y 12..32), clipped to it');
  assert.deepEqual(g.getTransform(), { a: 4, b: 0, c: 0, d: 4, e: 10, f: 0 }, 'the transform comes back');
  // none draws nothing
  ({ g, ops, c } = fakeCtx()); exposeClip(c, 1, 0, 0, 10, 10); exposeClip(c, undefined, 0, 0, 10, 10);
  assert.equal(ops.length, 0);
  // over a stroke (a feather's step at alpha 0.25): darker the stroke again in grey; lighter the texture's stroke again, added
  ({ g, ops, c } = fakeCtx()); const tex = { pattern: 'grass' } as unknown as CanvasPattern;
  exposeDraw(c, 0.5, tex, () => g.stroke(), 0.25);
  exposeDraw(c, 1.6, tex, () => g.stroke(), 0.25);
  assert.deepEqual(ops.map(o => [o.op, Math.round(o.alpha * 1000) / 1000, o.style]), [['multiply', 0.25, 'rgb(128,128,128)'], ['lighter', 0.15, tex]]);
  assert.equal(g.globalCompositeOperation, 'source-over'); assert.equal(g.globalAlpha, 1); assert.equal(g.strokeStyle, '#000', 'the styles come back');
  // never a colour of its own: no style but grey or the texture
  for (const o of ops) assert.ok(o.style === tex || /^rgb\((\d+),\1,\1\)$/.test(String(o.style)), `${String(o.style)} is grey or the texture`);
});
