// Living ground (T111, #198; the owner, 2026-10-25: "biomes that form logically according to the assets on the terrain itself ... it should
// double as a natural ambient occlusion bake as well"). Every ground chunk bakes influence maps from what stands on it and near it, plus slow
// noise: they choose between grass variants and darken the ground, so one bake gives the variety and the ambient occlusion.
//   - fences, walls and hedges: a strip of darker, bushier grass the mower cannot reach, and soft darkening at the base;
//   - trees (by canopy): patchy, thin grass with bare dirt and leaf litter, strongest at the trunk and fading out to the drip line, a little lush
//     ring just beyond it; canopy shade offset at 145 degrees (the sun at the upper right) and contact darkening at the trunk;
//   - buildings: worn, patchy ground at the door and the corners, a lush strip along the walls, contact darkening round the foundations;
//   - roads, cart paths and hard lot ground: a worn, trampled band at the edge, a lush verge just beyond it, a small shade at the kerb;
//   - water: lusher grass near the bank;
//   - open ground: slow natural patches of lush and thin grass (world-space noise, never periodic).
// Pure TypeScript (no DOM): the ground workers bake it per chunk (renderer.ts drawLiving), the engine packs the casters, the tests run it in node.

/** a tile-space box x0, y0, x1, y1 */
export type Box = [number, number, number, number];

/* ---- casters: the things standing on the ground, as flat Float32Array records the engine sends the ground workers ---- */
/** floats per caster record: kind, then six numbers by kind (tiles):
 *  - FENCE, HEDGE, WALL: the line x0, y0, x1, y1, its half thickness, 0;
 *  - TREE: the trunk x, y, the canopy radius, leafiness (1 a broadleaf tree, about 0.5 a conifer), 0, 0;
 *  - BUSH: its centre x, y, its radius, 0, 0, 0;
 *  - BUILDING: its footprint x0, y0, x1, y1, its door x, y (NaN when it has none) */
export const CASTER_STRIDE = 7;
export const CK = { FENCE: 1, HEDGE: 2, WALL: 3, TREE: 4, BUSH: 5, BUILDING: 6 } as const;
/** a tile is 2 m */
const M_PER_TILE = 2;
/** the reach of a caster past its own shape, in tiles: how far its influence (lush strips, worn doors, shade) spreads */
const LINE_REACH: Record<number, number> = { [CK.FENCE]: 1.3, [CK.HEDGE]: 1.6, [CK.WALL]: 1.3 };
const BUILDING_REACH = 1.8;
/** the influence box of record k of recs (its shape grown by its reach) */
export function casterBox(recs: ArrayLike<number>, k: number): Box {
  const o = k * CASTER_STRIDE, kind = recs[o]!, a = recs[o + 1]!, b = recs[o + 2]!, c = recs[o + 3]!, d = recs[o + 4]!;
  if (kind === CK.TREE || kind === CK.BUSH) { const r = c * 1.85 + 0.6; return [a - r, b - r, a + r, b + r]; }
  if (kind === CK.BUILDING) { const g = BUILDING_REACH; return [Math.min(a, c) - g, Math.min(b, d) - g, Math.max(a, c) + g, Math.max(b, d) + g]; }
  const g = (LINE_REACH[kind] ?? 1) + recs[o + 5]!;
  return [Math.min(a, c) - g, Math.min(b, d) - g, Math.max(a, c) + g, Math.max(b, d) + g];
}
/** the longest reach any caster has past the box it is indexed by (a tree's canopy radius is part of its box) */
export const MAX_CASTER_REACH = 12;

/** a caster record's text (for the diff) */
const recKey = (r: ArrayLike<number>, o: number) => { let s = ''; for (let k = 0; k < CASTER_STRIDE; k++) s += (k ? ',' : '') + r[o + k]; return s; };
/** the box of what changed between the records a key had and its new ones (each changed record's influence box), null when nothing did: the
 *  ground cache re-bakes only the chunks under it */
export function casterChange(old: ArrayLike<number> | undefined, next: ArrayLike<number>): Box | null {
  const n0 = old ? old.length / CASTER_STRIDE : 0, n1 = next.length / CASTER_STRIDE;
  if (old && old.length === next.length) { let same = true; for (let i = 0; i < next.length && same; i++) same = Object.is(old[i], next[i]); if (same) return null; }
  const count = new Map<string, number>();
  for (let k = 0; k < n0; k++) { const s = recKey(old!, k * CASTER_STRIDE); count.set(s, (count.get(s) ?? 0) + 1); }
  let box: Box | null = null;
  const grow = (r: ArrayLike<number>, k: number) => { const b = casterBox(r, k); box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; };
  for (let k = 0; k < n1; k++) { const s = recKey(next, k * CASTER_STRIDE), c = count.get(s) ?? 0; if (c > 0) count.set(s, c - 1); else grow(next, k); }
  if (old) for (let k = 0; k < n0; k++) { const s = recKey(old, k * CASTER_STRIDE), c = count.get(s) ?? 0; if (c > 0) { count.set(s, c - 1); grow(old, k); } }
  return box;
}

