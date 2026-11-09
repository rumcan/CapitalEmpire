// T377 (#1033, the owner, 2026-11-08: "fix spectators walking in step 3 at a time and over water, greens, fairways or tee boxes, that includes where carts
// can drive. they should not be driving on tee boxes or greens and follow the cart paths. fix people standing watching next to a tee box. they need to be
// around it not on it."): where people and carts may go on the course. The course is read once (per day, per hole edit) into a raster of what the ground is
// (the walk field), and a route over it is the cheapest way between two points under a profile of what each ground costs: a spectator walks on the rough, the
// paths and the galleries, crosses a fairway only where it must (the narrowest place: the dearest ground is the one it crosses the shortest way) and never
// crosses a tee, a green, a bunker or water; a cart takes the cart paths, leaves them only over the rough (or a fairway, to reach a ball) and never drives on
// a tee, a green, a bunker or water. A route is a few waypoints (A* over the raster, then pulled straight where the line is as cheap), worked out once per
// pair of ends and kept, so a walker or a cart costs a look at its next waypoint a frame, however long the route. Pure TS, no DOM, no engine: the engine reads
// the ground from the course grid and the roads and hands the field to the City (the spectators' routes) and the cart playback.
import type { Pt } from '../network';

/** what a cell of the field is: open ground (the rough, the fescue, the land off the course), a cart path or a course drive (a way for carts and people), a
 *  fairway (its first cut and fringe too), the ground in front of a tee in the line of play (a fairway too, dearer to cross), a tee box, a green, a bunker,
 *  water, and a way for people only (a walking path, a street: a cart takes it for open ground) */
export const G = { open: 0, path: 1, fairway: 2, front: 3, tee: 4, green: 5, bunker: 6, water: 7, walk: 8 } as const;
export type Ground = (typeof G)[keyof typeof G];
/** what a ground costs to cross a tile of, per profile (0: never). A cart path is the cheapest way, so the routes follow the paths while they lead there */
export interface Profile { readonly name: 'spectator' | 'cart'; readonly cost: readonly [number, number, number, number, number, number, number, number, number] }
export const SPECTATOR: Profile = { name: 'spectator', cost: [2, 1, 12, 36, 0, 0, 0, 0, 1] };
export const CART: Profile = { name: 'cart', cost: [3, 1, 7, 7, 0, 0, 0, 0, 3] };
/** the spectators' field keeps this many cells (tiles) off every tee, green and bunker, and the second off water (dilate): the people of a party walk a little either side of its line */
export const SPECTATOR_GROW = 2, SPECTATOR_WATER_GROW = 1;

/** the field: a raster of w x h cells of `cell` tiles, its corner at tile (x0, y0); g[j * w + i] is the ground at the cell's centre */
export interface WalkField { x0: number; y0: number; cell: number; w: number; h: number; g: Uint8Array }

/** an empty field (all open ground) over the tile box x0 y0 x1 y1 */
export function makeField(x0: number, y0: number, x1: number, y1: number, cell = 1): WalkField {
  const w = Math.max(1, Math.ceil((x1 - x0) / cell)), h = Math.max(1, Math.ceil((y1 - y0) / cell));
  return { x0, y0, cell, w, h, g: new Uint8Array(w * h) };
}
/** the field's cell (i, j) of tile point (x, y), or -1 outside the field */
export function cellOf(f: WalkField, x: number, y: number): number {
  const i = Math.floor((x - f.x0) / f.cell), j = Math.floor((y - f.y0) / f.cell);
  return i < 0 || j < 0 || i >= f.w || j >= f.h ? -1 : j * f.w + i;
}
/** the ground at tile point (x, y): open outside the field */
export function groundAt(f: WalkField, x: number, y: number): Ground { const c = cellOf(f, x, y); return c < 0 ? G.open : f.g[c]! as Ground; }
/** whether a profile may stand at tile point (x, y) (any ground it has a cost for; everywhere outside the field) */
export function passable(f: WalkField, p: Profile, x: number, y: number): boolean { return p.cost[groundAt(f, x, y)]! > 0; }
/** the field with every tee, green and bunker cell grown by `grow` cells and every water cell by `waterGrow`: the cells within that many (Chebyshev) of one that
 *  are not themselves of those grounds take its ground (the first found), so a way over it, and the people of a party walking it a little to either side,
 *  keep clear of them; the spectators' field (the carts' is the field as it is). Water grows less (a footbridge keeps its middle) */
