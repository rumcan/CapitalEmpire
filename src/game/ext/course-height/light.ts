// The course height's light (T126; T110 for the terrain height): the Height tool's raised and lowered ground lit like real slopes, baked into
// the ground chunks with the rest of the ground (no per-frame cost). It replaces the old overlay (terrain-paint.ts courseShadeRGBA: a flat navy
// wash at up to 50% alpha and a pale wash, one pixel per 4 m, drawn over the grass), which hid the texture and read as dirty blotches.
//
// The model, per point of a grid on the world lattice (1 m on the ground chunks), a function of the global height field alone, so two chunks
// agree exactly at their seam:
//  - the surface: a Catmull-Rom cubic through the 4 m height samples (its slope continuous: no facets), heights exaggerated LIGHT_EXAG times,
//    gentle slopes more (GENTLE_GAIN, T263: so a fairway's rolls read; steep banks as they were);
//  - one sun at the screen's upper right (SUN_LIGHT, shadows at 145°) and a sky share AMBIENT: the brightness
//      B = AMBIENT × (1 − ao) + (1 − AMBIENT) × max(0, n·L) / L.z × (1 − cast)
//    is exactly 1 on flat ground (left as it is), more on slopes facing the sun, less on slopes facing away;
//  - cast shadows: a short march toward the sun. Only a rise steeper than the sun blocks it (CAST_SLOPE); soft, widening with distance;
//  - ambient occlusion: how far a point lies below the ground around it (the bottom of hollows, the feet of mounds);
//  - B < 1 gives `dark`, a cool multiply that keeps the texture. B > 1 gives `lift`, and `spec`, the part of it that starts a little way down
//    the slope (inset from the slope's top edge, ramped in). Both are masked by each texel's luminance against its neighbourhood's mean, so the
//    light lands on the grass's mid-tones and lit tips and never in its dark gaps (HL_MASK). The renderer lays it with canvas compositing on the
//    GPU, from three small pictures of the grid (heightLightPictures); applyHeightLight is the same on CPU pixels, its reference.
// Pure TypeScript, no DOM: runs in Node (tests) and the ground workers.
import file from './light.json';
import { CH_SIZE, CH_STEP, SUN_LIGHT, SUN_TILE_DIR, type CourseTileBox } from './index';

/** the strength's range: 0 = off, 1 = the default look, 2 = twice as strong */
export const HEIGHT_LIGHT_RANGE = [0, 2] as const;
/** a strength held to its range (not a finite number: 1) */
export function clampHeightLight(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(HEIGHT_LIGHT_RANGE[0], Math.min(HEIGHT_LIGHT_RANGE[1], n));
}
/** the strength the game was built with (light.json, a studio value; the gear menu's Slope light overrides it per player) */
export const HEIGHT_LIGHT_STRENGTH = clampHeightLight((file as { strength?: unknown }).strength);

/** the heights' exaggeration for the light (the course height is subtle: ±3 m), as the old hillshade's */
export const LIGHT_EXAG = 2.2;
/** T263 (#771): gentle ground's extra response. The light tilts the normal by the slope s (m per m) times
 *  LIGHT_EXAG × (1 + GENTLE_GAIN / (1 + (s / GENTLE_SLOPE)²)): a fairway's 1-3% rolls and a green's 1-2% tilt catch the light 6 to 8 times as
 *  much as they did, a mound's 10% flank 2.6 times, and it fades out on steep ground (a 35% bank 1.1 times, a 45% one 1.06), so ground
 *  sculpted steep with the Ground height brush stays as it was. The lit slope still grows with the real one everywhere (the gain is under 8,
 *  so s times it never turns back) */