/** the casters a ground worker knows, by key (the engine's prop cells 'p:..', forest cells 'f:..', town-tree cells 't:..'), indexed by a
 *  coarse grid of their boxes so a chunk finds the ones within reach quickly */
export class CasterStore {
  private keys = new Map<string, { recs: Float32Array; box: Box; cells: number[] }>();
  private grid = new Map<number, Set<string>>();
  private static readonly CELL = 64;
  get size() { return this.keys.size; }
  set(key: string, recs: Float32Array) {
    this.drop(key);
    const n = recs.length / CASTER_STRIDE; if (!n) return;
    let box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < n; k++) { const b = casterBox(recs, k); box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]; }
    const C = CasterStore.CELL, cells: number[] = [];
    for (let cy = Math.floor(box[1] / C); cy <= Math.floor(box[3] / C); cy++) for (let cx = Math.floor(box[0] / C); cx <= Math.floor(box[2] / C); cx++) {
      const c = (cy + 64) * 4096 + cx + 64; cells.push(c); let s = this.grid.get(c); if (!s) this.grid.set(c, (s = new Set())); s.add(key);
    }
    this.keys.set(key, { recs, box, cells });
  }
  drop(key: string) {
    const e = this.keys.get(key); if (!e) return;
    for (const c of e.cells) { const s = this.grid.get(c); if (s) { s.delete(key); if (!s.size) this.grid.delete(c); } }
    this.keys.delete(key);
  }
  /** every key whose name starts with prefix goes (a new map: the forest and town-tree cells) */
  dropPrefix(prefix: string) { for (const k of [...this.keys.keys()]) if (k.startsWith(prefix)) this.drop(k); }
  /** the records whose influence boxes touch box b, packed */
  query(b: Box): Float32Array {
    const C = CasterStore.CELL, seen = new Set<string>(), parts: { recs: Float32Array; ks: number[] }[] = []; let n = 0;
    for (let cy = Math.floor(b[1] / C); cy <= Math.floor(b[3] / C); cy++) for (let cx = Math.floor(b[0] / C); cx <= Math.floor(b[2] / C); cx++) {
      for (const key of this.grid.get((cy + 64) * 4096 + cx + 64) ?? []) {
        if (seen.has(key)) continue; seen.add(key);
        const e = this.keys.get(key)!; if (e.box[2] < b[0] || e.box[0] > b[2] || e.box[3] < b[1] || e.box[1] > b[3]) continue;
        const ks: number[] = [];
        for (let k = 0; k < e.recs.length / CASTER_STRIDE; k++) { const q = casterBox(e.recs, k); if (q[2] >= b[0] && q[0] <= b[2] && q[3] >= b[1] && q[1] <= b[3]) ks.push(k); }
        if (ks.length) { parts.push({ recs: e.recs, ks }); n += ks.length; }
      }
    }
    const out = new Float32Array(n * CASTER_STRIDE); let o = 0;
    for (const p of parts) for (const k of p.ks) { out.set(p.recs.subarray(k * CASTER_STRIDE, (k + 1) * CASTER_STRIDE), o); o += CASTER_STRIDE; }
    return out;
  }
}

/* ---- the sources a chunk's influence comes from ---- */
/** a road or cart path piece: its centre line a-b and the half width of its paved surface and sidewalk or verge (tiles); cart: a cart path
 *  (packed dirt or cement slabs: a narrower worn band, little kerb shade) */
export interface RoadPiece { ax: number; ay: number; bx: number; by: number; hw: number; cart?: boolean }
/** a waterway: its points (tiles) with their widths, and the bank past the water's edge before the grass starts (tiles) */
export interface WaterLine { pts: readonly { x: number; y: number; w: number }[]; bank: number }
export interface LivingSources {
  casters: Float32Array;
  roads?: readonly RoadPiece[];
  /** hard lot ground (driveways, paving, yards, painted paths) as closed rings x0 y0 x1 y1 ... (tiles) */
  paths?: readonly ArrayLike<number>[];
  /** rivers and creeks */
  rivers?: readonly WaterLine[];
  /** other water edges (course water, painted ponds) as polylines x0 y0 x1 y1 ...; closed when the last point repeats the first, or ring
   *  (a painted pond's outline) */
  shores?: readonly { pts: ArrayLike<number>; ring?: boolean }[];
}

/* ---- noise: value noise on the world grid (never periodic) ---- */
const hash2 = (x: number, y: number, s: number) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** value noise in 0..1, smooth between lattice points one unit apart */
export function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** the open ground's slow patches at tile (x, y), -1 (thin) .. 1 (lush): waves of about 44 m and 17 m (never a multiple of the grass's
 *  48, 96 or 192 m pictures) */
export function openNoise(x: number, y: number) {
  const n = vnoise(x / 22 + 3.7, y / 22 - 8.1, 41) * 0.62 + vnoise(x / 8.5 - 1.3, y / 8.5 + 5.9, 43) * 0.38;
  return Math.max(-1, Math.min(1, (n - 0.5) * 2.7));
}

