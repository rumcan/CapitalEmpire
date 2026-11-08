/** T338 (#965; the owner, 2026-11-04: "fix the water that cant build on the maps river. they should connnect not build over eachother"): the
 *  map's own water (the river and the creeks from the terrain), as the ground draws it (terrain-paint.ts waterShape at extra 0: a disc at each
 *  centreline point, a trapezoid between each two; a creek's water is its width times SWAMP.water), so the course's water can join it:
 *  - the Course brush never lays water on a cell of the map's water the course leaves bare (it is water already: painting over the river is a
 *    no-op, and erasing next to it leaves the river as it was), paint-tool.ts gridOpts;
 *  - a course chunk's water reaches into the map's water where it meets it (joinCells: the bare cells of the map's water within JOIN_REACH of
 *    the course's water count as water while the chunk's outlines are made), its edges there are dropped (no wall, bank, feather or shore where
 *    the two meet: joinEdges), and the renderer keeps the course's water off the map's water there (CourseLayer.join), so the two read as one.
 *  Pure TypeScript, no DOM. Units: tiles of 2 m; course cells of 1 m (CELL_T). */
import { CELL_T, SURF, type Grid } from './ext/course-grid';

/** a run of the map's water: flat (x, y, r) triples along a waterway's centreline, r its water's half width there (tiles) */
export type WaterRun = ArrayLike<number>;
/** how far the course's water reaches into the map's water it meets, cells (its outline then runs on into the map's water, not round short of it) */
export const JOIN_REACH = 2;
/** how near a bare cell of the map's water an edge of the course's water is dropped, cells (the seam, and the last of a shore that meets it) */
export const JOIN_EDGE = 1.5;
/** how far inside the map's water's edge the renderer keeps the course's water off it, tiles (the course's water covers the soft edge) */
export const JOIN_INSET = 0.1;
/** the seam's fade: the course's water drawn on into the map's water in bands JOIN_FADE_STEP tiles wide, at these alphas (the renderer) */
export const JOIN_FADE: readonly number[] = [0.6, 0.35, 0.15], JOIN_FADE_STEP = 0.2;
/** the bucket side of the segment index, tiles */
const BUCKET = 16;

/** the map's waterways as runs (x, y, r): r = half its width times scale(kind) (a river 1, a creek SWAMP.water); with box, only the stretches
 *  within pad of it (a point either side kept, so each kept segment is whole) */
