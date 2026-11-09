// T409 (#1105; the owner, 2026-11-09, after the video "Making a little pixel world that looks 3D": "can this technique help us get more 3d looking terrain?"):
// the relief light and the slope materials of the ground bake. Pure TypeScript, no DOM: it runs in Node (the tests) and in the ground workers.
//
// What it takes from the video (Shifty the Dev, a Godot 2D image lit by one normal per pixel), and where each part lands here:
//  - the normal per pixel from the height: a pixel tilts only because of a TALLER neighbour (the very tops of the hills always face straight up), the four
//    direct neighbours weighted more than the four diagonals (NORMAL_W). This module reads the surface that way (tiltOneSided): the weights are such that a
//    plane of any orientation gives exactly its own slope (the least-squares gradient over the taller half of the ring), so the crests and the valley floors
//    are flat and only the flanks lean;
//  - diffuse light, dot(sun, normal), the shadow a chosen colour and never black: the light is the ground bake's own (ext/course-height/light.ts): a cool
//    multiply that keeps the texture where the ground faces away, a lift and a warm highlight masked by the texels' own luminance where it faces the sun;
//  - "posterize the gradient" (d = ceil(d * bands) / bands): a soft staircase over the light (bandRel), 3 to 5 bands, level 0 (flat ground) always exactly
//    the ground as it is;
//  - the moon colour (the far side of the hill in a cool tint) waits for the night light and is left out.
// What the video does not have and the ticket asks for stays from T126 (the cast shadows from the hills' rises, the hollows' occlusion) and gains a thin
// highlight along the crests (ridgeLight).
//
// The ground's height, as the workers hold it: the course height (the Height tool's mounds and hollows, ±3 m, a sample every 4 m), the real land under a
// map-data course (golf/osm/land.ts, tens of metres), and the natural terrain (terrain/types.ts: a sample every 16 m, flat in the game that ships: T025). The
// light is cast from the first two (the natural terrain keeps its own old hillshade overlay, the way water and the banks keep theirs); the slope that picks
// the ground's MATERIAL is read from all three. Every number at a point is a function of the global height field alone, so two chunks agree exactly at their seam.
import { CH_SIZE, CH_STEP, SUN_LIGHT, SUN_TILE_DIR } from './ext/course-height';
import { fbm, type Noise } from './terrain/noise';
import { HS, HSTEP, sampleField } from './terrain/types';
import { AMBIENT, HEIGHT_LIGHT_REACH, HL_STRIDE, LAND_GAIN, LIGHT_EXAG, gentleDark, landExag, lightExag, splineHeight, splineLand, type HeightLightGrid, type LightLand } from './ext/course-height/light';

// ---------------------------------------------------------------- the modes

/** the look of the hills: 'old' is the ground as it was before T409 (the course height's and the land's light of T126 and T388, the natural terrain's overlay, the steep
 *  faces' rock, and no slope materials); 'smooth' the relief light and the slope materials; 'bands' the same with the light posterized into RELIEF_BANDS soft bands */
export type ReliefMode = 'old' | 'smooth' | 'bands';
export const RELIEF_MODES: readonly ReliefMode[] = ['old', 'smooth', 'bands'];
/** the bands 'bands' lays: 3 to 5 soft steps across the shade to light range (the video's "posterize" is a handful) */
export const RELIEF_BANDS = 4;
/** a mode from text (the URL's ?relief=, a saved choice): 'old', 'smooth', 'bands'; anything else null */
export function reliefModeOf(v: unknown): ReliefMode | null { return v === 'old' || v === 'smooth' || v === 'bands' ? v : null; }
/** the mode a game starts in (the dev server's ?relief= and the player's saved choice override it). Smooth: the A/B shots (T409) found that 4 bands read well on small steep ground (the same as smooth, a little crisper) but turn a broad
 *  gentle slope, which is all a real course has, into a flat spotlight blob with hard edges, a cel-shaded map rather than a hill; 'bands' is one select away */
