// Pond edges (T231, #671; docs/art/CONCEPT-LOOK.md step 5, the owner's concept look, 2026-10-27: "water with stone edges ... in town, a round
// pond with a fountain jet"). A pond is a body of still water: the course's water cells and the painted water areas, read on the course grid's
// 1 m lattice (CELL tiles). Its edge style is Natural (today's look: nothing is added) or Stones: the pond-edge boulder pieces (kit.ts
// KIT_POND_EDGE) laid round its shore by themselves, with corner clusters where the shore turns, and lily pads (KIT_LILIES) scattered on its
// still water away from the edge. A pond is Stones when one of the saved marks (GolfSave.ponds) stands in it; the engine lays the pieces again
// whenever the water changes, keeping the ones that did not move (pondKey). Nothing lands on land: every piece's footprint lies on the pond's own
// water (a run piece in the cell row along the shore, a corner cluster in its corner cell, a lily cluster at least LILY_EDGE cells from the edge).
// Deterministic: the pieces from the pond's cells alone, the lily pads from a world lattice (a change elsewhere in the pond moves none of them).
// Pure TS, no DOM; units are tiles (2 m) unless named.
// T234 (#683): the rim is not a ring wall. Each long stretch of shore is laid as a seeded rhythm of run pieces of varied size (0.8 to 1.2 of
// the mean), standing in from the shore line by varied amounts, with short gaps (10 to 20% of the stretch) where the grass meets the water:
// a tuft of plume grass in most, a single boulder in some. The corners are as they were. The seed is the stretch's own place on the world
// lattice, so a change elsewhere in the pond moves none of it.
import { mulberry } from '../iso';
import { KIT_BOULDERS, KIT_FLOWERS, KIT_LILIES, KIT_PLUME, KIT_POND_EDGE, KIT_SHRUBS } from '../kit';

/** the lattice: a cell is 0.5 tile (1 m), the course grid's */
export const CELL = 0.5;
/** the most cells a pond may have (6 ha): bigger water (the map's lakes) gets no edge */
export const POND_MAX_CELLS = 60000;
/** a water sampler: is cell (cx, cy) of the world lattice water (cell cx covers tiles [cx * CELL, (cx + 1) * CELL)) */
export type Wet = (cx: number, cy: number) => boolean;

/** a pond: its cells as a mask over its box (x0, y0 the first cell; w, h cells), how many, and the water sampler it was found in (any water, this pond's
 *  or another body's: the rim's planting keeps off all of it) */
export interface Pond { x0: number; y0: number; w: number; h: number; mask: Uint8Array; cells: number; wet?: Wet }
/** a piece the edge lays: a library id, its footprint's centre (tiles) and its scale */
export interface PondPiece { id: string; x: number; y: number; s: number }

const cellOf = (v: number) => Math.floor(v / CELL);
/** the pond at tile (x, y): its connected water cells (4-neighbours), or null when the cell is dry or the water has more than max cells */
export function pondAt(x: number, y: number, wet: Wet, max = POND_MAX_CELLS): Pond | null {
  const sx = cellOf(x), sy = cellOf(y);
  if (!wet(sx, sy)) return null;
  const K = 1 << 16, key = (cx: number, cy: number) => (cy + 32768) * K + (cx + 32768);
  const seen = new Set<number>([key(sx, sy)]), stack = [sx, sy];
  let x0 = sx, y0 = sy, x1 = sx, y1 = sy;
  while (stack.length) {
    const cy = stack.pop()!, cx = stack.pop()!;
    x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      const k = key(nx, ny); if (seen.has(k) || !wet(nx, ny)) continue;
      seen.add(k); if (seen.size > max) return null;
      stack.push(nx, ny);
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h);
  for (const k of seen) { const cx = (k % K) - 32768, cy = Math.floor(k / K) - 32768; mask[(cy - y0) * w + (cx - x0)] = 1; }
  return { x0, y0, w, h, mask, cells: seen.size, wet };
}
/** is cell (cx, cy) (world lattice) part of the pond */
export function inPond(p: Pond, cx: number, cy: number): boolean {
  const i = cx - p.x0, j = cy - p.y0; return i >= 0 && j >= 0 && i < p.w && j < p.h && p.mask[j * p.w + i] === 1;
}
/** a pond's identity: its first cell in row order (two marks in one pond lay it once) */
export function pondId(p: Pond): number { for (let k = 0; k < p.mask.length; k++) if (p.mask[k]) return (p.y0 + Math.floor(k / p.w)) * 65536 + p.x0 + (k % p.w); return -1; }

