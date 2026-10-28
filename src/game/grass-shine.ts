/** T262 (#769, phase 1: a prototype with a verdict): the grass catches the camera's shine. The owner, 2026-10-29: "if we generate a texture
 *  bumpmap for every grass type and lay that over as the specular highlight when your camera moves it will work well".
 *
 *  Each grass pixel gets a normal from a height field's slope and is lit Blinn-Phong style by the one sun (the upper right: shadows at 145°,
 *  ext/course-height SUN_SHADOW_DEG) seen from an eye above the screen's centre: the view direction differs across the screen, so as the
 *  camera pans or zooms the blades turning their faces between sun and eye change and the highlight slides over the blades. It is masked by
 *  T215's camera falloff (strongest at the centre), scaled by the day (it fades after dusk), weighted per surface (greens and fairways most,
 *  rough and long grass least) and inset from the surfaces' edges by the chunk's weight mask, and laid as T110's textured shine: each pixel
 *  gains its own colour squared, so lit tips brighten and the dark gaps between blades stay dark; never a flat wash.
 *
 *  The height field comes from one of four sources, the options the issue asks to measure (window.__game.grassShine, a dev switch; 'off' the
 *  default: the ground exactly as before):
 *  - 'a'  a half-size bump layer per chunk (R8): the ground worker lays each grass family's bump tiles (scripts/assets/prep-grass-bump.mjs)
 *         where the bake laid its colour tiles, clipped to the surface; 'a4' the same at a quarter of the chunk's size.
 *  - 'b'  T215's reflection mask's free channel: it has none (rgb the road's mean, premultiplied, alpha the pools), and it exists only on a
 *         chunk with a lamp pool, so 'b' is measured as what packing a channel into a quarter-size per-chunk mask costs: 'a4'.
 *  - 'c'  no new chunk layer: each family's small tiling bump maps (a texture array) sampled in tile space in the shader, the tile and its
 *         permutation found as the bake found them (painted-tiles.ts), the family from the chunk's mask's second channel.
 *  - 'd'  no new texture: a bump derived in the shader from the chunk's own colour (its luminance's high-pass and slope, four more taps).
 *  Every option shares the per-chunk weight mask (a quarter of the chunk's size each way, R8, RG8 for 'c'), made by the worker from the
 *  surfaces' outlines (shineMaskPixels: the weight, inset from the edges).
 *
 *  Pure: the node tests run it, and gl.ts builds its shader from the same numbers. */
import BUMP from './grass-bump.json';
import { SUN_SHADOW_DEG } from './ext/course-height';

export type ShineMode = 'off' | 'a' | 'a4' | 'c' | 'd';
export const SHINE_MODES: readonly ShineMode[] = ['off', 'a', 'a4', 'c', 'd'];
/** the shader's mode number of each source (FS_QUAD uShine.w) */
export const SHINE_CODE: Readonly<Record<ShineMode, number>> = { off: 0, a: 1, a4: 1, c: 3, d: 4 };
export const isShineMode = (m: unknown): m is ShineMode => typeof m === 'string' && (SHINE_MODES as readonly string[]).includes(m);

/** the weight mask's size against its chunk's (a quarter each way: the weights and the inset are soft) */
export const SHINE_MASK_K = 4;
/** the bump layer's size against its chunk's, by mode ('a' half, 'a4' a quarter) */
export const bumpK = (m: ShineMode) => (m === 'a' ? 2 : m === 'a4' ? 4 : 0);
/** the inset from a shiny surface's edge (world px): no shine within the first, whole past the second */
export const SHINE_INSET = [14, 60] as const;

/** the families with bump maps (grass-bump.json, made by prep-grass-bump.mjs), in their slot order: slot k + 1 in the mask's second channel */
export interface BumpLevel { size: [number, number]; lumStd: number; tiles: { file: string; of: string; sha256: string }[] }
export interface BumpFamily { id: string; levels: Partial<Record<'near' | 'mid' | 'far', BumpLevel>> }
export const BUMP_FAMILIES: readonly BumpFamily[] = (BUMP as unknown as { families: BumpFamily[] }).families;
/** the bump maps' stored spread (prep-grass-bump.mjs SPREAD: 128 + SPREAD z) */
export const BUMP_SPREAD = (BUMP as unknown as { spread: number }).spread;
/** a family's slot (1-based; 0: it has no bump map) */
export const bumpSlot = (family: string | null | undefined) => (family ? BUMP_FAMILIES.findIndex(f => f.id === family) + 1 : 0);