export function dilate(f: WalkField, grow: number, waterGrow = grow): WalkField {
  const out: WalkField = { x0: f.x0, y0: f.y0, cell: f.cell, w: f.w, h: f.h, g: f.g.slice() }, blocked = (g: number) => g === G.tee || g === G.green || g === G.bunker || g === G.water;
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const g = f.g[j * f.w + i]!; if (!blocked(g)) continue;
    const r = g === G.water ? waterGrow : grow;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= f.w || b >= f.h) continue;
      const k = b * f.w + a; if (!blocked(out.g[k]!)) out.g[k] = g;
    }
  }
  return out;
}
/** a cell's centre (tiles) */
const centre = (f: WalkField, c: number): Pt => ({ x: f.x0 + ((c % f.w) + 0.5) * f.cell, y: f.y0 + (Math.floor(c / f.w) + 0.5) * f.cell });

/** the nearest cell to tile point (x, y) a profile may stand on, looked for in rings out to `reach` tiles; the point's own cell first; -1 when there is
 *  none (or the point is outside the field) */
export function nearestPassable(f: WalkField, p: Profile, x: number, y: number, reach = 12): number {
  const c0 = cellOf(f, x, y); if (c0 < 0) return -1;
  if (p.cost[f.g[c0]!]! > 0) return c0;
  const ci = c0 % f.w, cj = Math.floor(c0 / f.w), R = Math.ceil(reach / f.cell);
  for (let r = 1; r <= R; r++) {
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= f.w || j >= f.h) continue;
      const c = j * f.w + i; if (p.cost[f.g[c]!]! <= 0) continue;
      const q = centre(f, c), d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = c; }
    }
    if (best >= 0) return best;
  }
  return -1;
}
/** the nearest point to (x, y) a profile may stand on (the point itself when it may): the cell's centre; null when none within reach */
export function nearestStand(f: WalkField, p: Profile, x: number, y: number, reach = 12): Pt | null {
  if (passable(f, p, x, y)) return { x, y };
  const c = nearestPassable(f, p, x, y, reach); return c < 0 ? null : centre(f, c);
}

/** the cost of walking the straight line a to b under a profile: each ground's cost per tile times the length of the line over it, exactly (the cells the line passes
 *  through, one by one). Infinity when the line crosses or touches a cell of a ground the profile never enters, a corner grazed too (a hair either side is
 *  counted): a way that clears it clears it, so no sample of a way drawn from these lines is ever on it. Cells outside the field are open ground */
