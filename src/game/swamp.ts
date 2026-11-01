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
 *  - **The river's band (T265, #794).** The river gets a band too (RIVER_SWAMP, riverStreams: a second SwampField with RIVER_BAND's look): it
 *    starts under the river's bank and lies outside it, as a creek's lies outside its lip; its width past the bank scales with the river's own
 *    (k x its half width, at most cap: wider than a creek's), and it comes in stretches and bays (a slow noise has it go and come back along the
 *    river, a second swings its width), so it never reads as an even ribbon. The river keeps its water, bank, depth and reflections (renderer.ts
 *    lays the band before them); the renderer cuts the band short of the roads, bridges, lots, painted areas and the course (riverCut). Its own
 *    dev switch: window.__game.ground.setRiverSwamp(false), the river as before.
 *
 *  Pure TypeScript, no DOM: the node tests run it, and gl.ts builds its shader from the same numbers. Units: tiles of 2 m. */
import { fbm, makeNoise } from './terrain/noise';
import type { WaterPoint } from './terrain/types';
import type { SpecLook } from './lamp-reflect';

/** the band's numbers (tiles):
 *  - reach: how far past the channel's edge (half its width) the swamp reaches on average (the soft union, below, adds about a tile and a
 *    half); sway: how much that varies along the stream, over a slow noise of swayWave; rag: the edge's raggedness, at most (a fractal noise of
 *    ragWave and two finer octaves, on a half-tile lattice); feather: the soft rim's half width; core: the band always covers its channel and this much past it (so
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
/** how far past the nearest segment another still counts for the soft distance (its share past it is under e^-3, left out alike everywhere) */
const SOFT_REACH = 3 * SWAMP.soft;
/** past this nearest distance the soft distance is SWAMP_OUT (the soft sum takes at most soft x ln 4 off it: four segments within reach); a
 *  segment's box is grown by it and SOFT_REACH, so every chunk and every point query sums the same segments wherever the band can be */
const SOFT_OUT = SWAMP_OUT + SWAMP.soft * Math.log(4);

/** the waterways drawn as swamp: the small streams (creeks), never the river (T265: the river's band is its own field, riverStreams) */
export const swampStreams = <T extends { kind: string }>(waters: readonly T[]): T[] => waters.filter(w => w.kind === 'creek');
/** T265: the river (or rivers), for the river's band (RIVER_BAND) */
export const riverStreams = <T extends { kind: string }>(waters: readonly T[]): T[] => waters.filter(w => w.kind === 'river');

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const NOISE = makeNoise(0x5a17);
/** the band's reach past the channel's edge at tile (x, y): its slow sway along the stream */
export const reachAt = (x: number, y: number) => SWAMP.reach + SWAMP.sway * clamp(NOISE(x / SWAMP.swayWave + 0.37, y / SWAMP.swayWave + 0.71), -1, 1);
/** the edge's raggedness at tile (x, y) (tiles, within +-rag) */
export const ragAt = (x: number, y: number) => SWAMP.rag * clamp(2 * fbm(NOISE, x / SWAMP.ragWave + 13.1, y / SWAMP.ragWave - 7.9, 3), -1, 1);
/** the band's cover (0..1), e tiles past the channel's edge on the soft distance (negative inside the channel), where its reach is R and its
 *  rim's rag g: its ragged rim, and whole over its core */
export function bandOf(e: number, R: number, g: number): number {
  const core = 1 - smooth(SWAMP.core - SWAMP.feather, SWAMP.core + SWAMP.feather, e);
  if (e >= SWAMP_OUT) return core;
  return Math.max(core, 1 - smooth(R - SWAMP.feather, R + SWAMP.feather, e + g));
}
/** the rag's lattice step (tiles): the soft distance and the reach are sampled every tile, the rag (its finest octave about 0.6 tiles) every
 *  half tile; between, bilinear. World-anchored, so every chunk and every point query reads the same values */
const RAG_STEP = 0.5;