/** the shine's weight per painted surface (painted-surfaces.json keys): greens and fairways sheen most, rough and long grass least (the
 *  issue's rule). Phase 1, the prototype: the fairway, the green and the town lawns only; everything else 0 */
export const SURFACE_SHINE: Readonly<Record<string, number>> = {
  green: 1, 'range-green': 1, fairway: 0.85, 'range-outfield': 0.85,
  lawn: 0.6, lawns: 0.6, lawnBuilt: 0.6, lawnUpgraded: 0.7,
};
/** the weight of a surface by its texture name, its family as the fallback (a town lawn wears lawn:<slot>, a course layer its look's name) */
export function shineWeight(tex: string, family: string | null | undefined, weights: Readonly<Record<string, number>> = SURFACE_SHINE): number {
  if (tex in weights) return weights[tex]!;
  if (tex.startsWith('lawn:')) return weights.lawns ?? 0;
  if (family === 'fairway-concept-run') return weights.fairway ?? 0;
  if (family === 'green-concept-run') return weights.green ?? 0;
  return 0;
}

/** the look's knobs (window.__game.setShine; phase 2 puts them in the Studio beside T215's SpecLook): strength, gloss (the highlight's
 *  exponent: higher, smaller and sharper), bump (the normals' tilt per unit of slope), eye (the eye's distance over half the screen's longer
 *  side, along the sun's mirror from the screen's centre: nearer, the glint is smaller and slides faster as the camera pans), night (the share
 *  lost after dusk) */
export interface ShineLook { strength: number; gloss: number; bump: number; eye: number; night: number }
export const SHINE_LOOK: ShineLook = { strength: 0.8, gloss: 24, bump: 0.6, eye: 1.5, night: 0.9 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
export function clampShineLook(s: Partial<ShineLook> | null | undefined): ShineLook {
  const D = SHINE_LOOK;
  return { strength: num(s?.strength, D.strength, 0, 4), gloss: num(s?.gloss, D.gloss, 1, 200), bump: num(s?.bump, D.bump, 0, 20), eye: num(s?.eye, D.eye, 0.2, 5), night: num(s?.night, D.night, 0, 1) };
}
/** the shine's strength at the night light's amount (0 day .. 1 night): whole by day, night of it gone after dusk */
export const shineGain = (s: ShineLook, night: number) => s.strength * (1 - s.night * clamp(night, 0, 1));

/** the sun as a unit vector in screen space (x right, y down, z up out of the ground): toward the upper right, opposite the shadows' 145°,
 *  at the course light's elevation (about 46°, ext/course-height SUN_LIGHT) */
export const SUN_SCREEN = (() => {
  const a = (SUN_SHADOW_DEG * Math.PI) / 180, el = Math.atan2(1.05, 1.0124), c = Math.cos(el);
  return [-Math.cos(a) * c, -Math.sin(a) * c, Math.sin(el)] as const;
})();
/** the sun's colour on the blades (a warm white: the T110 shine's) */
export const SHINE_TINT = [1.0, 0.96, 0.82] as const;
/** the highlight's amount (the colour-squared gain at full weight, strength 1) and how much of it is whitened (the sun's colour, not the grass's) */
export const SHINE_AMOUNT = 1.0, SHINE_WHITE = 0.5;
/** the chunk colour's luminance high-pass spread (mode 'd': a radius-1 Laplacian on the baked chunk, measured on the fairway, green and lawn
 *  at 30%), so its heights come out in the same units as the bump maps' (standard deviations) */
export const LUM_HP_STD = 0.022;

/** one weight-mask texel's inset factor at distance d (world px) inside its surface's edge */
export const insetAt = (d: number) => { const t = clamp((d - SHINE_INSET[0]) / (SHINE_INSET[1] - SHINE_INSET[0]), 0, 1); return t * t * (3 - 2 * t); };
/** the margin (texels) the worker draws the mask with past each side of its chunk, so an edge just over a seam insets both chunks alike */
export const maskPad = (texelWorld: number) => Math.ceil(SHINE_INSET[1] / texelWorld) + 1;
/** the weight mask's pixels (the worker's): src is the mask canvas's RGBA as drawn (maskColour: red 128 + 127 x the weight, 0 none; green the
 *  family's slot x 40; antialiased at the edges), W x H texels of texelWorld world px with pad texels of margin all round; out: the inner
 *  (W - 2 pad) x (H - 2 pad) texels' weight times the inset (the distance inside the shiny ground, a two-pass chamfer; past the margin counts
 *  as more of the same), and with two channels the slot (rounded: an edge texel takes its nearer slot) */
export function shineMaskPixels(src: Uint8ClampedArray, W: number, H: number, texelWorld: number, channels: 1 | 2, pad = 0): Uint8Array {
  const n = W * H, dist = new Float32Array(n), INF = 1e9, D = 1, D2 = Math.SQRT2, w = W, h = H;
  for (let i = 0; i < n; i++) dist[i] = src[4 * i + 3]! >= 128 && src[4 * i]! >= 128 ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!dist[i]) continue; let d = dist[i]!;
    if (x > 0) d = Math.min(d, dist[i - 1]! + D);
    if (y > 0) { d = Math.min(d, dist[i - w]! + D); if (x > 0) d = Math.min(d, dist[i - w - 1]! + D2); if (x < w - 1) d = Math.min(d, dist[i - w + 1]! + D2); }
    dist[i] = d;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!dist[i]) continue; let d = dist[i]!;
    if (x < w - 1) d = Math.min(d, dist[i + 1]! + D);
    if (y < h - 1) { d = Math.min(d, dist[i + w]! + D); if (x < w - 1) d = Math.min(d, dist[i + w + 1]! + D2); if (x > 0) d = Math.min(d, dist[i + w - 1]! + D2); }
    dist[i] = d;
  }
  const iw = W - 2 * pad, ih = H - 2 * pad, out = new Uint8Array(iw * ih * channels);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y + pad) * W + x + pad, o = y * iw + x, dd = dist[i]!;
    if (!dd || src[4 * i + 3]! === 0) continue;
    out[o * channels] = Math.round(255 * maskWeight(src[4 * i]!) * (dd >= INF ? 1 : insetAt((dd - 0.5) * texelWorld)));
    if (channels === 2) out[o * 2 + 1] = Math.round(src[4 * i + 1]! / 40);
  }
  return out;
}
/** the mask colour a surface of weight wgt (0..1) and family slot k is drawn in */
export const maskColour = (wgt: number, slot: number) => `rgb(${Math.round(clamp(wgt, 0, 1) * 127 + 128 * (wgt > 0 ? 1 : 0))},${slot * 40},0)`;
/** a drawn mask texel's weight (0..1) back from its red (maskColour: 128 + 127 w, 0 for none) */
export const maskWeight = (r: number) => (r >= 128 ? (r - 128) / 127 : 0);