export function lineCost(f: WalkField, p: Profile, a: Pt, b: Pt): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) return 0;
  const u0 = (a.x - f.x0) / f.cell, v0 = (a.y - f.y0) / f.cell, du = (b.x - a.x) / f.cell, dv = (b.y - a.y) / f.cell, E = 1e-6, steep = Math.abs(dv) > Math.abs(du);
  // the major axis (the longer: its cells are swept one by one) and the minor (the rows each column's part of the line touches)
  const m0 = steep ? v0 : u0, dm = steep ? dv : du, n0 = steep ? u0 : v0, dn = steep ? du : dv, open = p.cost[G.open]!;
  const mlo = Math.min(m0, m0 + dm), mhi = Math.max(m0, m0 + dm); let sum = 0;
  for (let i = Math.floor(mlo - E); i <= Math.floor(mhi + E); i++) {
    let ta = (i - E - m0) / dm, tb = (i + 1 + E - m0) / dm; if (ta > tb) { const x = ta; ta = tb; tb = x; }
    ta = Math.max(0, ta); tb = Math.min(1, tb); if (tb < ta) continue;
    const na = n0 + dn * ta, nb = n0 + dn * tb, nlo = Math.min(na, nb), nhi = Math.max(na, nb);
    for (let j = Math.floor(nlo - E); j <= Math.floor(nhi + E); j++) {
      const ci = steep ? j : i, cj = steep ? i : j;
      const c = ci < 0 || cj < 0 || ci >= f.w || cj >= f.h ? open : p.cost[f.g[cj * f.w + ci]!]!;
      if (c <= 0) return Infinity;
      // the line's length inside this cell: where the major coordinate is in [i, i + 1] and the minor in [j, j + 1]
      let ma = (i - m0) / dm, mb = (i + 1 - m0) / dm; if (ma > mb) { const x = ma; ma = mb; mb = x; }
      let qa = 0, qb = 1;
      if (Math.abs(dn) < 1e-12) { if (n0 < j || n0 > j + 1) continue; } else { qa = (j - n0) / dn; qb = (j + 1 - n0) / dn; if (qa > qb) { const x = qa; qa = qb; qb = x; } }
      const lo = Math.max(0, ma, qa), hi = Math.min(1, mb, qb); if (hi > lo) sum += c * (hi - lo) * L;
    }
  }
  return sum;
}
/** the cost of a route's whole length under a profile (Infinity if any part of it enters a ground the profile never does) */
export function routeCost(f: WalkField, p: Profile, pts: readonly Pt[]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += lineCost(f, p, pts[i - 1]!, pts[i]!); return s; }
/** whether a route (a polyline) stays off the grounds a profile never enters, checked along its whole length (not only at its points) */
export function routeClear(f: WalkField, p: Profile, pts: readonly Pt[]): boolean { for (let i = 1; i < pts.length; i++) if (!Number.isFinite(lineCost(f, p, pts[i - 1]!, pts[i]!))) return false; return true; }

const SQ2 = Math.SQRT2;
/** the options of a route search: the tiles the box of the ends is grown by (30), how far an end may be moved to ground the profile may stand on (12 tiles), and
 *  whether a search that finds nothing in the box grown four times goes on over the whole field (true: a lake the way goes round is found however far round;
 *  false: it stops there, for the searches that must be cheap) */
export interface RouteOpts { pad?: number; reach?: number; whole?: boolean }

/** the connected pieces of the ground a profile may stand on (by the four neighbours: the searches' diagonal steps need both of their sides, so they join no pieces
 *  the four neighbours do not): a label a cell, 0 for ground it may not stand on. Made once per field and profile, in one pass: two ends in different pieces have no
 *  way between them, and a search is not made to find that out (it would flood the whole piece) */
const PIECES = new WeakMap<WalkField, Map<string, Int32Array>>();
function pieces(f: WalkField, p: Profile): Int32Array {
  let m = PIECES.get(f); if (!m) PIECES.set(f, m = new Map());
  const got = m.get(p.name); if (got) return got;
  const { w, h, g } = f, cost = p.cost, n = w * h, lab = new Int32Array(n), stack = new Int32Array(n); let k = 0;
  for (let s = 0; s < n; s++) {
    if (lab[s] || cost[g[s]!]! <= 0) continue;
    k++; let sp = 0; stack[sp++] = s; lab[s] = k;
    while (sp) {
      const u = stack[--sp]!, i = u % w;
      if (i > 0 && !lab[u - 1] && cost[g[u - 1]!]! > 0) { lab[u - 1] = k; stack[sp++] = u - 1; }
      if (i < w - 1 && !lab[u + 1] && cost[g[u + 1]!]! > 0) { lab[u + 1] = k; stack[sp++] = u + 1; }
      if (u >= w && !lab[u - w] && cost[g[u - w]!]! > 0) { lab[u - w] = k; stack[sp++] = u - w; }
      if (u < n - w && !lab[u + w] && cost[g[u + w]!]! > 0) { lab[u + w] = k; stack[sp++] = u + w; }
    }
  }
  m.set(p.name, lab); return lab;
}
/** the cheapest route from a to b under a profile: the waypoints after a (the last is b itself), or null when there is none (an end outside the field or
 *  boxed in, or no way round). The ends are moved to the nearest ground the profile may stand on (reach tiles), the way found by A* over the eight
 *  neighbours of the raster inside the ends' box grown by `pad` tiles (grown once more when it finds nothing), the cells then pulled straight wherever the line
 *  between two of them is no dearer than the cells' own way. The route's first leg starts at a and its last ends at b, whatever ground they stand on */