/** T265: a band's look, the numbers and functions a SwampField draws it by: the creeks' (CREEK_BAND, T199's SWAMP) or the river's (RIVER_BAND).
 *  out: the farthest the band reaches past its channel's edge on the soft distance (past it, nothing); soft, softReach, softOut: the soft
 *  union's radius, how far past the nearest segment another still counts, and the nearest distance past which the soft distance is out;
 *  ragStep: the rag's lattice step; reach(x, y, hw): the band's reach at (x, y) where the nearest channel's half width is hw; rag(x, y): its
 *  rim's rag; band(e, R, g): its cover; wide: the reach reads hw (the lattice keeps the nearest channel's half width) */
export interface BandLook {
  /** latStep, farStep: the soft distance's and the reach's lattice step at a street chunk and at a district chunk (tiles); farRag: the rag's
   *  at a district chunk; ragFrom: the reach at or under which the band ignores the rag (its noise not made there) */
  out: number; soft: number; softReach: number; softOut: number; ragStep: number; latStep: number; farStep: number; farRag: number; ragFrom: number; wide: boolean;
  /** a wide band's bounds, for skipping whole lattice cells: none under lo (the water), none past the reach plus rim plus rag0 */
  lo: number; rim: number; rag0: number;
  reach(x: number, y: number, hw: number): number; rag(x: number, y: number): number; band(e: number, R: number, g: number): number;
}
/** the creeks' band (T199): SWAMP's numbers, as before */
export const CREEK_BAND: BandLook = { out: SWAMP_OUT, soft: SWAMP.soft, softReach: SOFT_REACH, softOut: SOFT_OUT, ragStep: RAG_STEP, latStep: 1, farStep: 2, farRag: 2 * RAG_STEP, ragFrom: -Infinity, wide: false, lo: -Infinity, rim: SWAMP.feather, rag0: SWAMP.rag, reach: (x, y) => reachAt(x, y), rag: ragAt, band: bandOf };

/** T265 (#794): the river's band (tiles):
 *  - bank: the river's bank (renderer.ts: 3 tiles past its water, feathered 0.8); the band rises under it, from inner[0] to inner[1] past the
 *    water's edge on the soft distance (about a tile more on the plain one), so it never lies on the water and no grass shows between the bank
 *    and the swamp;
 *  - k, cap: the band's width past the bank, k x the river's half width, at most cap (a river of 40-80 m: 4.5-7 tiles, 9-14 m; a creek's 3.2
 *    past its channel): wider than a creek's, capped;
 *  - stretch, stretchWave: the swamp comes in stretches: a slow world noise (about stretchWave tiles a swing) under stretch[0] none (the river's
 *    bank and grass as before), over stretch[1] the whole width, between a fringe; the two banks lie far enough apart to differ;
 *  - bay, bayWave: bays: the width swings by +-bay tiles over a noise of bayWave;
 *  - rag, ragWave, feather, soft, ragStep: the rim's raggedness, its soft rim, the soft union's radius and the rag's lattice step (as SWAMP's;
 *    the rag a tile apart, three on a district chunk: the band is wider); latStep, farStep: the soft distance and the reach two tiles apart,
 *    eight on a district chunk (its bank a pixel or two: the band starts under it whatever the lattice) (a wide river's distance runs straight
 *    across a lattice cell: bilinear is as good, at a quarter of the work) */
export const RIVER_SWAMP = {
  floor: 0.5, border: 2.5, fescue: 3, bank: 3, inner: [-0.8, -0.4], k: 0.45, cap: 7, stretch: [-0.05, 0.25], stretchWave: 70, bay: 2.5, bayWave: 21,
  rag: 2.4, ragWave: 6, feather: 0.4, soft: 1, ragStep: 1, latStep: 2, farStep: 8, farRag: 3,
} as const;
/** the farthest the river's band reaches past the water's edge (tiles, on the soft distance) */
export const RIVER_SWAMP_OUT = RIVER_SWAMP.bank + RIVER_SWAMP.cap + RIVER_SWAMP.bay + RIVER_SWAMP.rag + RIVER_SWAMP.feather;
const RNOISE = makeNoise(0x71e5);
/** the river's swamp at tile (x, y): 0 (none: a stretch without) .. 1 (the whole width) */
export const riverStretchAt = (x: number, y: number) => smooth(RIVER_SWAMP.stretch[0], RIVER_SWAMP.stretch[1], fbm(RNOISE, x / RIVER_SWAMP.stretchWave + 3.17, y / RIVER_SWAMP.stretchWave - 5.71, 2));
/** the river's band's reach past the water's edge at tile (x, y), the river's half width there hw: the bank and the width past it (k hw, at
 *  most cap, with its bays), all times the stretch (none: 0, the band then never shows past the water) */