/** a pond under this many cells (about 22 m across) is edged with medium boulders and a few plants only: the large ones would cover a small
 *  pond's water */
export const BIG_POND_CELLS = 500;
/** the smallest pond that gets an edge (cells): a puddle gets none */
export const POND_MIN_CELLS = 12;

/** the biggest a boulder (or fill, or plant) may stand out onto land from the shore: 0.5 tile (1 m). The rule is judged on the footprint: no point of it
 *  lies further than this from the pond's water (tests/ponds.test.ts checks it with its own sampling). The rim lays at LAND_REACH - REACH_SLACK. */
export const LAND_REACH = 0.5, REACH_SLACK = 0.03;
/** the planting stands on the bank: no point of its footprint on any water, and none of it further than this (tiles) from the pond's water */
export const PLANT_REACH = 2, PLANT_MAX_C = 1.2;

/** T234 part 2 (#683), the boulder-led rim. The shore (the pond's outline, walked as the contour of its cells) is cut into runs where it crosses a line of
 *  the world lattice every RIM_BLOCK cells (so a run is laid from its own place: a change elsewhere moves none of it), and each run is strung with
 *  boulders. RIM_LARGE, RIM_MEDIUM: the scale of a large (about 2 m) or a medium (1.2 m) boulder; RIM_LARGE_SHARE: of the boulders in a pond of
 *  BIG_POND_CELLS or more, the share that are large (a smaller pond takes mediums, a little smaller: RIM_SMALL_POND); RIM_GAP: the free metres
 *  (tiles) between two boulders' footprints; RIM_BREAK: the chance of a longer break after a boulder, of length RIM_BREAK_LEN (tiles; a fill and
 *  plants stand in it); RIM_IN: a boulder's centre from the shore line (tiles into the water; negative is onto the bank). */
export const RIM_BLOCK = 20;
export const RIM_LARGE: readonly [number, number] = [0.72, 1.0], RIM_MEDIUM: readonly [number, number] = [0.9, 1.3], RIM_SMALL_POND: readonly [number, number] = [0.8, 1.1];
export const RIM_LARGE_SHARE = 0.45, RIM_SMALL_GAP = 2;
export const RIM_GAP: readonly [number, number] = [0.05, 0.45], RIM_BREAK = 0.2, RIM_BREAK_LEN: readonly [number, number] = [1.5, 2.6], RIM_IN: readonly [number, number] = [-0.05, 0.18];
/** the small-stone run piece (KIT_POND_EDGE.x / .y, 4 tiles long a piece at scale 1) as a short fill in a break: its scale (RIM_FILL, 1.2 to 2.2 tiles long),
 *  the share of the breaks of a straight shore that take one, and the most of a run's length they may cover */
export const RIM_FILL: readonly [number, number] = [0.3, 0.55], FILL_SHARE = 0.75, FILL_COVER = 0.3, RIM_FILL_MIN = 1.45;
/** planting: plants a tile of free shore (between the boulders), the share kept in a small pond, and the kinds (plume grass, a shrub, mums) */
export const PLANT_PER_FREE = 0.5, PLANT_FREE_MIN = 0.6, PLANT_JOINT = 0.4, PLANT_JOINT_MAX = 1.6, PLANT_SMALL_POND = 0.8, PLANT_PLUME = 0.3, PLANT_SHRUB = 0.4;
/** a plant's scale: shrubs and plume grass, mums */
export const PLANT_SCALE: readonly [number, number] = [1.0, 1.5], MUMS_SCALE: readonly [number, number] = [1.2, 1.9];
/** a footprint's side in tiles at scale 1 (the library's box: kit:shrub-plume-grass 0.525, small boulders 0.32, medium 0.6, large 1; the shrubs 0.35
 *  to 0.525, the mums 0.25): what the rim is fitted by (tests/ponds.test.ts checks them against the library) */