export const RELIEF_DEFAULT: ReliefMode = 'smooth';
/** the bands a mode lays (0: the smooth staircase-free light) */
export const bandsOf = (m: ReliefMode): number => (m === 'bands' ? RELIEF_BANDS : 0);

// ---------------------------------------------------------------- the surface

/** the weights of the taller neighbours in the normal estimate: the four direct neighbours count twice what the four diagonals do (the video's "different
 *  weights on the direct neighbours versus the diagonal ones"; the 2 : 1 is the least-squares gradient's own, so a plane of any orientation gives its exact slope) */
export const NORMAL_W = { direct: 2, diagonal: 1 } as const;
const WD = NORMAL_W.direct, WG = NORMAL_W.diagonal;
/** the one-sided gradient of the lattice H (row stride W) at index c, the lattice step s metres, written to out[o] (gx) and out[o + 1] (gy): the tilt toward the taller
 *  ground in m per m along the tile axes. Each taller neighbour adds its rise along its own offset u (in lattice steps), weighted (NORMAL_W); the sum is scaled by
 *  2 / ((2 w_direct + 4 w_diagonal) s): the whole ring's weights are (2 w_d + 4 w_g) s squared and a plane's taller half is half of them, so a plane of slope g and any
 *  orientation gives exactly g (4 s for the 2 : 1). A crest, with no taller neighbour, gives 0: it faces straight up */
export function tiltInto(H: ArrayLike<number>, c: number, W: number, s: number, out: Float64Array, o: number): void {
  const h0 = H[c]!; let sx = 0, sy = 0, d: number;
  d = H[c + 1]! - h0; if (d > 0) sx += WD * d;
  d = H[c - 1]! - h0; if (d > 0) sx -= WD * d;
  d = H[c + W]! - h0; if (d > 0) sy += WD * d;
  d = H[c - W]! - h0; if (d > 0) sy -= WD * d;
  d = H[c + W + 1]! - h0; if (d > 0) { sx += WG * d; sy += WG * d; }
  d = H[c + W - 1]! - h0; if (d > 0) { sx -= WG * d; sy += WG * d; }
  d = H[c - W + 1]! - h0; if (d > 0) { sx += WG * d; sy -= WG * d; }
  d = H[c - W - 1]! - h0; if (d > 0) { sx -= WG * d; sy -= WG * d; }
  const k = 2 / ((2 * WD + 4 * WG) * s);
  out[o] = sx * k; out[o + 1] = sy * k;
}
/** tiltInto as a pair [gx, gy] (the tests'; the light's loop writes to its own scratch) */
export function tiltOneSided(H: ArrayLike<number>, c: number, W: number, s: number): [number, number] {
  const t = new Float64Array(2); tiltInto(H, c, W, s, t, 0); return [t[0]!, t[1]!];
}

// ---------------------------------------------------------------- the light
/** the cast shadow's reach (tiles) and its penumbra: the march toward the sun (T126's numbers: the rise that blocks the sun is judged on the exaggerated heights) */
const CAST_REACH = 8, PEN0 = 0.12, PEN = 0.22, CAST_EPS = 0.03;
/** the hollows' occlusion: the ring radii (tiles) the ground around is read at, and the occlusion per exaggerated metre of depth */
const AO_RADII = [3, 6] as const, AO_K = 0.2;
/** the lift (0..1) over which the inset highlight on a lit slope ramps in */
const SPEC_LO = 0.3, SPEC_HI = 0.85;
/** the creases and the crests: the ground against the mean of a ring one tile (2 m) round it, a narrow one, so only a fold shows and a broad swell does not. A crest (the ground above that
 *  mean by this many exaggerated metres) catches a thin highlight on its lit side, a crease (below it) darkens a little more than the hollow's occlusion: none under CREST_LO, all of it from CREST_HI;
 *  a crease adds CREASE_AO of its share to the occlusion */