export function findRoute(f: WalkField, p: Profile, a: Pt, b: Pt, o: RouteOpts = {}): Pt[] | null {
  const reach = o.reach ?? 12, sa = nearestPassable(f, p, a.x, a.y, reach), sb = nearestPassable(f, p, b.x, b.y, reach);
  if (sa < 0 || sb < 0) return null;
  const L = pieces(f, p); if (L[sa] !== L[sb]) return null; // (cut off: no way, and no search to find it out)
  const A = centre(f, sa);
  // the box of the ends grown by pad, then by four times it, then the whole field (a lake the way goes round, an end boxed in by water: found, however far round)
  const first = o.pad ?? 30, whole = Math.max(f.w, f.h) * f.cell, pads = first >= whole ? [whole] : first * 4 >= whole ? [first, whole] : o.whole === false ? [first, first * 4] : [first, first * 4, whole];
  for (const pad of pads) {
    const cells = astar(f, p, sa, sb, pad);
    if (!cells) continue;
    // the cells' centres, the first and last the ends' own cells
    let pts: Pt[] = cells.map(c => centre(f, c));
    pts = pull(f, p, pts);
    // the ends themselves: a leads in to the first cell's centre and b out from the last (their own ground is not checked: a stop's end is wherever it stands)
    const out: Pt[] = [];
    if (Math.hypot(A.x - a.x, A.y - a.y) > 1e-6 && Math.hypot(pts[0]!.x - a.x, pts[0]!.y - a.y) > 1e-6) out.push(pts[0]!);
    for (let i = out.length ? 1 : 0; i < pts.length - 1; i++) out.push(pts[i]!);
    out.push({ x: b.x, y: b.y });
    return out.length ? out : [{ x: b.x, y: b.y }];
  }
  return null;
}

/** the scratch of the searches (a search clears the box it uses, it allocates nothing: a route costs no garbage): per cell of the box the cost so far, where it
 *  came from and whether it is done; and the heap of (estimate, cell) pairs, entries deleted lazily */
let GS = new Float32Array(1 << 14), FROM = new Int32Array(1 << 14), CLOSED = new Uint8Array(1 << 14), HF = new Float64Array(1 << 14), HI = new Int32Array(1 << 14);
function scratch(n: number): void {
  if (GS.length >= n) return;
  let m = GS.length; while (m < n) m <<= 1;
  GS = new Float32Array(m); FROM = new Int32Array(m); CLOSED = new Uint8Array(m);
}

/** A* from cell s to cell t over the cells of the box round them (pad tiles) the profile may enter: the cells' indices from s to t, or null. The estimate is the
 *  octile distance at the cheapest ground the box has (a box with no path in it is searched at the rough's cost a tile: tighter, so far fewer cells) */
