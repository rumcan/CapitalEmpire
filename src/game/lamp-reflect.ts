/** T215 (#561, phase 1): the street lamps' reflection pools as a camera specular (the owner, 2026-10-27: "a global specular layer that lies
 *  on the camera and goes where the camera does ... most visible in the center to least at the edge of the screen").
 *
 *  Off (the default), the ground worker bakes the pools into the road picture as it always has (renderer.ts step 9: each pool stamp laid as the
 *  asphalt's brighter 'lit' mosaic). On (window.__game.specCam), the worker bakes the pools' coverage (stamp x asphalt mask x strength) into a
 *  small per-chunk reflection mask instead, with the road's local mean colour, and the GPU lights the road by it as it draws the chunk (gl.ts
 *  FS_QUAD, specLight): the bake's own blend toward the 'lit' mosaics' colours (the painting's measured lamp response, litAt, on the painting's
 *  pixel rebuilt from the ground's: the asphalt's own texture), at an intensity of mask x camera falloff x strength. So at the screen's centre
 *  by night the pools look as baked, and toward the edges they fade out. Never a flat glow: every pixel keeps its texture and local contrast.
 *
 *  Pure: the node tests run it, and gl.ts builds its shader from the same tables. */
import { ASPHALT_MEAN } from './ground-art';

/** the reflection mask's size against its chunk's: a quarter each way, as T186's shade mask (the pools are soft) */
export const SPEC_MASK_K = 4;

/* manifest.json light response: brightness added (DMU) and local-contrast gain (DSG) per channel, by intensity bucket IB (moved here from
 * textures.ts, which makes the 'lit' mosaics with it) */
export const LIGHT_IB = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1];
export const LIGHT_DMU = [
  [0, 16.76, 46.07, 78.8, 107.09, 134.12, 158.92, 170.35, 189.37, 200.48, 203.72, 203.72],
  [0, 5.94, 15.45, 26.45, 37.96, 52.13, 67.37, 80.68, 109.8, 124.57, 153.05, 153.05],
  [0, -3.62, -11.36, -18.76, -24.21, -26.76, -30.88, -32.08, -19.45, -18.64, -6.87, -6.87]];
export const LIGHT_DSG = [
  [0, 8.15, 19.72, 26.77, 29.02, 27.95, 27.86, 32.33, 21.16, 0, 0, 0],
  [0, 3.27, 9.8, 15.27, 20.71, 23.44, 29.76, 37.91, 37.43, 34.72, 25.59, 25.59],
  [0, 0.95, 0.86, 0.55, 1.29, 4.02, 9.32, 16.99, 27.67, 31.84, 34.4, 34.4]];
for (let b = 1; b < LIGHT_IB.length; b++) LIGHT_DSG[0]![b] = Math.max(LIGHT_DSG[0]![b]!, Math.min(30, LIGHT_DSG[0]![b - 1]!));
/** the asphalt painting's mean luma: the response's contrast term is the pixel's distance from it */
export const LUMA0 = 0.3 * ASPHALT_MEAN[0] + 0.59 * ASPHALT_MEAN[1] + 0.11 * ASPHALT_MEAN[2];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function tbl(t: number[], I: number) { if (I <= 0) return 0; if (I >= 1) return t[t.length - 1]!; let i = 1; while (LIGHT_IB[i]! < I) i++; const f = (I - LIGHT_IB[i - 1]!) / (LIGHT_IB[i]! - LIGHT_IB[i - 1]!); return t[i - 1]! + (t[i]! - t[i - 1]!) * f; }
/** the response at fixed table values (mu: the brightness added, sg: the local-contrast gain, per channel) on one pixel (0..255, in place) */
export function litAt(c: number[], mu: readonly number[], sg: readonly number[]) {
  const z = clamp((0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]! - LUMA0) / 8.8, -3, 3);
  for (let k = 0; k < 3; k++) c[k] = c[k]! + mu[k]! + z * sg[k]!;
  if (c[0]! > 140) { const k = smooth(140, 200, c[0]!); c[1] = Math.min(c[1]!, c[1]! * (1 - k) + c[0]! * 0.9 * k); }
  const mx = Math.max(c[0]!, c[1]!, c[2]!);
  if (mx > 248) { const over = mx - 248, k = 248 / mx; c[0] = c[0]! * k + over * 0.42; c[1] = c[1]! * k + over * 0.36; c[2] = c[2]! * k + over * 0.3; }
  for (let i = 0; i < 3; i++) c[i] = clamp(c[i]!, 0, 255);
}
/** the tables' values at intensity I */
export const lightAt = (I: number) => ({ mu: LIGHT_DMU.map(t => tbl(t, I)), sg: LIGHT_DSG.map(t => tbl(t, I)) });
/** town-scene.mjs litAsphalt: the painting's response to lamp light at intensity I (0..1), applied to one pixel (0..255, in place) */
export function litPixel(c: number[], I: number) { const l = lightAt(I); litAt(c, l.mu, l.sg); }