const CREASE_R = 1, CREST_LO = 0.05, CREST_HI = 0.5, CREASE_AO = 0.5;
/** the sun's brightness over flat ground at its fullest: B(max) - 1 (a slope facing the sun squarely), the lift's scale */
const { lx, ly, lz } = SUN_LIGHT;
export const REL_MAX = (1 - AMBIENT) * (1 / lz - 1);
/** the darkest a point of ground gets from the sun alone (a slope facing away: no sun, only the sky's share): B(min) - 1 */
export const REL_MIN = -(1 - AMBIENT);
/** the sun's height as a slope (rise over run), the rise that shadows is judged against it */
const SUN_SLOPE = lz / Math.hypot(lx, ly);
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)] as const);
const smooth = (a: number, b: number, v: number) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const clampS = (i: number) => (i < 0 ? 0 : i > CH_SIZE - 1 ? CH_SIZE - 1 : i);

/** how much of a step the staircase spends climbing: 0.5 is a ramp the width of the step (smooth), the smaller the harder the edge; the soft bands' edge is a few metres on a hill's flank */
export const BAND_SOFT = 0.3;
/** the light's brightness change above (+) and below (-) flat ground, rel = B - 1, posterized into n bands: steps of SPAN / n with level 0 exactly at flat ground (the
 *  steps are whole multiples of the step), each rising smoothly over BAND_SOFT of it; n < 2: rel itself. SPAN is the whole range, the shade's and the light's */
export function bandRel(rel: number, n: number): number {
  if (!(n >= 2) || rel === 0) return rel;
  const step = (REL_MAX - REL_MIN) / n, x = rel / step, fl = Math.floor(x), t = x - fl;
  const lo = 0.5 - BAND_SOFT / 2, hi = 0.5 + BAND_SOFT / 2, u = t <= lo ? 0 : t >= hi ? 1 : (t - lo) / (hi - lo);
  return (fl + u * u * (3 - 2 * u)) * step;
}

/** the ground the light is cast from: the course height's samples (CH_SIZE², m), and the real land under a map-data course (null: none) */
export interface ReliefInput { course: Float32Array | null; land: LightLand | null }
/** the light on a grid of points over a tile box, as heightLightGrid's (the same lattice, the same five numbers a point: dark, lift, spec, cast, ao), and the slope at each point */
export interface ReliefGrid extends HeightLightGrid {
  /** the slope at each grid point, degrees from straight up (the angle of the unexaggerated surface's normal: tiltOneSided of the whole ground), w x h */
  slope: Float32Array;
}

/** the light of the ground over tile box `box` at res points per tile (2: a point a metre), null when nothing in it is lit, shaded or sloped. `bands` (0: smooth): the
 *  posterized light. The surface is the course height plus the land (their tilts added, each by its own response: the player's gentle-ground gain on the course
 *  height, the land's own on the land: T388); every number is a function of the global field alone */
