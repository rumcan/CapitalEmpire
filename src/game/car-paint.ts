// T228 (#661, the owner's concept, 2026-10-27: "car parks full of colourful cars"): the cars in many colours from the two car models we have
// (the burgundy and the navy wood-panel wagons). A car's paint is a palette colour its body takes in the sprite shader (gl.ts FS_SPRITE): the
// pixels of the art's body colour (picked by hue: burgundy or navy) take the paint at their own light and shade (their luminance over the
// body's mean), so the glass, chrome, tyres, lamps and wood trim keep the art. Every car has one: a parked car from where it stands (its bay or
// its spot on a lot: always the same), a moving one from its own number. CAR_PAINT.on false draws every car in its art's own colour (the
// look before T228, kept as an option: ?carpaint=0).
// T236 (#693, the owner, 2026-10-28: "some one attemted to add varialtion to the cars and paineted the metalic blue car which did not work"): the
// audit (?carpaint=audit, dev/car-paint-audit.ts; the sheets in E:/ClaudeTemp/T236) found no paint clean on both wagons at every heading. The
// burgundy wagon's sunlit edges are orange, outside its hue band, so every paint but red and orange leaves an orange rim down its right side and
// an orange nose at E; red and orange paint its chrome and hubcaps too. The navy wagon's lit hood front and its sills are grey, so every paint
// leaves its hood half painted at E and W, a coloured sill line and speckle on the roof. So KEPT_PAINTS is empty: painting is off (CAR_PAINT.on
// false) and the cars keep their art's own colours, the variety coming from the other vehicles (vehicles.ts). ?carpaint=1 turns T228's full
// palette back on, for the art fix the shader waits for (a body mask in the art instead of a hue band).
import { LIBRARY } from './library';

/** the paints (linear-ish display RGB, 0..1), index 1..; 0 is the art's own colour. The shader's PAINTS table is built from this list */
// (the body's light runs to about 1.7 times its mean, so a bright paint is set darker than it reads: its lit side reaches the full colour
// without flattening to a clamped block)
export const PAINTS: readonly (readonly [number, number, number])[] = [
  [0.84, 0.84, 0.82], // 1 white
  [0.56, 0.58, 0.61], // 2 silver
  [0.08, 0.08, 0.09], // 3 black
  [0.3, 0.31, 0.33], // 4 grey
  [0.62, 0.06, 0.05], // 5 red
  [0.07, 0.2, 0.55], // 6 blue
  [0.74, 0.54, 0.06], // 7 yellow
  [0.07, 0.29, 0.14], // 8 green
  [0.07, 0.36, 0.42], // 9 teal
  [0.66, 0.6, 0.44], // 10 beige
  [0.72, 0.3, 0.05], // 11 orange
];
/** the paints' names, as PAINTS */
export const PAINT_NAMES = ['white', 'silver', 'black', 'grey', 'red', 'blue', 'yellow', 'green', 'teal', 'beige', 'orange'] as const;
/** the paints the audit kept (T236: none, see above); drawn whatever the switch says */
export const KEPT_PAINTS: readonly number[] = [];
/** how often each paint comes up, index 0 (the art's own) first: the street's mix, mostly white, silver, black and grey, a few bright ones */
const SHARE = [14, 18, 14, 12, 8, 9, 8, 4, 4, 3, 3, 3];
const TOTAL = SHARE.reduce((a, b) => a + b, 0);
/** the switch: on, T228's whole palette (?carpaint=1, for the art fix); off (T236's default), only the kept paints (none: every car in its art's
 *  own colour, the look before T228) */
export const CAR_PAINT = { on: false };
try { if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('carpaint') === '1') CAR_PAINT.on = true; } catch { /* no location */ }
/** whether paint k (1..PAINTS.length) is drawn: a kept one, or any with the switch on */
export const drawnPaint = (k: number): boolean => k > 0 && k <= PAINTS.length && (CAR_PAINT.on || KEPT_PAINTS.includes(k));