/** the two pool stamps (textures.ts pool1 / pool2: the stamp's intensity a split at 0.4) as the bake lays them: pool1 = min(a, 0.4) / 0.4
 *  toward lit(0.4), pool2 = (a - 0.4) / 0.5 toward lit(0.9). The reflection mask holds 0.4 pool1 + 0.5 pool2, which is the stamp's own
 *  intensity min(a, 0.9) (the bake's brightest is lit(0.9) too); poolCover splits it again */
export const POOL_SHARES = [0.4, 0.5] as const;
export const poolIntensity = (pool1: number, pool2: number) => POOL_SHARES[0] * pool1 + POOL_SHARES[1] * pool2;
export const poolCover = (I: number): [number, number] => [clamp(I, 0, 0.4) / 0.4, clamp((I - 0.4) / 0.5, 0, 1)];
/** the two lit mosaics' intensities (textures.ts 'lit1', 'lit2') */
export const LIT1 = lightAt(0.4), LIT2 = lightAt(0.9);
/** the bake's pool (renderer.ts step 9, off): the ground's pixel c, toward lit1 by pool1 and then toward lit2 by pool2, where the lit mosaics
 *  are the painting's pixel p put through the response (p: the asphalt painting before the road's tones, gutter and grime darkened it) */
export function bakedPixel(c: readonly number[], p: readonly number[], pool1: number, pool2: number): number[] {
  const l1 = [...p]; litAt(l1, LIT1.mu, LIT1.sg); const l2 = [...p]; litAt(l2, LIT2.mu, LIT2.sg);
  return c.map((v, k) => { const a = v + (l1[k]! - v) * pool1; return a + (l2[k]! - a) * pool2; });
}
/** the reflection mask also holds the road's local mean colour m before its markings (the asphalt alone: renderer.ts step 8). The bake's lit
 *  mosaics are the painting's pixels lit, laid over the road's tone and gutter; the GPU rebuilds the painting's pixel as the painting's mean
 *  plus the ground's texture, p = ASPHALT_MEAN + (c - m) x ASPHALT_MEAN / m (the ratio clamped, the texture at most DEVIATION a channel): its
 *  level is the painting's wherever the road is darkened (a tone, the gutter), and its texture is the road's own. (Rebuilding the level from
 *  m too, p = c x ASPHALT_MEAN / m, ran 10 luma bright or dark by where m was taken: the gutter's rows are sharper than a mask texel) */
export const RATIO_RANGE = [0.5, 2.5] as const;
/** how much of a pixel is road (w, 1 .. 0 by its RGB distance, 0..255, from the road's local mean): something on the road (a leaf, a line, a
 *  stripe) is not lit, as the bake laid its leaves over the pools (and lights them by their own pool light) and its pools over no line; its
 *  edge, part road, is lit by the road's share only (out = c + w (lit(r) - r), r = mix(mean, c, w): never a hot rim) */
export const FOREIGN = [30, 80] as const;
/** the rebuilt painting's pixel keeps at most this far (per channel, 0..255) from the rebuilt mean (about 2.5 steps of the response's contrast
 *  term): the painting's own texture is within it */
export const DEVIATION = 22;
/** the GPU's pool (gl.ts specLight; its twin): the ground's pixel c (0..255) where the mask holds the road's local mean m (0..255) and the pool
 *  intensity a, at the camera falloff times the gain k: the bake's pool at intensity min(a k, 0.9), from the painting's pixel rebuilt from c */