export function reliefGrid(inp: ReliefInput, box: readonly number[], res: number, bands = 0): ReliefGrid | null {
  const h = inp.course, land = inp.land, R = HEIGHT_LIGHT_REACH, bx0 = box[0]!, by0 = box[1]!, bx1 = box[2]!, by1 = box[3]!;
  // the samples within reach of the box that are not 0 (the field is 0 everywhere it was never edited)
  const i0 = clampS(Math.floor((bx0 - R) / CH_STEP)), i1 = clampS(Math.ceil((bx1 + R) / CH_STEP));
  const j0 = clampS(Math.floor((by0 - R) / CH_STEP)), j1 = clampS(Math.ceil((by1 + R) / CH_STEP));
  let ni0 = CH_SIZE, ni1 = -1, nj0 = CH_SIZE, nj1 = -1;
  if (h) for (let j = j0; j <= j1; j++) {
    const row = j * CH_SIZE;
    for (let i = i0; i <= i1; i++) if (h[row + i] !== 0) { if (i < ni0) ni0 = i; if (i > ni1) ni1 = i; if (j < nj0) nj0 = j; nj1 = j; }
  }
  const L = land && land.w > 0 && land.h > 0 && land.i0 <= i1 && land.i0 + land.w - 1 >= i0 && land.j0 <= j1 && land.j0 + land.h - 1 >= j0 ? land : null;
  if (L) { ni0 = Math.min(ni0, Math.max(i0, L.i0)); ni1 = Math.max(ni1, Math.min(i1, L.i0 + L.w - 1)); nj0 = Math.min(nj0, Math.max(j0, L.j0)); nj1 = Math.max(nj1, Math.min(j1, L.j0 + L.h - 1)); }
  if (ni1 < 0) return null;
  // the part of the box those samples can light (tiles), as whole lattice points with one point to spare all round
  const px0 = Math.max(bx0, ni0 * CH_STEP - R), px1 = Math.min(bx1, (ni1 + 1) * CH_STEP + R), py0 = Math.max(by0, nj0 * CH_STEP - R), py1 = Math.min(by1, (nj1 + 1) * CH_STEP + R);
  if (px0 >= px1 || py0 >= py1) return null;
  const k0 = Math.floor(px0 * res) - 1, l0 = Math.floor(py0 * res) - 1, w = Math.ceil(px1 * res) + 1 - k0, gh = Math.ceil(py1 * res) + 1 - l0;
  // the spline heights on the lattice, grown by the march's and the ring's reach (m points): the course height, the land, and the two together
  const m = Math.ceil(Math.max(CAST_REACH, AO_RADII[1]) * res) + 2, HWd = w + 2 * m, HHt = gh + 2 * m, n = HWd * HHt;
  const Hc = new Float32Array(n), Hl = L ? new Float32Array(n) : null, Hs = L ? new Float32Array(n) : Hc;
  for (let jj = 0; jj < HHt; jj++) {
    const ty = (l0 - m + jj + 0.5) / res;
    for (let ii = 0; ii < HWd; ii++) {
      const tx = (k0 - m + ii + 0.5) / res, c = jj * HWd + ii, hc = h ? splineHeight(h, tx, ty) : 0;
      Hc[c] = hc;
      if (Hl) { const hl = splineLand(L!, tx, ty); Hl[c] = hl; Hs[c] = hc + hl; }
    }
  }
  const at = (u: number, v: number) => {
    u = u < 0 ? 0 : u > HWd - 1.001 ? HWd - 1.001 : u; v = v < 0 ? 0 : v > HHt - 1.001 ? HHt - 1.001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * HWd + i;
    const top = Hs[k]! + (Hs[k + 1]! - Hs[k]!) * fu, bot = Hs[k + HWd]! + (Hs[k + HWd + 1]! - Hs[k + HWd]!) * fu;
    return top + (bot - top) * fv;
  };
  const TS = new Float64Array(2), TL = new Float64Array(2), TC = new Float64Array(2);
  // the highest ground the lattice holds: a ray toward the sun climbs 2 SUN_SLOPE a tile, so a point can only be shaded by ground within (rise to that height) / (2 SUN_SLOPE) tiles: the march stops there (exact, and most points stop early)
  let hMax = -Infinity; for (let k = 0; k < n; k++) if (Hs[k]! > hMax) hMax = Hs[k]!;
  const step = 1 / res, stepM = 2 * step, sdx = SUN_TILE_DIR.x * res, sdy = SUN_TILE_DIR.y * res, out = new Float32Array(w * gh * HL_STRIDE), slope = new Float32Array(w * gh), DEG = 180 / Math.PI;
  let qi0 = w, qi1 = -1, qj0 = gh, qj1 = -1;
  for (let j = 0; j < gh; j++) for (let i = 0; i < w; i++) {
    const ii = i + m, jj = j + m, c = jj * HWd + ii, H0 = Hs[c]!, o = (j * w + i) * HL_STRIDE;
    // the slope of the ground: the one-sided tilt of the whole surface (the angle of its normal from straight up)
    tiltInto(Hs, c, HWd, stepM, TS, 0); const sgx = TS[0]!, sgy = TS[1]!, deg = Math.atan(Math.hypot(sgx, sgy)) * DEG; slope[j * w + i] = deg;
    // the light's tilt: the course height's own (the player's gentle-ground gain) and the land's (T388), added; ex0 is the tilt with LIGHT_EXAG alone (the inset highlight's ramp)
    let nx: number, ny: number, ex0: number, ey0: number, landShare = 0;
    if (Hl) {
      tiltInto(Hl, c, HWd, stepM, TL, 0); tiltInto(Hc, c, HWd, stepM, TC, 0);
      const qx = TL[0]!, qy = TL[1]!, px = TC[0]!, py = TC[1]!, xp = lightExag(px * px + py * py), xq = landExag(qx * qx + qy * qy);
      nx = -(xp * px + xq * qx); ny = -(xp * py + xq * qy); ex0 = -(LIGHT_EXAG * px + xq * qx); ey0 = -(LIGHT_EXAG * py + xq * qy);
      const tq = xq * Math.hypot(qx, qy), tp = xp * Math.hypot(px, py); landShare = tq / (tq + tp + 1e-12);
    } else { const xg = lightExag(sgx * sgx + sgy * sgy); nx = -xg * sgx; ny = -xg * sgy; ex0 = -LIGHT_EXAG * sgx; ey0 = -LIGHT_EXAG * sgy; }
    const ndl = (nx * lx + ny * ly + lz) / Math.sqrt(nx * nx + ny * ny + 1), ndl0 = (ex0 * lx + ey0 * ly + lz) / Math.sqrt(ex0 * ex0 + ey0 * ey0 + 1);
    // cast: the march toward the sun; a point is shaded where the ground ahead rises above the sun's ray (exaggerated heights, metres)
    let cast = 0;
    const dEnd = Math.min(CAST_REACH + 1e-9, LIGHT_EXAG * (hMax - H0) / (2 * SUN_SLOPE));
    for (let d = step; d <= dEnd && cast < 1; d += step) {
      const ex = LIGHT_EXAG * (at(ii + sdx * d, jj + sdy * d) - H0) - 2 * d * SUN_SLOPE;
      if (ex > 0) cast = Math.max(cast, Math.min(1, ex / (PEN0 + PEN * 2 * d)) * (1 - smooth(0.6 * CAST_REACH, CAST_REACH, d)));
    }
    cast = cast > CAST_EPS ? (cast - CAST_EPS) / (1 - CAST_EPS) : 0;
    // occlusion (a hollow) and its opposite (a crest): the mean of the ring round, less this point's height
    let ring = 0;
    for (const r of AO_RADII) for (const [cx, cy] of RING) ring += at(ii + cx * r * res, jj + cy * r * res);
    const below = ring / (RING.length * AO_RADII.length) - H0;
    // the narrow ring: a fold in the ground (res of at least a point a tile: the planner's coarse lattice has no such scale)
    let fold = 0;
    if (res >= 1) {
      // (the four lattice points that distance away tell first whether the ground curves there at all: on a gentle swell it does not, and the eight-point ring is skipped)
      const k = CREASE_R * res, lap4 = (Hs[c + k]! + Hs[c - k]! + Hs[c + k * HWd]! + Hs[c - k * HWd]!) / 4 - H0;
      if (Math.abs(lap4) * LIGHT_EXAG >= 0.5 * CREST_LO) { let r1 = 0; for (const [cx, cy] of RING) r1 += at(ii + cx * k, jj + cy * k); fold = (r1 / RING.length - H0) * LIGHT_EXAG; }
    }
    const crease = fold > 0 ? smooth(CREST_LO, CREST_HI, fold) : 0, crest = fold < 0 ? smooth(CREST_LO, CREST_HI, -fold) : 0;
    const ao = Math.min(1, (below > 0 ? below * LIGHT_EXAG * AO_K : 0) + CREASE_AO * crease);
    out[o + 3] = cast; out[o + 4] = ao;
    // flat ground (or a level plateau) stays exactly as it is: judged on the plain response, so the gentle gain lights no more ground than it did
    const rel0 = AMBIENT * (1 - ao) + (1 - AMBIENT) * Math.max(0, ndl0) / lz * (1 - cast) - 1;
    const rawRel = Math.abs(rel0) < 1e-5 ? 0 : AMBIENT * (1 - ao) + (1 - AMBIENT) * Math.max(0, ndl) / lz * (1 - cast) - 1, rel = bandRel(rawRel, bands);
    // the crest's thin highlight: on the lit side of a convex crest, over the slope's own inset highlight
    const ridge = crest > 0 && rawRel > 0 ? crest * smooth(0, 0.5 * REL_MAX, rawRel) : 0;
    if (rel !== 0 || ridge > 0) {
      const gain = 1 + (LAND_GAIN - 1) * landShare, lift = rel > 0 ? gain * Math.min(1, rel / REL_MAX) : 0;
      out[o] = rel < 0 ? gain * Math.min(1, landShare > 0 ? gentleDark(-rel) + (-rel - gentleDark(-rel)) * landShare : gentleDark(-rel)) : 0; out[o + 1] = lift;
      out[o + 2] = Math.max(rel0 > 0 ? smooth(SPEC_LO, SPEC_HI, Math.min(1, rel0 / REL_MAX)) : 0, ridge);
    }
    if (rel !== 0 || ridge > 0 || deg > 0.25) { if (i < qi0) qi0 = i; if (i > qi1) qi1 = i; if (j < qj0) qj0 = j; if (j > qj1) qj1 = j; }
  }
  if (qi1 < 0) return null;
  return { x0: k0 / res, y0: l0 / res, res, w, h: gh, v: out, nz: [qi0, qj0, qi1, qj1], slope };
}