export const GENTLE_GAIN = 7.5, GENTLE_SLOPE = 0.04;
/** T263: the shade on gentle ground answers more too (the cool multiply is weaker than the lift for the same slope): a shade d under
 *  GENTLE_DARK_KNEE is d × (1 + GENTLE_DARK × (1 − smoothstep(d / knee))), up to 2.4 times on the gentlest, the same from the knee on (a
 *  steep bank's shade as it was); it still deepens with d everywhere (the boost is under 1.45: 1 − 9t² + 8t³ >= −0.69) */
export const GENTLE_DARK = 1.4, GENTLE_DARK_KNEE = 0.25;
/** the shade d (0..1) with gentle ground's boost */
export const gentleDark = (d: number) => { const t = d >= GENTLE_DARK_KNEE ? 1 : d / GENTLE_DARK_KNEE; return d * (1 + GENTLE_DARK * (1 - t * t * (3 - 2 * t))); };
/** the light's normal tilt per metre per metre of slope at slope² s2: LIGHT_EXAG with the gentle ground's gain */
export const lightExag = (s2: number) => LIGHT_EXAG * (1 + GENTLE_GAIN / (1 + s2 / (GENTLE_SLOPE * GENTLE_SLOPE)));
/** the sky's share of the light on flat ground; the sun gives the rest */
export const AMBIENT = 0.35;
const { lx, ly, lz } = SUN_LIGHT;
/** the sun's height as a slope (rise over run, about 1.04: the sun stands about 46° up) */
export const SUN_SLOPE = lz / Math.hypot(lx, ly);
/** the real slope (m per m) past which a rise blocks the sun and casts a shadow (about 0.47, 25°) */
export const CAST_SLOPE = SUN_SLOPE / LIGHT_EXAG;
/** how far (tiles) a cast shadow can reach: short, and faded out over its last 40% */
export const CAST_REACH = 8;
/** the penumbra: a shadow's edge softens by PEN0 + PEN × distance (metres), tight at contact, softer further out; the faintest shadow dropped */
const PEN0 = 0.12, PEN = 0.22, CAST_EPS = 0.03;
/** ambient occlusion: the ring radii (tiles) the ground around is read at, and the occlusion per exaggerated metre of depth below it */
const AO_RADII = [3, 6] as const, AO_K = 0.2;
/** the lift (0..1) over which the inset highlight ramps in: none near the slope's top edge, all of it further down the slope */
const SPEC_LO = 0.3, SPEC_HI = 0.85;
/** a height sample changes the light at most this far away (tiles): the march and the ring, one coarse grid cell, the spline's support */
export const HEIGHT_LIGHT_REACH = 16;
/** the brightness above flat ground on a slope facing the sun squarely: lift = (B − 1) / REL_MAX */
const REL_MAX = (1 - AMBIENT) * (1 / lz - 1);
/** the eight directions of the occlusion ring */
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)] as const);

const smooth = (a: number, b: number, v: number) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const clampS = (i: number) => (i < 0 ? 0 : i > CH_SIZE - 1 ? CH_SIZE - 1 : i);

/** the cubic through the height samples (Mitchell–Netravali B, C): B = 0, C = 0.5 is Catmull-Rom, which passes through the samples and keeps
 *  their slopes (a smoothing B-spline, B = 1, rounds a steep rise below the sun and loses its shadow); its slope is continuous, so the light
 *  has no facets */
const SPLINE_B = 0, SPLINE_C = 0.5;
function cubicW(x: number): number {
  const B = SPLINE_B, C = SPLINE_C; x = x < 0 ? -x : x;
  if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
  if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
  return 0;
}
/** the smooth height (metres) of the raw CH_SIZE² samples h at world tile (x, y): the cubic through them (SPLINE), clamped at the map's edges */
export function splineHeight(h: Float32Array, x: number, y: number): number {
  const fx = x / CH_STEP - 0.5, fy = y / CH_STEP - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
  const a0 = cubicW(1 + tx), a1 = cubicW(tx), a2 = cubicW(1 - tx), a3 = cubicW(2 - tx);
  const c0 = clampS(i - 1), c1 = clampS(i), c2 = clampS(i + 1), c3 = clampS(i + 2);
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const wy = cubicW(k === 0 ? 1 + ty : k === 1 ? ty : k === 2 ? 1 - ty : 2 - ty);
    if (wy === 0) continue;
    const row = clampS(j - 1 + k) * CH_SIZE;
    s += wy * (a0 * h[row + c0]! + a1 * h[row + c1]! + a2 * h[row + c2]! + a3 * h[row + c3]!);
  }
  return s;
}

