// Headless tests for T226 (#652): the golden-hour colour grade (src/game/grade.ts; the pass is gl.ts FS_GRADE and GLRenderer.endFrame, the
// setting the gear menu's Colour grade, src/ui/GradePanel.tsx; the look is checked in the browser by scripts/dev/grade-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EDGE_BLUR, GRADE, GRADE_DEFAULT, GRADE_GLSL, GRADE_KEY, GRADE_STRENGTH_MAX, blurGlsl, blurTaps, clampGrade, edgeBlurMask, gradeDay, gradeFrame,
  gradeRgb, loadGrade, luma, saveGrade, vignette,
} from '../src/game/grade';

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
/** a few hundred colours over the cube, greys and saturated ones included */
const colours: [number, number, number][] = [];
for (let r = 0; r <= 1.0001; r += 0.125) for (let g = 0; g <= 1.0001; g += 0.125) for (let b = 0; b <= 1.0001; b += 0.125) colours.push([r, g, b]);

test('T226 the curve at strength 0 is the identity, exactly', () => {
  for (const c of colours) assert.deepEqual(gradeRgb(c[0], c[1], c[2], 0), c);
  assert.deepEqual(gradeRgb(0.3, 0.6, 0.2, NaN), [0.3, 0.6, 0.2]);
  assert.equal(vignette(0, 0, 0), 1); assert.equal(vignette(1, 1, 0), 1);
});

test('T226 the curve keeps black and white, stays in gamut, and never washes a flat colour over (every channel stays a curve of itself)', () => {
  for (const s of [0.5, 1, GRADE_STRENGTH_MAX]) {
    assert.deepEqual(gradeRgb(0, 0, 0, s), [0, 0, 0], 'black stays black');
    gradeRgb(1, 1, 1, s).forEach(v => assert.ok(Math.abs(v - 1) < 1e-9, 'white stays white'));
    for (const c of colours) for (const v of gradeRgb(c[0], c[1], c[2], s)) assert.ok(v >= 0 && v <= 1, `in gamut: ${c} -> ${v}`);
    // a channel at 0 or 1 stays there (no lift, no wash: the bump and the S-curve are 0 at both ends; the vibrance only spreads from the luma)
    for (const c of colours) {
      const o = gradeRgb(c[0], c[1], c[2], s);
      for (let i = 0; i < 3; i++) if (c[i] === 0 && c.every(v => v === 0 || v === 1)) assert.ok(o[i]! < 1e-9, `${c}: a 0 channel of a pure colour stays 0`);
    }
  }
});

test('T226 the curve is monotonic: along the grey ramp and along each channel, the output never falls', () => {
  for (const s of [0.25, 1, GRADE_STRENGTH_MAX]) {
    let prev = gradeRgb(0, 0, 0, s);
    for (let x = 0.002; x <= 1.0001; x += 0.002) {
      const o = gradeRgb(x, x, x, s);
      for (let i = 0; i < 3; i++) assert.ok(o[i]! >= prev[i]! - 1e-9, `grey ${x.toFixed(3)} channel ${i} at ${s}`);
      assert.ok(luma(...o) >= luma(...prev) - 1e-9);
      prev = o;
    }
    // each channel swept with the others held (a texture's detail: a brighter texel stays brighter in that channel)
    for (const base of [[0.2, 0.3, 0.1], [0.7, 0.55, 0.3], [0.45, 0.6, 0.35], [0.9, 0.4, 0.2], [0.1, 0.12, 0.15]] as const) for (let ch = 0; ch < 3; ch++) {
      let last = -1;
      for (let x = 0; x <= 1.0001; x += 0.004) {
        const c = [...base] as [number, number, number]; c[ch] = x;
        const o = gradeRgb(c[0], c[1], c[2], s)[ch]!;
        assert.ok(o >= last - 1e-9, `channel ${ch} of ${base} at ${x.toFixed(3)}, strength ${s}: ${o} < ${last}`); last = o;
      }
    }
  }
});

