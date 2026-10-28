// T213 (#558): the carts in the field. A cart (two golfers of a group, entourage.ts) parks by the tee and beside the green, and on the hole beside each
// ball it drives to; its golfers walk from it to the ball and back, and ride in it between (they are not drawn while they ride: the hire cart's art has
// nobody in it). It drives on the cart paths where there are some near (the network's cart paths and course drives, cartPaths), else along the rough's
// edge (around the fairways, greens, tees and bunkers). The cart's stops and minutes follow from the round's shots (the round already timed its golfers
// at CART_PACE), so the play is unchanged; a late cart only shortens its golfers' walk out. Everything is worked out lazily, a hole at a time and a
// drive's route only when it is near the screen: a cart off the screen costs a look at its hole. Pure TS, no DOM; times are game minutes.
import { TILE_M } from '../types';
import { ADDRESS_TIME, FLIGHT_TIME, PICK_UP, PUTT_FLIGHT, SWING_TIME, walkMin } from './round';
import type { CourseView, Lie, Pt, RoundPlan, Shot } from './types';

/** a cart's speed on the course (metres per game minute: about 15 km/h) */
export const CART_SPEED_M = 250;
/** a stop is on a cart path when one passes within this many tiles of the tee, the green or the ball (else it is at the rough's edge) */
export const PATH_REACH = 25;
/** a ball within this many tiles of the pin (or on the green) is played from the cart parked beside the green */
export const GREEN_NEAR = 15;
/** the next stroke's stop within this many tiles of the cart's stop: the cart stays where it is (both golfers walk from it) */
export const MERGE_TILES = 20;
/** the cart waits by the first tee from this many minutes before its group's tee time */
export const CART_LEAD = 10;
/** a route along the paths longer than DETOUR times the straight line plus DETOUR_TILES is not taken: the cart drives the rough's edge */
export const DETOUR = 2.5, DETOUR_TILES = 60;
/** the rough's edge: looked for this far out (tiles) in steps of EDGE_STEP across the way, the cart this far past it (EDGE_PAD; GREEN_PAD by a green) */
const EDGE_MAX = 40, EDGE_STEP = 1.5, EDGE_PAD = 1.5, GREEN_PAD = 2.5;
/** a drive off the paths is checked every SAMPLE tiles for the played surfaces it must go around */
const SAMPLE = 6;
/** the drive's minutes are its straight line times this (the routes wind a little) */
const WIND = 1.3;
/** a drive's route is worked out once its box (padded this many tiles) is near the screen */
const NEAR = 40;

/** a cart's drive along `len` tiles (game minutes) */
export const driveMin = (len: number): number => len * TILE_M / CART_SPEED_M;
/** the lies a cart may drive on: the rough, the fescue and off the course */
export const cartLie = (l: Lie): boolean => l === 'rough' || l === 'fescue' || l === 'out';

/** the cart paths as a graph: the segments (ax ay bx by), their two nodes, the node points (x y) and each node's segments */
export interface CartPaths { segs: Float64Array; ends: Int32Array; nodes: Float64Array; adj: number[][] }
/** the nearest point of the paths: the segment, the point and its distance (tiles) */
export interface OnPath { seg: number; x: number; y: number; d: number }

/** the cart paths from their centre lines (the network's cart paths and course drives, straight segments; ends within 0.01 tiles are one node) */
export function cartPaths(lines: readonly { a: Pt; b: Pt }[]): CartPaths {
  const key = new Map<string, number>(), nodes: number[] = [], adj: number[][] = [];
  const node = (p: Pt): number => {
    const k = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
    let i = key.get(k);
    if (i === undefined) { i = nodes.length / 2; key.set(k, i); nodes.push(p.x, p.y); adj.push([]); }
    return i;
  };
  const segs: number[] = [], ends: number[] = [];
  for (const l of lines) {
    if (Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < 1e-6) continue;
    const a = node(l.a), b = node(l.b), s = segs.length / 4;
    segs.push(l.a.x, l.a.y, l.b.x, l.b.y); ends.push(a, b); adj[a]!.push(s); adj[b]!.push(s);
  }
  return { segs: Float64Array.from(segs), ends: Int32Array.from(ends), nodes: Float64Array.from(nodes), adj };
}

/** the nearest point of the paths to (x, y); null with no paths */
export function nearestOnPaths(P: CartPaths, x: number, y: number): OnPath | null {
  const S = P.segs; let best: OnPath | null = null;
  for (let i = 0; i < S.length; i += 4) {
    const ax = S[i]!, ay = S[i + 1]!, dx = S[i + 2]! - ax, dy = S[i + 3]! - ay, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, px = ax + dx * u, py = ay + dy * u, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { seg: i / 4, x: px, y: py, d };
  }
  return best;
}