/** the numbers per grid point in HeightLightGrid.v: dark, lift, spec, cast, ao */
export const HL_STRIDE = 5;
/** the light on a grid of points over a tile box: point (i, j) sits at world tile (x0 + (i + 0.5) / res, y0 + (j + 0.5) / res), on the world
 *  lattice (x0 × res is whole), so the grids of two chunks share their points. v holds HL_STRIDE numbers a point: dark (0..1, the shade before
 *  the strength), lift (0..1, the light), spec (0..1, its inset highlight), and the terms behind them, cast (0..1, the sun blocked by a rise) and
 *  ao (0..1, the sky hidden in a hollow); nz: the grid points with any light or shade [i0, j0, i1, j1] (inclusive) */
export interface HeightLightGrid { x0: number; y0: number; res: number; w: number; h: number; v: Float32Array; nz: [number, number, number, number] }

/** the course height's light over tile box `box` at res points per tile (2 = a point per metre), from the raw CH_SIZE² samples h; null when
 *  nothing in the box is lit or shaded (no height within reach, or all of it flat) */
export function heightLightGrid(h: Float32Array, box: CourseTileBox | readonly number[], res: number): HeightLightGrid | null {
  const R = HEIGHT_LIGHT_REACH, bx0 = box[0]!, by0 = box[1]!, bx1 = box[2]!, by1 = box[3]!;
  // the samples within reach of the box that are not 0 (the field is 0 everywhere it was never edited)
  const i0 = clampS(Math.floor((bx0 - R) / CH_STEP)), i1 = clampS(Math.ceil((bx1 + R) / CH_STEP));
  const j0 = clampS(Math.floor((by0 - R) / CH_STEP)), j1 = clampS(Math.ceil((by1 + R) / CH_STEP));
  let ni0 = CH_SIZE, ni1 = -1, nj0 = CH_SIZE, nj1 = -1;
  for (let j = j0; j <= j1; j++) {
    const row = j * CH_SIZE;
    for (let i = i0; i <= i1; i++) if (h[row + i] !== 0) { if (i < ni0) ni0 = i; if (i > ni1) ni1 = i; if (j < nj0) nj0 = j; nj1 = j; }
  }
  if (ni1 < 0) return null;
  // the part of the box those samples can light (tiles), as whole lattice points with one point to spare all round
  const px0 = Math.max(bx0, ni0 * CH_STEP - R), px1 = Math.min(bx1, (ni1 + 1) * CH_STEP + R);
  const py0 = Math.max(by0, nj0 * CH_STEP - R), py1 = Math.min(by1, (nj1 + 1) * CH_STEP + R);
  if (px0 >= px1 || py0 >= py1) return null;
  const k0 = Math.floor(px0 * res) - 1, l0 = Math.floor(py0 * res) - 1, w = Math.ceil(px1 * res) + 1 - k0, gh = Math.ceil(py1 * res) + 1 - l0;
  // the spline heights on the lattice, grown by the march's and the ring's reach (m points), read bilinearly below
  const m = Math.ceil(Math.max(CAST_REACH, AO_RADII[1]) * res) + 2, HWd = w + 2 * m, HHt = gh + 2 * m, Hg = new Float32Array(HWd * HHt);
  for (let jj = 0; jj < HHt; jj++) { const ty = (l0 - m + jj + 0.5) / res; for (let ii = 0; ii < HWd; ii++) Hg[jj * HWd + ii] = splineHeight(h, (k0 - m + ii + 0.5) / res, ty); }
  const at = (u: number, v: number) => {
    u = u < 0 ? 0 : u > HWd - 1.001 ? HWd - 1.001 : u; v = v < 0 ? 0 : v > HHt - 1.001 ? HHt - 1.001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * HWd + i;
    const top = Hg[k]! + (Hg[k + 1]! - Hg[k]!) * fu, bot = Hg[k + HWd]! + (Hg[k + HWd + 1]! - Hg[k + HWd]!) * fu;
    return top + (bot - top) * fv;
  };
  const step = 1 / res, sdx = SUN_TILE_DIR.x * res, sdy = SUN_TILE_DIR.y * res, out = new Float32Array(w * gh * HL_STRIDE);
  let qi0 = w, qi1 = -1, qj0 = gh, qj1 = -1;
  for (let j = 0; j < gh; j++) for (let i = 0; i < w; i++) {
    const ii = i + m, jj = j + m, c = jj * HWd + ii, H0 = Hg[c]!;
    // the slope (m per m) by central differences over the lattice (two steps of 1/res tiles of 2 m)
    const gx = (Hg[c + 1]! - Hg[c - 1]!) / (4 * step), gy = (Hg[c + HWd]! - Hg[c - HWd]!) / (4 * step);
    // the sun on the normal tilted with the gentle ground's gain (the shade and the lift), and on the one tilted by LIGHT_EXAG alone (the inset
    // highlight's ramp: it keeps its place down the slope, so a gentle roll's top never catches the highlight)
    const xg = lightExag(gx * gx + gy * gy), nx = -xg * gx, ny = -xg * gy, ndl = (nx * lx + ny * ly + lz) / Math.sqrt(nx * nx + ny * ny + 1);
    const ex0 = -LIGHT_EXAG * gx, ey0 = -LIGHT_EXAG * gy, ndl0 = (ex0 * lx + ey0 * ly + lz) / Math.sqrt(ex0 * ex0 + ey0 * ey0 + 1);
    // cast: the march toward the sun; a point is shaded where the ground ahead rises above the sun's ray (exaggerated heights, metres)
    let cast = 0;
    for (let d = step; d <= CAST_REACH + 1e-9 && cast < 1; d += step) {
      const ex = LIGHT_EXAG * (at(ii + sdx * d, jj + sdy * d) - H0) - 2 * d * SUN_SLOPE;
      if (ex > 0) cast = Math.max(cast, Math.min(1, ex / (PEN0 + PEN * 2 * d)) * (1 - smooth(0.6 * CAST_REACH, CAST_REACH, d)));
    }
    cast = cast > CAST_EPS ? (cast - CAST_EPS) / (1 - CAST_EPS) : 0; // a rise only just at the sun's slope (the cubic's slight overshoot) casts none
    // occlusion: the mean of the ring around, less this point's height (above 0 in a hollow)
    let ring = 0;
    for (const r of AO_RADII) for (const [cx, cy] of RING) ring += at(ii + cx * r * res, jj + cy * r * res);
    const below = ring / (RING.length * AO_RADII.length) - H0, ao = below > 0 ? Math.min(1, below * LIGHT_EXAG * AO_K) : 0;
    // flat ground (or a level plateau) stays exactly as it is: judged on the plain response, so the gentle gain lights no more of the ground
    // than before (the chunk's lit rect, and what the bake composites, stay the same)
    const rel0 = AMBIENT * (1 - ao) + (1 - AMBIENT) * Math.max(0, ndl0) / lz * (1 - cast) - 1;
    const rel = Math.abs(rel0) < 1e-5 ? 0 : AMBIENT * (1 - ao) + (1 - AMBIENT) * Math.max(0, ndl) / lz * (1 - cast) - 1;
    const o = (j * w + i) * HL_STRIDE; out[o + 3] = cast; out[o + 4] = ao;
    if (rel === 0) continue;
    const lift = rel > 0 ? Math.min(1, rel / REL_MAX) : 0;
    out[o] = rel < 0 ? Math.min(1, gentleDark(-rel)) : 0; out[o + 1] = lift; out[o + 2] = rel0 > 0 ? smooth(SPEC_LO, SPEC_HI, Math.min(1, rel0 / REL_MAX)) : 0;
    if (i < qi0) qi0 = i; if (i > qi1) qi1 = i; if (j < qj0) qj0 = j; if (j > qj1) qj1 = j;
  }
  if (qi1 < 0) return null;
  return { x0: k0 / res, y0: l0 / res, res, w, h: gh, v: out, nz: [qi0, qj0, qi1, qj1] };
}