function astar(f: WalkField, p: Profile, s: number, t: number, pad: number): number[] | null {
  const W = f.w, si = s % W, sj = Math.floor(s / W), ti = t % W, tj = Math.floor(t / W), P = Math.ceil(pad / f.cell);
  const i0 = Math.max(0, Math.min(si, ti) - P), i1 = Math.min(W - 1, Math.max(si, ti) + P), j0 = Math.max(0, Math.min(sj, tj) - P), j1 = Math.min(f.h - 1, Math.max(sj, tj) + P);
  const bw = i1 - i0 + 1, bh = j1 - j0 + 1, n = bw * bh, cost = p.cost, g = f.g;
  scratch(n);
  const gs = GS, from = FROM, closed = CLOSED;
  gs.fill(Infinity, 0, n); from.fill(-1, 0, n); closed.fill(0, 0, n);
  let minC = Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0, o = j * W; i <= i1; i++) { const c = cost[g[o + i]!]!; if (c > 0 && c < minC) minC = c; }
  if (minC === Infinity) return null;
  const hs = f.cell * minC, DIAG = SQ2 - 1;
  let hn = 0;
  const push = (fv: number, v: number) => {
    if (hn === HF.length) { const nf = new Float64Array(hn * 2), ni = new Int32Array(hn * 2); nf.set(HF); ni.set(HI); HF = nf; HI = ni; }
    let k = hn++; const hf = HF, hi = HI;
    while (k > 0) { const q = (k - 1) >> 1; if (hf[q]! <= fv) break; hf[k] = hf[q]!; hi[k] = hi[q]!; k = q; }
    hf[k] = fv; hi[k] = v;
  };
  const pop = (): number => {
    const hf = HF, hi = HI, top = hi[0]!, lf = hf[--hn]!, lv = hi[hn]!, m = hn;
    if (m > 0) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= m) break; if (c + 1 < m && hf[c + 1]! < hf[c]!) c++; if (hf[c]! >= lf) break; hf[k] = hf[c]!; hi[k] = hi[c]!; k = c; } hf[k] = lf; hi[k] = lv; }
    return top;
  };
  const est = (i: number, j: number) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return (Math.max(dx, dy) + DIAG * Math.min(dx, dy)) * hs; };
  const ls = (sj - j0) * bw + (si - i0), lt = (tj - j0) * bw + (ti - i0); gs[ls] = 0; push(est(si, sj), ls);
  while (hn > 0) {
    const u = pop(); if (closed[u]) continue; closed[u] = 1;
    if (u === lt) break;
    const ui = u % bw + i0, uj = (u - (u % bw)) / bw + j0, gu = gs[u]!, cu = cost[g[uj * W + ui]!]!;
    for (let dj = -1; dj <= 1; dj++) {
      const vj = uj + dj; if (vj < j0 || vj > j1) continue;
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const vi = ui + di; if (vi < i0 || vi > i1) continue;
        const cv = cost[g[vj * W + vi]!]!; if (cv <= 0) continue;
        // a diagonal step must not cut a blocked corner
        if (di && dj && (cost[g[uj * W + vi]!]! <= 0 || cost[g[vj * W + ui]!]! <= 0)) continue;
        const v = (vj - j0) * bw + (vi - i0); if (closed[v]) continue;
        const gv = gu + (cu + cv) / 2 * f.cell * (di && dj ? SQ2 : 1);
        if (gv < gs[v]!) { gs[v] = gv; from[v] = u; push(gv + est(vi, vj), v); }
      }
    }
  }
  // (a search over the whole field leaves a heap of millions of entries: it is not kept)
  if (HF.length > (1 << 17)) { HF = new Float64Array(1 << 14); HI = new Int32Array(1 << 14); }
  if (!closed[lt]) return null;
  const out: number[] = [];
  for (let v = lt; v >= 0; v = from[v]!) out.push((Math.floor(v / bw) + j0) * W + (v % bw + i0));
  return out.reverse();
}

/** the cells' route pulled straight: from each point on, the farthest later point the straight line to which costs no more than the cells' own way there
 *  (and never crosses or touches a ground the profile does not enter). The farthest is looked for from the end back: a line that crosses a blocked ground
 *  stops at the first blocked cell, so the checks that fail are cheap */