test('T226 at 100%: highlights warmer, deep shadows cooler (toward teal), mid contrast and saturation up slightly', () => {
  const warmth = (c: readonly number[]) => c[0]! - c[2]!;
  // a grey highlight turns warm (red gains most, blue least), a grey deep shadow cool (blue over red, red down); a mid grey moves a little
  const hi = gradeRgb(0.85, 0.85, 0.85, 1), lo = gradeRgb(0.12, 0.12, 0.12, 1), mid = gradeRgb(0.5, 0.5, 0.5, 1);
  assert.ok(hi[0] > hi[1] && hi[1] > hi[2] && warmth(hi) > 0.03, `highlight warmer: ${hi}`);
  assert.ok(lo[2] > lo[0] && lo[1] > lo[0] && lo[0] < 0.12, `shadow cooler: ${lo}`);
  assert.ok(mid.every(v => Math.abs(v - 0.5) < 0.06) && warmth(mid) > 0 && warmth(lo) < 0, `mid grey moves little, on the warm side: ${mid}`);
  // the gold ground and a green lawn get warmer in their light and richer; a texture's local contrast is kept or raised, never flattened
  for (const c of [[0.72, 0.6, 0.36], [0.42, 0.55, 0.25]] as const) {
    const o = gradeRgb(c[0], c[1], c[2], 1), sat = (v: readonly number[]) => Math.max(...v) - Math.min(...v);
    assert.ok(sat(o) > sat(c), `${c}: more colour (${sat(c).toFixed(3)} -> ${sat(o).toFixed(3)})`);
    for (const d of [0.02, 0.05]) {
      const a = gradeRgb(c[0] - d, c[1] - d, c[2] - d, 1), b = gradeRgb(c[0] + d, c[1] + d, c[2] + d, 1);
      assert.ok(luma(...b) - luma(...a) >= 2 * d * 0.95, `${c} ±${d}: the detail survives (${(luma(...b) - luma(...a)).toFixed(4)})`);
    }
  }
  // mid contrast: a step round the middle grows slightly (the S-curve's slope there, 1 + 2a(p(1 - p)) at its pivot, a little more with the warmth)
  const step = luma(...gradeRgb(0.55, 0.55, 0.55, 1)) - luma(...gradeRgb(0.45, 0.45, 0.45, 1));
  assert.ok(step > 0.1 * (1 + GRADE.contrast * 0.3) && step < 0.1 * (1 + GRADE.contrast * 1.2), `mid step ${step}`);
  // and the darkest darks a little deeper, the bright mids a little brighter (below the pivot down, above it up)
  assert.ok(luma(...gradeRgb(0.2, 0.2, 0.2, 1)) < 0.2 && luma(...gradeRgb(0.6, 0.6, 0.6, 1)) > 0.6);
  // more strength, more of it; the already rich colours gain less than the dull ones (vibrance)
  const h15 = gradeRgb(0.85, 0.85, 0.85, 1.5); assert.ok(warmth(h15) > warmth(hi));
  const gain = (c: [number, number, number]) => { const o = gradeRgb(...c, 1); return (Math.max(...o) - Math.min(...o)) / (Math.max(...c) - Math.min(...c)); };
  assert.ok(gain([0.55, 0.5, 0.42]) > gain([0.85, 0.2, 0.1]), 'the dull gain more than the rich');
});

test('T226 the vignette: the centre untouched, the corners a few percent darker, the sides between', () => {
  assert.equal(vignette(0.5, 0.5, 1), 1);
  const corner = vignette(0, 0, 1), side = vignette(0, 0.5, 1);
  assert.ok(Math.abs(corner - (1 - GRADE.vignette)) < 1e-9 && GRADE.vignette >= 0.03 && GRADE.vignette <= 0.1, `corner ${corner}`);
  assert.ok(side < 1 && side > corner, `side ${side}`);
  assert.equal(vignette(1, 1, 1), corner); assert.equal(vignette(1, 0, 1), corner);
});

