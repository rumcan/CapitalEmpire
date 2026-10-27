/** T215 (#561, phase 1): the street lamps' reflection pools as a camera specular (the owner, 2026-10-27: "a global specular layer that lies
 *  on the camera and goes where the camera does ... most visible in the center to least at the edge of the screen").
 *
 *  Off (the default), the ground worker bakes the pools into the road picture as it always has (renderer.ts step 9: each pool stamp laid as the
 *  asphalt's brighter 'lit' mosaic). On (window.__game.specCam), the worker bakes the pools' coverage (stamp x asphalt mask x strength) into a
 *  small per-chunk reflection mask instead, and the GPU lights the road by it as it draws the chunk (gl.ts FS_QUAD): the asphalt's own pixels
 *  put through the painting's measured lamp response (litPixel, the very function the 'lit' mosaics are made with), at an intensity of
 *  mask x camera falloff x strength. The texture stays (a brightening with the painting's local contrast, never a flat glow).
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
/** town-scene.mjs litAsphalt: the painting's response to lamp light at intensity I (0..1), applied to one pixel (0..255, in place) */
export function litPixel(c: number[], I: number) {
  const z = clamp((0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]! - LUMA0) / 8.8, -3, 3);
  for (let k = 0; k < 3; k++) c[k] = c[k]! + tbl(LIGHT_DMU[k]!, I) + z * tbl(LIGHT_DSG[k]!, I);
  if (c[0]! > 140) { const k = smooth(140, 200, c[0]!); c[1] = Math.min(c[1]!, c[1]! * (1 - k) + c[0]! * 0.9 * k); }
  const mx = Math.max(c[0]!, c[1]!, c[2]!);
  if (mx > 248) { const over = mx - 248, k = 248 / mx; c[0] = c[0]! * k + over * 0.42; c[1] = c[1]! * k + over * 0.36; c[2] = c[2]! * k + over * 0.3; }
  for (let i = 0; i < 3; i++) c[i] = clamp(c[i]!, 0, 255);
}

/** the two pool stamps (textures.ts pool1 / pool2: the stamp's intensity a split at 0.4) as the bake lays them: pool1 = min(a, 0.4) / 0.4
 *  toward lit(0.4), pool2 = (a - 0.4) / 0.5 toward lit(0.9). The reflection mask holds 0.4 pool1 + 0.5 pool2, which is the stamp's own
 *  intensity min(a, 0.9) (the bake's brightest is lit(0.9) too) */
export const POOL_SHARES = [0.4, 0.5] as const;
export const poolIntensity = (pool1: number, pool2: number) => POOL_SHARES[0] * pool1 + POOL_SHARES[1] * pool2;
/** the bake's response at stamp coverages pool1, pool2 (each a source-over toward its lit mosaic), for comparing the GPU's with it */
export function bakedPixel(c: readonly number[], pool1: number, pool2: number): number[] {
  const l1 = [...c]; litPixel(l1, 0.4); const l2 = [...c]; litPixel(l2, 0.9);
  return c.map((v, k) => { const a = v + (l1[k]! - v) * pool1; return a + (l2[k]! - a) * pool2; });
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
const glslVec3s = (t: number[][]) => LIGHT_IB.map((_, i) => `vec3(${t.map(r => glslNum(r[i]!)).join(', ')})`).join(', ');
/** GLSL: lampLit(c, I), litPixel on a colour in 0..255, from the same tables (gl.ts FS_QUAD) */
export const LAMP_LIT_GLSL = `const float LIB[12] = float[12](${LIGHT_IB.map(glslNum).join(', ')});
const vec3 LDMU[12] = vec3[12](${glslVec3s(LIGHT_DMU)});
const vec3 LDSG[12] = vec3[12](${glslVec3s(LIGHT_DSG)});
vec3 lampLit(vec3 c, float I) {
  if (I <= 0.0) return c;
  vec3 mu = LDMU[11], sg = LDSG[11];
  if (I < 1.0) for (int i = 1; i < 12; i++) if (LIB[i] >= I) { float f = (I - LIB[i - 1]) / (LIB[i] - LIB[i - 1]); mu = mix(LDMU[i - 1], LDMU[i], f); sg = mix(LDSG[i - 1], LDSG[i], f); break; }
  float z = clamp((dot(c, vec3(0.3, 0.59, 0.11)) - ${glslNum(LUMA0)}) / 8.8, -3.0, 3.0);
  c += mu + z * sg;
  if (c.r > 140.0) { float k = smoothstep(140.0, 200.0, c.r); c.g = min(c.g, c.g * (1.0 - k) + c.r * 0.9 * k); }
  float mx = max(c.r, max(c.g, c.b));
  if (mx > 248.0) { float over = mx - 248.0, k = 248.0 / mx; c = c * k + over * vec3(0.42, 0.36, 0.3); }
  return clamp(c, 0.0, 255.0);
}`;