/* ---- the influence grid ---- */
/** the five channels, each 0..1 per sample: lush (darker, denser grass), thin (patchy grass with dirt in its gaps), bare (dirt), litter (leaves
 *  and needles) and ao (how much the ground is darkened) */
export interface InfluenceGrid { ix0: number; iy0: number; res: number; w: number; h: number; lush: Float32Array; thin: Float32Array; bare: Float32Array; litter: Float32Array; ao: Float32Array }
/** samples past the chunk's box on every side (so the bilinear stretch has neighbours at its edges) */
const PAD = 2;
/** the sample density for a chunk baked at level L (samples per tile): about one every 12 px, at most 3 (two thirds of a metre) and at least one every
 *  two tiles (district chunks). Chunks at one level share it, so their samples sit on the same world points */
export function livingRes(L: number, lite: boolean): number {
  const px = 71.55 * L;
  return lite ? (px >= 9 ? 1 : 0.5) : Math.max(1, Math.min(3, Math.round(px / 12)));
}
/** the box a chunk asks its casters for: its whole sample grid (the box and its pad samples), so the samples at its edges, which the bilinear
 *  stretch blends with, see everything its neighbour's do */
export function livingQueryBox(box: Box, res: number): Box { const g = (PAD + 1) / res; return [box[0] - g, box[1] - g, box[2] + g, box[3] + g]; }
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** 1 at d <= a, easing to 0 at d >= b */
const near = (a: number, b: number, d: number) => 1 - sm(a, b, d);
/** 0 below a, 1 from b to c, 0 again past e */
const band = (a: number, b: number, c: number, e: number, d: number) => sm(a, b, d) * (1 - sm(c, e, d));
/** the shadow direction on the ground for the sun at the upper right (screen 145 degrees: down and to the left), a unit vector in tiles */
export const SHADOW_DIR: readonly [number, number] = (() => { const a = 145 * Math.PI / 180, sx = Math.cos(a), sy = Math.sin(a), x = (sx / 64 + sy / 32) / 2, y = (sy / 32 - sx / 64) / 2, l = Math.hypot(x, y); return [x / l, y / l] as const; })();

/** squared distance (tiles) from (px, py) to segment a-b, and the segment parameter */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0, ex = ax + dx * t - px, ey = ay + dy * t - py;
  return ex * ex + ey * ey;
}

/** the influence over a chunk's tile box at res samples a tile, from its sources: the distance classes (fences, hedges, walls, roads, cart
 *  paths, hard ground, water, buildings, doors, corners) as nearest-distance fields, so pieces end to end (fence panels, road pieces) never
 *  double up at their joints; trees and bushes add up (overlapping canopies make deeper shade); the open ground's noise on top. Every sample
 *  depends only on its world point and the sources within reach, so neighbouring chunks agree at their seams */