const g = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));
/** GLSL (gl.ts FS_QUAD): grassShine(c, z, slope, w, k): the shine on colour c (0..1) of height z (standard deviations) and slope (z per world
 *  px), at weight w times falloff-and-gain k; uShineLook: gloss, bump, eye, 0 */
export const GRASS_SHINE_GLSL = `vec3 grassShine(vec3 c, float z, vec2 slope, float w, float k) {
  // the eye: uShineLook.z (over half the screen's longer side) from the screen's centre along the sun's mirror, so the flat ground's glint
  // lies at the centre and every point off it sees the sun's reflection tilted: as the camera moves, other blades turn to it
  vec2 p = vec2(gl_FragCoord.x, uScreen.y - gl_FragCoord.y), d = (p - 0.5 * uScreen) / (0.5 * max(uScreen.x, uScreen.y));
  vec3 L = vec3(${g(SUN_SCREEN[0])}, ${g(SUN_SCREEN[1])}, ${g(SUN_SCREEN[2])});
  vec3 V = normalize(vec3(-L.xy * uShineLook.z - d, L.z * uShineLook.z));
  vec3 N = normalize(vec3(-slope * uShineLook.y, 1.0));
  vec3 H = normalize(L + V);
  float s = pow(max(dot(N, H), 0.0), uShineLook.x);
  // the blade tops (above the local mean) and green pixels only: a path, sand or a shadow laid over the grass takes none
  float tip = mix(0.3, 1.0, smoothstep(-1.0, 1.2, z)), key = smoothstep(0.004, 0.04, c.g - max(c.r * 0.93, c.b));
  // T110's textured light (its own colour squared), half of it whitened: a sheen is the sun's colour more than the grass's
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return c + (w * k * s * tip * key * ${g(SHINE_AMOUNT)}) * mix(c * c, vec3(1.3 * l * l), ${g(SHINE_WHITE)}) * vec3(${SHINE_TINT.map(g).join(', ')});
}`;
