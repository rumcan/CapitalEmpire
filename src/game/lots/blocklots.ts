// Block lots: a city block is cut by an irregular fence grid into cells, and the cells are the lots (the fences come first, the
// lots are the spaces left). A block is a right-angled 4-corner face (blocks.ts) whose sides are 16-70 tiles after the street
// insets. subdivide() cuts the inner rectangle: end columns on the two short sides, a spine that may jog once, and 10-14 tile
// partitions. The cut is cached per block (its outline and insets); each edit only picks the streets of the lots. Pure TS, no DOM.
import { mulberry } from '../iso';
import { SK, dot, mul, perp, sub, vlen, type Pt, type RoadNetwork, type Seg } from '../network';
import type { Block } from '../blocks';
import { badShare, BAD_MAX, type Lot } from './lots';

/** a cell of the grid: the inner-rect side it faces (0 y=0, 1 x=W, 2 y=H, 3 x=0) and its box in the inner rect's frame, tiles */
export interface Cell { front: 0 | 1 | 2 | 3; x0: number; y0: number; x1: number; y1: number }
/** a cell of a block's cut in world coordinates: the side it faces, its frame (o, u, n, w, d), the front midpoint, the centre, the corner flag,
 *  its index in the cut, and its bad-terrain share (0 until a terrain is seen) */
export interface Cut { f: 0 | 1 | 2 | 3; o: Pt; u: Pt; n: Pt; w: number; d: number; front: Pt; c: Pt; corner: boolean; idx: number; bad: number }
/** a block's cut, kept while its signature (outline and insets) is unchanged; terr is the terrain its bad shares were taken from */
export interface BlockCut { sig: string; terr: Uint8Array | null; cells: Cut[] }

/** the smallest cell side, tiles; the spine's depth from either long side; the block sides allowed after the insets; the corner tolerance */
const MIN_SIDE = 6, SPINE_MIN = 8, SIDE_MIN = 16, SIDE_MAX = 70, RIGHT = 0.02;
/** rounds to 0.5 tiles */
const h5 = (v: number) => Math.round(v * 2) / 2;
/** uniform in [-a, a] */
const jit = (rnd: () => number, a: number) => (rnd() * 2 - 1) * a;
/** 32-bit FNV-1a hash of a string (the seed of a block's cut) */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

/** a length cut into 12.5-17.5 tile widths (25% over the first 10-14, the owner 2026-10-22; a length of 17.5-25 stays one piece): the
 *  boundaries from 0 to L (0.5-rounded); no boundaries under 6 tiles (none at all) */
function partition(L: number, rnd: () => number): number[] {
  if (L < MIN_SIDE) return [];
  let n = Math.max(1, Math.round(L / 15));
  while (L / n > 17.5) n++;
  while (n > 1 && L / n < 12.5) n--;
  const wt: number[] = []; let sum = 0;
  for (let i = 0; i < n; i++) { const w = (L / n) * (1 + jit(rnd, 0.2)); wt.push(w); sum += w; }
  const b = [0]; let acc = 0;
  for (let i = 0; i < n - 1; i++) { acc += wt[i]! * L / sum; b.push(h5(acc)); }
  b.push(L);
  return b;
}

/** the cells of a block whose spine runs along x: rows on sides 0 and 2, end columns on sides 3 and 1 (L x D frame) */
function spineCells(L: number, D: number, rnd: () => number): Cell[] {
  const out: Cell[] = [];
  const push = (front: 0 | 1 | 2 | 3, x0: number, y0: number, x1: number, y1: number) => { if (x1 - x0 >= MIN_SIDE && y1 - y0 >= MIN_SIDE) out.push({ front, x0, y0, x1, y1 }); };
  // the spine: y clamped so both depths are at least SPINE_MIN (a short block sits at its middle)
  const spine = (v: number) => (D - SPINE_MIN >= SPINE_MIN ? h5(Math.min(D - SPINE_MIN, Math.max(SPINE_MIN, v))) : h5(D / 2));
  let eL = h5(9 + rnd() * 3), eR = h5(9 + rnd() * 3);
  if (L - eL - eR < SPINE_MIN) eL = eR = 0;
  if (eL > 0) { const b = partition(D, rnd); for (let i = 0; i + 1 < b.length; i++) push(3, 0, b[i]!, eL, b[i + 1]!); }
  if (eR > 0) { const b = partition(D, rnd); for (let i = 0; i + 1 < b.length; i++) push(1, L - eR, b[i]!, L, b[i + 1]!); }
  const mx0 = eL, mx1 = L - eR, top = partition(mx1 - mx0, rnd).map(v => h5(v + mx0));
  // the one jog: an inner boundary of the top row, with the spine stepping there (|s1 - s2| >= 2)
  let s1 = spine(D / 2 + jit(rnd, 3)), s2 = s1, jogX = -1;
  if (mx1 - mx0 >= 20 && top.length >= 4 && rnd() < 0.5) {
    const jx = top[1 + Math.floor(rnd() * (top.length - 2))]!;
    for (let t = 0; t < 20; t++) {
      const a = spine(D / 2 + jit(rnd, 3)), c = spine(D / 2 + jit(rnd, 3));
      if (Math.abs(a - c) >= 2) { s1 = a; s2 = c; jogX = jx; break; }
    }
  }
  // the top row (side 0): each cell from y 0 down to the spine at that cell
  for (let i = 0; i + 1 < top.length; i++) { const a = top[i]!, b = top[i + 1]!; push(0, a, 0, b, (jogX >= 0 && (a + b) / 2 > jogX) ? s2 : s1); }
  // the bottom row (side 2): each cell from the spine at that cell up to D; no cell crosses the jog
  const runs = jogX >= 0 ? [[mx0, jogX], [jogX, mx1]] : [[mx0, mx1]];
  for (const [ra, rb] of runs) {
    const b = partition(rb! - ra!, rnd);
    for (let i = 0; i + 1 < b.length; i++) { const a = b[i]! + ra!, c = b[i + 1]! + ra!; push(2, a, (jogX >= 0 && (a + c) / 2 > jogX) ? s2 : s1, c, D); }
  }
  return out;
}