export const PLUME_FOOT = 0.525, BOULDER_FOOT = { small: 0.32, medium: 0.6, large: 1 } as const;
export const PLANT_FOOT: Readonly<Record<string, number>> = {
  'kit:shrub-burning-bush': 0.525, 'kit:shrub-golden-spirea': 0.42, 'kit:shrub-boxwood-ball': 0.35, 'kit:shrub-red-twig-dogwood': 0.525, 'kit:shrub-blue-juniper': 0.42, 'kit:shrub-plume-grass': PLUME_FOOT,
  'kit:flowers-mums-red': 0.25, 'kit:flowers-mums-yellow': 0.25, 'kit:flowers-mums-orange': 0.25, 'kit:flowers-mums-white': 0.25, 'kit:flowers-mums-bronze': 0.25, 'kit:flowers-black-eyed-susans': 0.25,
};
/** a 32-bit hash of a lattice square (the lily pads' world lattice: a pond's pads stay put when it changes elsewhere; the rim's runs the same) */
const hash2 = (a: number, b: number) => { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

/** a run of the shore: the lattice vertices (cell corners) of a stretch of the pond's outline, in order, the water on the right hand (the map's y down),
 *  consecutive vertices a cell apart. closed: the run is a whole loop (it starts and ends at the same vertex) */
export interface ShoreRun { vx: number[]; vy: number[]; closed: boolean }
/** the pond's outline as runs (see RIM_BLOCK): the cell sides between the pond's water and dry cells, linked into loops (at a pinch, where two water
 *  cells meet at a corner, keeping to the water on the right), each loop cut where the water cell on its sides changes block. Deterministic, and a
 *  run depends only on the water in and just round its own block. */
export function shoreRuns(p: Pond): ShoreRun[] {
  const at = (cx: number, cy: number) => inPond(p, cx, cy);
  // the cell sides, each from a to (a + d), the water on the right
  const ax: number[] = [], ay: number[] = [], dx: number[] = [], dy: number[] = [], bk: number[] = [];
  const startAt = new Map<number, number[]>(), vkey = (x: number, y: number) => (y + 32768) * 65536 + (x + 32768);
  const add = (x: number, y: number, ddx: number, ddy: number, cx: number, cy: number) => {
    const e = ax.length; ax.push(x); ay.push(y); dx.push(ddx); dy.push(ddy); bk.push(Math.floor(cy / RIM_BLOCK) * 4096 + Math.floor(cx / RIM_BLOCK));
    const k = vkey(x, y), l = startAt.get(k); if (l) l.push(e); else startAt.set(k, [e]);
  };
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    if (!p.mask[j * p.w + i]) continue;
    const cx = p.x0 + i, cy = p.y0 + j;
    if (!at(cx, cy - 1)) add(cx, cy, 1, 0, cx, cy);
    if (!at(cx + 1, cy)) add(cx + 1, cy, 0, 1, cx, cy);
    if (!at(cx, cy + 1)) add(cx + 1, cy + 1, -1, 0, cx, cy);
    if (!at(cx - 1, cy)) add(cx, cy + 1, 0, -1, cx, cy);
  }
  // the side that follows e: the sharpest turn to the right from the vertex it ends at, else straight on, else left
  const next = new Int32Array(ax.length).fill(-1);
  for (let e = 0; e < ax.length; e++) {
    const c = startAt.get(vkey(ax[e]! + dx[e]!, ay[e]! + dy[e]!)); if (!c) continue;
    const want = [[-dy[e]!, dx[e]!], [dx[e]!, dy[e]!], [dy[e]!, -dx[e]!]] as const;
    for (const [wx, wy] of want) { const f = c.find(g => dx[g] === wx && dy[g] === wy); if (f !== undefined) { next[e] = f; break; } }
  }
  const runs: ShoreRun[] = [], seen = new Uint8Array(ax.length);
  const make = (edges: number[], closed: boolean): ShoreRun => {
    const vx = [ax[edges[0]!]!], vy = [ay[edges[0]!]!];
    for (const e of edges) { vx.push(ax[e]! + dx[e]!); vy.push(ay[e]! + dy[e]!); }
    return { vx, vy, closed };
  };
  for (let s = 0; s < ax.length; s++) {
    if (seen[s]) continue;
    const loop: number[] = []; for (let e = s; e >= 0 && !seen[e]; e = next[e]!) { seen[e] = 1; loop.push(e); }
    const n = loop.length; if (!n) continue;
    // the places the loop changes block: a run starts at each
    const starts: number[] = []; for (let i = 0; i < n; i++) if (bk[loop[i]!] !== bk[loop[(i + n - 1) % n]!]) starts.push(i);
    if (!starts.length) {
      // a loop inside one block: from its first side in scan order (the sides were made in row order, so the lowest index is it)
      let lo = 0; for (let i = 1; i < n; i++) if (loop[i]! < loop[lo]!) lo = i;
      runs.push(make([...loop.slice(lo), ...loop.slice(0, lo)], true)); continue;
    }
    for (let k = 0; k < starts.length; k++) {
      const a = starts[k]!, b = k + 1 < starts.length ? starts[k + 1]! : starts[0]! + n, edges: number[] = [];
      for (let i = a; i < b; i++) edges.push(loop[i % n]!);
      runs.push(make(edges, false));
    }
  }
  return runs;
}