/** the grid's light at world tile (x, y), bilinear between its points (all 0 outside the grid) */
export function sampleHeightLight(g: HeightLightGrid, x: number, y: number): { dark: number; lift: number; spec: number; cast: number; ao: number } {
  const u = (x - g.x0) * g.res - 0.5, v = (y - g.y0) * g.res - 0.5;
  if (!(u >= 0 && v >= 0 && u < g.w - 1 && v < g.h - 1)) return { dark: 0, lift: 0, spec: 0, cast: 0, ao: 0 };
  const S = HL_STRIDE, i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = (j * g.w + i) * S, r = g.w * S, V = g.v;
  const lerp = (n: number) => { const top = V[k + n]! + (V[k + S + n]! - V[k + n]!) * fu, bot = V[k + r + n]! + (V[k + r + S + n]! - V[k + r + n]!) * fu; return top + (bot - top) * fv; };
  return { dark: lerp(0), lift: lerp(1), spec: lerp(2), cast: lerp(3), ao: lerp(4) };
}

/** the shade at strength 1 where the sun is fully blocked (a multiply, 0..1), and the most it may darken */
const DARK_K = 0.42, DARK_MAX = 0.4;
/** the shade's tint: each channel's share of the darkening (blue least: a slightly cool shade, as the edges' DARK_RGB, T110) */
const SHADE_W = [1.12, 1, 0.66] as const;
/** the light at strength 1 on a slope facing the sun squarely: the lift, a slightly warm gain on the texel (its mid-tones and up), and the
 *  inset highlight, a warm screen (the sunlight, the edges' LIGHT_RGB 255 236 176) on its mid-tones and lit tips, so they catch the light
 *  paler and warmer, as light on grass does, instead of glowing a more saturated green */