export function influence(box: Box, res: number, src: LivingSources): InfluenceGrid {
  const ix0 = Math.floor(box[0] * res) - PAD, iy0 = Math.floor(box[1] * res) - PAD, w = Math.ceil(box[2] * res) + PAD - ix0, h = Math.ceil(box[3] * res) + PAD - iy0, n = w * h;
  const lush = new Float32Array(n), thin = new Float32Array(n), bare = new Float32Array(n), litter = new Float32Array(n), ao = new Float32Array(n);
  const X = (i: number) => (ix0 + i + 0.5) / res, Y = (j: number) => (iy0 + j + 0.5) / res;
  /** the sample index range a tile box covers, clamped to the grid; null when it misses */
  const span = (x0: number, y0: number, x1: number, y1: number) => {
    const i0 = Math.max(0, Math.floor(x0 * res - ix0 - 0.5)), i1 = Math.min(w - 1, Math.ceil(x1 * res - ix0 - 0.5));
    const j0 = Math.max(0, Math.floor(y0 * res - iy0 - 0.5)), j1 = Math.min(h - 1, Math.ceil(y1 * res - iy0 - 0.5));
    return i0 > i1 || j0 > j1 ? null : [i0, j0, i1, j1] as const;
  };
  const BIG = 1e9;
  const fields = new Map<string, Float32Array>();
  const field = (name: string) => { let f = fields.get(name); if (!f) { f = new Float32Array(n).fill(BIG); fields.set(name, f); } return f; };
  /** a segment's distance (metres, past half thickness t tiles) into field f within reach r tiles */
  const segInto = (f: Float32Array, ax: number, ay: number, bx: number, by: number, t: number, r: number) => {
    const s = span(Math.min(ax, bx) - t - r, Math.min(ay, by) - t - r, Math.max(ax, bx) + t + r, Math.max(ay, by) + t + r); if (!s) return;
    for (let j = s[1]; j <= s[3]; j++) { const y = Y(j); for (let i = s[0]; i <= s[2]; i++) { const d = (Math.sqrt(segD2(X(i), y, ax, ay, bx, by)) - t) * M_PER_TILE, o = j * w + i; if (d < f[o]!) f[o] = d < 0 ? 0 : d; } }
  };
  const pointInto = (f: Float32Array, x: number, y0: number, r: number) => {
    const s = span(x - r, y0 - r, x + r, y0 + r); if (!s) return;
    for (let j = s[1]; j <= s[3]; j++) { const ey = Y(j) - y0; for (let i = s[0]; i <= s[2]; i++) { const ex = X(i) - x, d = Math.sqrt(ex * ex + ey * ey) * M_PER_TILE, o = j * w + i; if (d < f[o]!) f[o] = d; } }
  };
  const boxInto = (f: Float32Array, x0: number, y0: number, x1: number, y1: number, r: number) => {
    const s = span(x0 - r, y0 - r, x1 + r, y1 + r); if (!s) return;
    for (let j = s[1]; j <= s[3]; j++) { const y = Y(j), dy = Math.max(y0 - y, 0, y - y1); for (let i = s[0]; i <= s[2]; i++) { const x = X(i), dx = Math.max(x0 - x, 0, x - x1), d = Math.sqrt(dx * dx + dy * dy) * M_PER_TILE, o = j * w + i; if (d < f[o]!) f[o] = d; } }
  };
  // ---- the casters
  const c = src.casters, nc = c.length / CASTER_STRIDE, [sx, sy] = SHADOW_DIR;
  for (let k = 0; k < nc; k++) {
    const o = k * CASTER_STRIDE, kind = c[o]!;
    if (kind === CK.FENCE || kind === CK.HEDGE || kind === CK.WALL) segInto(field('line' + kind), c[o + 1]!, c[o + 2]!, c[o + 3]!, c[o + 4]!, c[o + 5]!, LINE_REACH[kind]!);
    else if (kind === CK.BUILDING) {
      const x0 = Math.min(c[o + 1]!, c[o + 3]!), y0 = Math.min(c[o + 2]!, c[o + 4]!), x1 = Math.max(c[o + 1]!, c[o + 3]!), y1 = Math.max(c[o + 2]!, c[o + 4]!);
      boxInto(field('wall'), x0, y0, x1, y1, BUILDING_REACH);
      const cr = field('corner'); for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) pointInto(cr, px, py, 1.2);
      if (Number.isFinite(c[o + 5]!) && Number.isFinite(c[o + 6]!)) pointInto(field('door'), c[o + 5]!, c[o + 6]!, BUILDING_REACH);
    } else if (kind === CK.TREE || kind === CK.BUSH) {
      const tx = c[o + 1]!, ty = c[o + 2]!, R = Math.max(0.2, c[o + 3]!), Rm = R * M_PER_TILE, leafy = c[o + 4]!, tree = kind === CK.TREE;
      // the canopy's shade sits a third of the radius toward the shadow side (145 degrees on screen)
      const cx = tx + sx * R * 0.35, cy = ty + sy * R * 0.35, reach = R * 1.85 + 0.6, s = span(tx - reach, ty - reach, tx + reach, ty + reach); if (!s) continue;
      // the falloffs by kind (metres): thin, bare, litter, the lush ring past the drip line, the canopy's shade and the trunk's contact shade
      const thinA = tree ? 0.15 * Rm : 0.2 * Rm, thinK = tree ? 0.95 : 0.35, bareA = 0.1 * Rm + 0.3, bareB = 0.65 * Rm + 0.5, litA = 0.3 * Rm, litB = tree ? 1.2 * Rm : Rm, litK = tree ? 0.45 + 0.55 * leafy : 0.25;
      const ringA = tree ? 0.95 * Rm : 0.8 * Rm, ringB = tree ? 1.2 * Rm : Rm, ringC = tree ? 1.35 * Rm : 1.3 * Rm, ringE = 1.85 * Rm, ringK = tree ? 0.32 : 0.4;
      const shA = 0.1 * Rm, shB = tree ? 1.05 * Rm : 1.1 * Rm, shK = tree ? 0.24 : 0.34, ctB = 0.35 + 0.08 * Rm, dMax = Rm * 1.85 + 1.2, d2Max = (dMax / M_PER_TILE) ** 2;
      for (let j = s[1]; j <= s[3]; j++) {
        const y = (iy0 + j + 0.5) / res, ey = y - ty, ecy = y - cy;
        for (let i = s[0]; i <= s[2]; i++) {
          const x = (ix0 + i + 0.5) / res, ex = x - tx, d2 = ex * ex + ey * ey;
          if (d2 > d2Max) continue;
          const d = Math.sqrt(d2) * M_PER_TILE, ecx = x - cx, dc = Math.sqrt(ecx * ecx + ecy * ecy) * M_PER_TILE, q = j * w + i;
          const vThin = thinK * near(thinA, Rm, d), vBare = tree ? 0.9 * near(bareA, bareB, d) : 0, vLit = litK * near(litA, litB, d), vLush = d > ringA ? ringK * band(ringA, ringB, ringC, ringE, d) : 0;
          const vAo = tree ? 1 - (1 - shK * near(shA, shB, dc)) * (1 - 0.34 * near(0, ctB, d)) : shK * near(shA, shB, dc);
          thin[q] = thin[q]! + vThin * (1 - thin[q]!); bare[q] = bare[q]! + vBare * (1 - bare[q]!); litter[q] = litter[q]! + vLit * (1 - litter[q]!);
          lush[q] = lush[q]! + vLush * (1 - lush[q]!); ao[q] = ao[q]! + vAo * (1 - ao[q]!);
        }
      }
    }
  }
  // ---- roads, cart paths, hard ground, water
  for (const r of src.roads ?? []) segInto(field(r.cart ? 'cart' : 'road'), r.ax, r.ay, r.bx, r.by, r.hw, 2.2);
  for (const ring of src.paths ?? []) { const m = ring.length; for (let k = 0; k + 1 < m; k += 2) { const k2 = (k + 2) % m; segInto(field('path'), ring[k]!, ring[k + 1]!, ring[k2]!, ring[k2 + 1]!, 0, 1.7); } }
  for (const wl of src.rivers ?? []) {
    const f = field('water'), p = wl.pts;
    for (let k = 0; k < p.length; k++) {
      const a = p[k]!, b = p[Math.min(p.length - 1, k + 1)]!, ra = a.w / 2 + wl.bank, rb = b.w / 2 + wl.bank, g = Math.max(ra, rb) + 4;
      const s = span(Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g); if (!s) continue;
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      for (let j = s[1]; j <= s[3]; j++) { const y = Y(j); for (let i = s[0]; i <= s[2]; i++) {
        const x = X(i), t = l2 > 0 ? clamp01(((x - a.x) * dx + (y - a.y) * dy) / l2) : 0, ex = a.x + dx * t - x, ey = a.y + dy * t - y, d = (Math.sqrt(ex * ex + ey * ey) - (ra + (rb - ra) * t)) * M_PER_TILE, q = j * w + i;
        if (d < f[q]!) f[q] = d;
      } }
    }
  }
  for (const sh of src.shores ?? []) { const p = sh.pts, m = p.length, f = field('water'); for (let k = 0; k + 3 < m + (sh.ring ? 2 : 0); k += 2) { const k2 = (k + 2) % m; segInto(f, p[k]!, p[k + 1]!, p[k2]!, p[k2 + 1]!, 0, 4); } }
  // ---- the distance fields into the channels, and the open ground's noise
  const F = (name: string) => fields.get(name);
  const fence = F('line' + CK.FENCE), hedge = F('line' + CK.HEDGE), wallL = F('line' + CK.WALL), road = F('road'), cart = F('cart'), path = F('path'), water = F('water'), wall = F('wall'), corner = F('corner'), door = F('door');
  // the open noise is slow: sampled on a coarse lattice every 2 tiles of the world (the same points in every chunk, so seams agree) and stretched
  const step = Math.max(1, Math.round(res * 2)), ci0 = Math.floor(ix0 / step), cj0 = Math.floor(iy0 / step);
  const cw = Math.floor((ix0 + w - 1) / step) - ci0 + 2, chh = Math.floor((iy0 + h - 1) / step) - cj0 + 2, coarse = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) coarse[j * cw + i] = openNoise(((ci0 + i) * step + 0.5) / res, ((cj0 + j) * step + 0.5) / res);
  const add = (v: number, ch: number) => ch + v * (1 - ch);
  for (let j = 0; j < h; j++) {
    const gj = iy0 + j, cj = Math.floor(gj / step), fy = (gj - cj * step) / step, rowB = (cj - cj0) * cw;
    for (let i = 0; i < w; i++) {
      const q = j * w + i, gi = ix0 + i, ci = Math.floor(gi / step), fx = (gi - ci * step) / step, b0 = rowB + ci - ci0;
      const on = (coarse[b0]! * (1 - fx) + coarse[b0 + 1]! * fx) * (1 - fy) + (coarse[b0 + cw]! * (1 - fx) + coarse[b0 + cw + 1]! * fx) * fy;
      let L = lush[q]!, T = thin[q]!, B = bare[q]!, A = ao[q]!;
      L = add(0.38 * sm(0.12, 0.6, on), L); T = add(0.24 * sm(0.2, 0.65, -on), T);
      if (fence) { const d = fence[q]!; if (d < BIG) { L = add(0.9 * near(0.6, 2.2, d), L); A = add(0.34 * near(0, 0.7, d), A); } }
      if (hedge) { const d = hedge[q]!; if (d < BIG) { L = add(0.92 * near(0.9, 2.8, d), L); A = add(0.42 * near(0, 1.0, d), A); } }
      if (wallL) { const d = wallL[q]!; if (d < BIG) { L = add(0.8 * near(0.7, 2.2, d), L); A = add(0.46 * near(0, 0.9, d), A); } }
      if (road) { const d = road[q]!; if (d < BIG) { T = add(0.5 * near(0.15, 1.3, d), T); B = add(0.22 * near(0, 0.5, d), B); L = add(0.45 * band(1.0, 1.8, 2.6, 4.2, d), L); A = add(0.24 * near(0, 0.5, d), A); } }
      if (cart) { const d = cart[q]!; if (d < BIG) { T = add(0.38 * near(0.1, 1.0, d), T); L = add(0.35 * band(0.8, 1.5, 2.2, 3.6, d), L); A = add(0.1 * near(0, 0.35, d), A); } }
      if (path) { const d = path[q]!; if (d < BIG) { T = add(0.4 * near(0.1, 1.0, d), T); L = add(0.25 * band(0.9, 1.5, 2.2, 3.2, d), L); A = add(0.15 * near(0, 0.35, d), A); } }
      if (water) { const d = water[q]!; if (d < BIG) L = add(0.9 * near(0.5, 7, Math.max(0, d)), L); }
      if (wall) { const d = wall[q]!; if (d < BIG) { A = add(1 - (1 - 0.42 * near(0, 1.3, d)) * (1 - 0.25 * near(0, 0.35, d)), A); L = add(0.3 * band(0.3, 0.7, 1.2, 2.4, d), L); } }
      if (corner) { const d = corner[q]!; if (d < BIG) T = add(0.5 * near(0.4, 2.2, d), T); }
      if (door) { const d = door[q]!; if (d < BIG) { T = add(0.95 * near(0.6, 3.2, d), T); B = add(0.75 * near(0.3, 1.6, d), B); } }
      lush[q] = L; thin[q] = T; bare[q] = B; ao[q] = A;
    }
  }
  return { ix0, iy0, res, w, h, lush, thin, bare, litter, ao };
}