/** the look of the relief light as the pictures lay it (the shade's multiply, the lift, the highlight): heightLightPictures' form with the relief's own strengths. The
 *  numbers are the T126 look's, the shade a little deeper and the highlight a little warmer so the hills read as shapes */
export interface ReliefLook { darkK: number; darkMax: number; shadeW: readonly [number, number, number]; liftG: number; liftW: readonly [number, number, number]; specG: number; sun: readonly [number, number, number] }
export const RELIEF_LOOK: ReliefLook = { darkK: 0.75, darkMax: 0.5, shadeW: [1.12, 1, 0.66], liftG: 0.42, liftW: [1.08, 1, 0.8], specG: 0.34, sun: [255, 236, 176] };
/** the grid's light as three w x h RGBA pictures at strength s (heightLightPictures' contract) */
export function reliefPictures(g: HeightLightGrid, s: number, look: ReliefLook = RELIEF_LOOK): { shade: Uint8ClampedArray; lift: Uint8ClampedArray; spec: Uint8ClampedArray } {
  const n = g.w * g.h, shade = new Uint8ClampedArray(n * 4), lift = new Uint8ClampedArray(n * 4), spec = new Uint8ClampedArray(n * 4), V = g.v;
  for (let p = 0; p < n; p++) {
    const k = p * HL_STRIDE, o = p * 4, D = Math.min(look.darkMax, s * look.darkK * V[k]!), up = s * look.liftG * V[k + 1]!, hi = Math.min(1, s * look.specG * V[k + 2]!);
    for (let c = 0; c < 3; c++) { shade[o + c] = 255 * (1 - D * look.shadeW[c]!); lift[o + c] = 255 * up * look.liftW[c]!; spec[o + c] = hi * look.sun[c]!; }
    shade[o + 3] = lift[o + 3] = spec[o + 3] = 255;
  }
  return { shade, lift, spec };
}

