/** T199 (#517): the map's small streams become swamp, and the swamp's pools catch the camera's sky glint (the owner, 2026-10-27: "we can
 *  replace the small streams with" a swamp; "for that swamp you will need to do that thing with the specular we wanted to test").
 *
 *  - **The band.** Every waterway below the river class (a creek, swampStreams) is drawn as a swamp band: the stream's own water stays narrow
 *    (renderer.ts, as before: SWAMP.water of its channel's width), a thin muddy lip round it, and its banks widen into the swamp texture (the
 *    painted surface 'swamp', painted-surfaces.ts: the tile set swamp-run). The band reaches SWAMP.reach tiles past the channel's edge on average,
 *    swaying slowly along the stream (a wide marsh in places, a narrow fringe in others) and broken by a ragged world-space noise, so its edge is
 *    soft and rugged (T204's rule: no straight line, the fescue never showing through: whole inside, soft only at its rim). The band is a pure
 *    function of the world (SwampField), so chunks, levels and re-bakes agree, and an edit elsewhere never moves it. Rivers and lakes keep their
 *    look.
 *  - **The glint.** The swamp tiles' pools (their dark teal water, picked by colour: swampKey) give a gloss mask, made once per tile (glossTile:
 *    the pools inset from their edges, with each pool's local mean colour). The ground worker lays the gloss tiles where it laid the swamp's
 *    picture, cut to the band and off the stream's water, onto a small per-chunk mask (renderer.ts takeGlossMask), and the GPU lights the pools
 *    by it times T215's camera falloff (gl.ts FS_QUAD, glossLight): a cool sky glint textured by the water itself (its own ripples take the
 *    most, its dark hollows little: never a flat shine), strongest at the screen's centre. The switch is T215's (window.__game.specCam, the gear
 *    menu's Night panel) and so are its knobs (inner, outer, strength); off, no mask is made and the ground is bit for bit as before.
 *
 *  Pure TypeScript, no DOM: the node tests run it, and gl.ts builds its shader from the same numbers. Units: tiles of 2 m. */
import { fbm, makeNoise } from './terrain/noise';
import type { WaterPoint } from './terrain/types';
import type { SpecLook } from './lamp-reflect';

/** the band's numbers (tiles):
 *  - reach: how far past the channel's edge (half its width) the swamp reaches on average (the soft union, below, adds about a tile and a
 *    half); sway: how much that varies along the stream, over a slow noise of swayWave; rag: the edge's raggedness, at most (a fractal noise of
 *    ragWave and three finer octaves); feather: the soft rim's half width; core: the band always covers its channel and this much past it (so
 *    no fescue ever shows between the stream and its swamp, whatever the noise);
 *  - soft: the soft union's radius: the band's edge is the level set of a smooth minimum of the distances to the stream's segments, so the
 *    inside of a bend is rounded (a plain minimum leaves a sharp corner there) and the joints draw no kink;
 *  - water: the stream's own water, this share of its channel's width (renderer.ts's creek water, unchanged), with its soft edge waterFeather;
 *  - lip: the muddy lip round the water (the river banks' and creek beds' painted surface 'bank'), this far past the water's edge, its soft
 *    edge lipFeather */
export const SWAMP = {
  reach: 3.2, sway: 1.6, swayWave: 17, rag: 2.2, ragWave: 5, feather: 0.35, core: 0.6, soft: 1.5,
  water: 0.35, waterFeather: 0.25, lip: 0.35, lipFeather: 0.3,
} as const;
/** the farthest the band can reach past its channel's edge (tiles, on the soft distance): past it, nothing is swamp */
export const SWAMP_OUT = SWAMP.reach + SWAMP.sway + SWAMP.rag + SWAMP.feather;
/** how far past the nearest segment another still counts for the soft distance (its share past it is under e^-4); a segment's box is grown
 *  by twice it, so every chunk and every point query sums the same segments wherever the band can be */
const SOFT_REACH = 4 * SWAMP.soft;

/** the waterways drawn as swamp: the small streams (creeks), never the river */
export const swampStreams = <T extends { kind: string }>(waters: readonly T[]): T[] => waters.filter(w => w.kind === 'creek');

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const NOISE = makeNoise(0x5a17);
/** the band's reach past the channel's edge at tile (x, y): its slow sway along the stream */
export const reachAt = (x: number, y: number) => SWAMP.reach + SWAMP.sway * clamp(NOISE(x / SWAMP.swayWave + 0.37, y / SWAMP.swayWave + 0.71), -1, 1);
/** the edge's raggedness at tile (x, y) (tiles, within +-rag) */
export const ragAt = (x: number, y: number) => SWAMP.rag * clamp(2 * fbm(NOISE, x / SWAMP.ragWave + 13.1, y / SWAMP.ragWave - 7.9, 4), -1, 1);
/** the band's cover (0..1) at tile (x, y), e tiles past the channel's edge on the soft distance (negative inside the channel): its ragged rim,
 *  and whole over its core */