/** a boulder by a dice roll: in a pond of BIG_POND_CELLS or more large ones (RIM_LARGE_SHARE of them), else mediums; id and scale */
const boulderOf = (big: boolean, r: () => number): { id: string; foot: number; s: number } => {
  const isLarge = big && r() < RIM_LARGE_SHARE, shape = Math.min(2, Math.floor(r() * 3)), u = r();
  const range = isLarge ? RIM_LARGE : big ? RIM_MEDIUM : RIM_SMALL_POND;
  return isLarge ? { id: KIT_BOULDERS.large[shape]!, foot: BOULDER_FOOT.large, s: range[0] + (range[1] - range[0]) * u } : { id: KIT_BOULDERS.medium[shape]!, foot: BOULDER_FOOT.medium, s: range[0] + (range[1] - range[0]) * u };
};

/** The rim of a pond's shore: boulders (item 36, large and medium) strung along it, half on the bank and half in the water, a boulder every 1.5 to
 *  3 m with now and then a longer break, short fills of the small stones (the pond-edge run pieces, at most FILL_COVER of a run) in some breaks of a
 *  straight shore, and planting (plume grass, shrubs, mums) on the bank in the gaps, about a plant to each 3 to 5 m. A small pond (under
 *  BIG_POND_CELLS) takes mediums and a few plants. Each run of the shore (shoreRuns) is laid from its own place on the lattice. A boulder, a fill or
 *  a plant never stands more than LAND_REACH out onto land; a plant is wholly on the bank, within PLANT_REACH of the water. Empty for a pond under
 *  POND_MIN_CELLS. */
