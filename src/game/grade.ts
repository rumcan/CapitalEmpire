/** T226 (#652): the golden-hour colour grade, step 2 of the owner's concept look (docs/art/CONCEPT-LOOK.md; the owner, 2026-10-27, with
 *  docs/art/concept/maple-falls-concept.webp: "this is the look and feel we need to get to").
 *
 *  One full-screen pass after the scene (gl.ts GLRenderer.endFrame: after the ground with T215's lamp reflection and T199's swamp glint, the
 *  shadows and the sprites; before the overlay canvas and the UI). When it is on, the scene draws into an offscreen texture of the screen's
 *  size and the pass lays it on the screen through:
 *
 *  - **A tone curve, not a tint** (the owner's no-flat-colour-wash rule): every change is a curve of the pixel's own value that keeps 0 and 1
 *    where they are, so black stays black, white stays white, and the texture's detail (its local differences) survives:
 *    - split toning by the pixel's luma: highlights a little warmer (red up, blue down), deep shadows a little cooler, toward teal (red down,
 *      blue and a touch of green up). Each channel moves by k * c * (1 - c) (a bump, zero at 0 and 1, monotonic for |k| < 1), k the zone's
 *      weight times the channel's gain, so nothing clips and nothing is washed over;
 *    - mid contrast up slightly: an S-curve c + a * (2c - 1) * c * (1 - c) (mid slope 1 + a / 2, end slopes 1 - a);
 *    - saturation up slightly, as a vibrance: the dull colours (the gold ground, the greens) gain more than the already rich ones (the
 *      maples' reds), and never past the gamut (each pixel's boost is held where its first channel would reach 0 or 1: no hue shift, no clip).
 *  - **A soft vignette:** the corners a few percent darker (a multiply: the texture stays).
 *  - **An optional edge blur** (tilt-shift, the miniature feel): off by default, its own switch. The scene at half the screen's size, blurred
 *    by a separable Gaussian (two passes), mixed in toward the top and bottom of the screen; the middle stays sharp.
 *  - **Night:** the grade eases off after dusk (the night light's amount, engine.ts nightAmount), so the lamps' warm light stays true.
 *
 *  Off (the gear menu's Colour grade: Off), at strength 0 or fully eased off with the edge blur off, the pass is skipped and the scene draws
 *  straight to the screen as before, bit for bit. Pure TypeScript, no DOM: the node tests run the curve (gradeRgb) and gl.ts builds its shader
 *  from the same numbers (GRADE_GLSL). Colours are display values 0..1. */

/** the curve's numbers at strength 1 (the gear menu's 100%):
 *  - warm, cool: each channel's gain (r, g, b) in the highlights and in the deep shadows (the bump's k at the zone's full weight);
 *  - hi: the highlight zone, by luma (its weight a smoothstep from hi[0] to hi[1]); lo: the deep shadow zone (its weight 1 below lo[0], a
 *    smoothstep down to 0 at lo[1]);
 *  - contrast: the S-curve's a; vibrance: the saturation boost of a grey-ish colour (1 + vibrance * (1 - its saturation));
 *  - vignette: how much darker the corners are; vignetteFrom: where the darkening starts, on the screen's radius (0 the centre, 1 a corner;
 *    the screen's own shape, so the sides' midpoints are at 0.71);
 *  - night: the night light's amount over which the grade eases off (a smoothstep: whole below night[0], none past night[1]).
 *  Tuned against the concept beside the town and the range (scripts/dev/grade-shots.mjs): the concept's warmth and richness, not its colours
 *  (our ground is still gold) */
export const GRADE = {
  warm: [0.11, 0.04, -0.12] as readonly [number, number, number],
  cool: [-0.1, 0.015, 0.08] as readonly [number, number, number],
  hi: [0.38, 0.92] as readonly [number, number],
  lo: [0.06, 0.42] as readonly [number, number],
  contrast: 0.18,
  vibrance: 0.22,
  vignette: 0.07,
  vignetteFrom: 0.42,
  night: [0.25, 0.9] as readonly [number, number],
} as const;
/** the edge blur (tilt-shift): the Gaussian's sigma in half-screen px (so about twice that on the screen), how far it reaches (taps a side,
 *  merged in pairs into bilinear fetches), and where it starts toward the top and bottom: the blur's share is a smoothstep from `from` to 1 of
 *  the distance from the screen's middle row (0 the middle, 1 the top or bottom edge), so the middle `from` of the screen stays sharp */