export function bandAt(e: number, x: number, y: number): number {
  const core = 1 - smooth(SWAMP.core - SWAMP.feather, SWAMP.core + SWAMP.feather, e);
  if (e >= SWAMP_OUT) return core;
  const R = reachAt(x, y);
  return Math.max(core, 1 - smooth(R - SWAMP.feather, R + SWAMP.feather, e + ragAt(x, y)));
}

/** segment records: ax ay bx by (tiles), the half widths at a and b, then the box (grown by the widest half width, SWAMP_OUT and twice the
 *  soft union's reach) */
const SEG = 10;
/** the bucket size (tiles) of the segment index */
const CELL = 32;

/** the swamp band of a map's streams: its segments indexed by where they reach, so a chunk (alpha) or a point (cover) looks at only the few
 *  near it. Built once per terrain (renderer.ts setTerrain) */
export class SwampField {
  private segs: Float64Array;
  private cells = new Map<number, number[]>();
  constructor(streams: readonly { pts: readonly WaterPoint[] }[]) {
    const out: number[] = [];
    for (const s of streams) {
      const p = s.pts;
      for (let k = 0; k + 1 < p.length; k++) {
        const a = p[k]!, b = p[k + 1]!, g = Math.max(a.w, b.w) / 2 + SWAMP_OUT + 2 * SOFT_REACH;
        out.push(a.x, a.y, b.x, b.y, a.w / 2, b.w / 2, Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g);
      }
      if (p.length === 1) { const a = p[0]!, g = a.w / 2 + SWAMP_OUT + 2 * SOFT_REACH; out.push(a.x, a.y, a.x, a.y, a.w / 2, a.w / 2, a.x - g, a.y - g, a.x + g, a.y + g); }
    }
    this.segs = Float64Array.from(out);
    for (let i = 0; i < this.segs.length; i += SEG) {
      const s = this.segs;
      for (let cy = Math.floor(s[i + 7]! / CELL); cy <= Math.floor(s[i + 9]! / CELL); cy++) for (let cx = Math.floor(s[i + 6]! / CELL); cx <= Math.floor(s[i + 8]! / CELL); cx++) {
        const key = (cy + 64) * 4096 + cx + 64, l = this.cells.get(key); if (l) l.push(i); else this.cells.set(key, [i]);
      }
    }
  }
  /** no stream at all */
  get empty() { return this.segs.length === 0; }
  /** the segments (offsets) whose reach touches the tile box */
  near(x0: number, y0: number, x1: number, y1: number): number[] {
    const seen = new Set<number>(), s = this.segs;
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (const i of this.cells.get((cy + 64) * 4096 + cx + 64) ?? []) if (s[i + 6]! <= x1 && s[i + 8]! >= x0 && s[i + 7]! <= y1 && s[i + 9]! >= y0) seen.add(i);
    }
    return [...seen];
  }
  /** how far tile (x, y) lies past the channels' edge (tiles; negative inside one), at most SWAMP_OUT: the soft union of the segments' distances
   *  (the nearest's, less soft x ln of the sum of exp(-(d - nearest) / soft) over the segments within SOFT_REACH of it: at most the nearest's
   *  distance, about a tile and a half less along a stream). d: a scratch for the distances (as long as the list) */
  edge(list: readonly number[], x: number, y: number, d: Float64Array = new Float64Array(list.length)): number {
    const s = this.segs; let m = Infinity, n = 0;
    for (const i of list) {
      if (x < s[i + 6]! || x > s[i + 8]! || y < s[i + 7]! || y > s[i + 9]!) continue;
      const ax = s[i]!, ay = s[i + 1]!, dx = s[i + 2]! - ax, dy = s[i + 3]! - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const v = Math.hypot(ax + dx * t - x, ay + dy * t - y) - (s[i + 4]! + (s[i + 5]! - s[i + 4]!) * t);
      d[n++] = v; if (v < m) m = v;
    }
    if (!(m < SWAMP_OUT + SOFT_REACH)) return SWAMP_OUT;
    let sum = 0; for (let k = 0; k < n; k++) { const v = d[k]! - m; if (v < SOFT_REACH) sum += Math.exp(-v / SWAMP.soft); }
    return Math.min(SWAMP_OUT, m - SWAMP.soft * Math.log(sum));
  }
  /** the band's cover (0..1) at tile (x, y) */
  cover(x: number, y: number): number {
    if (this.empty) return 0;
    return bandAt(this.edge(this.near(x, y, x, y), x, y), x, y);
  }
  /** the band's cover over tiles [x0, x0 + w) x [y0, y0 + h) at res samples a tile (RGB 0, alpha the cover; sample (u, v) at the tile point
   *  (x0 + (u + 0.5) / res, y0 + (v + 0.5) / res), as terrain-paint.ts classAlpha), with the tile box it covers; null when none */
  alpha(x0: number, y0: number, w: number, h: number, res: number): { data: Uint8ClampedArray; W: number; H: number; box: [number, number, number, number] } | null {
    if (this.empty) return null;
    const list = this.near(x0, y0, x0 + w, y0 + h); if (!list.length) return null;
    const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), data = new Uint8ClampedArray(W * H * 4), d = new Float64Array(list.length);
    let u0 = W, v0 = H, u1 = -1, v1 = -1;
    for (let v = 0; v < H; v++) {
      const y = y0 + (v + 0.5) / res;
      for (let u = 0; u < W; u++) {
        const x = x0 + (u + 0.5) / res, e = this.edge(list, x, y, d); if (e >= SWAMP_OUT) continue;
        const a = Math.round(bandAt(e, x, y) * 255); if (a <= 0) continue;
        data[(v * W + u) * 4 + 3] = a;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    }
    if (u1 < 0) return null;
    return { data, W, H, box: [x0 + u0 / res - 1, y0 + v0 / res - 1, x0 + (u1 + 1) / res + 1, y0 + (v1 + 1) / res + 1] };
  }
}

