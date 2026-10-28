/** T262 (#769): the grass catches the camera's shine. The owner, 2026-10-29: "if we generate a texture bumpmap for every grass type and lay
 *  that over as the specular highlight when your camera moves it will work well".
 *
 *  Each grass pixel gets a normal from a height field's slope and is lit Blinn-Phong style by the one sun (the upper right: shadows at 145°,
 *  ext/course-height SUN_SHADOW_DEG) seen from an eye on the sun's mirror above the screen's centre: the view direction differs across the
 *  screen, so as the camera pans or zooms other blades turn between sun and eye and the sheen slides over the grass. It is masked by T215's
 *  camera falloff (strongest at the centre), scaled by the day (it fades after dusk) and by the zoom (gone by the district zoom, whose chunks
 *  have no mask), weighted per surface (greens and fairways most, rough, long grass and fescue least), inset from the surfaces' edges by the
 *  chunk's weight mask, taken out where a sprite's shadow or the ground's baked shade lies (a sun highlight cannot sit in a shadow), and laid
 *  as T110's textured shine: each pixel gains its own colour squared (half whitened), so lit tips brighten and the dark gaps between blades
 *  stay dark; never a flat wash.
 *
 *  The height is the chunk's own colour's (phase 1's verdict, PR #792: its luminance's high-pass and slope from two more taps in gl.ts
 *  FS_QUAD). It looked the same as a bump map per grass family sampled in tile space and costs no texture, half the shader time, and follows
 *  everything the bake lays (the mowing stripes, the finish's bands, every family imported later).
 *
 *  The per-chunk weight mask (a texel of SHINE_TEXEL world px, R8, spanning the chunk) is made by the ground worker from the surfaces' outlines in the order
 *  the bake lays them (renderer.ts grassShineMask; shineMaskPixels here). Pure: the node tests run it, and gl.ts builds its shader from it. */
import { SUN_SHADOW_DEG } from './ext/course-height';

/** the weight mask's texel: SHINE_TEXEL world px (the weights and the inset are soft), and never under SHINE_TEXEL_PX of its chunk's own px.
 *  One byte a texel: the masks of a full ground cache (192 MB of RGBA pictures) take at most 192 / (4 x 25) = 1.9 MB, at 30% under 1 MB */
export const SHINE_TEXEL = 24, SHINE_TEXEL_PX = 5;
/** the inset from a shiny surface's edge (world px): no shine within the first, whole past the second */
export const SHINE_INSET = [14, 60] as const;
/** the zoom the shine fades out over (CSS zoom): whole from the second down, gone by the first (the district chunks, iso.ts MID_BELOW 10%,
 *  have no mask: the fade keeps that switch from showing) */
export const SHINE_ZOOM = [0.105, 0.14] as const;

/** the surfaces' shine groups, most shine first (the issue's rule: greens and fairways most; then the fringe, first cut and tee; then the
 *  town lawns, the map's grass and the range's outfield; rough, long grass and fescue least, but never none) */
export type ShineGroup = 'green' | 'fairway' | 'fringe' | 'firstCut' | 'tee' | 'lawn' | 'map' | 'outfield' | 'rough' | 'longGrass' | 'fescue';
export const SHINE_GROUPS: readonly { key: ShineGroup; label: string }[] = [
  { key: 'green', label: 'Greens' }, { key: 'fairway', label: 'Fairways' }, { key: 'fringe', label: 'Fringe' }, { key: 'firstCut', label: 'First cut' },
  { key: 'tee', label: 'Tees' }, { key: 'lawn', label: 'Town lawns' }, { key: 'map', label: 'Map grass' }, { key: 'outfield', label: 'Range outfield' },
  { key: 'rough', label: 'Rough' }, { key: 'longGrass', label: 'Long grass' }, { key: 'fescue', label: 'Fescue' },
];
export type ShineWeights = Record<ShineGroup, number>;
export const SHINE_WEIGHTS: Readonly<ShineWeights> = {
  green: 1, fairway: 0.9, fringe: 0.7, firstCut: 0.65, tee: 0.7, lawn: 0.5, map: 0.4, outfield: 0.5, rough: 0.3, longGrass: 0.22, fescue: 0.2,
};
/** each texture's group by its name (a painted surface's key, a preset's or a picture's name without its prefix; renderer.ts lays the map's
 *  own grass, the terrain's ground, meadow and woodland floor, as 'map') */