/** a cheap signature of what a chunk's influence is made from (its sample density and sources): a re-bake whose sources did not change (a
 *  course stroke, a lot edit elsewhere in the chunk, the course's hold re-bakes) reuses the grid and masks it made before */
export function livingSignature(res: number, src: LivingSources): number {
  let h = (2166136261 ^ Math.round(res * 8)) | 0;
  const mix = (v: number) => { h = Math.imul(h ^ (Number.isFinite(v) ? Math.round(v * 1024) | 0 : 0x5bd1e995), 16777619); };
  const c = src.casters; mix(c.length); for (let i = 0; i < c.length; i++) mix(c[i]!);
  for (const r of src.roads ?? []) { mix(r.ax); mix(r.ay); mix(r.bx); mix(r.by); mix(r.hw); mix(r.cart ? 1 : 0); }
  for (const p of src.paths ?? []) { mix(p.length); for (let i = 0; i < p.length; i++) mix(p[i]!); }
  for (const w of src.rivers ?? []) { mix(w.pts.length); mix(w.bank); for (const p of w.pts) { mix(p.x); mix(p.y); mix(p.w); } }
  for (const s of src.shores ?? []) { mix(s.pts.length); mix(s.ring ? 1 : 0); for (let i = 0; i < s.pts.length; i++) mix(s.pts[i]!); }
  return h >>> 0;
}