// ---- the glint

/** the swamp's pools by their colour (0..255): the dark teal water has blue well over red and green far over red; the grass (yellow-green), the
 *  mud (brown), the asphalt (blue-grey: blue over red, green not), leaves and lines have not. 0..1 */
export const KEY = { br: [6, 18], gr: [14, 26] } as const;
export const swampKey = (r: number, g: number, b: number) => smooth(KEY.br[0], KEY.br[1], b - r) * smooth(KEY.gr[0], KEY.gr[1], g - r);

/** the glint's numbers:
 *  - tileScale: a tile's gloss is made at this share of its native size (the near set as it lies on screen at the closest zoom);
 *  - inset: px at that scale: the glint starts this far inside a pool's edge and is whole past the second (the textured-highlights rule: a
 *    small gap inside the edge, about 0.15 m at 30%, then a soft rise, so a pool's sheen is brightest in its open middle);
 *  - meanRadius: px: each pool's local mean colour, over its own water within this box radius (the GPU takes the water's texture as each
 *    pixel's distance from it);
 *  - maskK: the chunk's gloss mask is a maskK-th of its size each way (the pools are small: finer than the lamps' quarter);
 *  - amount: how far toward the sky the pools go at the whole gain, on their lit ripples; spread: luma: the water's texture, its distance from
 *    the local mean, in units of this; floor: the share of it the water's darkest hollows keep; max: the most a pixel goes toward the sky;
 *  - sky: the cool sky colour the pools reflect (0..255);
 *  - night: the share of the glint gone after dusk (no sky to reflect) */
export const GLOSS = {
  tileScale: 0.5, inset: [1.5, 9], meanRadius: 14, maskK: 2,
  amount: 0.55, spread: 12, floor: 0.2, max: 0.5, sky: [180, 212, 226], night: 0.8,
} as const;

/** a swamp tile's gloss (src: its RGBA, w x h px, at GLOSS.tileScale of native): RGBA, alpha the gloss (its pools by colour, inset from their
 *  edges: swampKey x smoothstep of the distance inside the pool), colour each pool's local mean colour (its water only). Beyond the tile's
 *  border counts as more of the same water (a neighbouring tile goes on there), so the tiles' seams draw no line */