const NAME_GROUP: Readonly<Record<string, ShineGroup>> = {
  green: 'green', 'golf-green': 'green', 'range-green': 'green', 'putting-green': 'green',
  fairway: 'fairway', fringe: 'fringe', firstCut: 'firstCut', 'first-cut': 'firstCut',
  tee: 'tee', golfTee: 'tee', 'range-tee-turf': 'tee', sod: 'tee',
  lawn: 'lawn', lawns: 'lawn', lawnBuilt: 'lawn', lawnUpgraded: 'lawn', 'range-home-yard': 'lawn',
  map: 'map', grass: 'map', base: 'map', meadow: 'map', dry: 'map', worn: 'map', woodland: 'map', outside: 'map',
  'range-outfield': 'outfield',
  rough: 'rough', lawnDeclined: 'rough', patchy: 'rough', longGrass: 'longGrass', 'long-grass': 'longGrass', fescue: 'fescue',
};
/** the group a texture's name belongs to, or null */
export function shineGroup(tex: string): ShineGroup | null {
  const n = tex.replace(/^(preset|pic):/, '');
  return NAME_GROUP[n] ?? (/^lawn:\d+$/.test(n) ? 'lawn' : null);
}
/** a surface's shine weight by its texture's name and its painted family's kind (kind: 'grass', 'sand', 'water', 'cut', or null when it
 *  wears no painted family): ground that is not grass takes none (a town lawn wearing the desert, a path), a grass of no known name the town
 *  lawns' weight */
export function shineWeight(tex: string, kind: string | null | undefined, w: Readonly<ShineWeights> = SHINE_WEIGHTS): number {
  if (kind && kind !== 'grass') return 0;
  const g = shineGroup(tex);
  return g ? w[g] : kind === 'grass' ? w.lawn : 0;
}

/** the look's knobs (the gear menu's Night panel beside T215's: window.__game.setShine; remembered): on, strength, size (the gloss's size:
 *  larger, a broader and softer sheen; the highlight's exponent is SHINE_GLOSS / size²), the weights per group, and the fine knobs bump (the
 *  normals' tilt per unit of slope), eye (the eye's distance over half the screen's longer side, along the sun's mirror from the screen's
 *  centre: nearer, the glint slides faster as the camera pans) and night (the share lost after dusk) */
export interface ShineLook { on: boolean; strength: number; size: number; weights: ShineWeights; bump: number; eye: number; night: number }
/** the highlight's exponent at size 1 */
export const SHINE_GLOSS = 24;
export const SHINE_LOOK: Readonly<ShineLook> = { on: true, strength: 0.8, size: 1, weights: { ...SHINE_WEIGHTS }, bump: 0.6, eye: 1.5, night: 0.9 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
export function clampShineLook(s: Partial<ShineLook> | null | undefined): ShineLook {
  const D = SHINE_LOOK, w = (s?.weights ?? {}) as Partial<Record<string, unknown>>;
  const weights = Object.fromEntries(SHINE_GROUPS.map(({ key }) => [key, num(w[key], D.weights[key], 0, 2)])) as ShineWeights;
  return { on: typeof s?.on === 'boolean' ? s.on : D.on, strength: num(s?.strength, D.strength, 0, 4), size: num(s?.size, D.size, 0.25, 4), weights, bump: num(s?.bump, D.bump, 0, 20), eye: num(s?.eye, D.eye, 0.2, 5), night: num(s?.night, D.night, 0, 1) };
}
/** the highlight's exponent of a look */
export const shineExponent = (s: Pick<ShineLook, 'size'>) => SHINE_GLOSS / (s.size * s.size);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** the shine's strength at the night light's amount (0 day .. 1 night) and the CSS zoom: whole by day at the near zooms, night of it gone
 *  after dusk, faded out toward the district zoom (SHINE_ZOOM); 0 when off */
export const shineGain = (s: ShineLook, night: number, zoom = 1) => (s.on ? s.strength * (1 - s.night * clamp(night, 0, 1)) * smooth(SHINE_ZOOM[0], SHINE_ZOOM[1], zoom) : 0);

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
/** the chunk colour's luminance high-pass spread (a radius-1.5 Laplacian on the baked chunk, measured on the fairway, green and lawn at 30%),
 *  so its heights come out in standard deviations */
export const LUM_HP_STD = 0.022;
/** where a shadow takes the shine out: the shadow layer's coverage (a sprite's shadow, the ground's baked shade) from none to all of it */
export const SHINE_SHADE = [0.04, 0.35] as const;

/** one weight-mask texel's inset factor at distance d (world px) inside its surface's edge */
export const insetAt = (d: number) => smooth(SHINE_INSET[0], SHINE_INSET[1], d);
/** the margin (texels) the worker draws the mask with past each side of its chunk, so an edge just over a seam insets both chunks alike */
export const maskPad = (texelWorld: number) => Math.ceil(SHINE_INSET[1] / texelWorld) + 1;
/** the mask colour a surface of weight wgt (0..2, the weights' range) is drawn in: red 128 + 63 x the weight (128: a shiny surface of weight
 *  0, which takes none but is not an edge between two shiny ones), 0 for ground that is no grass (it is an edge) */
export const maskColour = (wgt: number | null) => (wgt === null ? '#000' : `rgb(${Math.round(128 + 63.5 * clamp(wgt, 0, 2))},0,0)`);
/** a drawn mask texel's weight (0..2) back from its red (maskColour) */
export const maskWeight = (r: number) => (r >= 128 ? (r - 128) / 63.5 : 0);
/** the weight mask's pixels (the worker's): src is the mask canvas's RGBA as drawn (maskColour, antialiased at the edges), W x H texels of
 *  texelWorld world px with pad texels of margin all round; out: the inner (W - 2 pad) x (H - 2 pad) texels' weight (0..2 as 0..255) times
 *  the inset (the distance inside the grass, a two-pass chamfer; past the margin counts as more of the same) */
export function shineMaskPixels(src: Uint8ClampedArray, W: number, H: number, texelWorld: number, pad = 0): Uint8Array {
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
  const iw = W - 2 * pad, ih = H - 2 * pad, out = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const i = (y + pad) * W + x + pad, dd = dist[i]!;
    if (!dd || src[4 * i + 3]! === 0) continue;
    out[y * iw + x] = Math.round(127.5 * maskWeight(src[4 * i]!) * (dd >= INF ? 1 : insetAt((dd - 0.5) * texelWorld)));
  }
  return out;
}
/** the weight a mask texel (0..255) holds (gl.ts reads it as 0..1: times 2) */
export const MASK_SCALE = 2;