export function riverReachAt(x: number, y: number, hw: number): number {
  // (the owner, 2026-11-01: "the same swamp around the big river": never a stretch without, at least floor of the width)
  const s = Math.max(RIVER_SWAMP.floor, riverStretchAt(x, y));
  const w = Math.min(RIVER_SWAMP.cap, RIVER_SWAMP.k * hw) + RIVER_SWAMP.bay * clamp(RNOISE(x / RIVER_SWAMP.bayWave + 0.53, y / RIVER_SWAMP.bayWave + 1.93), -1, 1);
  return s * (RIVER_SWAMP.bank + Math.max(0, w));
}
/** the river's band's rim rag at tile (x, y) (tiles, within +-rag) */
export const riverRagAt = (x: number, y: number) => RIVER_SWAMP.rag * clamp(2 * fbm(RNOISE, x / RIVER_SWAMP.ragWave - 9.3, y / RIVER_SWAMP.ragWave + 4.1, 3), -1, 1);
/** the river's band's cover (0..1), e tiles past the water's edge on the soft distance, where its reach is R and its rim's rag g: risen under
 *  the bank (inner), its rim ragged once the band is wider than the bank (where it is a thin fringe, a soft one) */
export function riverBandOf(e: number, R: number, g: number): number {
  const inner = smooth(RIVER_SWAMP.inner[0], RIVER_SWAMP.inner[1], e); if (!(inner > 0) || !(R > 0)) return 0;
  const gg = g * clamp((R - RIVER_SWAMP.bank) / 2, 0, 1);
  return inner * (1 - smooth(R - RIVER_SWAMP.feather, R + RIVER_SWAMP.feather, e + gg));
}
/** the river's band's look: its soft union over as many as eight segments within reach (a wide river: its 8-tile segments all near) */
export const RIVER_BAND: BandLook = {
  out: RIVER_SWAMP_OUT, soft: RIVER_SWAMP.soft, softReach: 3 * RIVER_SWAMP.soft, softOut: RIVER_SWAMP_OUT + RIVER_SWAMP.soft * Math.log(8), ragStep: RIVER_SWAMP.ragStep, latStep: RIVER_SWAMP.latStep, farStep: RIVER_SWAMP.farStep, farRag: RIVER_SWAMP.farRag, ragFrom: RIVER_SWAMP.bank, wide: true,
  lo: RIVER_SWAMP.inner[0], rim: RIVER_SWAMP.feather, rag0: RIVER_SWAMP.rag,
  reach: riverReachAt, rag: riverRagAt, band: riverBandOf,
};
const bilerp = (a: number, b: number, c: number, d: number, tx: number, ty: number) => { const t = a + (b - a) * tx, u = c + (d - c) * tx; return t + (u - t) * ty; };
/** a lattice point's key in a cache */
const latKey = (i: number, j: number) => (i + 8192) * 32768 + j + 8192;
const CACHE_MAX = 1 << 18;
/** T265: the band alphas a field keeps (SwampField alpha: the last chunks', 40-60 KB each) */
const ALPHA_MEMO = 48;
/** a band's cover over a tile box (SwampField alpha) */
export interface BandAlpha { data: Uint8ClampedArray; W: number; H: number; box: [number, number, number, number] }
/** the river's dirt border (the owner, 2026-11-01: the swamp "in between the water and the dirt border"): band a grown r pixels each way (a
 *  square max, made solid where the band reaches at all), the ground the river's bank lays before the band goes over it */
export function growBand(a: BandAlpha, r: number): BandAlpha {
  const { W, H, data } = a, row = new Uint8ClampedArray(W * H), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let i = Math.max(0, x - r); i <= Math.min(W - 1, x + r); i++) { const v = data[(y * W + i) * 4 + 3]!; if (v > m) m = v; } row[y * W + x] = m; }
  // (solid wherever the band reaches at all: its faint rim carried out would leave the border as thin as the rim)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) { const v = row[j * W + x]!; if (v > m) m = v; } out[(y * W + x) * 4 + 3] = Math.min(255, m * 8); }
  return { data: out, W, H, box: a.box };
}
const NONE: readonly number[] = [];
/** T265: the lattice's scratch of each segment's distances (grown as needed, never shrunk) */
let LAT_D = new Float64Array(1 << 16);