export function shorePieces(p: Pond): PondPiece[] {
  if (p.cells < POND_MIN_CELLS) return [];
  const out: PondPiece[] = [], big = p.cells >= BIG_POND_CELLS, E = KIT_POND_EDGE, LIM = LAND_REACH - REACH_SLACK;
  const at = (cx: number, cy: number) => inPond(p, cx, cy), dry = (cx: number, cy: number) => !at(cx, cy) && !(p.wet !== undefined && p.wet(cx, cy));
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  /** the distance (tiles) from a point to the pond's nearest water cell: 0 on water, Infinity past a tile */
  const toWater = (x: number, y: number): number => {
    const cx = cellOf(x), cy = cellOf(y); if (at(cx, cy)) return 0;
    let best = Infinity;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      if (!at(cx + i, cy + j)) continue;
      const rx = (cx + i) * CELL, ry = (cy + j) * CELL, ex = Math.max(rx - x, 0, x - rx - CELL), ey = Math.max(ry - y, 0, y - ry - CELL), d = Math.hypot(ex, ey);
      if (d < best) best = d;
    }
    return best;
  };
  /** the footprint [x0, x1] x [y0, y1]: the furthest any sampled point lies from the pond's water (stops once past LIM), and whether any is on water */
  const sample = (x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => boolean) => {
    const e = 0.001, nx = Math.max(1, Math.ceil((x1 - x0) / 0.1)), ny = Math.max(1, Math.ceil((y1 - y0) / 0.1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) if (f(x0 + e + (x1 - x0 - 2 * e) * i / nx, y0 + e + (y1 - y0 - 2 * e) * j / ny)) return true;
    return false;
  };
  const reachOk = (x0: number, y0: number, x1: number, y1: number) => !sample(x0, y0, x1, y1, (x, y) => toWater(x, y) > LIM);
  const onWater = (x0: number, y0: number, x1: number, y1: number) => sample(x0, y0, x1, y1, (x, y) => !dry(cellOf(x), cellOf(y)));
  const bankOk = (x0: number, y0: number, x1: number, y1: number) => !onWater(x0, y0, x1, y1);
  for (const run of shoreRuns(p)) {
    const n = run.vx.length - 1, L = n * CELL; if (n < 1) continue;
    const rnd = mulberry(hash2(run.vx[0]! * 4 + (run.vy[1]! - run.vy[0]! > 0 ? 1 : 0) + (run.vx[1]! - run.vx[0]! > 0 ? 2 : 0), run.vy[0]!)), mix = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * rnd();
    const ex = (i: number) => run.vx[i + 1]! - run.vx[i]!, ey = (i: number) => run.vy[i + 1]! - run.vy[i]!;
    /** the contour point at arc length t (tiles) from the run's start, and the side it lies on */
    const pt = (t: number) => { const i = Math.min(n - 1, Math.max(0, Math.floor(t / CELL + 1e-9))), f = t - i * CELL; return { x: run.vx[i]! * CELL + ex(i) * f, y: run.vy[i]! * CELL + ey(i) * f, i }; };
    /** the way into the water at a contour point (a unit vector): across the side, or, where the shore bends, toward the water about it */
    const into = (q: { x: number; y: number; i: number }): [number, number] => {
      const ux = -ey(q.i), uy = ex(q.i), cx0 = cellOf(q.x), cy0 = cellOf(q.y); let sx = 0, sy = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        if (!at(cx0 + i, cy0 + j)) continue;
        const vx = (cx0 + i + 0.5) * CELL - q.x, vy = (cy0 + j + 0.5) * CELL - q.y; if (vx * vx + vy * vy <= 0.5625) { sx += vx; sy += vy; }
      }
      const m = Math.hypot(sx, sy); if (m < 1e-6) return [ux, uy];
      return (sx * ux + sy * uy) / m > 0.9 ? [ux, uy] : [sx / m, sy / m];
    };
    /** the water's width (tiles) from a contour point along a direction, to the first dry cell (3 at most) */
    const width = (q: { x: number; y: number }, d: [number, number]) => { let w = 0.05; while (w < 3 && at(cellOf(q.x + d[0] * w), cellOf(q.y + d[1] * w))) w += 0.1; return w; };
    // the boulders, strung along the run: each placed where the chord from the last one reaches the room its footprint needs
    interface Bead { t: number; h: number; x: number; y: number }
    const beads: Bead[] = [];
    let last: { x: number; y: number; t: number; F: number } | null = null, from = 0;
    for (let guard = 0; guard < 400; guard++) {
      const b = boulderOf(big, rnd), F = b.foot * b.s, h = F / 2, gap = mix(RIM_GAP) * (big ? 1 : RIM_SMALL_GAP), brk = rnd() < RIM_BREAK ? mix(RIM_BREAK_LEN) : 0, inn = mix(RIM_IN), start = mix([0, 0.2]);
      let t: number;
      if (!last) t = Math.max(from, start + h);
      else { const need = 0.9 * (last.F + F) / 2 + gap + brk; t = Math.max(from, last.t); while (t <= L) { const q = pt(t); if (Math.hypot(q.x - last.x, q.y - last.y) >= need) break; t += 0.05; } }
      if (t + h > L - 0.03) break;
      const q = pt(t), d = into(q); let placed: PondPiece | null = null;
      for (let k = 0; k < 4 && !placed; k++) {
        const s = r3(b.s * (1 - 0.1 * k)), FF = b.foot * s, hh = FF / 2; if (width(q, d) < 1.25 * FF + 0.1) continue;
        for (let c = inn; c <= hh + 0.1; c += 0.04) { const x = q.x + d[0] * c, y = q.y + d[1] * c; if (reachOk(x - hh, y - hh, x + hh, y + hh)) { placed = { id: b.id, x: r3(x), y: r3(y), s }; break; } }
      }
      if (placed) { out.push(placed); const FF = b.foot * placed.s; beads.push({ t, h: FF / 2, x: q.x, y: q.y }); last = { x: q.x, y: q.y, t, F: FF }; from = t; } else from = t + 0.2;
    }
    // a closed run: its last boulder may not crowd its first
    if (run.closed && beads.length > 1) {
      const a = beads[0]!, z = beads[beads.length - 1]!;
      if (Math.hypot(a.x - z.x, a.y - z.y) < 0.9 * (a.h + z.h)) { beads.pop(); out.pop(); }
    }
    // the free stretches between the boulders (and before the first, after the last): the fills
    const slots: [number, number][] = []; let at0 = 0;
    for (const b of beads) { if (b.t - b.h - at0 >= 0.2) slots.push([at0, b.t - b.h]); at0 = b.t + b.h; }
    if (L - at0 >= 0.2) slots.push([at0, L]);
    let filled = 0;
    /** where the planting goes (arc lengths, each with how far in from the bank's edge it keeps): behind the joints of boulders close together, and spread
     *  along the longer free stretches */
    const spots: [number, number][] = [], keep = big ? 1 : PLANT_SMALL_POND;
    for (let i = 0; i + 1 < beads.length; i++) { const a = beads[i]!, z = beads[i + 1]!, roll = rnd(); if (z.t - a.t < PLANT_JOINT_MAX && roll < PLANT_JOINT * keep) spots.push([(a.t + z.t) / 2, 0]); }
    for (const [t0, t1] of slots) {
      const g = t1 - t0, i0 = Math.floor(t0 / CELL + 1e-9), i1 = Math.min(n - 1, Math.floor((t1 - 1e-6) / CELL));
      // a fill: a short run of the small stones along a straight, axis-aligned stretch of shore
      let straight = g >= RIM_FILL_MIN; for (let i = i0 + 1; i <= i1 && straight; i++) if (ex(i) !== ex(i0) || ey(i) !== ey(i0)) straight = false;
      const roll = rnd(), size = rnd(), spot = rnd(), inn = rnd(); let inFill = false;
      if (straight && roll < FILL_SHARE) {
        const s = r3(Math.min(RIM_FILL[1], (g - 0.12) / E.len) * (0.85 + 0.15 * size)), len = E.len * s, depth = E.depth * s;
        if (s >= RIM_FILL[0] && filled + len <= FILL_COVER * L) {
          const tm = t0 + len / 2 + 0.06 + (g - len - 0.12) * spot, q = pt(tm), d: [number, number] = [-ey(i0), ex(i0)], alongX = ex(i0) !== 0;
          for (let c = depth / 2 - 0.1 + 0.2 * inn; c <= depth / 2 + 0.15; c += 0.04) {
            const x = q.x + d[0] * c, y = q.y + d[1] * c, hx = (alongX ? len : depth) / 2, hy = (alongX ? depth : len) / 2;
            if (width(q, d) >= 1.5 && reachOk(x - hx, y - hy, x + hx, y + hy)) { out.push({ id: alongX ? E.x : E.y, x: r3(x), y: r3(y), s }); filled += len; inFill = true; break; }
          }
        }
      }
      // planting along a free stretch of PLANT_FREE_MIN or more: PLANT_PER_FREE to each tile of it, spread, standing back from a fill
      if (g >= PLANT_FREE_MIN) { const want = Math.floor(PLANT_PER_FREE * keep * g + rnd()); for (let k = 0; k < want; k++) spots.push([t0 + g * (k + 0.5) / want, inFill ? 0.3 : 0]); }
    }
    // the planting: a plume tuft, a shrub or a clump of mums at each spot, on the bank behind the shore line, none on any water
    for (const [tm, back] of spots) {
      const kind = rnd(), pick = rnd(), sz = rnd(), dd = rnd();
      const id = kind < PLANT_PLUME ? KIT_PLUME : kind < PLANT_PLUME + PLANT_SHRUB ? KIT_SHRUBS[Math.floor(pick * (KIT_SHRUBS.length - 1))]! : KIT_FLOWERS[Math.floor(pick * KIT_FLOWERS.length)]!;
      const foot = PLANT_FOOT[id]!, s = r3(foot < 0.3 ? MUMS_SCALE[0] + (MUMS_SCALE[1] - MUMS_SCALE[0]) * sz : PLANT_SCALE[0] + (PLANT_SCALE[1] - PLANT_SCALE[0]) * sz), F = foot * s, h = F / 2;
      const q = pt(Math.min(L, Math.max(0, tm))), d = into(q);
      for (let c = h + 0.04 + back + 0.35 * dd; c <= PLANT_MAX_C; c += 0.05) {
        const x = q.x - d[0] * c, y = q.y - d[1] * c;
        if (bankOk(x - h, y - h, x + h, y + h)) { out.push({ id, x: r3(x), y: r3(y), s }); break; }
      }
    }
  }
  return out;
}