/** the cells of a W x H inner rectangle (local frame [0,W] x [0,H]): a spine along x when W > H + 4, along y when H > W + 4, else by rnd */
export function subdivide(W: number, H: number, rnd: () => number): Cell[] {
  W = h5(W); H = h5(H);
  const alongX = W > H + 4 ? true : H > W + 4 ? false : rnd() < 0.5;
  if (alongX) return spineCells(W, H, rnd);
  // the spine along y: cut the transposed rectangle, then turn it back (side 0 becomes 3, 1 becomes 2, 2 becomes 1, 3 becomes 0)
  const turn = [3, 2, 1, 0] as const;
  return spineCells(H, W, rnd).map(c => ({ front: turn[c.front], x0: c.y0, y0: c.x0, x1: c.y1, y1: c.x1 }));
}

/** a cell's front edge in the inner frame: a and b the edge ends, u along it, n away from the road into the cell, d the cell's depth along n */
function edgeOf(c: Cell): { a: Pt; b: Pt; u: Pt; n: Pt; d: number } {
  switch (c.front) {
    case 0: return { a: { x: c.x0, y: c.y0 }, b: { x: c.x1, y: c.y0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, d: c.y1 - c.y0 };
    case 1: return { a: { x: c.x1, y: c.y0 }, b: { x: c.x1, y: c.y1 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, d: c.x1 - c.x0 };
    case 2: return { a: { x: c.x0, y: c.y1 }, b: { x: c.x1, y: c.y1 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, d: c.y1 - c.y0 };
    default: return { a: { x: c.x0, y: c.y0 }, b: { x: c.x0, y: c.y1 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, d: c.x1 - c.x0 };
  }
}

/** is (x, y) inside a block's outline (q = its four corners x0 y0 ... as in Block.pts; the outline is a convex rectangle) */
export function inBlock(q: number[], x: number, y: number): boolean {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const ax = q[2 * i]!, ay = q[2 * i + 1]!, bx = q[(2 * i + 2) % 8]!, by = q[(2 * i + 3) % 8]!;
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c === 0) continue;
    if (s === 0) s = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== s) return false;
  }
  return s !== 0;
}

/** the lots of one block: its inner rectangle cut by subdivide(), each cell a lot on the street of the side it faces. Null unless the
 *  block is a right-angled 4-corner face whose sides are 16-70 tiles after the street insets (a side with no ground street: null, and a block
 *  bounded by any course drive (noLots, P19) gets none).
 *  The cut is read from cache (keyed by the block's key, checked against its outline and insets) and written to it on a miss */
export function blockLots(net: RoadNetwork, b: Block, terr: Uint8Array | null, cache: Map<string, BlockCut> = new Map()): Lot[] | null {
  if (b.pts.length !== 8) return null;
  const P: Pt[] = [0, 1, 2, 3].map(i => ({ x: b.pts[2 * i]!, y: b.pts[2 * i + 1]! }));
  for (let i = 0; i < 4; i++) {
    const p = P[(i + 3) % 4]!, v = P[i]!, q = P[(i + 1) % 4]!;
    const e1 = sub(v, p), e2 = sub(q, v), l1 = vlen(e1), l2 = vlen(e2);
    if (l1 < 1e-6 || l2 < 1e-6 || Math.abs(dot(e1, e2)) / (l1 * l2) >= RIGHT) return null;
  }
  // the local frame: origin P0, X along P0 -> P1, Y perpendicular and pointing into the block (towards its centre)
  const X = mul(sub(P[1]!, P[0]!), 1 / vlen(sub(P[1]!, P[0]!)));
  const cen = { x: (P[0]!.x + P[1]!.x + P[2]!.x + P[3]!.x) / 4, y: (P[0]!.y + P[1]!.y + P[2]!.y + P[3]!.y) / 4 };
  let Y = perp(X); if (dot(sub(cen, P[0]!), Y) < 0) Y = mul(Y, -1);
  const wp = (x: number, y: number): Pt => ({ x: P[0]!.x + X.x * x + Y.x * y, y: P[0]!.y + X.y * x + Y.y * y });
  const wv = (x: number, y: number): Pt => ({ x: X.x * x + Y.x * y, y: X.y * x + Y.y * y });
  // the ground streets on each side (side k runs P[k] -> P[k+1]) and each side's inset: h + walk + 0.5 of the widest
  const sides: Seg[][] = [], inset: number[] = [];
  for (let k = 0; k < 4; k++) {
    const A = P[k]!, B = P[(k + 1) % 4]!, dv = sub(B, A), len = vlen(dv), U = mul(dv, 1 / len), M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const on: Seg[] = []; let ins = -1;
    for (const s of net.segsNear(M, len / 2 + 2)) {
      if (s.kind !== SK.GROUND) continue;
      const ta = dot(sub(s.a, A), U), tb = dot(sub(s.b, A), U);
      const na = U.x * (s.a.y - A.y) - U.y * (s.a.x - A.x), nb = U.x * (s.b.y - A.y) - U.y * (s.b.x - A.x);
      if (Math.abs(na) >= 0.05 || Math.abs(nb) >= 0.05) continue;
      if (Math.min(Math.max(ta, tb), len) - Math.max(Math.min(ta, tb), 0) <= 0.01) continue;
      // a course drive (P19, noLots) on the boundary: no town lots in this block
      if (s.cls.noLots) return null;
      on.push(s); ins = Math.max(ins, s.cls.h + s.cls.walk + 0.5);
    }
    if (!on.length) return null;
    sides.push(on); inset.push(ins);
  }
  const Lx = vlen(sub(P[1]!, P[0]!)), Ly = vlen(sub(P[2]!, P[1]!));
  const W = h5(Lx - inset[1]! - inset[3]!), H = h5(Ly - inset[0]! - inset[2]!);
  if (W < SIDE_MIN || W > SIDE_MAX || H < SIDE_MIN || H > SIDE_MAX) return null;
  const ix0 = inset[3]!, iy0 = inset[0]!;
  // the cut: rebuilt only when the outline or the insets moved
  const sig = b.pts.join(',') + '|' + inset.join(',');
  let cut = cache.get(b.key);
  if (!cut || cut.sig !== sig) {
    const cells: Cut[] = [];
    subdivide(W, H, mulberry(fnv(b.key))).forEach((c, idx) => {
      const e = edgeOf(c), u = wv(e.u.x, e.u.y), n = wv(e.n.x, e.n.y);
      const o = wp(ix0 + e.a.x, iy0 + e.a.y), front = wp(ix0 + (e.a.x + e.b.x) / 2, iy0 + (e.a.y + e.b.y) / 2);
      const w = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y), d = e.d;
      const c0 = wp(ix0 + (c.x0 + c.x1) / 2, iy0 + (c.y0 + c.y1) / 2), corner = (c.x0 === 0 || c.x1 === W) && (c.y0 === 0 || c.y1 === H);
      cells.push({ f: c.front, o, u, n, w, d, front, c: c0, corner, idx, bad: 0 });
    });
    cut = { sig, terr: null, cells }; cache.set(b.key, cut);
  }
  // the terrain shares depend only on the geometry: taken again only when the terrain array changes
  if (cut.terr !== terr) { for (const c of cut.cells) c.bad = terr ? badShare(terr, c.o, c.u, c.n, c.w, c.d) : 0; cut.terr = terr; }
  const out: Lot[] = [];
  for (const c of cut.cells) {
    if (terr && c.bad > BAD_MAX) continue;
    // the street of the front side: the seg whose span holds the front midpoint (else the nearest)
    const P0 = P[c.f]!, dv = sub(P[(c.f + 1) % 4]!, P0), U = mul(dv, 1 / vlen(dv));
    let seg = sides[c.f]![0]!, best = Infinity;
    for (const s of sides[c.f]!) {
      const ta = dot(sub(s.a, P0), U), tb = dot(sub(s.b, P0), U), t = dot(sub(c.front, P0), U);
      const dist = Math.max(Math.min(ta, tb) - t, t - Math.max(ta, tb), 0);
      if (dist < best) { best = dist; seg = s; }
    }
    const side = dot(c.n, perp(sub(seg.b, seg.a))) > 0 ? 1 : -1;
    out.push({ key: `blk:${b.key}:${c.f}:${c.idx}`, id: 0, seg, side, o: c.o, u: c.u, n: c.n, w: c.w, d: c.d, cls: seg.cls.id, front: c.front, c: c.c, corner: c.corner });
  }
  return out;
}