/* ---- the masks the renderer lays the variants through (RGBA, one px per sample, stretched bilinear over the chunk) ---- */
/** the lush layer's strength at full influence (the grass laid over itself and tinted: deeper, denser, more saturated) */
export const LUSH_MAX = 0.85;
/** the ambient occlusion's colour at full strength (a cool multiply that keeps the texture, T110) and its most */
export const AO_COLOUR: readonly [number, number, number] = [0.5, 0.58, 0.74];
export const AO_MAX = 0.62;
export interface LivingMasks { W: number; H: number; x0: number; y0: number; res: number; lush: Uint8ClampedArray; thin: Uint8ClampedArray; bare: Uint8ClampedArray; litter: Uint8ClampedArray; ao: Uint8ClampedArray;
  /** the most each mask reaches (0..1): a pass whose mask stays near 0 is skipped */
  max: { lush: number; thin: number; bare: number; litter: number; ao: number } }
/** the masks from a grid: each channel broken up by fine noise into painted-looking patches (never a smooth disc, never flat), at the sample
 *  density: the finest wave (about 1.4 m) only where the samples resolve it */
export function livingMasks(g: InfluenceGrid): LivingMasks {
  const { w, h, res, ix0, iy0 } = g, n = w * h, mk = () => new Uint8ClampedArray(n * 4);
  const lush = mk(), thin = mk(), bare = mk(), litter = mk(), ao = mk(), max = { lush: 0, thin: 0, bare: 0, litter: 0, ao: 0 };
  // the finest wave only where the samples resolve it; the broad wave never finer than about two samples (a district chunk's patches stay
  // patches, not speckle)
  const fine = res >= 3 ? 1 : res >= 2 ? 0.5 : 0, s1 = Math.max(1.8, 2.2 / res), s2 = Math.max(1.1, 1.6 / res);
  for (let j = 0; j < h; j++) {
    const y = (iy0 + j + 0.5) / res;
    for (let i = 0; i < w; i++) {
      const x = (ix0 + i + 0.5) / res, q = j * w + i, o = q * 4;
      // two breakup noises: a 3.6 m wave everywhere, a 1.4 m wave where the samples resolve it
      const n1 = vnoise(x / s1 + 11.1, y / s1 - 4.2, 51), n2 = fine ? vnoise(x / 0.7 - 2.3, y / 0.7 + 7.7, 53) : 0.5, nf = n1 * (1 - 0.45 * fine) + n2 * 0.45 * fine;
      const nb = vnoise(x / s2 + 5.5, y / s2 + 1.9, 57);
      const L = LUSH_MAX * sm(0.05, 0.85, g.lush[q]! * (0.7 + 0.6 * nf));
      const T = sm(0.22, 0.8, g.thin[q]! + (nf - 0.5) * 0.5);
      // bare soil: the cores (trunks, doors) and, where the grass is thinnest, patches of soil between its clumps (never on the open ground's
      // thin patches, which stay grass)
      const B = Math.max(sm(0.4, 0.88, g.bare[q]! + (nb - 0.5) * 0.6), 0.85 * sm(0.66, 0.98, g.thin[q]! + (nb - 0.5) * 0.7));
      const F = 0.9 * sm(0.18, 0.75, g.litter[q]! * (0.45 + nf));
      const A = Math.min(AO_MAX, g.ao[q]!);
      lush[o + 3] = L * 255; thin[o + 3] = T * 255; bare[o + 3] = B * 255; litter[o + 3] = F * 255;
      for (let k = 0; k < 3; k++) ao[o + k] = (1 - A * (1 - AO_COLOUR[k]!)) * 255;
      ao[o + 3] = 255;
      if (L > max.lush) max.lush = L; if (T > max.thin) max.thin = T; if (B > max.bare) max.bare = B; if (F > max.litter) max.litter = F; if (A > max.ao) max.ao = A;
    }
  }
  return { W: w, H: h, x0: ix0 / res, y0: iy0 / res, res, lush, thin, bare, litter, ao, max };
}
/** the dev debug view of a grid: lush green, thin orange, bare brown, litter red, the ambient occlusion as blue-grey shade (RGBA, laid over the
 *  ground, opaque) */