const g = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));
/** GLSL (gl.ts FS_QUAD): grassShine(c, z, slope, w, k): the shine on colour c (0..1) of height z (standard deviations) and slope (z per world
 *  px), at weight w (its surface's, inset, and out of the shadows) times falloff-and-gain k; uShineLook: exponent, bump, eye, 0 */
export const GRASS_SHINE_GLSL = `vec3 grassShine(vec3 c, float z, vec2 slope, float w, float k) {
  // the eye: uShineLook.z (over half the screen's longer side) from the screen's centre along the sun's mirror, so the flat ground's glint
  // lies at the centre and every point off it sees the sun's reflection tilted: as the camera moves, other blades turn to it
  vec2 p = vec2(gl_FragCoord.x, uScreen.y - gl_FragCoord.y), d = (p - 0.5 * uScreen) / (0.5 * max(uScreen.x, uScreen.y));
  vec3 L = vec3(${g(SUN_SCREEN[0])}, ${g(SUN_SCREEN[1])}, ${g(SUN_SCREEN[2])});
  vec3 V = normalize(vec3(-L.xy * uShineLook.z - d, L.z * uShineLook.z));
  vec3 N = normalize(vec3(-slope * uShineLook.y, 1.0));
  vec3 H = normalize(L + V);
  float s = pow(max(dot(N, H), 0.0), uShineLook.x);
  // the blade tops (above the local mean) most; grass-coloured pixels only, green to golden (a grey path, a blue pond, a red leaf or the
  // sand of a bunker laid over the grass takes little or none)
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float tip = mix(0.3, 1.0, smoothstep(-1.0, 1.2, z));
  float key = smoothstep(0.42, 0.55, c.g / max(c.r, 0.001)) * (1.0 - smoothstep(0.72, 0.86, c.b / max(c.g, 0.001))) * smoothstep(0.16, 0.3, (mx - mn) / max(mx, 0.001));
  // T110's textured light (its own colour squared), half of it whitened: a sheen is the sun's colour more than the grass's
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return c + (w * k * s * tip * key * ${g(SHINE_AMOUNT)}) * mix(c * c, vec3(1.3 * l * l), ${g(SHINE_WHITE)}) * vec3(${SHINE_TINT.map(g).join(', ')});
}`;