const LIFT_G = 0.3, SPEC_G = 0.26, LIFT_W = [1.08, 1, 0.8] as const, SUN_RGB = [255, 236, 176] as const;
/** the luminance masks, on q = a texel's luminance over its neighbourhood's mean (canvas compositing can do these, renderer.ts):
 *  the lift's, clamp(2 (min(q, 1) − 0.45)): none in the dark gaps (q < 0.45), all of it from just under the mean up;
 *  the highlight's, clamp(4 (q − 1)): only the texels above the mean, the lit tips, all of it from 1.25 times the mean */
export const HL_MASK = { liftLo: 0.45, liftK: 2, specK: 4 } as const;
/** the neighbourhood the mean luminance is taken over: a Gaussian of this many px per unit of cache level (about 0.7 m on the ground) */
export const LUMA_SIGMA_PER_L = 26;
const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
/** the lift's luminance mask (HL_MASK) */
export const liftMask = (q: number) => clamp01(HL_MASK.liftK * (Math.min(q, 1) - HL_MASK.liftLo));
/** the highlight's luminance mask (HL_MASK) */
export const specMask = (q: number) => clamp01(HL_MASK.specK * (q - 1));

/** the grid's light as three w x h RGBA pictures (a pixel a point, opaque) for compositing, at strength s:
 *  shade, the multiply (255 where nothing is shaded; per channel 1 − D × SHADE_W, D = min(DARK_MAX, s × DARK_K × dark));
 *  lift, the gain (0 where nothing is lit; s × LIFT_G × lift × LIFT_W per channel): the texel becomes c × (1 + gain × liftMask);
 *  spec, the highlight's warm screen colour (0 where none; min(1, s × SPEC_G × spec) × SUN_RGB): the texel becomes screen(c, spec × specMask) */
