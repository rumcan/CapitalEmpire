// #1295 (the owner, 2026-11-14: "make sure people use walking paths if they are there and they can follow them"): where a walker goes when a walking path
// or a cart path (the network's legs of the cart family) leads where he is going. One small shared helper, pure TS, no DOM, no engine: given the paths'
// legs, a start and a goal it returns the polyline a walker follows: straight to the nearest point of a path that helps, along the path's legs (the
// shortest way over the path graph, its bends kept), and straight from the path's best leaving point to the goal. It uses a path only when the whole
// trip is at most PATH_DETOUR times the way it replaces (nobody takes a silly detour), when he starts within PATH_REACH of a path, and when the path
// carries him a fair way for the walking it adds. With no path, or no path that helps, there is no route here and the walker walks as he did before.
// A route is worked out once, when a trip begins (and again when the paths change), never per frame: the graph (PathNet) is built once per network
// version and a search allocates only the route it returns.
import type { Pt } from '../network';

/** a leg of a path: its two ends (tiles). The network's legs join where they share an end point (to a thousandth of a tile) */
export interface PathLeg { a: Pt; b: Pt }

/** how far from a path a walker may start for him to go and join it (tiles: 15 m) */
export const PATH_REACH = 7.5;
/** the whole trip by the paths may be this many times the way it replaces: a longer detour is not taken */
export const PATH_DETOUR = 1.3;
/** the least a path must carry a walker (tiles: 6 m), and how many tiles of path he must walk for each tile of walking it adds to the way he had: a
 *  hop onto a path for a step or two, or a long way round for a short stretch of it, is not a path that helps */
export const PATH_MIN_ON = 3, PATH_WORTH = 2;
/** no path for a way shorter than this (tiles: 12 m): a few steps are walked straight */
export const PATH_MIN_TRIP = 6;
/** the most a trip over the paths is longer than the way it replaces, so the most a walker that is to take as long as that way goes faster than his ordinary pace (a multiple):
 *  the range's golfers are timed by the way they would have walked and only drawn over the paths, at this pace at most */
export const PATH_PACE = PATH_DETOUR;
/** a path's legs count this much of their length when ways are compared (a firm path is the easier walk: the way he takes is the one with the least walking
 *  at that weight, within the limits above), so he follows its bends rather than leaving it for a straight line across the grass */
export const PATH_PREFER = 0.6;
/** a way's own waypoint this close to where a path route joins or leaves the path is dropped (tiles: the route would step back for it) */
export const PATH_SOFT = 1;
/** the entry and exit legs looked at, nearest first */
const K = 6;