/** the route along the paths from a to b (both within PATH_REACH of them): a, onto the paths, along them (the shortest way over the nodes), off to b.
 *  Null when either end is too far from the paths, when they do not join, or when the way round is a long detour (DETOUR) */
export function pathRoute(P: CartPaths, a: Pt, b: Pt): Pt[] | null {
  const A = nearestOnPaths(P, a.x, a.y), B = nearestOnPaths(P, b.x, b.y);
  if (!A || !B || A.d > PATH_REACH || B.d > PATH_REACH) return null;
  let pts: Pt[];
  if (A.seg === B.seg) pts = [a, { x: A.x, y: A.y }, { x: B.x, y: B.y }, b];
  else {
    // Dijkstra over the nodes (a few hundred at most: the plain O(n^2) form), from A's segment's two ends to B's
    const n = P.nodes.length / 2, N = P.nodes, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const nd = (i: number, x: number, y: number) => Math.hypot(N[2 * i]! - x, N[2 * i + 1]! - y);
    for (const e of [P.ends[2 * A.seg]!, P.ends[2 * A.seg + 1]!]) dist[e] = Math.min(dist[e]!, nd(e, A.x, A.y));
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < du) { du = dist[i]!; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const s of P.adj[u]!) {
        const v = P.ends[2 * s]! === u ? P.ends[2 * s + 1]! : P.ends[2 * s]!, w = du + nd(v, N[2 * u]!, N[2 * u + 1]!);
        if (w < dist[v]!) { dist[v] = w; prev[v] = u; }
      }
    }
    let end = -1, de = Infinity;
    for (const e of [P.ends[2 * B.seg]!, P.ends[2 * B.seg + 1]!]) { const d = dist[e]! + nd(e, B.x, B.y); if (d < de) { de = d; end = e; } }
    if (end < 0 || !Number.isFinite(de)) return null;
    const mid: Pt[] = [];
    for (let i = end; i >= 0; i = prev[i]!) mid.push({ x: N[2 * i]!, y: N[2 * i + 1]! });
    mid.reverse();
    pts = [a, { x: A.x, y: A.y }, ...mid, { x: B.x, y: B.y }, b];
  }
  const straight = Math.hypot(b.x - a.x, b.y - a.y);
  return polyLen(pts) > DETOUR * straight + DETOUR_TILES ? null : pts;
}

/** the length of a polyline (tiles) */
export function polyLen(pts: readonly Pt[]): number { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); return L; }

/** the rough's edge from p across the way (ux, uy, a unit vector): the nearest point on either side, in steps of EDGE_STEP up to EDGE_MAX, where a cart
 *  may drive (cartLie), pad tiles past it; null when there is none */
export function edgeOf(view: CourseView, p: Pt, ux: number, uy: number, pad = EDGE_PAD): Pt | null {
  for (let d = EDGE_STEP; d <= EDGE_MAX; d += EDGE_STEP) {
    for (const s of [1, -1]) {
      const x = p.x + ux * d * s, y = p.y + uy * d * s;
      if (cartLie(view.lieAt(x, y))) return { x: x + ux * pad * s, y: y + uy * pad * s };
    }
  }
  return null;
}

/** the route off the paths from a to b: the straight line, each SAMPLE-tile point of it on a played surface (a fairway, green, tee or bunker, or water)
 *  moved across the way to the rough's edge */
export function edgeRoute(view: CourseView, a: Pt, b: Pt): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), out: Pt[] = [a];
  if (L > 0) {
    const ux = dx / L, uy = dy / L, k = Math.floor(L / SAMPLE);
    for (let i = 1; i < k; i++) {
      const q = { x: a.x + ux * SAMPLE * i, y: a.y + uy * SAMPLE * i };
      out.push(cartLie(view.lieAt(q.x, q.y)) ? q : edgeOf(view, q, -uy, ux) ?? q);
    }
  }
  out.push(b);
  return out;
}

/** a golfer's part of a cart's stop: he leaves the cart (out), is at his ball for his first stroke here (at: its address), done with his strokes here
 *  (end: his swing over, or his ball in the hole), back at the cart (back); where his ball is (ball) and where he walks back from (rest) */