/** lily pads keep at least this many cells from the shore, LILY_GAP tiles apart (one to a lattice square of that side), FOUNTAIN_CLEAR tiles
 *  from a fountain; LILY_SHARE of the squares deep enough hold one */
export const LILY_EDGE = 4, LILY_GAP = 3, FOUNTAIN_CLEAR = 2.5, LILY_SHARE = 0.4;
/** a cluster's size (T234: the art is 2.4 m across at 1, 33 px wide at 30% zoom, which read as a dot: 3.4 to 4.8 m, 50 to 70 px) */
export const LILY_SIZE: readonly [number, number] = [1.4, 2.0];
/** The lily pads of a pond: on the world lattice of LILY_GAP-tile squares, a square whose seeded spot lies on water at least LILY_EDGE cells from
 *  the shore (every cell within that many is water) and FOUNTAIN_CLEAR from every fountain gets a cluster (LILY_SHARE of them), its picture and
 *  size (LILY_SIZE) from the same seed. Deterministic. */
export function lilyPads(p: Pond, fountains: readonly { x: number; y: number }[] = []): PondPiece[] {
  if (p.cells < POND_MIN_CELLS) return [];
  const out: PondPiece[] = [], gx0 = Math.floor(p.x0 * CELL / LILY_GAP), gy0 = Math.floor(p.y0 * CELL / LILY_GAP);
  const gx1 = Math.floor((p.x0 + p.w) * CELL / LILY_GAP), gy1 = Math.floor((p.y0 + p.h) * CELL / LILY_GAP);
  const deep = (cx: number, cy: number) => { for (let dy = -LILY_EDGE; dy <= LILY_EDGE; dy++) for (let dx = -LILY_EDGE; dx <= LILY_EDGE; dx++) if (!inPond(p, cx + dx, cy + dy)) return false; return true; };
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const r = mulberry(hash2(gx, gy)), u = r(), v = r(), keep = r(), pick = r(), size = r();
    if (keep >= LILY_SHARE) continue;
    const x = (gx + 0.1 + 0.8 * u) * LILY_GAP, y = (gy + 0.1 + 0.8 * v) * LILY_GAP;
    if (!deep(cellOf(x), cellOf(y))) continue;
    if (fountains.some(f => (f.x - x) ** 2 + (f.y - y) ** 2 < FOUNTAIN_CLEAR ** 2)) continue;
    out.push({ id: KIT_LILIES[Math.floor(pick * KIT_LILIES.length)]!, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, s: Math.round((LILY_SIZE[0] + (LILY_SIZE[1] - LILY_SIZE[0]) * size) * 1000) / 1000 });
  }
  return out;
}

