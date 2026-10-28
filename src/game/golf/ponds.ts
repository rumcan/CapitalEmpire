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
import { KIT_BOULDERS, KIT_LILIES, KIT_PLUME, KIT_POND_EDGE } from '../kit';

/** the lattice: a cell is 0.5 tile (1 m), the course grid's */
export const CELL = 0.5;
/** the most cells a pond may have (6 ha): bigger water (the map's lakes) gets no edge */
export const POND_MAX_CELLS = 60000;
/** a water sampler: is cell (cx, cy) of the world lattice water (cell cx covers tiles [cx * CELL, (cx + 1) * CELL)) */
export type Wet = (cx: number, cy: number) => boolean;

/** a pond: its cells as a mask over its box (x0, y0 the first cell; w, h cells), and how many */
export interface Pond { x0: number; y0: number; w: number; h: number; mask: Uint8Array; cells: number }
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
  return { x0, y0, w, h, mask, cells: seen.size };
}
/** is cell (cx, cy) (world lattice) part of the pond */
export function inPond(p: Pond, cx: number, cy: number): boolean {
  const i = cx - p.x0, j = cy - p.y0; return i >= 0 && j >= 0 && i < p.w && j < p.h && p.mask[j * p.w + i] === 1;
}
/** a pond's identity: its first cell in row order (two marks in one pond lay it once) */
export function pondId(p: Pond): number { for (let k = 0; k < p.mask.length; k++) if (p.mask[k]) return (p.y0 + Math.floor(k / p.w)) * 65536 + p.x0 + (k % p.w); return -1; }

/** a corner cluster's scale over a two-by-two block of water cells (its footprint, 0.8 x scale tiles, a tile at most) and in one cell */
export const CORNER_BIG = 1.2, CORNER_SMALL = 0.6;
/** a pond under this many cells (about 25 m across) is edged with the small stones only (half-size pieces, a cell deep; the corners' small
 *  clusters): the big ones would cover a small pond's water */
export const BIG_POND_CELLS = 500;
/** the smallest pond that gets an edge (cells): a puddle gets none */
export const POND_MIN_CELLS = 12;

/** T234, the natural rim. RIM_SCALE: a run piece's size round the stretch's mean (the weights are normalised, so the stretch is still filled);
 *  RIM_ROWS: the rows of water in from the shore a piece may reach (a piece at 1.2 is 2.4 cells deep, and 0.25 tile in from the shore line
 *  more); RIM_IN: the most a piece stands in from the shore line (tiles; never out, onto land); GAP_SHARE: the share of a stretch's length left
 *  as gaps (from, to); GAP_LEN: a gap's length (tiles; 1.2 to 3 m); GAP_MIN_STRETCH: the shortest stretch that takes a gap (tiles);
 *  GAP_TUFT, GAP_BOULDER: of the gaps, the share that take a tuft of plume grass, then a single boulder (the rest are bare grass). */
export const RIM_SCALE: readonly [number, number] = [0.8, 1.2];
export const RIM_ROWS = 3, RIM_IN = 0.25;
export const GAP_SHARE: readonly [number, number] = [0.18, 0.3], GAP_LEN: readonly [number, number] = [0.6, 1.5], GAP_MIN_STRETCH = 3;
export const GAP_TUFT = 0.5, GAP_BOULDER = 0.25;
/** the corners in a staircase (a one-cell step from another corner, as along a round pond's diagonal; a corner at the end of a straight stretch
 *  is as it was): the cluster shrinks to CLUSTER_SHRINK..1 of its size and moves about its block; CLUSTER_DROP of them (never two within 1.3
 *  tiles) are swapped for a tuft of plume grass (CLUSTER_TUFT of those), a single boulder (CLUSTER_BOULDER), or bare grass (the rest) */