export interface Leg { id: number; ball: Pt; rest: Pt; out: number; at: number; end: number; back: number }
/** a cart's stop on a hole: where it parks, when it is there (arr) and when it leaves (dep), its golfers' parts, and its route in from the stop before
 *  (worked out when first drawn; with its lengths) */
export interface Visit { stop: Pt; arr: number; dep: number; legs: Leg[]; route: Pt[] | null; cum: number[] | null }
/** a cart: its golfers, its group's tee time, its stops on each hole (worked out a hole at a time), the hole it is on (the playback's cursor), and its
 *  drive home after the last green (its route when drawn, and the minute it is there) */
interface Cart { ids: number[]; tee: number; holes: (Visit[] | undefined)[]; leaves: number[]; h: number; home: Visit | null }

/** what a golfer of a cart does at a minute (CartPlay.rider): STATE, as the round has him (at his ball and on the tee: the playback's own state);
 *  WALK, walking between the cart and his ball (the point and heading in its `walk`); RIDE, in the cart (not drawn) */
export const STATE = 0, WALK = 1, RIDE = 2;
/** a cart to draw: its point (tiles), its heading (tile direction) and its golfers */
export interface PlayCart { x: number; y: number; hx: number; hy: number; cart: number }

/** the carts of a round plan on a course, played back: the golfers' stops, walks and rides, and the carts' points (see the file's head) */
export class CartPlay {
  /** the scratch of rider(): the walk's point and heading */
  readonly walk = { x: 0, y: 0, hx: 0, hy: 0 };
  private plan: RoundPlan; private view: CourseView; private paths: CartPaths | null; private homeAt: Pt;
  private carts: Cart[] = []; private cartOf: Int32Array; private shots: Shot[][] = [];
  /** per hole: the stop by its tee and the stop beside its green (worked out once) */
  private teeStops: (Pt | undefined)[] = []; private greenStops: (Pt | undefined)[] = [];
  /** the plan's shots when the stops were worked out (a live group adds shots: the carts' stops are worked out again) */
  private count = -1;
  /** the last heading of each cart (kept while it is parked) */
  private head: Float64Array;

  /** the plan's carts (golfer.cart, entourage.ts) on the course; `paths` the cart paths (null: none, every drive along the rough's edge), `home` where a
   *  cart goes after the last green (the clubhouse) */
  constructor(plan: RoundPlan, view: CourseView, paths: CartPaths | null, home: Pt) {
    this.plan = plan; this.view = view; this.paths = paths && paths.segs.length ? paths : null; this.homeAt = home;
    const size = Math.max(0, ...plan.golfers.map(g => g.id)) + 1, tee = new Map<number, number>();
    this.cartOf = new Int32Array(size).fill(-1);
    plan.groups.forEach(gr => { for (const id of gr.players) tee.set(id, gr.tee); });
    for (const g of plan.golfers) {
      if (g.cart === undefined || g.owner) continue;
      const c = this.carts[g.cart] ?? (this.carts[g.cart] = { ids: [], tee: tee.get(g.id) ?? 0, holes: [], leaves: [], h: 0, home: null });
      c.ids.push(g.id); this.cartOf[g.id] = g.cart;
    }
    for (let i = 0; i < this.carts.length; i++) if (!this.carts[i]) this.carts[i] = { ids: [], tee: 0, holes: [], leaves: [], h: 0, home: null };
    this.head = new Float64Array(this.carts.length * 2).fill(1);
    this.index();
  }

  /** the number of carts */
  get size(): number { return this.carts.length; }
  /** the cart golfer id rides (-1: he walks) */
  cartOfGolfer(id: number): number { return this.cartOf[id] ?? -1; }