// ---------------------------------------------------------------- the slope materials

/** the slope bands (degrees from straight up) that pick the natural ground's material, the numbers of the surfaces file's `relief`: flat and gentle ground below hillAt keeps the
 *  ground as it is, moderate ground (hillAt to rockAt) wears the Hillside material, steep ground (from rockAt) the Mountain rock. Each edge blends over `blend` degrees (half
 *  either side of its angle), broken by noise of ±`noise` degrees in blotches `grain` tiles across, so rock pokes through on the steeper patches of a hill and never in a contour line */
export interface ReliefBands { hillAt: number; rockAt: number; blend: number; noise: number; grain: number }
/** the ranges each number is held to (the surfaces file may say anything) */
export const RELIEF_RANGES = { hillAt: [2, 60], rockAt: [5, 80], blend: [0.5, 20], noise: [0, 12], grain: [2, 80] } as const;
export const RELIEF_BANDS_DEFAULT: Readonly<ReliefBands> = { hillAt: 9, rockAt: 27, blend: 4, noise: 2, grain: 12 };
const clampNum = (v: unknown, r: readonly [number, number], d: number) => { const n = typeof v === 'number' && Number.isFinite(v) ? v : d; return Math.max(r[0], Math.min(r[1], n)); };
/** the surfaces file's relief numbers with every value held to its range and the rock never below the hillside */
export function clampRelief(v: unknown): ReliefBands {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ReliefBands>, d = RELIEF_BANDS_DEFAULT, R = RELIEF_RANGES;
  const hillAt = clampNum(o.hillAt, R.hillAt, d.hillAt), rockAt = Math.max(hillAt + 1, clampNum(o.rockAt, R.rockAt, d.rockAt));
  return { hillAt, rockAt, blend: clampNum(o.blend, R.blend, d.blend), noise: clampNum(o.noise, R.noise, d.noise), grain: clampNum(o.grain, R.grain, d.grain) };
}
/** the share (0..1) of the hillside material and of the mountain rock at a slope of `deg` degrees with noise n (about -1..1 at the point): each a smoothstep across its blend,
 *  the rock over the hillside (where the rock is whole the hillside under it does not show) */