export function specPixel(c: readonly number[], m: readonly number[], a: number, k: number): number[] {
  const I = Math.min(a * k, 0.9), w = 1 - smooth(FOREIGN[0], FOREIGN[1], Math.hypot(c[0]! - m[0]!, c[1]! - m[1]!, c[2]! - m[2]!));
  if (!(I > 0) || !(w > 0)) return [...c];
  const r = c.map((v, i) => m[i]! + (v - m[i]!) * w);
  const p = r.map((v, i) => ASPHALT_MEAN[i]! + clamp((v - m[i]!) * clamp(ASPHALT_MEAN[i]! / Math.max(m[i]!, 4), RATIO_RANGE[0], RATIO_RANGE[1]), -DEVIATION, DEVIATION)), [p1, p2] = poolCover(I);
  const lit = bakedPixel(r, p, p1, p2);
  return c.map((v, i) => v + w * (lit[i]! - r[i]!));
}

/** the camera layer's knobs (window.__game.spec, the gear menu's Night panel): the falloff's inner and outer radius (the distance from the
 *  screen's centre over half its longer side: within inner the reflection is whole, past outer gone), the strength, and the share of it by
 *  day (the night light's amount takes it to the whole strength after dusk) */
export interface SpecLook { inner: number; outer: number; strength: number; day: number }
export const SPEC_LOOK: SpecLook = { inner: 0.15, outer: 1, strength: 1, day: 0.5 };
const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
export function clampSpecLook(s: Partial<SpecLook> | null | undefined): SpecLook {
  const D = SPEC_LOOK, inner = num(s?.inner, D.inner, 0, 2);
  return { inner, outer: Math.max(inner + 0.01, num(s?.outer, D.outer, 0.01, 3)), strength: num(s?.strength, D.strength, 0, 3), day: num(s?.day, D.day, 0, 1) };
}
/** the camera falloff at device px (x, y) of a w x h screen: 1 within the inner radius, 0 past the outer, a smoothstep between. The distance
 *  is in screen px over half the longer side, so the falloff is round on any screen (the aspect corrected), and outer 1 reaches the far edges */
export function specFalloff(x: number, y: number, w: number, h: number, inner: number, outer: number): number {
  const d = Math.hypot(x - w / 2, y - h / 2) / (0.5 * Math.max(w, h));
  return 1 - smooth(inner, outer, d);
}
/** the reflection's strength at the night light's amount (0 day .. 1 night): the day share by day, the whole strength at night */
export const specGain = (s: SpecLook, night: number) => s.strength * (s.day + (1 - s.day) * clamp(night, 0, 1));

const glslNum = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
const glslVec3 = (v: readonly number[]) => `vec3(${v.map(glslNum).join(', ')})`;
/** GLSL (gl.ts FS_QUAD): specLight(c, m, k), specPixel on the GPU, from the same tables */
export const SPEC_LIGHT_GLSL = `vec3 lampLitAt(vec3 c, vec3 mu, vec3 sg) {
  float z = clamp((dot(c, vec3(0.3, 0.59, 0.11)) - ${glslNum(LUMA0)}) / 8.8, -3.0, 3.0);
  c += mu + z * sg;
  if (c.r > 140.0) { float k = smoothstep(140.0, 200.0, c.r); c.g = min(c.g, c.g * (1.0 - k) + c.r * 0.9 * k); }
  float mx = max(c.r, max(c.g, c.b));
  if (mx > 248.0) { float over = mx - 248.0, k = 248.0 / mx; c = c * k + over * vec3(0.42, 0.36, 0.3); }
  return clamp(c, 0.0, 255.0);
}
vec3 specLight(vec3 c, vec4 m, float k) {
  float I = min(m.a * k, 0.9), w = 1.0 - smoothstep(${glslNum(FOREIGN[0])}, ${glslNum(FOREIGN[1])}, distance(c, m.rgb));
  if (I <= 0.0 || w <= 0.0) return c;
  vec3 r = mix(m.rgb, c, w), q = clamp(${glslVec3(ASPHALT_MEAN)} / max(m.rgb, vec3(4.0)), ${glslNum(RATIO_RANGE[0])}, ${glslNum(RATIO_RANGE[1])});
  vec3 p = ${glslVec3(ASPHALT_MEAN)} + clamp((r - m.rgb) * q, -${glslNum(DEVIATION)}, ${glslNum(DEVIATION)});
  vec3 l1 = lampLitAt(p, ${glslVec3(LIT1.mu)}, ${glslVec3(LIT1.sg)}), l2 = lampLitAt(p, ${glslVec3(LIT2.mu)}, ${glslVec3(LIT2.sg)});
  return c + w * (mix(mix(r, l1, clamp(I, 0.0, 0.4) / 0.4), l2, clamp((I - 0.4) / 0.5, 0.0, 1.0)) - r);
}`;