  /** the stop by hole h's tee: on a path near it, else at the rough's edge beside it (across the hole's first line) */
  teeStop(h: number): Pt {
    const got = this.teeStops[h]; if (got) return got;
    const hole = this.view.holes[h]!, t = hole.tee, a = hole.line[1] ?? hole.pin, [ux, uy] = unit(a.x - t.x, a.y - t.y);
    const p = this.onPath(t) ?? edgeOf(this.view, t, -uy, ux) ?? { x: t.x - uy * 4, y: t.y + ux * 4 };
    return this.teeStops[h] = p;
  }
  /** the stop beside hole h's green: on a path near the pin that is off the green, else just off the green at the rough's edge (across the approach) */
  greenStop(h: number): Pt {
    const got = this.greenStops[h]; if (got) return got;
    const hole = this.view.holes[h]!, pin = hole.pin, b = hole.line[hole.line.length - 2] ?? hole.tee, [ux, uy] = unit(pin.x - b.x, pin.y - b.y);
    let p = this.onPath(pin);
    if (p && this.view.lieAt(p.x, p.y) === 'green') p = null;
    p ??= edgeOf(this.view, pin, -uy, ux, GREEN_PAD) ?? { x: pin.x - uy * EDGE_MAX, y: pin.y + ux * EDGE_MAX };
    return this.greenStops[h] = p;
  }
  /** the stop for a stroke from `ball` on hole h: by the tee for a tee shot, beside the green near it, else on a path near the ball, else beside the ball
   *  (a ball in the rough) or at the rough's edge across the hole */
  stopFor(h: number, s: Shot): Pt {
    if (s.stroke === 1) return this.teeStop(h);
    const hole = this.view.holes[h]!, b = s.from, pin = hole.pin;
    if (Math.hypot(b.x - pin.x, b.y - pin.y) <= GREEN_NEAR || this.view.lieAt(b.x, b.y) === 'green') return this.greenStop(h);
    const p = this.onPath(b); if (p) return p;
    const [ux, uy] = unit(pin.x - hole.tee.x, pin.y - hole.tee.y);
    return cartLie(this.view.lieAt(b.x, b.y)) ? { x: b.x - uy * 2, y: b.y + ux * 2 } : edgeOf(this.view, b, -uy, ux) ?? { x: b.x - uy * 2, y: b.y + ux * 2 };
  }

  /** cart c's stops on hole h (worked out once): its golfers' strokes on the hole in time order, a new stop when a stroke's is more than MERGE_TILES from
   *  the cart's; each golfer walks out for his first stroke at a stop and back after his last there. The cart is at a stop by the first golfer's walk
   *  out (later when the drive from the stop before takes longer: his walk out is then shorter) and leaves when they are all back. On the first tee
   *  they stand at the tee as the round has them (no walk out) */
  stops(c: number, h: number): Visit[] {
    if (this.count !== this.plan.shots.length) this.index();
    const cart = this.carts[c]!, got = cart.holes[h]; if (got) return got;
    const list: Shot[] = [];
    for (const id of cart.ids) for (const s of this.shots[id]!) if (s.hole === h) list.push(s);
    list.sort((a, b) => a.t - b.t || a.golfer - b.golfer);
    const visits: Visit[] = [];
    let cur: Visit | null = null;
    for (const s of list) {
      const stop = this.stopFor(h, s);
      if (!cur || Math.hypot(stop.x - cur.stop.x, stop.y - cur.stop.y) > MERGE_TILES) { cur = { stop, arr: 0, dep: 0, legs: [], route: null, cum: null }; visits.push(cur); }
      const at = s.t - ADDRESS_TIME, ending = s.holed || s.stroke + s.penalty >= PICK_UP, dur = s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME;
      const end = ending ? s.t + dur : s.t + SWING_TIME, rest = s.holed ? s.to : s.from, st = cur.stop;
      let leg = cur.legs.find(l => l.id === s.golfer);
      if (!leg) { leg = { id: s.golfer, ball: s.from, rest, out: h === 0 && s.stroke === 1 ? at : at - walkMin(st, s.from), at, end, back: 0 }; cur.legs.push(leg); }
      leg.end = end; leg.rest = rest; leg.back = end + walkMin(rest, st);
    }
    // the minutes: each stop by its first walk out, no sooner than the drive from the stop before allows; it leaves when all are back
    for (let v = 0; v < visits.length; v++) {
      const vi = visits[v]!, need = Math.min(...vi.legs.map(l => l.out));
      const pv = visits[v - 1], arr = pv ? Math.max(need, pv.dep + driveMin(WIND * Math.hypot(vi.stop.x - pv.stop.x, vi.stop.y - pv.stop.y))) : need;
      vi.arr = arr;
      for (const l of vi.legs) l.out = Math.min(l.at, Math.max(l.out, arr));
      vi.dep = Math.max(arr, ...vi.legs.map(l => l.back));
    }
    return cart.holes[h] = visits;
  }