/** the paths as a graph: nodes where legs share an end point, legs between them, built once (PathNet.of) and searched many times. Do not change it */
export class PathNet {
  /** the nodes (x, y) and the legs: each one's end nodes, end points, length, and the legs touching each node (adj[adjAt[n]..adjAt[n + 1]]) */
  readonly nx: Float64Array; readonly ny: Float64Array;
  readonly la: Int32Array; readonly lb: Int32Array; readonly ax: Float64Array; readonly ay: Float64Array; readonly bx: Float64Array; readonly by: Float64Array; readonly len: Float64Array;
  readonly adjAt: Int32Array; readonly adj: Int32Array;
  /** the search's scratch (a search clears what it uses, so it allocates nothing): the cost to each node, how it was reached (a node, or -1 - the entry), whether it is settled, the heap */
  private dist: Float64Array; private prev: Int32Array; private src: Int32Array; private done: Uint8Array; private hv: Float64Array; private hn: Int32Array; private heap = 0; private chainBuf: Int32Array;
  private constructor(nx: number[], ny: number[], legs: { a: number; b: number; len: number }[]) {
    const n = nx.length, m = legs.length;
    this.nx = Float64Array.from(nx); this.ny = Float64Array.from(ny);
    this.la = new Int32Array(m); this.lb = new Int32Array(m); this.ax = new Float64Array(m); this.ay = new Float64Array(m); this.bx = new Float64Array(m); this.by = new Float64Array(m); this.len = new Float64Array(m);
    const deg = new Int32Array(n + 1);
    legs.forEach((l, k) => { this.la[k] = l.a; this.lb[k] = l.b; this.ax[k] = nx[l.a]!; this.ay[k] = ny[l.a]!; this.bx[k] = nx[l.b]!; this.by[k] = ny[l.b]!; this.len[k] = l.len; deg[l.a + 1]!++; deg[l.b + 1]!++; });
    this.adjAt = new Int32Array(n + 1); for (let i = 0; i < n; i++) this.adjAt[i + 1] = this.adjAt[i]! + deg[i + 1]!;
    this.adj = new Int32Array(2 * m); const at = this.adjAt.slice(0, n);
    for (let k = 0; k < m; k++) { this.adj[at[this.la[k]!]!++] = k; this.adj[at[this.lb[k]!]!++] = k; }
    this.dist = new Float64Array(n); this.prev = new Int32Array(n); this.src = new Int32Array(n); this.done = new Uint8Array(n); this.chainBuf = new Int32Array(n);
    this.hv = new Float64Array(2 * m + 2 * K + 8); this.hn = new Int32Array(2 * m + 2 * K + 8);
  }
  get nodes(): number { return this.nx.length }
  get legs(): number { return this.len.length }
  /** the graph of these legs (legs of no length are left out), or null when there is none */
  static of(legs: readonly PathLeg[]): PathNet | null {
    const ids = new Map<string, number>(), nx: number[] = [], ny: number[] = [], out: { a: number; b: number; len: number }[] = [];
    const node = (p: Pt): number => {
      const k = `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`; let i = ids.get(k);
      if (i === undefined) { i = nx.length; ids.set(k, i); nx.push(p.x); ny.push(p.y); }
      return i;
    };
    for (const l of legs) {
      if (!(Number.isFinite(l.a.x) && Number.isFinite(l.a.y) && Number.isFinite(l.b.x) && Number.isFinite(l.b.y))) continue;
      const a = node(l.a), b = node(l.b), len = Math.hypot(nx[b]! - nx[a]!, ny[b]! - ny[a]!);
      if (a !== b && len > 1e-6) out.push({ a, b, len });
    }
    return out.length ? new PathNet(nx, ny, out) : null;
  }
  /** whether a point lies on a leg of the paths (within `tol` tiles) */
  on(x: number, y: number, tol = 0.05): boolean {
    for (let k = 0; k < this.len.length; k++) if (this.near(k, x, y)[1] <= tol) return true;
    return false;
  }
  private tmp: [number, number] = [0, 0];
  /** the entry and exit legs of the search under way: leg, parameter along it, distance from the start or the goal */
  private eK = new Int32Array(K); private eT = new Float64Array(K); private eD = new Float64Array(K); private xK = new Int32Array(K); private xT = new Float64Array(K); private xD = new Float64Array(K);
  /** the nearest point of leg k to (x, y): its parameter 0..1 along the leg and its distance (a reused pair) */
  private near(k: number, x: number, y: number): [number, number] {
    const ax = this.ax[k]!, ay = this.ay[k]!, dx = this.bx[k]! - ax, dy = this.by[k]! - ay, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, o = this.tmp;
    o[0] = t; o[1] = Math.hypot(x - ax - dx * t, y - ay - dy * t); return o;
  }
  private push(u: number, d: number): void {
    const hv = this.hv, hn = this.hn; let k = this.heap++;
    while (k > 0) { const p = (k - 1) >> 1; if (hv[p]! <= d) break; hv[k] = hv[p]!; hn[k] = hn[p]!; k = p; }
    hv[k] = d; hn[k] = u;
  }
  /** pops the nearest (node, cost) pair: the node, its cost left in `this.popped` */
  private popped = 0;
  private pop(): number {
    const hv = this.hv, hn = this.hn, top = hn[0]!; this.popped = hv[0]!;
    const m = --this.heap, lv = hv[m]!, ln = hn[m]!;
    if (m > 0) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= m) break; if (c + 1 < m && hv[c + 1]! < hv[c]!) c++; if (hv[c]! >= lv) break; hv[k] = hv[c]!; hn[k] = hn[c]!; k = c; } hv[k] = lv; hn[k] = ln; }
    return top;
  }
  /** a way to node u of cost d from node `from` (or, below 0, from the entry -1 - from), when it beats the one found */
  private relax(u: number, d: number, from: number): void { if (d < this.dist[u]!) { this.dist[u] = d; this.prev[u] = from; this.src[u] = from < 0 ? -1 - from : this.src[from]!; this.push(u, d); } }

  /** the cheapest way over the paths from `from` to `to` (see routeVia) */
  search(from: Pt, to: Pt, base: number, o: PathOpts): PathTrip | null {
    const reach = o.reach ?? PATH_REACH, limit = base * (o.detour ?? PATH_DETOUR), m = this.len.length, fx = from.x, fy = from.y, tx = to.x, ty = to.y;
    // the legs within reach of the start (the entries) and the legs nearest the goal (the exits: he leaves a path where it comes nearest where he is going), nearest first
    const eK = this.eK.fill(-1), eT = this.eT, eD = this.eD.fill(Infinity), xK = this.xK.fill(-1), xT = this.xT, xD = this.xD.fill(Infinity);
    const take = (ks: Int32Array, ts: Float64Array, ds: Float64Array, k: number, t: number, d: number) => {
      let i = K; while (i > 0 && ds[i - 1]! > d) i--;
      if (i >= K) return;
      for (let j = K - 1; j > i; j--) { ks[j] = ks[j - 1]!; ts[j] = ts[j - 1]!; ds[j] = ds[j - 1]!; }
      ks[i] = k; ts[i] = t; ds[i] = d;
    };
    for (let k = 0; k < m; k++) {
      const a = this.near(k, fx, fy); if (a[1] <= reach) take(eK, eT, eD, k, a[0], a[1]);
      const b = this.near(k, tx, ty); take(xK, xT, xD, k, b[0], b[1]);
    }
    if (eK[0]! < 0) return null;
    // the search: from the entries' end nodes over the legs, never past the node from which no way to the goal fits the limit
    this.dist.fill(Infinity); this.done.fill(0); this.heap = 0;
    for (let i = 0; i < K && eK[i]! >= 0; i++) {
      const k = eK[i]!, t = eT[i]!, d = eD[i]!;
      this.relax(this.la[k]!, d + t * this.len[k]!, -1 - i); this.relax(this.lb[k]!, d + (1 - t) * this.len[k]!, -1 - i);
    }
    // the best way found among those that use a path enough (PATH_MIN_ON, PATH_WORTH) within the limit: the least walking with the path's legs at PATH_PREFER of their
    // length; and how it leaves the paths (a node; or a leg's point, by one of its ends; or along the entry's own leg)
    const minOn = o.minOn ?? PATH_MIN_ON, worth = o.worth ?? PATH_WORTH, wOn = 1 - (o.prefer ?? PATH_PREFER);
    let best = Infinity, kind = 0, bu = -1, bj = -1, bEntry = -1;   // kind 1 a node, 2 an exit leg's point by its a end, 3 by its b end, 4 along one leg
    const consider = (total: number, on: number, k: number, u: number, j: number, ei: number) => {
      if (!(total <= limit) || !(on >= minOn) || !(on >= worth * (total - base))) return;
      const score = total - wOn * on; if (score < best) { best = score; kind = k; bu = u; bj = j; bEntry = ei; }
    };
    while (this.heap > 0) {
      const u = this.pop(), d = this.popped; if (this.done[u] || d > this.dist[u]!) continue; this.done[u] = 1;
      const h = Math.hypot(this.nx[u]! - tx, this.ny[u]! - ty);
      consider(d + h, d - eD[this.src[u]!]!, 1, u, -1, -1);
      if (d + h > limit) continue;
      for (let q = this.adjAt[u]!; q < this.adjAt[u + 1]!; q++) { const k = this.adj[q]!, v = this.la[k] === u ? this.lb[k]! : this.la[k]!; if (!this.done[v]) this.relax(v, d + this.len[k]!, u); }
    }
    for (let j = 0; j < K && xK[j]! >= 0; j++) {
      const k = xK[j]!, s = xT[j]!, d = xD[j]!, L = this.len[k]!, na = this.la[k]!, nb = this.lb[k]!;
      if (this.dist[na]! < Infinity) consider(this.dist[na]! + s * L + d, this.dist[na]! - eD[this.src[na]!]! + s * L, 2, -1, j, -1);
      if (this.dist[nb]! < Infinity) consider(this.dist[nb]! + (1 - s) * L + d, this.dist[nb]! - eD[this.src[nb]!]! + (1 - s) * L, 3, -1, j, -1);
      for (let i = 0; i < K && eK[i]! >= 0; i++) if (eK[i] === k) { const on = Math.abs(eT[i]! - s) * L; consider(eD[i]! + on + d, on, 4, -1, j, i); }
    }
    if (kind === 0) return null;
    // the points: the start, the entry, the nodes along the paths, the exit, the goal
    const pts: Pt[] = [{ x: fx, y: fy }]; let on0 = -1, on1 = -1;
    // (a point that lies on the last one is that point: a start on the path, an entry at a node, a goal on the path)
    const add = (x: number, y: number, onPath: boolean) => {
      const q = pts[pts.length - 1]!; if (Math.hypot(x - q.x, y - q.y) >= 1e-6) pts.push({ x, y });
      if (onPath) { if (on0 < 0) on0 = pts.length - 1; on1 = pts.length - 1; }
    };
    const point = (k: number, t: number): [number, number] => [this.ax[k]! + (this.bx[k]! - this.ax[k]!) * t, this.ay[k]! + (this.by[k]! - this.ay[k]!) * t];
    if (kind === 4) {
      const e = point(eK[bEntry]!, eT[bEntry]!), x = point(xK[bj]!, xT[bj]!); add(e[0], e[1], true); add(x[0], x[1], true);
    } else {
      // the node the way leaves by, then back along how it was reached to the entry
      let end = bu, tail: [number, number] | null = null;
      if (kind === 2 || kind === 3) { const k = xK[bj]!; end = kind === 2 ? this.la[k]! : this.lb[k]!; tail = point(k, xT[bj]!); }
      let n = 0; for (let u = end; ; u = this.prev[u]!) { this.chainBuf[n++] = u; if (this.prev[u]! < 0) break; }
      const entry = -1 - this.prev[this.chainBuf[n - 1]!]!, e = point(eK[entry]!, eT[entry]!);
      add(e[0], e[1], true);
      for (let i = n - 1; i >= 0; i--) add(this.nx[this.chainBuf[i]!]!, this.ny[this.chainBuf[i]!]!, true);
      if (tail) add(tail[0], tail[1], true);
    }
    add(tx, ty, false);
    // (the goal itself may lie on the path: then it is the last point on it)
    if (on0 < 0) return null;
    let len = 0, onLen = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); len += l; if (i > on0 && i <= on1) onLen += l; }
    if (!(len <= limit + 1e-9) || !(onLen >= (o.minOn ?? PATH_MIN_ON)) || !(onLen >= (o.worth ?? PATH_WORTH) * (len - base))) return null;
    return { pts, on0, on1, len, onLen };
  }
}

