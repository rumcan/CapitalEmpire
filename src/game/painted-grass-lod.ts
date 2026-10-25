import { levelFor, midLevelFor, MID_BELOW, mulberry } from './iso';

/** The painted grass (T082, #147): three art-directed pictures of one surface, one per camera zoom level, blended by the zoom a ground chunk
 *  is baked at. Pure: importable from node tests (the pictures themselves are in painted-grass-art.ts). */

/** the art level follows the CSS camera zoom (the same art on every screen); the raster level (the chunk's bake density) follows the device
 *  zoom, so a dpr-2 screen bakes sharper chunks of the same art */
export function grassZoomLevels(zoom: number, dpr: number) {
  const district = zoom < MID_BELOW, pick = district ? midLevelFor : levelFor;
  return { district, artL: pick(zoom), rasterL: pick(zoom * dpr) };
}
export type GrassDetail = 'far' | 'mid' | 'near';
/** the game's Grass setting: the painted families (the default) or the photo grass the game had before (base-grass.json, the presets' mixes) */
export type GrassArt = 'painted' | 'photo';
export const GRASS_ART_DEFAULT: GrassArt = 'painted';
export const clampGrassArt = (v: unknown): GrassArt => (v === 'photo' || v === 'painted' ? v : GRASS_ART_DEFAULT);
/** one level: its picture (a URL) and the metres of ground one repeat of it covers */
export interface PaintedLevel { src: string; metres: number }
/** a painted family: its three levels; repeat (metres) is the period of the translation mosaic that hides a level smaller than it (each
 *  level is laid over and over in soft, shifted patches: no turns, no mirrors, the light stays upper right); 0 = every level as painted */
export interface PaintedFamily { far: PaintedLevel; mid: PaintedLevel; near: PaintedLevel; repeat: number }
/** a family laid through a colour (multiplied): the meadow and the map edge are the base grass, tinted */
export interface PaintedTint { of: string; tint: string }

export interface GrassDetailWeight { detail: GrassDetail; weight: number }
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the levels a chunk baked at art level L blends, at most two, their weights summing to 1: near at 30% (ZOOM_MAX), mid at 15%, far from
 *  7.5% down, crossfading between (art levels 0.2 and 0.1 are the halfway mixes); a weight under 2% is left out */
export function grassDetailWeights(L: number): GrassDetailWeight[] {
  const level = Number.isFinite(L) && L > 0 ? L : 0;
  const near = smooth(.14, .3, level), mid = smooth(.05, .14, level);
  const pair: GrassDetailWeight[] = near > 0
    ? [{ detail: 'mid', weight: 1 - near }, { detail: 'near', weight: near }]
    : [{ detail: 'far', weight: 1 - mid }, { detail: 'mid', weight: mid }];
  const kept = pair.filter(x => x.weight >= .02), sum = kept.reduce((s, x) => s + x.weight, 0);
  return kept.map(x => ({ detail: x.detail, weight: x.weight / sum }));
}
/** the period (metres) of a blend of these levels: the mosaic's when it is bigger, else the biggest level (each level divides it) */
export function blendMetres(family: PaintedFamily, details: readonly GrassDetail[]) {
  return Math.max(family.repeat, ...details.map(d => family[d].metres));
}
/** the translation mosaic's patches over one repeat (metres): positions jittered on a grid of 3/8 of the level's metres, each showing the
 *  level shifted by its own phase (0..1 of the level); deterministic, the same layout for every level, so a blend of two lines up */
export function grassTranslationSeeds(repeat: number, levelMetres: number) {
  const random = mulberry(627119), count = Math.max(1, Math.round(repeat / (levelMetres * 3 / 8))), step = repeat / count;
  return Array.from({ length: count * count }, (_, i) => ({
    x: (i % count + .5 + (random() - .5) * .6) * step,
    y: (Math.floor(i / count) + .5 + (random() - .5) * .6) * step,
    phaseX: random(), phaseY: random(),
  }));
}
/** decoded pictures a worker keeps (the least recently used past this are dropped; the current batch is always kept) */
export const MAX_PAINTED_SOURCES = 9;
/** blends (mip chains) a worker keeps: a few art levels of the grass and its tints */
export const MAX_PAINTED_CHAINS = 6;
/** a blend's side at most, px (2048: 48 m at 42.7 px a metre, enough for the closest zoom on a dpr-2 screen) */
export const PAINTED_MAX_PX = 2048;
/** Map insertion order is the LRU: drop the oldest keys past the limit, never a protected one */
export function trimLru<T>(map: Map<string, T>, protectedKeys: ReadonlySet<string>, limit: number, drop?: (v: T) => void) {
  let size = map.size;
  for (const [key, v] of map) { if (size <= limit) break; if (!protectedKeys.has(key)) { map.delete(key); drop?.(v); size--; } }
}