export const EDGE_BLUR = { sigma: 3, reach: 9, from: 0.38 } as const;
/** the gear menu's strength range (0 = none .. 1.5 = 150%) */
export const GRADE_STRENGTH_MAX = 1.5;

/** the player's setting (the gear menu's Colour grade), remembered in localStorage */
export interface GradeSettings { on: boolean; strength: number; edgeBlur: boolean }
export const GRADE_DEFAULT: Readonly<GradeSettings> = { on: true, strength: 1, edgeBlur: false };
export const GRADE_KEY = 'capitalempire.grade';
export type GradeStore = Pick<Storage, 'getItem' | 'setItem'>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** a setting from anything (a stored value, the menu): the defaults where a field is missing or wrong, the strength held to 0..150% */
export function clampGrade(v: unknown): GradeSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof GradeSettings, unknown>>, D = GRADE_DEFAULT;
  return {
    on: typeof o.on === 'boolean' ? o.on : D.on,
    strength: typeof o.strength === 'number' && Number.isFinite(o.strength) ? clamp(o.strength, 0, GRADE_STRENGTH_MAX) : D.strength,
    edgeBlur: typeof o.edgeBlur === 'boolean' ? o.edgeBlur : D.edgeBlur,
  };
}
/** the remembered setting (the defaults when none, or it cannot be read) */
export function loadGrade(store: GradeStore | null): GradeSettings {
  let raw: string | null = null;
  try { raw = store?.getItem(GRADE_KEY) ?? null; } catch { /* storage may be unavailable */ }
  if (!raw) return { ...GRADE_DEFAULT };
  try { return clampGrade(JSON.parse(raw)); } catch { return { ...GRADE_DEFAULT }; }
}
export function saveGrade(store: GradeStore | null, g: GradeSettings): void {
  try { store?.setItem(GRADE_KEY, JSON.stringify(clampGrade(g))); } catch { /* storage may be unavailable */ }
}

/** how much of the grade is left at the night light's amount (0 day .. 1 night): all of it by day and through the start of dusk, none at night */
export const gradeDay = (night: number) => 1 - smooth(GRADE.night[0], GRADE.night[1], clamp(night, 0, 1));

/** what the pass draws this frame (gl.ts GLRenderer.grade): the curve's strength (the setting's times gradeDay) and the edge blur; null when
 *  there is nothing to draw (off, or no strength and no blur): the scene then draws straight to the screen, bit for bit as before */
export interface GradeFrame { strength: number; edgeBlur: boolean }
export function gradeFrame(g: GradeSettings, night: number): GradeFrame | null {
  if (!g.on) return null;
  const strength = clamp(g.strength, 0, GRADE_STRENGTH_MAX) * gradeDay(night);
  return strength > 0 || g.edgeBlur ? { strength, edgeBlur: g.edgeBlur } : null;
}

/** the tone curve at strength s (0 = the identity, exactly) of one display colour (0..1 each): split toning, mid contrast, vibrance (the
 *  module's comment). The shader's gradeCurve (GRADE_GLSL) is the same maths, line for line */
export function gradeRgb(r: number, g: number, b: number, s: number): [number, number, number] {
  if (!(s > 0)) return [r, g, b];
  const G = GRADE, L = luma(r, g, b), hw = smooth(G.hi[0], G.hi[1], L), lw = 1 - smooth(G.lo[0], G.lo[1], L);
  const bump = (c: number, k: number) => c + k * c * (1 - c);
  const k = (i: 0 | 1 | 2) => s * (G.warm[i] * hw + G.cool[i] * lw);
  let c = [bump(r, k(0)), bump(g, k(1)), bump(b, k(2))];
  const a = s * G.contrast;
  c = c.map(v => v + a * (2 * v - 1) * v * (1 - v));
  const L2 = luma(c[0]!, c[1]!, c[2]!), sat = Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
  let f = 1 + s * G.vibrance * (1 - sat);
  for (const v of c) { const d = v - L2; if (d > 1e-6) f = Math.min(f, (1 - L2) / d); else if (d < -1e-6) f = Math.min(f, L2 / -d); }
  return [clamp(L2 + (c[0]! - L2) * f, 0, 1), clamp(L2 + (c[1]! - L2) * f, 0, 1), clamp(L2 + (c[2]! - L2) * f, 0, 1)];
}
/** the vignette's multiplier at screen fraction (u, v) (0..1 each) at strength s: 1 at the centre, 1 - s * GRADE.vignette in the corners */
export function vignette(u: number, v: number, s: number): number {
  const r = Math.hypot(2 * u - 1, 2 * v - 1) * Math.SQRT1_2;
  return 1 - s * GRADE.vignette * smooth(GRADE.vignetteFrom, 1, r);
}
/** the edge blur's share at screen fraction v (0 the top or the bottom .. 1): none in the middle, all of it at the top and bottom edges */
export const edgeBlurMask = (v: number) => smooth(EDGE_BLUR.from, 1, Math.abs(2 * v - 1));