export function heightLightPictures(g: HeightLightGrid, s: number): { shade: Uint8ClampedArray; lift: Uint8ClampedArray; spec: Uint8ClampedArray } {
  const n = g.w * g.h, shade = new Uint8ClampedArray(n * 4), lift = new Uint8ClampedArray(n * 4), spec = new Uint8ClampedArray(n * 4), V = g.v;
  for (let p = 0; p < n; p++) {
    const k = p * HL_STRIDE, o = p * 4, D = Math.min(DARK_MAX, s * DARK_K * V[k]!), up = s * LIFT_G * V[k + 1]!, hi = Math.min(1, s * SPEC_G * V[k + 2]!);
    for (let c = 0; c < 3; c++) { shade[o + c] = 255 * (1 - D * SHADE_W[c]!); lift[o + c] = 255 * up * LIFT_W[c]!; spec[o + c] = hi * SUN_RGB[c]!; }
    shade[o + 3] = lift[o + 3] = spec[o + 3] = 255;
  }
  return { shade, lift, spec };
}

/** the pixel rect [x0, y0, x1, y1] (half-open, inside W x H) of a W x H picture, drawn with the tile to pixel matrix M, that the grid's light
 *  touches; null when none of it is on the picture */
export function heightLightRect(g: HeightLightGrid, M: { a: number; b: number; c: number; d: number; e: number; f: number }, W: number, H: number): [number, number, number, number] | null {
  const tx0 = g.x0 + (g.nz[0] - 0.5) / g.res, tx1 = g.x0 + (g.nz[2] + 1.5) / g.res, ty0 = g.y0 + (g.nz[1] - 0.5) / g.res, ty1 = g.y0 + (g.nz[3] + 1.5) / g.res;
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const [x, y] of [[tx0, ty0], [tx1, ty0], [tx0, ty1], [tx1, ty1]] as const) {
    const X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y);
  }
  const x0 = Math.max(0, Math.floor(X0) - 1), y0 = Math.max(0, Math.floor(Y0) - 1), x1 = Math.min(W, Math.ceil(X1) + 1), y1 = Math.min(H, Math.ceil(Y1) + 1);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/** the side (px) of the blocks the reference below takes the mean luminance over (the renderer blurs instead) */
export const LUMA_BLOCK = 24;
/** the light on RGBA pixels px (pw x ph, opaque ground), in place: the CPU reference of what the renderer lays with canvas compositing on
 *  the GPU (renderer.ts heightLight; reading a chunk's pixels back would stall its bake on the GPU, 50-150 ms a chunk). toTile = [a, b, c, d,
 *  e, f] maps a pixel's centre (x + 0.5, y + 0.5) to its world tile (a·x + c·y + e, b·x + d·y + f). The shade multiplies each texel by a
 *  cool tint (the texture stays, only darker); the lift multiplies it up by liftMask, the highlight screens the sunlight over it by specMask,
 *  q its luminance over the mean of its LUMA_BLOCK block (bilinear between blocks): the dark gaps stay dark, the mid-tones catch the light,
 *  the lit tips the warm highlight (T110). strength scales all of it (0 = off) */