/** a 32-bit hash of up to three numbers */
export function hash3(a: number, b = 0, c = 0): number {
  let h = 0x811c9dc5;
  for (const v of [a, b, c]) { h = Math.imul(h ^ (v | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return h >>> 0;
}
/** the paint of a seed: 0 (the art's own colour) or a palette index 1..PAINTS.length, by SHARE; a paint not drawn (drawnPaint) is 0 */
export function paintOf(seed: number): number {
  let r = (seed >>> 0) % TOTAL;
  for (let k = 0; k < SHARE.length; k++) { r -= SHARE[k]!; if (r < 0) return drawnPaint(k) ? k : 0; }
  return 0;
}
/** the paints of the five car types (traffic.ts facings: type % 2 the model) when nothing else tells a car apart (the club's everyday golfers'
 *  cars, T208's playback: a car is known only by its type): white, red, silver, blue, yellow, so the five looks differ */
export const TYPE_PAINTS = [1, 5, 2, 6, 7] as const;
/** a parked car's paint from where it stands (tiles; to a twentieth of a tile, so the same bay or lot spot always gets the same) */
export const paintAt = (x: number, y: number): number => paintOf(hash3(Math.round(x * 20), Math.round(y * 20), 0x7a228));

/** per library item: the body family of a car's art (0 burgundy: red hues, 1 navy: blue hues), -1 for anything else */
let BODY: Int8Array | null = null;
export function bodyOf(item: number): number {
  if (!BODY) { BODY = new Int8Array(LIBRARY.length).fill(-1); LIBRARY.forEach((it, i) => { if (it.id.startsWith('cars:burgundy-wagon:')) BODY![i] = 0; else if (it.id.startsWith('cars:navy-wood-panel-wagon:')) BODY![i] = 1; }); }
  return BODY[item] ?? -1;
}
/** the code a sprite instance carries for its paint (sprites.ts packs 2 + 2 code + alpha; code 0 is T176's tint): 0 for none (no paint, a paint
 *  not drawn: drawnPaint, or not a car), else paint + 16 x body */
export function paintCode(item: number, paint: number | undefined): number {
  if (!paint || !drawnPaint(paint)) return 0;
  const b = bodyOf(item); return b < 0 ? 0 : paint + 16 * b;
}
/** the alpha float of a sprite instance (sprites.ts packs it, gl.ts VS_SPRITE and VS_CAST read it back): the alpha alone, 2 + alpha for T176's
 *  tint, 2 + 2 code + alpha for a painted car (code from paintCode) */
export const packAlpha = (alpha: number, tint: boolean, code: number): number => (tint ? 2 + alpha : code ? 2 + 2 * code + alpha : alpha);
/** what the shaders read back from packAlpha's float (as VS_SPRITE does): vTint (0 none, 1 T176's tint, 2.. a paint: its code + 1) and the alpha */
export function unpackAlpha(v: number): { tint: number; alpha: number } {
  if (!(v > 1.5)) return { tint: 0, alpha: v };
  const code = Math.floor((v - 2) * 0.5); return { tint: code + 1, alpha: v - 2 - 2 * code };
}
/** the shader's paint function (GLSL): rgb un-premultiplied, code as paintCode; the body's pixels (hue within the band round the body's own,
 *  saturated, not black) take the paint times their luminance over the body's mean */
export const CAR_PAINT_GLSL = `
const vec3 PAINTS[${PAINTS.length + 1}] = vec3[${PAINTS.length + 1}](vec3(0.0), ${PAINTS.map(p => `vec3(${p.map(v => v.toFixed(3)).join(', ')})`).join(', ')});
vec3 carPaint(vec3 rgb, float code) {
  float body = floor(code / 16.0); int k = int(code - body * 16.0 + 0.5);
  float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), d = mx - mn, sat = mx > 1e-4 ? d / mx : 0.0, h = 0.0;
  if (d > 1e-5) { if (mx == rgb.r) h = mod((rgb.g - rgb.b) / d, 6.0); else if (mx == rgb.g) h = (rgb.b - rgb.r) / d + 2.0; else h = (rgb.r - rgb.g) / d + 4.0; }
  h *= 60.0;
  float c = body < 0.5 ? 348.0 : 225.0, dh = abs(mod(h - c + 540.0, 360.0) - 180.0);
  float w = (1.0 - smoothstep(body < 0.5 ? 22.0 : 24.0, body < 0.5 ? 34.0 : 38.0, dh)) * smoothstep(0.2, 0.36, sat) * smoothstep(0.03, 0.08, mx);
  float l = dot(rgb, vec3(0.299, 0.587, 0.114));
  return mix(rgb, min(PAINTS[k] * (l / (body < 0.5 ? 0.23 : 0.2)), vec3(1.0)), w);
}`;