function pull(f: WalkField, p: Profile, pts: Pt[]): Pt[] {
  const n = pts.length; if (n <= 2) return pts;
  const own = new Float64Array(n); for (let k = 1; k < n; k++) own[k] = own[k - 1]! + lineCost(f, p, pts[k - 1]!, pts[k]!);
  const out: Pt[] = [pts[0]!]; let i = 0;
  while (i < n - 1) {
    let best = i + 1;
    for (let j = n - 1; j > i + 1; j--) {
      const direct = lineCost(f, p, pts[i]!, pts[j]!);
      if (Number.isFinite(direct) && direct <= (own[j]! - own[i]!) * 1.0001) { best = j; break; }
    }
    out.push(pts[best]!); i = best;
  }
  return out;
}

/** the route of a pair of ends with no way between them */
export const NO_WAY: Pt[] = [];
/** the point of the field's rim nearest to a point outside it (the middle of the rim cell) */
function rimOf(f: WalkField, p: Pt): Pt {
  const h = f.cell / 2;
  return { x: Math.min(f.x0 + f.w * f.cell - h, Math.max(f.x0 + h, p.x)), y: Math.min(f.y0 + f.h * f.cell - h, Math.max(f.y0 + h, p.y)) };
}
/** what a search costs in a budget, in units: 1 for a way of under 100 tiles, one more for each 100 tiles further (a search grows with the square of the way, a
 *  long one is some 5 ms and a short one 1 ms or less) */
export const routeUnits = (a: Pt, b: Pt): number => 1 + Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 100);
/** a cache of routes by the cells of their ends: the route (or null for none) the first time, the same one after (the City keeps one per day). `budget` is how
 *  much search it may still do, in routeUnits (a miss costs a search; a hit costs a look): the City gives it a few units each step so a crowd arriving at once
 *  does not stall a step. A route is worked out while any budget is left (it may end below 0: a long way is never starved); with none left a miss is not worked
 *  out and the answer is undefined (ask again next step) */
export class RouteCache {
  private m = new Map<number, Pt[]>(); private hits = 0; private miss = 0;
  budget = Infinity;
  constructor(readonly f: WalkField, readonly p: Profile, private o: RouteOpts = {}) {}
  /** the route a to b (see findRoute), by the cells the two points are in: null when both ends are outside the field (off the course: a straight line will do),
   *  NO_WAY (an empty route) when there is no way between them, undefined when the route is not known and the budget is spent. An end outside the field is brought
   *  to its rim: the way outside is the straight line to the rim's point (the first waypoint of a route from outside, the one before the end of a route to it),
   *  the way inside is worked out from the rim (and kept) */
  route(a: Pt, b: Pt): Pt[] | null | undefined {
    const f = this.f, ca = cellOf(f, a.x, a.y), cb = cellOf(f, b.x, b.y);
    if (ca < 0 && cb < 0) return null;
    const a2 = ca < 0 ? rimOf(f, a) : a, b2 = cb < 0 ? rimOf(f, b) : b, r = this.inside(a2, b2);
    if (!r || !r.length || (ca >= 0 && cb >= 0)) return r;
    return [...(ca < 0 ? [a2] : []), ...r, ...(cb < 0 ? [b] : [])];
  }
  /** the route between two points inside the field, from the cache or worked out (within the budget) */
  private inside(a: Pt, b: Pt): Pt[] | null | undefined {
    const ca = cellOf(this.f, a.x, a.y), cb = cellOf(this.f, b.x, b.y);
    const key = ca * (this.f.w * this.f.h) + cb, got = this.m.get(key);
    if (got !== undefined) { this.hits++; return got; }
    if (this.budget <= 0) return undefined;
    this.budget -= routeUnits(a, b); this.miss++; const r = findRoute(this.f, this.p, a, b, this.o) ?? NO_WAY; this.m.set(key, r); return r;
  }
  get size(): number { return this.m.size; }
  get stats(): { hits: number; miss: number } { return { hits: this.hits, miss: this.miss }; }
  clear(): void { this.m.clear(); this.hits = 0; this.miss = 0; }
}