export function debugImage(g: InfluenceGrid): Uint8ClampedArray {
  const n = g.w * g.h, out = new Uint8ClampedArray(n * 4);
  for (let q = 0; q < n; q++) {
    let r = 128, gg = 128, b = 128;
    const mix = (v: number, c: readonly number[]) => { r += (c[0]! - r) * v; gg += (c[1]! - gg) * v; b += (c[2]! - b) * v; };
    mix(g.lush[q]!, [30, 190, 50]); mix(g.thin[q]! * 0.9, [235, 160, 40]); mix(g.bare[q]!, [120, 70, 30]); mix(g.litter[q]! * 0.8, [200, 50, 40]);
    const a = Math.min(1, g.ao[q]! * 1.4); r *= 1 - 0.75 * a; gg *= 1 - 0.7 * a; b *= 1 - 0.45 * a;
    out[q * 4] = r; out[q * 4 + 1] = gg; out[q * 4 + 2] = b; out[q * 4 + 3] = 255;
  }
  return out;
}

/* ---- which ground the variety lies on ---- */
/** the grass textures (ground textures, Paint photos and presets) the variety lies on: the rest (paving, soil, sand, water, the course's managed
 *  turf) keeps its look */
const GRASSY = new Set(['grass', 'grassDry', 'meadow', 'lawnLush', 'lawnWorn', 'lawnClover', 'golfRough', 'golfFescue', 'meadowLush', 'meadowFlowers', 'preset:lawns', 'preset:fescue', 'preset:rough']);
export const grassyTex = (tex: string) => GRASSY.has(tex);
/** water textures (a painted pond): their outline is a shore */
export const waterTex = (tex: string) => tex === 'water' || tex.startsWith('water');
/** the course surfaces (CourseLayer.s) the variety lies on: rough 1 and fescue 2; water 3 is a shore */
export const COURSE_GRASSY = new Set([1, 2]);
export const COURSE_WATER = 3;

/* ---- the variant art (docs/art/GRASS-PROMPTS.md): painted sets that replace the derived variants when their files exist ---- */
/** the variant sets by name: lush grass along fences and water, patchy grass under trees and at doors, bare dirt, leaf litter */
export const VARIANT_IDS = ['grass-lush', 'grass-patchy', 'dirt-bare', 'leaf-litter'] as const;
export type VariantId = typeof VARIANT_IDS[number];
/** the metres each zoom level's picture covers (as the painted grass: close 48, mid 96, far 192) */
const LEVEL_METRES = { near: 48, mid: 96, far: 192 } as const;
/** the variant families found among the art files (a map of file path to URL): `<id>-<close|near>-v<n>`, `<id>-mid-v<n>` and `<id>-far-v<n>`
 *  (.webp or .png), the highest version of each level; a set missing any level is left out (the derived variant stays) */