  /** the minute cart c leaves hole h's last stop for the next hole (Infinity while its golfers have not finished it: a live round) */
  private leave(c: number, h: number): number {
    const vs = this.stops(c, h), cart = this.carts[c]!, got = cart.leaves[h]; if (got !== undefined) return got;
    const last = vs[vs.length - 1];
    let t = last ? last.dep : Infinity;
    for (const id of cart.ids) if (!this.shots[id]!.some(s => s.hole === h && (s.holed || s.stroke + s.penalty >= PICK_UP))) t = Infinity;
    return cart.leaves[h] = t;
  }
  /** cart c's drive home after the last green: from its last stop to the clubhouse (null before its golfers are done) */
  private homeOf(c: number): Visit | null {
    const cart = this.carts[c]!; if (cart.home) return cart.home;
    const N = this.view.holes.length, vs = N ? this.stops(c, N - 1) : [], last = vs[vs.length - 1], dep = N ? this.leave(c, N - 1) : Infinity;
    if (!last || !Number.isFinite(dep)) return null;
    const d = this.homeAt, arr = dep + driveMin(WIND * Math.hypot(d.x - last.stop.x, d.y - last.stop.y));
    return cart.home = { stop: d, arr, dep: arr, legs: [], route: null, cum: null };
  }
  /** the minute golfer id's cart is back at the clubhouse after his round (Infinity: not known yet, or he walks) */
  homeMinute(id: number): number { const c = this.cartOf[id] ?? -1; if (c < 0) return Infinity; const h = this.homeOf(c); return h ? h.arr : Infinity; }

  /** the hole cart c is on at minute m (from its cursor: a few steps at most from one frame to the next) */
  private holeAt(c: number, m: number): number {
    const cart = this.carts[c]!, N = this.view.holes.length;
    let h = Math.min(cart.h, Math.max(0, N - 1));
    while (h + 1 < N && this.leave(c, h) <= m) h++;
    while (h > 0 && this.leave(c, h - 1) > m) h--;
    return cart.h = h;
  }

  /** what golfer id (a cart's) does at minute m: STATE, WALK (the point and heading in `walk`) or RIDE. In the cart from his walk back after his last
   *  stroke at a stop until his walk out at the next; at his ball (and on the first tee before his tee shot) as the round has him */
  rider(id: number, m: number): number {
    const c = this.cartOf[id] ?? -1; if (c < 0 || !this.view.holes.length) return STATE;
    const h = this.holeAt(c, m), vs = this.stops(c, h);
    let first = true;
    for (const v of vs) for (const l of v.legs) {
      if (l.id !== id) continue;
      if (first && m < l.out) return h === 0 ? STATE : RIDE;
      first = false;
      if (m < l.out) return RIDE;
      if (m < l.at) return this.walkTo(v.stop, l.ball, (m - l.out) / (l.at - l.out));
      if (m < l.end) return STATE;
      if (m < l.back) return this.walkTo(l.rest, v.stop, (m - l.end) / (l.back - l.end));
    }
    return first && h === 0 ? STATE : RIDE;
  }
  /** a walk from a to b at u (0..1) into `walk`: WALK */
  private walkTo(a: Pt, b: Pt, u: number): number {
    const w = this.walk, k = Math.min(1, Math.max(0, u)); w.x = a.x + (b.x - a.x) * k; w.y = a.y + (b.y - a.y) * k; w.hx = b.x - a.x; w.hy = b.y - a.y;
    return WALK;
  }