export function applyHeightLight(px: Uint8ClampedArray, pw: number, ph: number, toTile: readonly number[], g: HeightLightGrid, strength: number): void {
  if (!(strength > 0) || pw <= 0 || ph <= 0) return;
  const [a, b, c, d, e, f] = toTile as [number, number, number, number, number, number], B = LUMA_BLOCK;
  // the mean luminance of each block
  const bw = Math.ceil(pw / B), bh = Math.ceil(ph / B), sum = new Float32Array(bw * bh), cnt = new Float32Array(bw * bh);
  for (let y = 0; y < ph; y++) {
    const brow = ((y / B) | 0) * bw;
    for (let x = 0, o = y * pw * 4; x < pw; x++, o += 4) {
      if (px[o + 3] === 0) continue;
      const k = brow + ((x / B) | 0); sum[k] += 0.3 * px[o]! + 0.59 * px[o + 1]! + 0.11 * px[o + 2]!; cnt[k]++;
    }
  }
  for (let k = 0; k < sum.length; k++) sum[k] = cnt[k]! > 0 ? sum[k]! / cnt[k]! : 0;
  const mean = (x: number, y: number) => {
    let u = x / B - 0.5, v = y / B - 0.5; u = u < 0 ? 0 : u > bw - 1 ? bw - 1 : u; v = v < 0 ? 0 : v > bh - 1 ? bh - 1 : v;
    const i = Math.min(bw - 2, u | 0), j = Math.min(bh - 2, v | 0);
    if (i < 0 || j < 0) { const i2 = Math.max(0, Math.min(bw - 1, Math.round(u))), j2 = Math.max(0, Math.min(bh - 1, Math.round(v))); return sum[j2 * bw + i2]!; }
    const fu = u - i, fv = v - j, k = j * bw + i, top = sum[k]! + (sum[k + 1]! - sum[k]!) * fu, bot = sum[k + bw]! + (sum[k + bw + 1]! - sum[k + bw]!) * fu;
    return top + (bot - top) * fv;
  };
  const res = g.res, V = g.v, gw = g.w, S = HL_STRIDE, rowStride = gw * S, uMax = gw - 1, vMax = g.h - 1;
  for (let y = 0; y < ph; y++) {
    // the grid coordinates of the row's first pixel centre and their step per pixel
    let u = (a * 0.5 + c * (y + 0.5) + e - g.x0) * res - 0.5, v = (b * 0.5 + d * (y + 0.5) + f - g.y0) * res - 0.5;
    const du = a * res, dv = b * res;
    for (let x = 0, o = y * pw * 4; x < pw; x++, o += 4, u += du, v += dv) {
      if (!(u >= 0 && v >= 0 && u < uMax && v < vMax) || px[o + 3] === 0) continue;
      const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * rowStride + i * S, k2 = k + rowStride;
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
      const at = (n: number) => w00 * V[k + n]! + w10 * V[k + S + n]! + w01 * V[k2 + n]! + w11 * V[k2 + S + n]!;
      const dark = at(0), lift = at(1);
      if (dark < 1e-4 && lift < 1e-4) continue;
      let r = px[o]!, gg = px[o + 1]!, bb = px[o + 2]!;
      if (dark >= 1e-4) {
        const D = Math.min(DARK_MAX, strength * DARK_K * dark);
        r *= 1 - D * SHADE_W[0]; gg *= 1 - D * SHADE_W[1]; bb *= 1 - D * SHADE_W[2];
      }
      if (lift >= 1e-4) {
        const q = (0.3 * r + 0.59 * gg + 0.11 * bb) / Math.max(6, mean(x + 0.5, y + 0.5));
        const up = strength * LIFT_G * lift * liftMask(q), hi = Math.min(1, strength * SPEC_G * at(2)) * specMask(q);
        r *= 1 + up * LIFT_W[0]; gg *= 1 + up * LIFT_W[1]; bb *= 1 + up * LIFT_W[2];
        if (hi > 0) { r += (255 - r) * hi * SUN_RGB[0] / 255; gg += (255 - gg) * hi * SUN_RGB[1] / 255; bb += (255 - bb) * hi * SUN_RGB[2] / 255; }
      }
      px[o] = r; px[o + 1] = gg; px[o + 2] = bb;
    }
  }
}