export const CLUSTER_SHRINK = 0.75, CLUSTER_DROP = 0.24, CLUSTER_TUFT = 0.55, CLUSTER_BOULDER = 0.25;
/** a footprint's side in tiles at scale 1 (the library's box: kit:shrub-plume-grass 0.525, small boulders 0.32, medium 0.6): what a gap's
 *  tuft or boulder is fitted by (tests/ponds.test.ts checks them against the library) */
export const PLUME_FOOT = 0.525, BOULDER_FOOT = { small: 0.32, medium: 0.6, large: 1 } as const;
/** a single boulder dropped on a joint between two run pieces (the share of joints), in front of the rim: stones of mixed size, as in the concept */
export const JOINT_BOULDER = 0.18;
/** a boulder by a dice roll: in a pond of BIG_POND_CELLS or more a large one (a third of them) when it fits, else a medium, else a small one;
 *  put(id, foot) lays it and says whether it fitted */
const boulderBy = (pick: number, big: boolean, put: (id: string, foot: number) => boolean): boolean => {
  const v = Math.min(2, Math.floor(pick * 3)), f = pick * 3 - v;
  return (big && f < 0.35 && put(KIT_BOULDERS.large[v]!, BOULDER_FOOT.large)) || put(KIT_BOULDERS.medium[v]!, BOULDER_FOOT.medium) || put(KIT_BOULDERS.small[v]!, BOULDER_FOOT.small);
};
/** a 32-bit hash of a lattice square (the lily pads' world lattice: a pond's pads stay put when it changes elsewhere; the rim's stretches the same) */
const hash2 = (a: number, b: number) => { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

/** The stones round a pond's shore: a corner cluster at every corner of its outline (an outer one where the water's outline bulges, an inner one
 *  where it turns in), and between them the run pieces along each straight stretch of shore (KIT_POND_EDGE.x along the map's x axis, .y along
 *  its y axis), as many as the stretch takes at a scale of 0.5 to 1 (a piece is two cells deep at full size: in a pond under BIG_POND_CELLS, or where the second row in is not all
 *  water, at most half size, a cell deep). A corner's cluster covers the two-by-two block of water by the corner when it can, else its one cell.
 *  T234: the run pieces vary (RIM_SCALE, RIM_IN), a long stretch has short gaps with a plume tuft or a boulder in them (GAP_*), a boulder stands on
 *  some joints (JOINT_BOULDER), and the corners in a staircase are loosened (CLUSTER_*). Each stretch and corner is laid from its own place on the
 *  lattice. Every footprint lies on the pond's water. Empty for a pond under POND_MIN_CELLS. */
export function shorePieces(p: Pond): PondPiece[] {
  if (p.cells < POND_MIN_CELLS) return [];
  const out: PondPiece[] = [], E = KIT_POND_EDGE, at = (cx: number, cy: number) => inPond(p, cx, cy), large = p.cells >= BIG_POND_CELLS;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  // corners: each lattice vertex by the water of its four cells (nw, ne, sw, se); n: how many are water, 0 when the vertex is no corner
  const corner = new Set<number>(), outerCell = new Set<number>(), placed = new Set<string>(), vkey = (vx: number, vy: number) => vy * 65536 + vx;
  const nOf = (vx: number, vy: number) => {
    const nw = at(vx - 1, vy - 1), ne = at(vx, vy - 1), sw = at(vx - 1, vy), se = at(vx, vy), n = +nw + +ne + +sw + +se;
    return n === 0 || n === 4 || (n === 2 && nw !== se) ? 0 : n; // two cells side by side: a straight shore
  };
  for (let vy = p.y0; vy <= p.y0 + p.h; vy++) for (let vx = p.x0; vx <= p.x0 + p.w; vx++) if (nOf(vx, vy)) corner.add(vkey(vx, vy));
  // T234: a corner in a staircase (a one-cell step from another corner, as along a round pond's diagonal) is loosened (CLUSTER_SHRINK, CLUSTER_DROP);
  // a corner at the end of a straight stretch is as it was
  const stair = (vx: number, vy: number) => corner.has(vkey(vx + 1, vy)) || corner.has(vkey(vx - 1, vy)) || corner.has(vkey(vx, vy + 1)) || corner.has(vkey(vx, vy - 1));
  const dropped: [number, number][] = [];
  // a corner's cluster, from vertex (vx, vy) toward (dx, dy) (each +1 or -1): over the two-by-two block of cells there when all of it is water
  // (CORNER_BIG: its footprint a tile), else in the one cell by the vertex (CORNER_SMALL: its footprint a cell)
  const cluster = (id: string, vx: number, vy: number, dx: number, dy: number) => {
    const c0 = dx > 0 ? vx : vx - 1, r0 = dy > 0 ? vy : vy - 1, block = at(c0, r0) && at(c0 + dx, r0) && at(c0, r0 + dy) && at(c0 + dx, r0 + dy);
    const big = block && large, k = big ? 1 : 0.5, x = r3(vx * CELL + dx * CELL * k), y = r3(vy * CELL + dy * CELL * k), key = `${x},${y}`;
    if (placed.has(key)) return; placed.add(key);
    const s0 = big ? CORNER_BIG : CORNER_SMALL;
    if (!stair(vx, vy)) { out.push({ id, x, y, s: s0 }); return; }
    // the block's side (tiles); the corner's own dice (its vertex and quarter)
    const side = k * 2 * CELL, r = mulberry(hash2(vx * 8 + (dx > 0 ? 1 : 0) + (dy > 0 ? 2 : 0) + (id === E.inner ? 4 : 0), vy));
    const roll = r(), shrink = r(), jx = r(), jy = r(), what = r(), pick = r(), jit = r();
    const near = dropped.some(([qx, qy]) => Math.hypot(qx - x, qy - y) < 1.3);
    if (roll < CLUSTER_DROP && !near) {
      dropped.push([x, y]);
      const s = (foot: number) => { const fit = Math.min(RIM_SCALE[1], (side - 0.02) / foot); return fit < RIM_SCALE[0] ? 0 : r3(Math.max(RIM_SCALE[0], fit * (0.8 + 0.2 * jit))); };
      const add = (fid: string, foot: number) => { const sc = s(foot); if (!sc) return false; const F = foot * sc; out.push({ id: fid, x: r3(x + (jx - 0.5) * (side - F)), y: r3(y + (jy - 0.5) * (side - F)), s: sc }); return true; };
      if (what < CLUSTER_TUFT) add(KIT_PLUME, PLUME_FOOT); else if (what < CLUSTER_TUFT + CLUSTER_BOULDER) boulderBy(pick, large, add);
      return;
    }
    const sc = r3(s0 * (CLUSTER_SHRINK + (1 - CLUSTER_SHRINK) * shrink)), F = 0.8 * sc;
    out.push({ id, x: r3(x + (jx - 0.5) * (side - F)), y: r3(y + (jy - 0.5) * (side - F)), s: sc });
  };
  for (let vy = p.y0; vy <= p.y0 + p.h; vy++) for (let vx = p.x0; vx <= p.x0 + p.w; vx++) {
    const n = nOf(vx, vy); if (!n) continue;
    const nw = at(vx - 1, vy - 1), ne = at(vx, vy - 1), sw = at(vx - 1, vy);
    if (n === 3) {
      // inner (the shore turns in): the cluster across the vertex from the dry cell
      const [dx, dy] = !nw ? [1, 1] : !ne ? [-1, 1] : !sw ? [1, -1] : [-1, -1];
      cluster(E.inner, vx, vy, dx, dy);
      continue;
    }
    // outer (one water cell, or two across a pinch): a cluster toward each water cell at the vertex; the cell is left out of the stretches
    for (const [ok, dx, dy] of [[nw, -1, -1], [ne, 1, -1], [sw, -1, 1], [at(vx, vy), 1, 1]] as const) {
      if (!ok) continue;
      outerCell.add(vkey(dx > 0 ? vx : vx - 1, dy > 0 ? vy : vy - 1)); cluster(E.outer, vx, vy, dx, dy);
    }
  }
  // the straight stretches: shore edges of the cells (a water cell with a dry neighbour on that side), joined along their line; a stretch is
  // cut at every corner vertex, and a cell taken by an outer corner's cluster is left out of it
  const lay = (axis: 'x' | 'y', line: number, side: 1 | -1, a0: number, a1: number) => {
    // a0..a1: the stretch's cells along the axis (inclusive); line: the cells' row (axis x) or column (axis y); side: where the dry land is
    const n = a1 - a0 + 1, L = n * CELL; if (L < 1) return; // a stretch under a tile is the corners'
    // the rows of water in from the shore along the whole stretch (the shore cell is the first), at most RIM_ROWS. A piece at full size is two
    // cells deep: where the second row in is not all water, half size (a cell deep)
    let rows = RIM_ROWS;
    for (let a = a0; a <= a1 && rows > 1; a++) { let r = 1; while (r < rows && (axis === 'x' ? at(a, line - side * r) : at(line - side * r, a))) r++; rows = Math.min(rows, r); }
    const most = rows >= 2 && large ? 1 : 0.5, sCap = Math.min(rows * CELL / E.depth, most * RIM_SCALE[1]);
    // this stretch's own dice: its place on the world lattice (the same however the rest of the pond changes)
    const rnd = mulberry(hash2(a0 * 4 + (axis === 'x' ? 0 : 2) + (side > 0 ? 1 : 0), line)), mix = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * rnd();
    const shore = side > 0 ? (line + 1) * CELL : line * CELL;
    const emit = (id: string | null, along: number, across: number, s: number) => {
      const c = shore - side * across;
      out.push(axis === 'x' ? { id: id ?? E.x, x: r3(along), y: r3(c), s } : { id: id ?? E.y, x: r3(c), y: r3(along), s });
    };
    // the gaps (GAP_SHARE of a stretch of GAP_MIN_STRETCH tiles or more), each between two pieces, so the stretch's ends meet the corners as before
    const gaps: number[] = [];
    if (L >= GAP_MIN_STRETCH) for (let g = Math.floor(mix(GAP_SHARE) * L / ((GAP_LEN[0] + GAP_LEN[1]) / 2) + rnd()); g > 0; g--) gaps.push(mix(GAP_LEN));
    while (gaps.length && gaps.reduce((a, b) => a + b, 0) > GAP_SHARE[1] * 1.5 * L) gaps.pop();
    const T = L - gaps.reduce((a, b) => a + b, 0), k = Math.max(gaps.length + 1, Math.ceil(T / (E.len * most)));
    // the pieces' sizes: T shared out by weights of RIM_SCALE, none over sCap (what one cannot take, the rest share)
    const w = Array.from({ length: k }, () => mix(RIM_SCALE)), sc = new Array<number>(k).fill(0);
    let room = T, free = w.map((_, i) => i);
    for (let guard = 0; guard <= k && free.length; guard++) {
      const sum = free.reduce((a, i) => a + w[i]!, 0), over = free.filter(i => room * w[i]! / sum / E.len > sCap);
      if (!over.length) { for (const i of free) sc[i] = room * w[i]! / sum / E.len; break; }
      for (const i of over) { sc[i] = sCap; room -= sCap * E.len; }
      free = free.filter(i => !over.includes(i));
    }
    // which joints between pieces are gaps
    const joints = Array.from({ length: k - 1 }, (_, i) => i + 1);
    for (let i = joints.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [joints[i], joints[j]] = [joints[j]!, joints[i]!]; }
    const gapAt = new Map<number, number>(); gaps.forEach((g, i) => gapAt.set(joints[i]!, g));
    // a piece of kit in the stretch's span [g0, g0 + gw] along, from the shore line in: of size 0.8 to 1.2, the largest that fits the span and the rows
    const place = (id: string, foot: number, g0: number, gw: number, spot: number, inn: number, jit: number) => {
      const fit = Math.min(RIM_SCALE[1], Math.min(gw - 0.04, rows * CELL) / foot); if (fit < RIM_SCALE[0]) return false;
      const s = Math.round(Math.max(RIM_SCALE[0], fit * (0.8 + 0.2 * jit)) * 1000) / 1000, F = foot * s;
      emit(id, g0 + F / 2 + (gw - F) * spot, F / 2 + Math.max(0, Math.min(rows * CELL - F, RIM_IN)) * inn, s); return true;
    };
    // a gap's content: a tuft of plume grass, a single boulder, or bare grass
    const fill = (g0: number, gw: number) => {
      const roll = rnd(), spot = rnd(), inn = rnd(), pick = rnd(), jit = rnd(), put = (id: string, foot: number) => place(id, foot, g0, gw, spot, inn, jit);
      if (roll < GAP_TUFT) put(KIT_PLUME, PLUME_FOOT); else if (roll < GAP_TUFT + GAP_BOULDER) boulderBy(pick, large, put);
    };
    // a boulder on a joint between two pieces (not at a gap), in front of the rim, within a tile of the joint and the stretch
    const stand = (joint: number) => {
      const spot = rnd(), pick = rnd(), jit = rnd(), g0 = Math.max(a0 * CELL, joint - 0.5), g1 = Math.min((a1 + 1) * CELL, joint + 0.5);
      boulderBy(pick, large, (id, foot) => place(id, foot, g0, g1 - g0, spot, 1, jit));
    };
    let along = a0 * CELL;
    for (let i = 0; i < k; i++) {
      const g = gapAt.get(i); if (g !== undefined) { fill(along, g); along += g; }
      const s = Math.round(sc[i]! * 1000) / 1000, len = E.len * s, depth = E.depth * s;
      // across: the piece's footprint from the shore line (or a little in from it, RIM_IN at most, where the rows allow) into the water
      emit(null, along + len / 2, depth / 2 + Math.max(0, Math.min(rows * CELL - depth, RIM_IN)) * rnd(), s);
      along += len;
      if (i + 1 < k && !gapAt.has(i + 1) && rnd() < JOINT_BOULDER) stand(along);
    }
  };
  for (const [axis, side] of [['x', -1], ['x', 1], ['y', -1], ['y', 1]] as const) {
    // axis x: rows of cells whose north (side -1) or south (side 1) neighbour is dry; axis y: columns with a dry west / east neighbour
    const lines = axis === 'x' ? p.h : p.w, span = axis === 'x' ? p.w : p.h;
    for (let l = 0; l < lines; l++) {
      let start = -1;
      const flush = (end: number) => { if (start >= 0) { lay(axis, (axis === 'x' ? p.y0 : p.x0) + l, side, start, end); start = -1; } };
      for (let a = 0; a < span; a++) {
        const cx = axis === 'x' ? p.x0 + a : p.x0 + l, cy = axis === 'x' ? p.y0 + l : p.y0 + a;
        const edge = at(cx, cy) && !(axis === 'x' ? at(cx, cy + side) : at(cx + side, cy)) && !outerCell.has(vkey(cx, cy));
        // the vertex before this cell along the stretch: a corner there ends the stretch
        const vBefore = axis === 'x' ? vkey(cx, side > 0 ? cy + 1 : cy) : vkey(side > 0 ? cx + 1 : cx, cy);
        if (start >= 0 && corner.has(vBefore)) flush((axis === 'x' ? cx : cy) - 1);
        if (edge) { if (start < 0) start = axis === 'x' ? cx : cy; }
        else flush((axis === 'x' ? cx : cy) - 1);
      }
      flush((axis === 'x' ? p.x0 + p.w : p.y0 + p.h) - 1);
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