/** the tunable limits of a search (the defaults are the constants above) */
export interface PathOpts { reach?: number; detour?: number; minOn?: number; worth?: number; minTrip?: number; prefer?: number }

/** a trip over the paths: the points to walk, `from` first and `to` last; the first and last of them that lie on a path (the legs between are walked on it);
 *  and the whole way's length and the part on a path (tiles) */
export interface PathTrip { pts: Pt[]; on0: number; on1: number; len: number; onLen: number }

/** the way from `from` to `to` over the paths, or null when a walker should go straight (no path, none near the start, none that leads there, or the
 *  trip would be more than PATH_DETOUR times `base`: the length of the way it replaces, the straight line by default). Worked out when a trip begins */
export function routeVia(net: PathNet | null | undefined, from: Pt, to: Pt, base?: number, o: PathOpts = {}): PathTrip | null {
  if (!net) return null;
  const straight = Math.hypot(to.x - from.x, to.y - from.y);
  if (!Number.isFinite(straight)) return null;
  const b = base !== undefined && Number.isFinite(base) ? Math.max(base, straight) : straight;
  if (!(b >= (o.minTrip ?? PATH_MIN_TRIP))) return null;
  return net.search(from, to, b, o);
}

/** the length of a polyline (tiles) */
export function polyLength(pts: readonly Pt[]): number { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); return L; }