export function slopeShares(deg: number, n: number, b: ReliefBands): { hill: number; rock: number } {
  const d = deg + n * b.noise, hb = b.blend / 2;
  return { hill: smooth(b.hillAt - hb, b.hillAt + hb, d), rock: smooth(b.rockAt - hb, b.rockAt + hb, d) };
}
/** the least slope (degrees) at which either material can show anywhere: a point under it has neither, whatever the noise */
export const flatBelow = (b: ReliefBands) => b.hillAt - b.blend / 2 - b.noise;
/** the steepest slope (degrees) between neighbouring samples of the course height plus the land in tile box `box` (grown a sample): a cheap upper-ish bound, with a margin
 *  for the spline's overshoot, that tells whether a chunk can have any hillside or rock (the worker asks for those pictures only then) */
export function reliefMaxSlope(inp: ReliefInput, box: readonly number[]): number {
  const h = inp.course, L = inp.land;
  if (!h && !L) return 0;
  const i0 = clampS(Math.floor(box[0]! / CH_STEP) - 1), i1 = clampS(Math.ceil(box[2]! / CH_STEP) + 1), j0 = clampS(Math.floor(box[1]! / CH_STEP) - 1), j1 = clampS(Math.ceil(box[3]! / CH_STEP) + 1);
  const sample = (i: number, j: number) => (h ? h[j * CH_SIZE + i]! : 0) + (L && i >= L.i0 && i < L.i0 + L.w && j >= L.j0 && j < L.j0 + L.h ? L.data[(j - L.j0) * L.w + (i - L.i0)]! : 0);
  let best = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const a = sample(i, j), dx = Math.abs(sample(i + 1, j) - a), dy = Math.abs(sample(i, j + 1) - a), dd = Math.abs(sample(i + 1, j + 1) - a) / Math.SQRT2;
    const s = Math.max(dx, dy, dd) / (CH_STEP * 2); if (s > best) best = s;
  }
  return Math.atan(best * 1.3) * 180 / Math.PI + 1;
}