/** segment records: ax ay bx by (tiles), the half widths at a and b, then the box (grown by the widest half width, SOFT_OUT and the soft
 *  union's reach) */
const SEG = 10;
/** the bucket size (tiles) of the segment index */
const CELL = 32;

/** the swamp band of a map's streams: its segments indexed by where they reach, so a chunk (alpha) or a point (cover) looks at only the few
 *  near it. Built once per terrain (renderer.ts setTerrain). look: the band's (T265: CREEK_BAND, T199's, or RIVER_BAND) */
export class SwampField {
  private segs: Float64Array;
  private cells = new Map<number, number[]>();
  /** the point queries' lattice values (soft distance and reach by tile, rag by half tile), kept as they are asked for (cleared past CACHE_MAX) */
  private latE = new Map<number, number>(); private latR = new Map<number, number>(); private latG = new Map<number, number>();
  constructor(streams: readonly { pts: readonly WaterPoint[] }[], readonly look: BandLook = CREEK_BAND) {
    const out: number[] = [], grow = look.softOut + look.softReach;
    for (const s of streams) {
      const p = s.pts;
      for (let k = 0; k + 1 < p.length; k++) {
        const a = p[k]!, b = p[k + 1]!, g = Math.max(a.w, b.w) / 2 + grow;
        out.push(a.x, a.y, b.x, b.y, a.w / 2, b.w / 2, Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g);
      }
      if (p.length === 1) { const a = p[0]!, g = a.w / 2 + grow; out.push(a.x, a.y, a.x, a.y, a.w / 2, a.w / 2, a.x - g, a.y - g, a.x + g, a.y + g); }
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
    return [...seen].sort((a, b) => a - b); // (one order everywhere: the soft sum adds up alike in every chunk and query)
  }
  /** how far tile (x, y) lies past the channels' edge (tiles; negative inside one), at most SWAMP_OUT: the soft union of the segments' distances
   *  (the nearest's, less soft x ln of the sum of exp(-(d - nearest) / soft) over the segments within SOFT_REACH of it: at most the nearest's
   *  distance, about a tile and a half less along a stream). list: segments near (any superset of those whose box holds the point gives the
   *  same value); d: a scratch for the distances (as long as the list) */
  edge(list: readonly number[], x: number, y: number, d: Float64Array = new Float64Array(list.length)): number {
    const s = this.segs, L = this.look; let m = Infinity, n = 0;
    for (const i of list) {
      if (x < s[i + 6]! || x > s[i + 8]! || y < s[i + 7]! || y > s[i + 9]!) continue;
      const v = this.segDist(i, x, y); d[n++] = v; if (v < m) m = v;
    }
    if (!(m < L.softOut)) return L.out;
    let sum = 0; for (let k = 0; k < n; k++) { const v = d[k]! - m; if (v < L.softReach) sum += Math.exp(-v / L.soft); }
    return this.softEdge(m, sum);
  }
  /** the soft distance from the nearest segment's m and the soft sum */
  private softEdge(m: number, sum: number) { return Math.min(this.look.out, m - this.look.soft * Math.log(sum)); }
  /** T265: the half width of the channel nearest (x, y) (its segment's, where it passes nearest; 0 with none near) */
  halfWidth(list: readonly number[], x: number, y: number): number {
    const s = this.segs; let m = Infinity, hw = 0;
    for (const i of list) {
      if (x < s[i + 6]! || x > s[i + 8]! || y < s[i + 7]! || y > s[i + 9]!) continue;
      const v = this.segDist(i, x, y); if (v < m) { m = v; hw = this.segHw(i, x, y); }
    }
    return hw;
  }
  /** segment i's half width where it passes nearest (x, y) */
  private segHw(i: number, x: number, y: number) {
    const s = this.segs, ax = s[i]!, ay = s[i + 1]!, dx = s[i + 2]! - ax, dy = s[i + 3]! - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
    return s[i + 4]! + (s[i + 5]! - s[i + 4]!) * t;
  }
  /** segment i's distance from (x, y) past its channel's edge (tiles) */
  private segDist(i: number, x: number, y: number) {
    const s = this.segs, ax = s[i]!, ay = s[i + 1]!, dx = s[i + 2]! - ax, dy = s[i + 3]! - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
    const ex = ax + dx * t - x, ey = ay + dy * t - y;
    return Math.sqrt(ex * ex + ey * ey) - (s[i + 4]! + (s[i + 5]! - s[i + 4]!) * t);
  }
  /** the soft distance (edge) on the lattice of step st tiles, points [i0, i0 + ni) x [j0, j0 + nj) (point (i, j) at tile (i st, j st)): each
   *  segment visits the points its box holds (no point tests every segment), first for the nearest distance, then for the soft sum in the
   *  list's order, so every value is edge()'s exactly */
  private lattice(list: readonly number[], i0: number, j0: number, ni: number, nj: number, st: number, H: Float64Array | null = null): Float64Array {
    const s = this.segs, L = this.look, n = ni * nj, M = new Float64Array(n).fill(Infinity), S = new Float64Array(n);
    // (T265: each segment's distances kept from the first pass for the second, so each is worked out once: the same values, half the work)
    const need = list.length * n; if (LAT_D.length < need) LAT_D = new Float64Array(Math.max(need, LAT_D.length * 2)); const D = LAT_D;
    list.forEach((i, li) => {
      const a = Math.max(0, Math.ceil(s[i + 6]! / st) - i0), b = Math.min(ni - 1, Math.floor(s[i + 8]! / st) - i0), c = Math.max(0, Math.ceil(s[i + 7]! / st) - j0), d = Math.min(nj - 1, Math.floor(s[i + 9]! / st) - j0), o = li * n;
      for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { const k = y * ni + x, v = this.segDist(i, (i0 + x) * st, (j0 + y) * st); D[o + k] = v; if (v < M[k]!) { M[k] = v; if (H) H[k] = this.segHw(i, (i0 + x) * st, (j0 + y) * st); } }
    });
    list.forEach((i, li) => {
      const a = Math.max(0, Math.ceil(s[i + 6]! / st) - i0), b = Math.min(ni - 1, Math.floor(s[i + 8]! / st) - i0), c = Math.max(0, Math.ceil(s[i + 7]! / st) - j0), d = Math.min(nj - 1, Math.floor(s[i + 9]! / st) - j0), o = li * n;
      for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { const k = y * ni + x, m = M[k]!; if (!(m < L.softOut)) continue; const v = D[o + k]! - m; if (v < L.softReach) S[k] += Math.exp(-v / L.soft); }
    });
    for (let k = 0; k < M.length; k++) { const m = M[k]!; M[k] = m < L.softOut ? this.softEdge(m, S[k]!) : L.out; }
    return M;
  }
  private cached(map: Map<number, number>, k: number, f: () => number) {
    let v = map.get(k); if (v !== undefined) return v;
    if (map.size > CACHE_MAX) map.clear();
    v = f(); map.set(k, v); return v;
  }
  /** the band's cover (0..1) at tile (x, y), as alpha samples it */
  cover(x: number, y: number): number {
    if (this.empty) return 0;
    const L = this.look, st = L.latStep, fx = x / st, fy = y / st, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    // (T265: the one bucket a lattice cell lies in is a sorted superset of the segments near it, as near() gives: the same values, no allocation)
    const c0 = Math.floor((i * st) / CELL), c1 = Math.floor(((i + 1) * st) / CELL), r0 = Math.floor((j * st) / CELL), r1 = Math.floor(((j + 1) * st) / CELL);
    const list = c0 === c1 && r0 === r1 ? this.cells.get((r0 + 64) * 4096 + c0 + 64) ?? NONE : this.near(i * st, j * st, (i + 1) * st, (j + 1) * st); if (!list.length) return 0;
    const E = (a: number, b: number) => this.cached(this.latE, latKey(a, b), () => this.edge(list, a * st, b * st));
    const e = bilerp(E(i, j), E(i + 1, j), E(i, j + 1), E(i + 1, j + 1), tx, ty); if (e >= L.out) return 0;
    // (T265: the river's reach reads its half width there; a lattice point past the band's out lays none, as alpha's)
    const R = (a: number, b: number) => this.cached(this.latR, latKey(a, b), () => (L.wide ? (E(a, b) < L.out ? L.reach(a * st, b * st, this.halfWidth(list, a * st, b * st)) : 0) : L.reach(a * st, b * st, 0)));
    const rs = L.ragStep, gi = Math.floor(x / rs), gj = Math.floor(y / rs), gx = x / rs - gi, gy = y / rs - gj;
    const G = (a: number, b: number) => this.cached(this.latG, latKey(a, b), () => L.rag(a * rs, b * rs));
    return L.band(e, bilerp(R(i, j), R(i + 1, j), R(i, j + 1), R(i + 1, j + 1), tx, ty), bilerp(G(gi, gj), G(gi + 1, gj), G(gi, gj + 1), G(gi + 1, gj + 1), gx, gy));
  }
  /** the band's cover over tiles [x0, x0 + w) x [y0, y0 + h) at res samples a tile (RGB 0, alpha the cover; sample (u, v) at the tile point
   *  (x0 + (u + 0.5) / res, y0 + (v + 0.5) / res), as terrain-paint.ts classAlpha), with the tile box it covers; null when none. The soft
   *  distance and the reach on the tile lattice over the box, the rag on the half-tile lattice only where the band can reach; a district chunk
   *  (res under 2: a tile is a few px) on lattices twice as coarse */
  alpha(x0: number, y0: number, w: number, h: number, res: number): BandAlpha | null {
    if (this.empty) return null;
    // (T265: a pure function of the box: kept for the chunk's next bake, an edit's or another level's; the caller never writes into it)
    const key = `${x0},${y0},${w},${h},${res}`;
    if (this.memo.has(key)) { const v = this.memo.get(key)!; this.memo.delete(key); this.memo.set(key, v); return v; }
    const v = this.bake(x0, y0, w, h, res); this.memo.set(key, v);
    if (this.memo.size > ALPHA_MEMO) this.memo.delete(this.memo.keys().next().value!);
    return v;
  }
  /** T265: the alphas kept (alpha), dropped: the bench's cold bake check */
  clearMemo() { this.memo.clear(); }
  private memo = new Map<string, BandAlpha | null>();
  private bake(x0: number, y0: number, w: number, h: number, res: number): BandAlpha | null {
    const L = this.look, OUT = L.out, st = res >= 2 ? L.latStep : L.farStep, gs = res >= 2 ? L.ragStep : L.farRag;
    const i0 = Math.floor(x0 / st), j0 = Math.floor(y0 / st), ni = Math.floor((x0 + w) / st) - i0 + 2, nj = Math.floor((y0 + h) / st) - j0 + 2;
    const list = this.near(i0 * st, j0 * st, (i0 + ni - 1) * st, (j0 + nj - 1) * st); if (!list.length) return null;
    const HW = L.wide ? new Float64Array(ni * nj) : null, E = this.lattice(list, i0, j0, ni, nj, st, HW); let any = false;
    // (a lattice cell whose four corners are all past the band's out lays nothing: its samples are skipped whole)
    const live = new Uint8Array(ni * nj);
    for (let j = 0; j + 1 < nj; j++) for (let i = 0; i + 1 < ni; i++) { const k = j * ni + i; if (E[k]! < OUT || E[k + 1]! < OUT || E[k + ni]! < OUT || E[k + ni + 1]! < OUT) { live[k] = 1; any = true; } }
    if (!any) return null;
    const R = new Float64Array(ni * nj), gi0 = Math.floor(x0 / gs), gj0 = Math.floor(y0 / gs), gni = Math.floor((x0 + w) / gs) - gi0 + 2, gnj = Math.floor((y0 + h) / gs) - gj0 + 2;
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const k = j * ni + i; R[k] = HW ? (E[k]! < OUT ? L.reach((i0 + i) * st, (j0 + j) * st, HW[k]!) : 0) : L.reach((i0 + i) * st, (j0 + j) * st, 0); }
    // (T265, a wide band: a cell lays nothing where its corners all lie inside the water (under lo), its reach is none at every corner, or its
    //  nearest corner lies past its farthest reach and the rag; the bilinear values inside a cell lie between its corners')
    if (HW) {
      any = false;
      for (let j = 0; j + 1 < nj; j++) for (let i = 0; i + 1 < ni; i++) {
        const k = j * ni + i; if (!live[k]) continue;
        const e0 = Math.min(E[k]!, E[k + 1]!, E[k + ni]!, E[k + ni + 1]!), e1 = Math.max(E[k]!, E[k + 1]!, E[k + ni]!, E[k + ni + 1]!), r1 = Math.max(R[k]!, R[k + 1]!, R[k + ni]!, R[k + ni + 1]!);
        if (!(e1 > L.lo) || !(r1 > 0) || e0 - L.rag0 >= r1 + L.rim) live[k] = 0; else any = true;
      }
      if (!any) return null;
    }
    const G = new Float64Array(gni * gnj).fill(NaN);
    const g = (i: number, j: number) => { const k = j * gni + i; let v = G[k]!; if (v !== v) v = G[k] = L.rag((gi0 + i) * gs, (gj0 + j) * gs); return v; };
    const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res)), data = new Uint8ClampedArray(W * H * 4);
    // each column's lattice cells and fractions (the same arithmetic as cover's, made once a column)
    const cI = new Int32Array(W), cT = new Float64Array(W), cG = new Int32Array(W), cGT = new Float64Array(W);
    for (let u = 0; u < W; u++) { const x = x0 + (u + 0.5) / res, fx = x / st, fgx = x / gs; cI[u] = Math.floor(fx) - i0; cT[u] = fx - Math.floor(fx); cG[u] = Math.floor(fgx) - gi0; cGT[u] = fgx - Math.floor(fgx); }
    let u0 = W, v0 = H, u1 = -1, v1 = -1;
    for (let v = 0; v < H; v++) {
      const y = y0 + (v + 0.5) / res, fy = y / st, jj = Math.floor(fy) - j0, ty = fy - Math.floor(fy), fgy = y / gs, gj = Math.floor(fgy) - gj0, gy = fgy - Math.floor(fgy), row = jj * ni;
      for (let u = 0; u < W; u++) {
        const ii = cI[u]!, k = row + ii;
        if (!live[k]) continue;
        const tx = cT[u]!, e = bilerp(E[k]!, E[k + 1]!, E[k + ni]!, E[k + ni + 1]!, tx, ty); if (e >= OUT) continue;
        const gi = cG[u]!, gx = cGT[u]!;
        // (T265: a reach the band ignores the rag at, ragFrom (the river's no wider than its bank), skips the rag's noise: the same cover)
        const Rv = bilerp(R[k]!, R[k + 1]!, R[k + ni]!, R[k + ni + 1]!, tx, ty), gv = Rv <= L.ragFrom ? 0 : bilerp(g(gi, gj), g(gi + 1, gj), g(gi, gj + 1), g(gi + 1, gj + 1), gx, gy);
        const a = Math.round(L.band(e, Rv, gv) * 255);
        if (a <= 0) continue;
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
 *  - tileScale: a tile's gloss is made at this share of its native size (the near set as the gloss mask holds it at the closest zoom: the
 *    tile lies there at half its native size, the mask is half the chunk's);
 *  - inset: px at that scale: the glint starts this far inside a pool's edge and is whole past the second (the textured-highlights rule: a
 *    small gap inside the edge, about 0.15 m at 30%, a px here two on screen there; then a soft rise, so a pool's sheen is brightest in its
 *    open middle);
 *  - meanRadius: px: each pool's local mean colour, over its own water within this box radius (the GPU takes the water's texture as each
 *    pixel's distance from it);
 *  - maskK: the chunk's gloss mask is a maskK-th of its size each way (the pools are small: finer than the lamps' quarter);
 *  - amount: how far toward the sky the pools go at the whole gain, on their lit ripples; spread: luma: the water's texture, its distance from
 *    the local mean, in units of this; floor: the share of it the water's darkest hollows keep; max: the most a pixel goes toward the sky;
 *  - sky: the cool sky colour the pools reflect (0..255);
 *  - night: the share of the glint gone after dusk (no sky to reflect) */
export const GLOSS = {
  tileScale: 0.25, inset: [1, 4.5], meanRadius: 7, maskK: 2,
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