/** a piece's key (the engine keeps a laid piece whose key is unchanged: only what moved is laid again) */
export const pieceKey = (q: PondPiece): string => `pond:${q.id}:${q.x},${q.y},${q.s}`;

/** the marks as saved (GolfSave.ponds: flat x y pairs, tiles), every pair finite; anything else is dropped */
export function normalizePondMarks(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (let k = 0; k + 1 < v.length; k += 2) { const x = v[k], y = v[k + 1]; if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) out.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100); }
  return out;
}
/** the marks with the pond at (x, y) set to Stones (a mark added at the spot) or Natural (every mark in that pond taken out) */
export function setPondEdge(marks: readonly number[], pond: Pond, stones: boolean, x: number, y: number): number[] {
  const out: number[] = [];
  for (let k = 0; k + 1 < marks.length; k += 2) if (!inPond(pond, cellOf(marks[k]!), cellOf(marks[k + 1]!))) out.push(marks[k]!, marks[k + 1]!);
  if (stones) out.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  return out;
}
/** whether the pond carries a mark (its edge is Stones) */
export const pondHasStones = (marks: readonly number[], pond: Pond): boolean => {
  for (let k = 0; k + 1 < marks.length; k += 2) if (inPond(pond, cellOf(marks[k]!), cellOf(marks[k + 1]!))) return true;
  return false;
};

/** the cells of a round pond of radius r tiles about (x, y) (the Fountain pond: cell centres within r) */
export function discCells(x: number, y: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cy = cellOf(y - r); cy <= cellOf(y + r); cy++) for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) {
    const dx = (cx + 0.5) * CELL - x, dy = (cy + 0.5) * CELL - y; if (dx * dx + dy * dy <= r * r) out.push([cx, cy]);
  }
  return out;
}
/** a round outline of radius r tiles about (x, y), n corners (the town's Fountain pond: a painted water area) */
export function discOutline(x: number, y: number, r: number, n = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(Math.round((x + Math.cos(a) * r) * 100) / 100, Math.round((y + Math.sin(a) * r) * 100) / 100); }
  return out;
}