export function waterRuns(waters: readonly { kind: string; pts: readonly { x: number; y: number; w: number }[] }[], scale: (kind: string) => number, box?: readonly number[], pad = 0): number[][] {
  const out: number[][] = [];
  for (const w of waters) {
    const k = scale(w.kind), p = w.pts, n = p.length; if (!n || !(k > 0)) continue;
    const r = (i: number) => Math.max(0.05, (p[i]!.w / 2) * k);
    // a point's disc, or the segment from point i to i + 1 (its box grown by its wider end), within pad of the box
    const hit = (x0: number, y0: number, x1: number, y1: number) => !box || (x1 >= box[0]! - pad && x0 <= box[2]! + pad && y1 >= box[1]! - pad && y0 <= box[3]! + pad);
    const disc = (i: number) => hit(p[i]!.x - r(i), p[i]!.y - r(i), p[i]!.x + r(i), p[i]!.y + r(i));
    const seg = (i: number) => { if (i < 0 || i + 1 >= n) return false; const a = p[i]!, b = p[i + 1]!, g = Math.max(r(i), r(i + 1)); return hit(Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g); };
    let run: number[] | null = null;
    for (let i = 0; i < n; i++) {
      // a segment that is near keeps both its ends
      const keep = disc(i) || seg(i - 1) || seg(i);
      if (keep) { (run ??= []).push(p[i]!.x, p[i]!.y, r(i)); } else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}

/** the map's water as a point test: its discs and trapezoids (waterShape's) in buckets */
export class MapWater {
  /** per primitive: kind 0 a disc (x, y, r) or 1 a trapezoid (ax, ay, ra, bx, by, rb), then its box (x0, y0, x1, y1) */
  private prims: Float64Array;
  private buckets = new Map<number, number[]>();
  readonly empty: boolean;
  /** the box of all of it (tiles; empty: an inverted box) */
  readonly box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  static readonly STRIDE = 11;
  constructor(runs: readonly WaterRun[]) {
    const S = MapWater.STRIDE, out: number[] = [], b = this.box;
    const add = (kind: number, ax: number, ay: number, ra: number, bx: number, by: number, rb: number) => {
      const g = Math.max(ra, rb), x0 = Math.min(ax, bx) - g, y0 = Math.min(ay, by) - g, x1 = Math.max(ax, bx) + g, y1 = Math.max(ay, by) + g;
      out.push(kind, ax, ay, ra, bx, by, rb, x0, y0, x1, y1);
      if (x0 < b[0]) b[0] = x0; if (y0 < b[1]) b[1] = y0; if (x1 > b[2]) b[2] = x1; if (y1 > b[3]) b[3] = y1;
    };
    for (const p of runs) {
      const n = Math.floor(p.length / 3);
      for (let i = 0; i < n; i++) add(0, p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!, p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
      for (let i = 0; i + 1 < n; i++) if (Math.hypot(p[3 * i + 3]! - p[3 * i]!, p[3 * i + 4]! - p[3 * i + 1]!) > 1e-6) add(1, p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!, p[3 * i + 3]!, p[3 * i + 4]!, p[3 * i + 5]!);
    }
    this.prims = Float64Array.from(out); this.empty = out.length === 0;
    for (let o = 0; o < out.length; o += S) {
      for (let cy = Math.floor(out[o + 8]! / BUCKET); cy <= Math.floor(out[o + 10]! / BUCKET); cy++) for (let cx = Math.floor(out[o + 7]! / BUCKET); cx <= Math.floor(out[o + 9]! / BUCKET); cx++) {
        const k = (cy + 64) * 8192 + cx + 64, l = this.buckets.get(k); if (l) l.push(o); else this.buckets.set(k, [o]);
      }
    }
  }
  /** whether the box (tiles, grown by pad) can hold any of it */
  near(x0: number, y0: number, x1: number, y1: number, pad = 0): boolean {
    const b = this.box; if (this.empty || x1 + pad < b[0] || x0 - pad > b[2] || y1 + pad < b[1] || y0 - pad > b[3]) return false;
    return this.prim(x0 - pad, y0 - pad, x1 + pad, y1 + pad).length > 0;
  }
  /** the primitives (offsets) whose boxes touch the tile box, each once, in order */
  private prim(x0: number, y0: number, x1: number, y1: number): number[] {
    const s = this.prims, seen = new Set<number>();
    for (let cy = Math.floor(y0 / BUCKET); cy <= Math.floor(y1 / BUCKET); cy++) for (let cx = Math.floor(x0 / BUCKET); cx <= Math.floor(x1 / BUCKET); cx++) {
      for (const o of this.buckets.get((cy + 64) * 8192 + cx + 64) ?? []) if (s[o + 7]! <= x1 && s[o + 9]! >= x0 && s[o + 8]! <= y1 && s[o + 10]! >= y0) seen.add(o);
    }
    return [...seen].sort((a, b) => a - b);
  }
  /** whether tile point (x, y) lies in the map's water, its edge moved out by grow tiles (negative: in) */
  at(x: number, y: number, grow = 0): boolean {
    const s = this.prims, g = Math.max(0, grow);
    // (grown out, a piece in a neighbouring bucket can reach the point: the buckets under the point's box grown alike)
    for (let by = Math.floor((y - g) / BUCKET); by <= Math.floor((y + g) / BUCKET); by++) for (let bx = Math.floor((x - g) / BUCKET); bx <= Math.floor((x + g) / BUCKET); bx++) {
      for (const o of this.buckets.get((by + 64) * 8192 + bx + 64) ?? []) {
        if (x < s[o + 7]! - g || x > s[o + 9]! + g || y < s[o + 8]! - g || y > s[o + 10]! + g) continue;
        if (inPrim(s, o, x, y, grow)) return true;
      }
    }
    return false;
  }
  /** the primitives touching the tile box as shapes for a clip (each convex: a disc or a trapezoid), their edges moved out by grow (negative:
   *  in): discs as [x, y, r], trapezoids as their four corners [x0, y0, ... x3, y3] */
  shapes(x0: number, y0: number, x1: number, y1: number, grow = 0): number[][] {
    const s = this.prims, out: number[][] = [];
    for (const o of this.prim(x0, y0, x1, y1)) {
      const ax = s[o + 1]!, ay = s[o + 2]!, ra = s[o + 3]! + grow, bx = s[o + 4]!, by = s[o + 5]!, rb = s[o + 6]! + grow;
      if (s[o] === 0) { if (ra > 0) out.push([ax, ay, ra]); continue; }
      const l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l, ny = (bx - ax) / l;
      if (ra <= 0 && rb <= 0) continue;
      const qa = Math.max(0, ra), qb = Math.max(0, rb);
      out.push([bx - nx * qb, by - ny * qb, bx + nx * qb, by + ny * qb, ax + nx * qa, ay + ny * qa, ax - nx * qa, ay - ny * qa]);
    }
    return out;
  }
}

/** whether (x, y) lies in primitive o of s, grown by grow (WaterField.waterway's test: a disc, or within the trapezoid's half width at its t) */
function inPrim(s: Float64Array, o: number, x: number, y: number, grow: number): boolean {
  const ax = s[o + 1]!, ay = s[o + 2]!, ra = s[o + 3]! + grow;
  if (s[o] === 0) { const dx = x - ax, dy = y - ay; return ra > 0 && dx * dx + dy * dy <= ra * ra; }
  const bx = s[o + 4]!, by = s[o + 5]!, rb = s[o + 6]! + grow, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const t = ((x - ax) * ux + (y - ay) * uy) / len; if (t < 0 || t > 1) return false;
  return Math.abs((x - ax) * uy - (y - ay) * ux) <= ra + (rb - ra) * t;
}

/** whether cell i of g is the map's water the course leaves bare (none on the course, its centre in the map's water): the Course brush lays no
 *  water there, and the course's water meeting it joins it */
export function bareMapWater(g: Grid, i: number, water: MapWater): boolean {
  if (g.surf[i] !== SURF.none) return false;
  const cx = i % g.w, cy = (i - cx) / g.w;
  return water.at(g.x0 + (cx + 0.5) * CELL_T, g.y0 + (cy + 0.5) * CELL_T);
}

/** the join of the course's water with the map's over a tile box (a course chunk's, grown by the reach its outlines read): the cells to count as
 *  water while its outlines are made (ext: bare cells of the map's water within JOIN_REACH cells of a water cell of g, each with the hole of
 *  the nearest such cell), every bare cell of the map's water in the box (bare: for joinEdges), and the box of ext (tiles; the renderer keeps
 *  the course's water off the map's there). null when the box holds no join */
export interface Join { ext: Int32Array; hole: Uint8Array; bare: Set<number>; box: [number, number, number, number] }
export function joinCells(g: Grid, box: readonly number[], water: MapWater | null | undefined): Join | null {
  if (!water || water.empty || !water.near(box[0]!, box[1]!, box[2]!, box[3]!, (JOIN_REACH + 1) * CELL_T)) return null;
  const K = JOIN_REACH, i0 = Math.max(0, Math.floor((box[0]! - g.x0) / CELL_T) - K), j0 = Math.max(0, Math.floor((box[1]! - g.y0) / CELL_T) - K);
  const i1 = Math.min(g.w - 1, Math.ceil((box[2]! - g.x0) / CELL_T) + K), j1 = Math.min(g.h - 1, Math.ceil((box[3]! - g.y0) / CELL_T) + K);
  if (i1 < i0 || j1 < j0) return null;
  // (no course water in reach: no join, and no cell asked of the map's water; most chunks by the river)
  let wet = false;
  for (let j = j0; j <= j1 && !wet; j++) for (let i = i0, o = j * g.w; i <= i1; i++) if (g.surf[o + i] === SURF.water) { wet = true; break; }
  if (!wet) return null;
  const bare = new Set<number>(), ext: number[] = [], hole: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * g.w + i; if (!bareMapWater(g, c, water)) continue;
    bare.add(c);
    // the nearest water cell within K (by distance; the first found at the least)
    let best = -1, bd = Infinity;
    for (let dj = -K; dj <= K; dj++) for (let di = -K; di <= K; di++) {
      const d2 = di * di + dj * dj, ii = i + di, jj = j + dj; if (d2 > K * K || d2 >= bd || ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue;
      const q = jj * g.w + ii; if (g.surf[q] === SURF.water) { best = q; bd = d2; }
    }
    if (best < 0) continue;
    ext.push(c); hole.push(g.hole[best]!);
    const x = g.x0 + i * CELL_T, y = g.y0 + j * CELL_T;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + CELL_T > x1) x1 = x + CELL_T; if (y + CELL_T > y1) y1 = y + CELL_T;
  }
  if (!ext.length) return null;
  return { ext: Int32Array.from(ext), hole: Uint8Array.from(hole), bare, box: [x0, y0, x1, y1] };
}

/** runs fn with the join's cells laid as water on g (surface and hole; in place), then puts them back */
export function withJoin<T>(g: Grid, j: Join | null, fn: () => T): T {
  if (!j) return fn();
  const n = j.ext.length, s0 = new Uint8Array(n), h0 = new Uint8Array(n);
  for (let k = 0; k < n; k++) { const c = j.ext[k]!; s0[k] = g.surf[c]!; h0[k] = g.hole[c]!; g.surf[c] = SURF.water; g.hole[c] = j.hole[k]!; }
  try { return fn(); } finally { for (let k = 0; k < n; k++) { const c = j.ext[k]!; g.surf[c] = s0[k]!; g.hole[c] = h0[k]!; } }
}

/** the course's water edges (flat x, y polylines, tiles; a closed one repeats its first point) with every point within JOIN_EDGE cells of a bare
 *  cell of the map's water dropped (the seam where the two meet, and the last of a shore running into it): the rest as polylines of two or
 *  more points, a closed one that lost points opened where it did */
export function joinEdges(g: Grid, edges: readonly (readonly number[])[], j: Join | null): number[][] {
  if (!j) return edges.map(e => [...e]);
  const R = JOIN_EDGE, R2 = R * R, r = Math.ceil(R);
  const near = (x: number, y: number) => {
    const u = (x - g.x0) / CELL_T, v = (y - g.y0) / CELL_T, ci = Math.floor(u), cj = Math.floor(v);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, jj = cj + dj; if (i < 0 || jj < 0 || i >= g.w || jj >= g.h || !j.bare.has(jj * g.w + i)) continue;
      const du = u - (i + 0.5), dv = v - (jj + 0.5); if (du * du + dv * dv <= R2) return true;
    }
    return false;
  };
  const out: number[][] = [], STEP = 0.25;
  for (const e of edges) {
    const n = e.length >> 1; if (n < 2) continue;
    const closed = n > 2 && e[0] === e[2 * n - 2] && e[1] === e[2 * n - 1];
    // each segment walked in steps of STEP (a long straight run keeps its share up to the seam): its points with their drop flags
    const px: number[] = [], py: number[] = [], dp: boolean[] = [];
    let any = false;
    const put = (x: number, y: number) => { const d = near(x, y); px.push(x); py.push(y); dp.push(d); any ||= d; };
    put(e[0]!, e[1]!);
    for (let k = 1; k < n; k++) {
      const ax = e[2 * k - 2]!, ay = e[2 * k - 1]!, bx = e[2 * k]!, by = e[2 * k + 1]!, ns = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP));
      const flags: boolean[] = []; for (let q = 1; q <= ns; q++) flags.push(near(ax + ((bx - ax) * q) / ns, ay + ((by - ay) * q) / ns));
      // a segment wholly kept between kept ends: its end alone
      if (!flags.some(f => f) && !dp[dp.length - 1]) { px.push(bx); py.push(by); dp.push(false); continue; }
      for (let q = 1; q <= ns; q++) { px.push(ax + ((bx - ax) * q) / ns); py.push(ay + ((by - ay) * q) / ns); dp.push(flags[q - 1]!); any ||= flags[q - 1]!; }
    }
    if (!any) { out.push([...e]); continue; }
    // a closed one: walked from just after a dropped point, so a run over its join is not split in two
    const m = closed ? px.length - 1 : px.length, start = closed ? (dp.indexOf(true) + 1) % m : 0;
    let run: number[] = [];
    const flush = () => { if (run.length >= 4) out.push(run); run = []; };
    for (let t = 0; t < m; t++) { const k = (start + t) % m; if (dp[k]) flush(); else run.push(px[k]!, py[k]!); }
    flush();
  }
  return out;
}