/** the way a walker takes over the paths, made from the way he took without them (`pts`, the ordinary way). A stretch of it, from a point to a later one (or on to `goal`),
 *  is replaced by one trip over the paths when routeVia finds one for the whole stretch: the longest stretch from the earliest point it works from (a walker leaving his car
 *  for the shop takes the path from where he leaves the car, not from the car park's edge); the way's own points inside the stretch go (the route steers by the paths), and so
 *  does the point where the route joins or leaves the path when it lies within PATH_SOFT of it. Only the points from index `from` to index `to` are the stretches' to replace
 *  (the rest are kept: the lot's aisles, the way round a building); `goal`: the way's last stretch may run on to a goal beyond its last point as far as a path carries him
 *  toward it, and the walk then ends where the path leaves him (the rest to the goal is his own). null when no stretch uses a path: the way is then exactly the one he had.
 *  The first and the last point are never dropped. Worked out once, as a trip begins */
export function followPaths(net: PathNet | null | undefined, pts: readonly Pt[], goal?: Pt | null, from = 0, to = pts.length - 1): Pt[] | null {
  const n = pts.length; if (!net || n < 1) return null;
  const lo = Math.max(0, from), hi = Math.min(n - 1, to);
  const out: Pt[] = [pts[0]!], soft: boolean[] = [false]; let changed = false;
  const join = (q: Pt, s: boolean) => { out.push(q); soft.push(s); };
  // a trip's points 1 to `upto` as the way's; the last is a waypoint of the ordinary way (soft) when lastSoft
  const take = (trip: PathTrip, upto: number, lastSoft: boolean) => { for (let k = 1; k <= upto; k++) join(trip.pts[k]!, k === upto ? lastSoft : false); };
  // the way's own waypoint where the route steps onto the path, when that is within a step of it: the route would step back to it
  const unstep = (trip: PathTrip) => { const a = out[out.length - 1]!, e = trip.pts[trip.on0]!; if (trip.on0 >= 1 && out.length > 1 && soft[out.length - 1] && Math.hypot(e.x - a.x, e.y - a.y) < PATH_SOFT) { out.pop(); soft.pop(); } };
  for (let i = 0; ; ) {
    const a = out[out.length - 1]!;
    if (i >= lo) {
      // the stretches from here: on to the goal first, then to the last point the stretches reach, and shorter
      if (goal && hi === n - 1) {
        const trip = routeVia(net, a, goal, polyLength([a, ...pts.slice(i + 1)]) + Math.hypot(goal.x - pts[n - 1]!.x, goal.y - pts[n - 1]!.y));
        if (trip) { changed = true; unstep(trip); take(trip, trip.on1, false); break; }
      }
      let used = false;
      for (let j = hi; j > i && !used; j--) {
        const trip = routeVia(net, a, pts[j]!, Math.hypot(pts[i + 1]!.x - a.x, pts[i + 1]!.y - a.y) + polyLength(pts.slice(i + 1, j + 1)));
        if (!trip) continue;
        changed = used = true; unstep(trip);
        const x = trip.pts[trip.on1]!, dropEnd = j < hi && trip.on1 < trip.pts.length - 1 && Math.hypot(x.x - pts[j]!.x, x.y - pts[j]!.y) < PATH_SOFT;
        take(trip, trip.pts.length - 1 - (dropEnd ? 1 : 0), j < hi && !dropEnd);
        i = j;
      }
      if (used) continue;   // (on from where the stretch ended: the goal's stretch, or the next)
    }
    if (i + 1 >= n) break;
    join(pts[i + 1]!, i + 1 > lo && i + 1 < hi); i++;
  }
  return changed ? out : null;
}