/** the edge blur's one-dimensional Gaussian as bilinear fetches: the centre tap, then each pair of discrete taps (i, i + 1) merged into one
 *  fetch between them (its offset the pair's weighted centre, its weight their sum), mirrored on the other side by the shader; the weights
 *  sum to 1 */
export function blurTaps(sigma = EDGE_BLUR.sigma, reach = EDGE_BLUR.reach): { offsets: number[]; weights: number[] } {
  const w = Array.from({ length: reach + 1 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const total = w[0]! + 2 * w.slice(1).reduce((s, v) => s + v, 0), n = w.map(v => v / total);
  const offsets = [0], weights = [n[0]!];
  for (let i = 1; i <= reach; i += 2) {
    const a = n[i]!, b = i + 1 <= reach ? n[i + 1]! : 0;
    offsets.push((i * a + (i + 1) * b) / (a + b)); weights.push(a + b);
  }
  return { offsets, weights };
}

const glslNum = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(6)));
const glslVec3 = (v: readonly number[]) => `vec3(${v.map(glslNum).join(', ')})`;
/** the shader's curve (gl.ts FS_GRADE): gradeRgb, line for line */
export const GRADE_GLSL = `float gradeLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 gradeCurve(vec3 c, float s) {
  float L = gradeLuma(c), hw = smoothstep(${glslNum(GRADE.hi[0])}, ${glslNum(GRADE.hi[1])}, L), lw = 1.0 - smoothstep(${glslNum(GRADE.lo[0])}, ${glslNum(GRADE.lo[1])}, L);
  vec3 k = s * (${glslVec3(GRADE.warm)} * hw + ${glslVec3(GRADE.cool)} * lw);
  c = c + k * c * (1.0 - c);
  float a = s * ${glslNum(GRADE.contrast)};
  c = c + a * (2.0 * c - 1.0) * c * (1.0 - c);
  float L2 = gradeLuma(c), sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float f = 1.0 + s * ${glslNum(GRADE.vibrance)} * (1.0 - sat);
  vec3 d = c - L2;
  for (int i = 0; i < 3; i++) { if (d[i] > 1e-6) f = min(f, (1.0 - L2) / d[i]); else if (d[i] < -1e-6) f = min(f, L2 / -d[i]); }
  return clamp(L2 + d * f, 0.0, 1.0);
}
float gradeVignette(vec2 uv, float s) {
  float r = length(uv * 2.0 - 1.0) * 0.70710678;
  return 1.0 - s * ${glslNum(GRADE.vignette)} * smoothstep(${glslNum(GRADE.vignetteFrom)}, 1.0, r);
}
float gradeEdgeMask(float v) { return smoothstep(${glslNum(EDGE_BLUR.from)}, 1.0, abs(2.0 * v - 1.0)); }`;
/** the edge blur's separable pass (gl.ts FS_BLUR): blurTaps' fetches along uStep (one half-screen px, in uv), mirrored */
export function blurGlsl(): string {
  const t = blurTaps();
  return t.offsets.map((o, i) => i === 0
    ? `  vec3 c = texture(uSrc, uv).rgb * ${glslNum(t.weights[0]!)};`
    : `  c += (texture(uSrc, uv + uStep * ${glslNum(o)}).rgb + texture(uSrc, uv - uStep * ${glslNum(o)}).rgb) * ${glslNum(t.weights[i]!)};`).join('\n');
}