/** the slope at world tile (x, y) read from a relief grid (bilinear between its points; 0 off the grid, where nothing slopes) */
export function sampleSlope(g: ReliefGrid, x: number, y: number): number {
  const u = (x - g.x0) * g.res - 0.5, v = (y - g.y0) * g.res - 0.5;
  if (!(u >= 0 && v >= 0 && u < g.w - 1 && v < g.h - 1)) return 0;
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * g.w + i, S = g.slope;
  return (S[k]! * (1 - fu) + S[k + 1]! * fu) * (1 - fv) + (S[k + g.w]! * (1 - fu) + S[k + g.w + 1]! * fu) * fv;
}
/** an alpha-only RGBA picture over a tile box (the ground painter's overlay form: RGB 0, alpha the share), and the tile box of the pixels that have any */
export interface AlphaMask { data: Uint8ClampedArray; W: number; H: number; box: [number, number, number, number] }
/** the two slope masks of the natural ground over tile box [x0, x0 + w) x [y0, y0 + h) at res px a tile: the hillside's and the mountain rock's share at each pixel, from the
 *  slope of the relief grid g (the course height and the land) or of the natural terrain (`nat`: its slope field's m per m, HS x HS, flat in the game that ships), whichever is
 *  steeper, and the noise (world tiles, so two chunks agree at their seam). null: neither shows anywhere in the box */
export function slopeMasks(g: ReliefGrid | null, nat: Float32Array | null, x0: number, y0: number, w: number, h: number, res: number, noise: Noise, b: ReliefBands): { hill: AlphaMask | null; rock: AlphaMask | null } | null {
  if (!g && !nat) return null;
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), floor = flatBelow(b), DEG = 180 / Math.PI, mapEdge = HS * HSTEP;
  let hd: Uint8ClampedArray | null = null, rd: Uint8ClampedArray | null = null;
  const hb: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity], rb: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let v = 0; v < H; v++) {
    const ty = y0 + (v + 0.5) / res;
    for (let u = 0; u < W; u++) {
      const tx = x0 + (u + 0.5) / res;
      let deg = g ? sampleSlope(g, tx, ty) : 0;
      if (nat && tx >= 0 && ty >= 0 && tx < mapEdge && ty < mapEdge) deg = Math.max(deg, Math.atan(sampleField(nat, tx, ty)) * DEG);
      if (deg < floor) continue;
      const sh = slopeShares(deg, fbm(noise, tx / b.grain, ty / b.grain, 3), b), ah = Math.round(sh.hill * 255), ar = Math.round(sh.rock * 255), k = (v * W + u) * 4 + 3;
      if (ah > 0) { hd ??= new Uint8ClampedArray(W * H * 4); hd[k] = ah; hb[0] = Math.min(hb[0], tx); hb[1] = Math.min(hb[1], ty); hb[2] = Math.max(hb[2], tx); hb[3] = Math.max(hb[3], ty); }
      if (ar > 0) { rd ??= new Uint8ClampedArray(W * H * 4); rd[k] = ar; rb[0] = Math.min(rb[0], tx); rb[1] = Math.min(rb[1], ty); rb[2] = Math.max(rb[2], tx); rb[3] = Math.max(rb[3], ty); }
    }
  }
  if (!hd && !rd) return null;
  const grow = (a: [number, number, number, number]): [number, number, number, number] => [a[0] - 1, a[1] - 1, a[2] + 1, a[3] + 1];
  return { hill: hd ? { data: hd, W, H, box: grow(hb) } : null, rock: rd ? { data: rd, W, H, box: grow(rb) } : null };
}