export function variantFamilies(files: Readonly<Record<string, string>>): Record<string, { near: { src: string; metres: number }; mid: { src: string; metres: number }; far: { src: string; metres: number }; repeat: number }> {
  const out: ReturnType<typeof variantFamilies> = {};
  for (const id of VARIANT_IDS) {
    const best: Partial<Record<'near' | 'mid' | 'far', { v: number; src: string }>> = {};
    for (const [path, url] of Object.entries(files)) {
      const m = new RegExp(`(?:^|/)${id}-(close|near|mid|far)-v(\\d+)\\.(?:webp|png)$`).exec(path); if (!m) continue;
      const level = m[1] === 'close' ? 'near' : m[1] as 'near' | 'mid' | 'far', v = +m[2]!;
      if (!best[level] || best[level]!.v < v) best[level] = { v, src: url };
    }
    if (best.near && best.mid && best.far) out[id] = { near: { src: best.near.src, metres: LEVEL_METRES.near }, mid: { src: best.mid.src, metres: LEVEL_METRES.mid }, far: { src: best.far.src, metres: LEVEL_METRES.far }, repeat: 0 };
  }
  return out;
}

/* ---- the engine's side: the caster records of props ---- */
/** what the engine knows of a placed thing: its library kind, id and category, footprint (tiles), the picture's width on the ground (tiles
 *  across, the canopy of a tree), and its door (tiles) if it has one */
export interface CasterInput { kind: string; id: string; cat: string; big: boolean; x0: number; y0: number; x1: number; y1: number; across: number; door?: { x: number; y: number } | null; conifer?: boolean }
/** what kind of caster a library item is, if any (decor, cars, signs and people cast none) */
export function casterKind(p: { kind: string; id: string; cat: string; big: boolean }): number {
  if (p.id.includes('hedge')) return CK.HEDGE;
  if (p.kind === 'fencex' || p.kind === 'fencey' || p.cat === 'Fences') return CK.FENCE;
  if (/(^|[:_-])wall([:_-]|$)/i.test(p.id)) return CK.WALL;
  if (p.kind === 'tree') return CK.TREE;
  if (p.kind === 'bush') return CK.BUSH;
  if (p.big && p.kind !== 'car' && p.kind !== 'walker') return CK.BUILDING;
  return 0;
}
/** the caster record of one thing, appended to out (nothing for the things that cast none) */
export function casterOf(p: CasterInput, out: number[]) {
  const kind = casterKind(p); if (!kind) return;
  const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, wx = p.x1 - p.x0, wy = p.y1 - p.y0;
  if (kind === CK.FENCE || kind === CK.HEDGE || kind === CK.WALL) {
    // a wall that is no thin line (a wall block, an arcade cabinet's wall) is a building
    if (kind === CK.WALL && Math.min(wx, wy) >= 0.6 * Math.max(wx, wy)) return void out.push(CK.BUILDING, p.x0, p.y0, p.x1, p.y1, NaN, NaN);
    const alongX = wx >= wy, t = Math.max(0.04, (alongX ? wy : wx) / 2);
    return void out.push(kind, alongX ? p.x0 : cx, alongX ? cy : p.y0, alongX ? p.x1 : cx, alongX ? cy : p.y1, Math.min(t, 0.6), 0);
  }
  if (kind === CK.TREE) return void out.push(CK.TREE, cx, cy, Math.max(0.4, p.across / 2 * 0.9), p.conifer ? 0.5 : 1, 0, 0);
  if (kind === CK.BUSH) return void out.push(CK.BUSH, cx, cy, Math.max(0.25, p.across / 2 * 0.8), 0, 0, 0);
  // a building is at least a small shed (a pin flag or a sign drawn as a building block is not)
  if (wx * wy < 2) return;
  out.push(CK.BUILDING, p.x0, p.y0, p.x1, p.y1, p.door ? p.door.x : NaN, p.door ? p.door.y : NaN);
}
/** a building's door: the middle of the footprint's side that faces the nearest road point (q), on that side; null without a road near */
export function doorToward(x0: number, y0: number, x1: number, y1: number, q: { x: number; y: number } | null): { x: number; y: number } | null {
  if (!q) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = q.x - cx, dy = q.y - cy;
  // the side whose outward normal leans most toward the road (scaled by the footprint's half sizes, so a long front wins over a short end)
  const hx = (x1 - x0) / 2 || 1e-6, hy = (y1 - y0) / 2 || 1e-6;
  return Math.abs(dx) / hx >= Math.abs(dy) / hy ? { x: dx > 0 ? x1 : x0, y: cy } : { x: cx, y: dy > 0 ? y1 : y0 };
}
/** the ground-pixel width of a picture across (world px at the native scale, times its scale) as tiles on the ground: a circle r tiles round
 *  is 2 r x 64 sqrt 2 px wide on screen */
export const pxAcross = (px: number) => px / (64 * Math.SQRT2);