  /** the carts to draw at minute m, into out (refilled; returns the count): each cart from CART_LEAD before its group's tee time until it is home. With
   *  `only` (per golfer id), only the carts of those golfers; with a box (tiles x0 y0 x1 y1), only those in it (a drive's route is worked out only
   *  when it is near the box) */
  update(m: number, out: PlayCart[], only: Uint8Array | null = null, box: readonly number[] | null = null): number {
    let n = 0;
    for (let c = 0; c < this.carts.length; c++) {
      const cart = this.carts[c]!;
      if (!cart.ids.length || m < cart.tee - CART_LEAD) continue;
      if (only && !cart.ids.some(id => only[id] === 1)) continue;
      if (!this.at(c, m, box)) continue;
      const p = this.pt, q = out[n] ?? (out[n] = { x: 0, y: 0, hx: 1, hy: 0, cart: 0 });
      if (box && (p.x < box[0]! - 4 || p.x > box[2]! + 4 || p.y < box[1]! - 4 || p.y > box[3]! + 4)) continue;
      q.x = p.x; q.y = p.y; q.hx = this.head[2 * c]!; q.hy = this.head[2 * c + 1]!; q.cart = c; n++;
    }
    out.length = n;
    return n;
  }
  /** the scratch point of at() */
  private pt = { x: 0, y: 0 };
  /** cart c's point at minute m into pt (its heading into head): false when it is not out (home) or its drive is far from the box */
  private at(c: number, m: number, box: readonly number[] | null): boolean {
    const N = this.view.holes.length; if (!N) return false;
    const h = this.holeAt(c, m), vs = this.stops(c, h), p = this.pt;
    // no strokes on the hole yet (a live round: the field is held at the owner's strike): parked where it left the hole before, or by the first tee
    if (!vs.length) { const pvs = h > 0 ? this.stops(c, h - 1) : []; return this.park(c, pvs[pvs.length - 1]?.stop ?? this.teeStop(h)); }
    // before the hole's first stop: the drive in from the last stop of the hole before (the first tee: parked by it)
    if (m < vs[0]!.arr) {
      if (h === 0) return this.park(c, vs[0]!.stop);
      const pvs = this.stops(c, h - 1), from = pvs[pvs.length - 1]!.stop;
      return this.drive(c, vs[0]!, from, this.leave(c, h - 1), m, box);
    }
    for (let v = 0; v < vs.length; v++) {
      const vi = vs[v]!;
      if (m <= vi.dep) return this.park(c, vi.stop);
      const nx = vs[v + 1];
      if (nx && m < nx.arr) return this.drive(c, nx, vi.stop, vi.dep, m, box);
    }
    // after the last stop: on to the next hole (holeAt moves on at its leave), or home after the last green
    const last = vs[vs.length - 1]!;
    if (h < N - 1) return this.park(c, last.stop);
    const home = this.homeOf(c);
    if (!home || m >= home.arr) { p.x = last.stop.x; p.y = last.stop.y; return !home; }
    return this.drive(c, home, last.stop, last.dep, m, box);
  }
  /** parked at stop */
  private park(_c: number, stop: Pt): boolean { this.pt.x = stop.x; this.pt.y = stop.y; return true; }
  /** driving into stop `to` from `from`, leaving at t0 and there at to.arr, at minute m: along its route (the paths', else the rough's edge), worked out
   *  the first time the drive is near the box */
  private drive(c: number, to: Visit, from: Pt, t0: number, m: number, box: readonly number[] | null): boolean {
    const b = to.stop;
    if (!to.route) {
      if (box && (Math.max(from.x, b.x) < box[0]! - NEAR || Math.min(from.x, b.x) > box[2]! + NEAR || Math.max(from.y, b.y) < box[1]! - NEAR || Math.min(from.y, b.y) > box[3]! + NEAR)) return false;
      to.route = (this.paths && pathRoute(this.paths, from, b)) ?? edgeRoute(this.view, from, b);
      const cum = [0]; for (let i = 1; i < to.route.length; i++) cum.push(cum[i - 1]! + Math.hypot(to.route[i]!.x - to.route[i - 1]!.x, to.route[i]!.y - to.route[i - 1]!.y));
      to.cum = cum;
    }
    const R = to.route, C = to.cum!, L = C[C.length - 1]!, u = to.arr > t0 ? Math.min(1, Math.max(0, (m - t0) / (to.arr - t0))) : 1, d = u * L;
    let i = 1; while (i < R.length - 1 && C[i]! < d) i++;
    const a = R[i - 1]!, e = R[i]!, sl = C[i]! - C[i - 1]!, k = sl > 0 ? (d - C[i - 1]!) / sl : 1;
    this.pt.x = a.x + (e.x - a.x) * k; this.pt.y = a.y + (e.y - a.y) * k;
    if (sl > 1e-6) { this.head[2 * c] = (e.x - a.x) / sl; this.head[2 * c + 1] = (e.y - a.y) / sl; }
    return true;
  }

  /** the nearest path point within PATH_REACH of p (null: none, or no paths) */
  private onPath(p: Pt): Pt | null {
    if (!this.paths) return null;
    const o = nearestOnPaths(this.paths, p.x, p.y);
    return o && o.d <= PATH_REACH ? { x: o.x, y: o.y } : null;
  }
  /** each golfer's shots in time order (the stops are worked out again from them) */
  private index(): void {
    const size = this.cartOf.length;
    this.shots = Array.from({ length: size }, () => [] as Shot[]);
    for (const s of this.plan.shots) this.shots[s.golfer]?.push(s);
    for (const c of this.carts) { c.holes = []; c.leaves = []; c.home = null; c.h = 0; }
    this.count = this.plan.shots.length;
  }
}

/** the unit vector of (dx, dy) ((1, 0) for none) */
function unit(dx: number, dy: number): [number, number] { const L = Math.hypot(dx, dy); return L > 1e-9 ? [dx / L, dy / L] : [1, 0]; }