test('T226 the edge blur: none in the middle band, all of it at the top and bottom edges; its Gaussian weights sum to 1', () => {
  assert.equal(edgeBlurMask(0.5), 0); assert.equal(edgeBlurMask(0.5 + EDGE_BLUR.from / 2 - 1e-6), 0);
  assert.equal(edgeBlurMask(0), 1); assert.equal(edgeBlurMask(1), 1);
  assert.ok(edgeBlurMask(0.1) > edgeBlurMask(0.2) && edgeBlurMask(0.9) > edgeBlurMask(0.8));
  const t = blurTaps(), total = t.weights[0]! + 2 * t.weights.slice(1).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum ${total}`);
  for (let i = 1; i < t.offsets.length; i++) assert.ok(t.offsets[i]! > t.offsets[i - 1]! && t.weights[i]! < t.weights[i - 1]! * 2);
  assert.equal(t.offsets.length, 1 + Math.ceil(EDGE_BLUR.reach / 2));
  assert.equal((blurGlsl().match(/texture\(uSrc/g) ?? []).length, 1 + 2 * Math.ceil(EDGE_BLUR.reach / 2));
});

test('T226 night: the grade eases off after dusk; off, no strength or fully eased with no blur: nothing to draw (the pass is skipped)', () => {
  assert.equal(gradeDay(0), 1); assert.equal(gradeDay(GRADE.night[0]), 1); assert.equal(gradeDay(1), 0);
  for (let n = 0; n < 1; n += 0.05) assert.ok(gradeDay(n + 0.05) <= gradeDay(n) + 1e-12);
  assert.deepEqual(gradeFrame({ on: true, strength: 1, edgeBlur: false }, 0), { strength: 1, edgeBlur: false });
  assert.equal(gradeFrame({ on: false, strength: 1, edgeBlur: true }, 0), null, 'off: skipped');
  assert.equal(gradeFrame({ on: true, strength: 0, edgeBlur: false }, 0), null, '0%: skipped');
  assert.equal(gradeFrame({ on: true, strength: 1, edgeBlur: false }, 1), null, 'night: eased off, skipped');
  assert.deepEqual(gradeFrame({ on: true, strength: 1, edgeBlur: true }, 1), { strength: 0, edgeBlur: true }, 'the blur is its own switch');
  const dusk = gradeFrame({ on: true, strength: 1.5, edgeBlur: false }, 0.5)!; assert.ok(dusk.strength > 0 && dusk.strength < 1.5);
});

test('T226 the setting: defaults, clamped, remembered', () => {
  assert.deepEqual(GRADE_DEFAULT, { on: true, strength: 1, edgeBlur: false });
  assert.deepEqual(clampGrade(null), GRADE_DEFAULT);
  assert.deepEqual(clampGrade({ on: false, strength: 9, edgeBlur: true }), { on: false, strength: GRADE_STRENGTH_MAX, edgeBlur: true });
  assert.deepEqual(clampGrade({ on: 'yes', strength: -2, edgeBlur: 1 }), { on: true, strength: 0, edgeBlur: false });
  assert.deepEqual(clampGrade({ strength: NaN }), GRADE_DEFAULT);
  assert.equal(GRADE_STRENGTH_MAX, 1.5);
  const s = memStore();
  assert.deepEqual(loadGrade(s), GRADE_DEFAULT, 'nothing stored: the defaults');
  saveGrade(s, { on: false, strength: 0.65, edgeBlur: true });
  assert.deepEqual(JSON.parse(s.m.get(GRADE_KEY)!), { on: false, strength: 0.65, edgeBlur: true });
  assert.deepEqual(loadGrade(s), { on: false, strength: 0.65, edgeBlur: true });
  saveGrade(s, { on: true, strength: 7, edgeBlur: false }); assert.equal(loadGrade(s).strength, GRADE_STRENGTH_MAX, 'saved clamped');
  assert.deepEqual(loadGrade(memStore({ [GRADE_KEY]: '{not json' })), GRADE_DEFAULT);
  assert.deepEqual(loadGrade(null), GRADE_DEFAULT);
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadGrade(throwing), GRADE_DEFAULT); assert.doesNotThrow(() => saveGrade(throwing, GRADE_DEFAULT));
});

test('T226 the shader is the same curve, and off skips the pass (the scene straight to the screen, bit for bit)', () => {
  for (const v of [...GRADE.warm, ...GRADE.cool, ...GRADE.hi, ...GRADE.lo, GRADE.contrast, GRADE.vibrance, GRADE.vignette, GRADE.vignetteFrom, EDGE_BLUR.from])
    assert.ok(GRADE_GLSL.includes(Number.isInteger(v) ? v.toFixed(1) : String(v)), `GLSL has ${v}`);
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), e = readFileSync(resolve('src/game/engine.ts'), 'utf8');
  // begin: the scene target only while graded, else the screen (null); endShadows goes back to the frame's target; endFrame does nothing ungraded
  assert.match(gl, /this\.frameGrade = this\.grade; this\.target = this\.frameGrade \? this\.sceneTarget\(v\.cw, v\.ch\) : null;/);
  assert.match(gl, /gl\.bindFramebuffer\(gl\.FRAMEBUFFER, this\.target\); gl\.blendEquation\(gl\.FUNC_ADD\)/);
  assert.match(gl, /if \(!g \|\| !this\.target \|\| !this\.sceneTex\) \{ this\.target = null; return; \}/);
  // the engine: the grade from the setting and the night, the plain game only; the pass before the overlay (the night pass reads the canvas)
  assert.match(e, /gl\.grade = this\.boot\.kind === 'game' \? gradeFrame\(this\.grade, this\.nightAmount\(\)\) : null;/);
  const end = e.indexOf('gl.endFrame();'), over = e.indexOf('this.drawOverlay(now);', end);
  assert.ok(end > 0 && over > end, 'the grade before the overlay');
});