const hash2 = (x: number, y: number, s: number) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* ---- the stochastic layout (painted-ground.ts): how a chunk lays a family's blend so that no tile period and no constant streak shows at any
 *  zoom (the owner, 2026-10-25: "If we ever see a repeating pattern something is wrong"; the mowing stripes are the one exception, an overlay
 *  laid last). The blend is periodic and its brush strokes all lie one way; the ground shows it in soft round patches, each a window of the
 *  blend at its own phase and turned by a small angle, centred on a jittered hex lattice in world space. Two points one period apart come from
 *  different patches with unrelated phases, so nothing repeats; each patch takes one of four turns at random, so the strokes swing from patch
 *  to patch (blending at the soft edges) instead of running in parallel across the whole view. No mirrors, and turns of at most 36 degrees:
 *  the painted light stays in the upper right quadrant (the sun at 45 +- 36 degrees). ---- */
/** the turns a patch may be laid at, degrees */
export const PATCH_ANGLES: readonly number[] = [-36, -12, 12, 36];
/** the phases per turn, and the pre-cut patch pictures (sprite k: turn floor(k / PATCH_PHASES), its own phase) */
export const PATCH_PHASES = 3, PATCH_SPRITES = PATCH_ANGLES.length * PATCH_PHASES;
/** a patch's radius in tiles for a blend of this period (tiles): a quarter of it, so the painting's broad shapes stay whole in a patch (the far
 *  level's soft colour fields too) and a patch never shows the blend twice */
export const patchRadius = (period: number) => period / 4;
/** the lattice spacing over the radius (every point is well inside a patch) and the jitter of a centre over the spacing (so the lattice itself
 *  never shows as a cadence) */
export const PATCH_SPACING = 0.7, PATCH_JITTER = 0.5;
/** sprite k's offset into the blend, in periods (0..1 each way), and its turn in degrees */
export const patchPhase = (k: number): [number, number] => [hash2(k, 0, 17), hash2(k, 0, 19)];
export const patchAngle = (k: number) => PATCH_ANGLES[Math.floor(k / PATCH_PHASES)]!;
/** the patches over a tile box (x0, y0, x1, y1), centres and sprites, for patch radius R (tiles): deterministic per lattice cell and in the
 *  same order everywhere, so the chunks that share a patch draw it alike and no seam shows between them */
export function grassPatches(box: readonly [number, number, number, number], R: number): { x: number; y: number; k: number }[] {
  const d = R * PATCH_SPACING, rowH = d * Math.sqrt(3) / 2, out: { x: number; y: number; k: number }[] = [];
  const j0 = Math.floor((box[1] - R) / rowH) - 1, j1 = Math.ceil((box[3] + R) / rowH) + 1;
  for (let j = j0; j <= j1; j++) {
    const off = j & 1 ? 0.5 : 0, i0 = Math.floor((box[0] - R) / d - off) - 1, i1 = Math.ceil((box[2] + R) / d - off) + 1;
    for (let i = i0; i <= i1; i++) {
      const x = (i + off + (hash2(i, j, 7) - 0.5) * PATCH_JITTER) * d, y = (j + (hash2(i, j, 11) - 0.5) * PATCH_JITTER) * rowH;
      if (x + R < box[0] || x - R > box[2] || y + R < box[1] || y - R > box[3]) continue;
      out.push({ x, y, k: Math.floor(hash2(i, j, 29) * PATCH_ANGLES.length) * PATCH_PHASES + Math.floor(hash2(i, j, 13) * PATCH_PHASES) });
    }
  }
  return out;
}

/* ---- the low-frequency hue and value drift over the base grass, in world space, so no repeat of any picture shows from far away ---- */
/** value noise, smooth (C1) between lattice points one unit apart, in 0..1 */
function valueNoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** the drift's wavelengths in tiles (2 m): about 160 m and 56 m, never a multiple of a picture's repeat */
export const TONE_WAVES: readonly [number, number] = [80, 28];
/** the drift at tile (x, y), -1 (cool, darker) .. 1 (warm, lighter): two octaves of value noise, not periodic */
export function grassTone(x: number, y: number) {
  const n = valueNoise(x / TONE_WAVES[0], y / TONE_WAVES[0], 1) * 0.65 + valueNoise(x / TONE_WAVES[1] + 17.3, y / TONE_WAVES[1] - 5.1, 2) * 0.35;
  return Math.max(-1, Math.min(1, (n - 0.5) * 2.6));
}
/** the drift at full tone, as the owner's light rule has it (T110, #193): its light is the grass's own colour times TONE_LIGHT added (each
 *  channel brightened in proportion to itself: light lands on the lit strokes and mid-tones, the dark gaps stay dark, no flat wash); its shade a
 *  multiply by TONE_SHADE (cool, darker, keeping every stroke) */
export const TONE_LIGHT: readonly [number, number, number] = [0.11, 0.09, 0.02];
export const TONE_SHADE: readonly [number, number, number] = [0.86, 0.9, 0.98];
/** the shade's multiply and the light's gain at tone t (-1..1), per channel: [multiply, add-gain] */
export function toneOps(t: number): { mul: [number, number, number]; gain: [number, number, number] } {
  const s = Math.max(0, -t), l = Math.max(0, t);
  return { mul: [0, 1, 2].map(k => 1 - s * (1 - TONE_SHADE[k]!)) as [number, number, number], gain: [0, 1, 2].map(k => l * TONE_LIGHT[k]!) as [number, number, number] };
}