export function glossTile(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const n = w * h, key = new Float32Array(n), dist = new Float32Array(n), INF = 1e9;
  for (let i = 0; i < n; i++) { const k = swampKey(src[4 * i]!, src[4 * i + 1]!, src[4 * i + 2]!); key[i] = k; dist[i] = k >= 0.5 ? INF : 0; }
  // the distance inside a pool to its nearest edge (px): a two-pass chamfer (1, 1.4), what lies past the border not an edge
  const D = 1, D2 = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let d = dist[i]!; if (d === 0) continue;
    if (x > 0) d = Math.min(d, dist[i - 1]! + D);
    if (y > 0) { d = Math.min(d, dist[i - w]! + D); if (x > 0) d = Math.min(d, dist[i - w - 1]! + D2); if (x < w - 1) d = Math.min(d, dist[i - w + 1]! + D2); }
    dist[i] = d;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let d = dist[i]!; if (d === 0) continue;
    if (x < w - 1) d = Math.min(d, dist[i + 1]! + D);
    if (y < h - 1) { d = Math.min(d, dist[i + w]! + D); if (x < w - 1) d = Math.min(d, dist[i + w + 1]! + D2); if (x > 0) d = Math.min(d, dist[i + w - 1]! + D2); }
    dist[i] = d;
  }
  // each pool's local mean colour: a box mean of its water's colour (summed-area tables, the box clamped at the border)
  const W1 = w + 1, sat = new Float64Array(W1 * (h + 1) * 4);
  for (let y = 0; y < h; y++) {
    const r = [0, 0, 0, 0];
    for (let x = 0; x < w; x++) {
      const i = y * w + x, wt = key[i]! >= 0.5 ? 1 : 0;
      r[0] += src[4 * i]! * wt; r[1] += src[4 * i + 1]! * wt; r[2] += src[4 * i + 2]! * wt; r[3] += wt;
      const o = ((y + 1) * W1 + x + 1) * 4, up = (y * W1 + x + 1) * 4;
      for (let c = 0; c < 4; c++) sat[o + c] = sat[up + c]! + r[c]!;
    }
  }
  const out = new Uint8ClampedArray(n * 4), R = GLOSS.meanRadius;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, g = key[i]! * smooth(GLOSS.inset[0], GLOSS.inset[1], dist[i]!);
    const a = Math.round(g * 255); if (a <= 0) continue;
    const xa = Math.max(0, x - R), xb = Math.min(w, x + R + 1), ya = Math.max(0, y - R), yb = Math.min(h, y + R + 1);
    const s = (c: number) => sat[(yb * W1 + xb) * 4 + c]! - sat[(ya * W1 + xb) * 4 + c]! - sat[(yb * W1 + xa) * 4 + c]! + sat[(ya * W1 + xa) * 4 + c]!;
    const cnt = Math.max(1, s(3));
    out[4 * i] = Math.round(s(0) / cnt); out[4 * i + 1] = Math.round(s(1) / cnt); out[4 * i + 2] = Math.round(s(2) / cnt); out[4 * i + 3] = a;
  }
  return out;
}

const LUMA = [0.299, 0.587, 0.114] as const;
/** the GPU's glint (gl.ts glossLight; its twin): the ground's pixel c (0..255) where the gloss mask holds the pool's local mean m (0..255) and
 *  the gloss g, at the camera falloff times the gain k: toward the cool sky by g x k x the pixel's own water key x GLOSS.amount x its texture
 *  (its distance from the mean: the lit ripples whole, the dark hollows GLOSS.floor of it), at most GLOSS.max */
export function glossPixel(c: readonly number[], m: readonly number[], g: number, k: number): number[] {
  const a = g * swampKey(c[0]!, c[1]!, c[2]!) * k;
  if (!(a > 0)) return [...c];
  const z = ((c[0]! - m[0]!) * LUMA[0] + (c[1]! - m[1]!) * LUMA[1] + (c[2]! - m[2]!) * LUMA[2]) / GLOSS.spread;
  const s = Math.min(a * GLOSS.amount * (GLOSS.floor + (1 - GLOSS.floor) * smooth(-1, 1, z)), GLOSS.max);
  return c.map((v, i) => v + (GLOSS.sky[i]! - v) * s);
}
/** the glint's gain at the night light's amount (0 day .. 1 night): T215's strength by day, GLOSS.night of it gone after dusk */
export const glossGain = (s: Pick<SpecLook, 'strength'>, night: number) => s.strength * (1 - GLOSS.night * clamp(night, 0, 1));

const glslNum = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
/** GLSL (gl.ts FS_QUAD): glossLight(c, m, k), glossPixel on the GPU, from the same numbers */
export const GLOSS_LIGHT_GLSL = `float swampKey(vec3 c) {
  return smoothstep(${glslNum(KEY.br[0])}, ${glslNum(KEY.br[1])}, c.b - c.r) * smoothstep(${glslNum(KEY.gr[0])}, ${glslNum(KEY.gr[1])}, c.g - c.r);
}
vec3 glossLight(vec3 c, vec4 m, float k) {
  float a = m.a * swampKey(c) * k;
  if (a <= 0.0) return c;
  float z = dot(c - m.rgb, vec3(${LUMA.map(glslNum).join(', ')})) / ${glslNum(GLOSS.spread)};
  float s = min(a * ${glslNum(GLOSS.amount)} * mix(${glslNum(GLOSS.floor)}, 1.0, smoothstep(-1.0, 1.0, z)), ${glslNum(GLOSS.max)});
  return c + (vec3(${GLOSS.sky.map(glslNum).join(', ')}) - c) * s;
}`;
