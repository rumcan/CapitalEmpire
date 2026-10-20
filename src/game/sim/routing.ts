// Zone next-hop routing with congested travel times: link and movement costs (seconds), per-zone reverse Dijkstra tables,
// a local A* near the destination, and the logit choice at a junction. Pure TS, no DOM. Hot paths are allocation-free.
import { MAP } from '../iso';
import { type LaneGraph, type Turn, LK, MPT, laneAt } from './lanes';
import type { Sim } from './sim';
import { TOLL_ROUTE_COST } from '../event/config';

/** zones: a ZN x ZN grid of 128-tile squares over the map */
export const ZN = MAP >> 7;
/** turn penalties, seconds */
const TURN: Record<Turn, number> = { S: 0, R: 1.5, L: 3, U: 20 };
/** the local route is used within this many tiles of the destination, and in the destination's zone */
const LOCAL_TILES = 64;
/** A* pops at most this many dsegs */
const ASTAR_POPS = 4000;
/** zone tables refreshed on demand per step, at most */
const ON_DEMAND = 4;
/** A* heuristic speed, m/s (the fastest road class) */
const H_SPEED = 17;
/** seconds added to the link and the movements into a dseg closed by a disaster (Router.setShut): new plans go round it when they can */
export const CLOSED_COST = 3600;

/** zone of a point in tiles, clamped to the map (zones are 128 tiles square, row-major) */
export function zoneOf(x: number, y: number): number {
  const cx = x <= 0 ? 0 : x >= MAP ? ZN - 1 : x >> 7, cy = y <= 0 ? 0 : y >= MAP ? ZN - 1 : y >> 7;
  return cy * ZN + cx;
}

/** a binary min-heap of (key, id) pairs with lazy duplicates; grown as needed, reused */
export class Heap {
  private k = new Float64Array(256); private v = new Int32Array(256); private n = 0;
  /** the key and id of the entry the last pop() removed */
  key = 0; id = -1;
  clear() { this.n = 0; }
  push(key: number, id: number) {
    if (this.n === this.k.length) {
      const k = new Float64Array(2 * this.n), v = new Int32Array(2 * this.n); k.set(this.k); v.set(this.v); this.k = k; this.v = v;
    }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p]! <= key) break; this.k[i] = this.k[p]!; this.v[i] = this.v[p]!; i = p; }
    this.k[i] = key; this.v[i] = id;
  }
  /** removes the smallest entry into key and id; false if the heap is empty */
  pop(): boolean {
    if (!this.n) return false;
    this.key = this.k[0]!; this.id = this.v[0]!;
    const n = --this.n;
    if (n === 0) return true;
    const key = this.k[n]!, id = this.v[n]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.k[c + 1]! < this.k[c]!) c++;
      if (this.k[c]! >= key) break;
      this.k[i] = this.k[c]!; this.v[i] = this.v[c]!; i = c;
    }
    this.k[i] = key; this.v[i] = id;
    return true;
  }
}

/** a typed array grown to at least n entries (its values copied, the rest zero) */
function grown<A extends Float32Array | Float64Array | Int32Array | Uint32Array | Uint8Array>(a: A, n: number): A {
  if (a.length >= n) return a;
  const b = new (a.constructor as new (n: number) => A)(n);
  b.set(a);
  return b;
}

/** the cost table of one destination zone: D[d] = least cost from the end of dseg d to any dseg of zone z (Infinity = none) */
export interface ZoneTable { z: number; D: Float32Array; /** graph version built at */ gv: number; /** cost epoch built at */ ep: number }

/** Routing state of one Sim: the speed and delay estimates, the zone of each dseg, the zone tables, and the A*.
 *  The costs are cached in typed arrays (lcA per dseg, mcA per movement), refreshed every 10 steps and on each graph update. */
export class Router {
  private g!: LaneGraph;
  /** graph version (bumped by onGraph) and cost epoch (bumped every 10 steps) */
  private gv = 0; private ep = 0;
  /** per dseg id: exponential moving average of the mean speed of its vehicles, m/s */
  vEma = new Float32Array(0);
  /** per movement id: measured junction delay, s */
  private dEma = new Float64Array(0);
  /** per movement id: 1 when a vehicle entered it in the current second */
  private used = new Uint8Array(0);
  /** per dseg id: seconds to traverse it (linkCost) */
  private lcA = new Float64Array(0);
  /** per movement id: seconds for it (moveCost) */
  private mcA = new Float64Array(0);
  /** per movement id: the dseg it leaves */
  private mFrom = new Int32Array(0);
  /** per dseg id: the movements whose `to` is that dseg, as the range inOff[d] .. inOff[d + 1] of inList */
  private inOff = new Int32Array(0); private inList = new Int32Array(0); private cursor = new Int32Array(0);
  /** per dseg id: zone of its midpoint (-1 = no dseg) */
  zoneD = new Int32Array(0);
  /** per dseg id: 1 when the dseg was removed or re-keyed in the last onGraph (vehicles aimed at it need a new destination) */
  dGone = new Uint8Array(0);
  /** per dseg id: 1 when a disaster has closed it (setShut): its link and the movements into it cost CLOSED_COST more */
  private shut = new Uint8Array(0); private shutKeys = new Set<string>();
  private dKey: string[] = []; private mKey: string[] = [];
  private tabs = new Map<number, ZoneTable>(); private tabList: ZoneTable[] = []; private rr = -1; private budget = 0;
  /** duration of the last table rebuild, ms */
  tableMs = 0;
  private heap = new Heap(); private aHeap = new Heap();
  private gS = new Float64Array(0); private gSt = new Uint32Array(0); private par = new Int32Array(0); private cl = new Uint32Array(0);
  private stamp = 0;
  private sumV = new Float64Array(0); private cntV = new Float64Array(0);
  private cost = new Float64Array(16); private wt = new Float64Array(16); private cand = new Int32Array(16);
  private pt = { x: 0, y: 0, hx: 0, hy: 0 };

  /** after the graph update: grow the per-dseg and per-movement arrays, note the dsegs that went or changed key, rebuild the
   *  zones, the reverse adjacency and the costs, and mark every zone table stale (the next use or round-robin rebuilds it) */
  onGraph(g: LaneGraph) {
    this.g = g; this.gv++;
    const nD = g.dsegs.length, nM = g.moves.length;
    this.vEma = grown(this.vEma, nD); this.zoneD = grown(this.zoneD, nD); this.dGone = grown(this.dGone, nD);
    this.lcA = grown(this.lcA, nD); this.inOff = grown(this.inOff, nD + 1); this.cursor = grown(this.cursor, nD + 1);
    this.gS = grown(this.gS, nD); this.gSt = grown(this.gSt, nD); this.par = grown(this.par, nD); this.cl = grown(this.cl, nD);
    this.sumV = grown(this.sumV, nD); this.cntV = grown(this.cntV, nD);
    this.dEma = grown(this.dEma, nM); this.used = grown(this.used, nM); this.mcA = grown(this.mcA, nM); this.mFrom = grown(this.mFrom, nM);
    this.inList = grown(this.inList, nM); this.shut = grown(this.shut, nD);
    for (let id = 0; id < nD; id++) {
      const d = g.dsegs[id] ?? null, k = d ? d.key : '', old = this.dKey[id] ?? '';
      this.dGone[id] = old !== '' && old !== k ? 1 : 0;
      // a dseg new at this id (or with another key) starts at its speed limit
      if (k !== old) this.vEma[id] = d ? d.vmax : 0;
      this.dKey[id] = k;
      this.zoneD[id] = d ? zoneOf((d.from.x + d.to.x) / 2, (d.from.y + d.to.y) / 2) : -1;
    }
    for (let m = 0; m < nM; m++) {
      const mv = g.moves[m] ?? null, k = mv ? mv.key : '', old = this.mKey[m] ?? '';
      if (k !== old) this.dEma[m] = 0;
      this.mKey[m] = k;
      this.mFrom[m] = mv ? mv.from : -1;
    }
    // the reverse adjacency (counting sort by the movement's `to`)
    this.inOff.fill(0);
    for (const mv of g.moves) if (mv) this.inOff[mv.to + 1]!++;
    for (let d = 0; d < nD; d++) this.inOff[d + 1]! += this.inOff[d]!;
    this.cursor.set(this.inOff);
    for (const mv of g.moves) if (mv) this.inList[this.cursor[mv.to]!++] = mv.id;
    this.markShut();
    this.refreshCosts();
  }

  /** the closed dsegs, by key (the disasters' closures, both directions of a closed seg): new plans route round them; the zone tables are rebuilt now */
  setShut(keys: Set<string>): void {
    const same = keys.size === this.shutKeys.size && [...keys].every(k => this.shutKeys.has(k));
    this.shutKeys = keys;
    if (!this.g) return;
    this.markShut(); this.refreshCosts();
    if (!same) for (const T of this.tabList) this.build(T);
  }
  /** shut[d] for each current dsegs' key */
  private markShut(): void {
    const nD = this.g.dsegs.length;
    this.shut = grown(this.shut, nD);
    for (let d = 0; d < nD; d++) this.shut[d] = this.shutKeys.size && this.shutKeys.has(this.dKey[d] ?? '') ? 1 : 0;
  }

  /** true if dseg d was removed or re-keyed in the last graph update */
  gone(d: number): boolean { return this.dGone[d] === 1; }

  /** a vehicle left movement m after waiting `wait` s at its line: the junction delay estimate moves toward it */
  feed(m: number, wait: number) { this.dEma[m] = 0.9 * this.dEma[m]! + 0.1 * wait; this.used[m] = 1; if (this.g.moves[m]) this.mcA[m] = this.moveCost(m); }

  /** once per step (after the moves): every 10 steps the cost epoch (speeds and junction delays), then one zone table rebuilt
   *  round-robin; the on-demand budget is reset */
  tick(sim: Sim) {
    this.budget = ON_DEMAND;
    if (sim.steps % 10 === 0) this.costs(sim);
    const n = this.tabList.length;
    if (n) { this.rr = (this.rr + 1) % n; this.build(this.tabList[this.rr]!); }
    sim.stats.tables = n; sim.stats.tableMs = this.tableMs;
  }

  /** seconds for movement m: its length at 8 m/s, its turn penalty, the measured junction delay, and TOLL_ROUTE_COST into a toll gate */
  private moveCost(m: number): number { const mv = this.g.moves[m]!; return mv.len / 8 + TURN[mv.turn] + this.dEma[m]! + (this.g.dsegs[mv.to]?.toll ? TOLL_ROUTE_COST : 0) + (this.shut[mv.to] ? CLOSED_COST : 0); }
  /** recomputes lcA and mcA from the current speeds, delays and lengths */
  private refreshCosts() {
    const g = this.g, nD = g.dsegs.length, nM = g.moves.length;
    for (let d = 0; d < nD; d++) { const dg = g.dsegs[d]; this.lcA[d] = dg ? dg.len / Math.max(this.vEma[d]!, 1) + (this.shut[d] ? CLOSED_COST : 0) : 0; }
    for (let m = 0; m < nM; m++) this.mcA[m] = g.moves[m] ? this.moveCost(m) : 0;
  }

  /** the 1 s cost update: vEma of each dseg from its vehicles (or toward its limit when empty), junction delays relaxed where unused */
  private costs(sim: Sim) {
    const g = this.g, n = g.dsegs.length, S = this.sumV, C = this.cntV, Q = sim.onLane, V = sim.v, lanes = g.lanes;
    S.fill(0, 0, n); C.fill(0, 0, n);
    for (let id = 0; id < Q.length; id++) {
      const q = Q[id]!;
      if (!q.length) continue;
      const ln = lanes[id];
      if (!ln || ln.kind !== LK.LINK) continue;
      let s = 0; for (const i of q) s += V[i]!;
      S[ln.dseg]! += s; C[ln.dseg]! += q.length;
    }
    for (let d = 0; d < n; d++) {
      const dg = g.dsegs[d];
      if (!dg) continue;
      if (C[d]) this.vEma[d] = 0.9 * this.vEma[d]! + 0.1 * (S[d]! / C[d]!);
      else this.vEma[d] = this.vEma[d]! + 0.1 * (dg.vmax - this.vEma[d]!);
    }
    for (let m = 0; m < this.used.length; m++) {
      if (!this.used[m] && g.moves[m]) this.dEma[m] *= 0.99;
      this.used[m] = 0;
    }
    this.refreshCosts();
    this.ep++;
  }

  /** the table of zone z: created (and built) on first use; a table from an older graph is rebuilt on demand while the budget lasts */
  private table(z: number): ZoneTable {
    let T = this.tabs.get(z);
    if (!T) { T = { z, D: new Float32Array(this.g.dsegs.length), gv: -1, ep: -1 }; this.tabs.set(z, T); this.tabList.push(T); this.build(T); }
    else if (T.gv !== this.gv && this.budget > 0) { this.budget--; this.build(T); }
    return T;
  }

  /** the reverse Dijkstra of zone table T over the current costs: seeds are the movements into the zone's dsegs (half of the dseg),
   *  then the predecessors of each settled dseg */
  private build(T: ZoneTable) {
    const t0 = performance.now(), n = this.g.dsegs.length;
    if (T.D.length < n) T.D = new Float32Array(n);
    const D = T.D, H = this.heap, lc = this.lcA, mc = this.mcA, off = this.inOff, list = this.inList, mf = this.mFrom, zd = this.zoneD;
    D.fill(Infinity); H.clear();
    for (let t = 0; t < n; t++) {
      if (zd[t] !== T.z) continue;
      const half = 0.5 * lc[t]!, end = off[t + 1]!;
      for (let p = off[t]!; p < end; p++) {
        const mid = list[p]!, f = mf[mid]!, c = mc[mid]! + half;
        if (c < D[f]!) { D[f] = c; H.push(D[f]!, f); }
      }
    }
    while (H.pop()) {
      const f = H.id, k = H.key;
      if (k > D[f]!) continue;
      const add = lc[f]! + k, end = off[f + 1]!;
      for (let p = off[f]!; p < end; p++) {
        const mid = list[p]!, from = mf[mid]!, c = mc[mid]! + add;
        if (c < D[from]!) { D[from] = c; H.push(D[from]!, from); }
      }
    }
    T.gv = this.gv; T.ep = this.ep;
    this.tableMs = performance.now() - t0;
  }

  /** the driving time (s, at the current costs) from the end of dseg d to zone z (Infinity if unknown or unreachable) */
  timeTo(d: number, z: number): number {
    if (!this.g) return Infinity;
    const D = this.table(z).D;
    if (!(d >= 0 && d < D.length)) return Infinity;
    const v = D[d]!;
    return Number.isFinite(v) ? v : Infinity;
  }

  /** the logit choice at the end of a dseg among the movements `outs` (no U unless it is the only one): cost of the movement +
   *  its dseg + the zone table from there; keeps the costs within max(20, 25%) of the least, weights exp(-(c - cmin) / theta).
   *  Returns the movement, or -1 when none has a finite cost. */
  choose(outs: number[], z: number, rnd: () => number): number {
    const g = this.g, T = this.table(z), D = T.D, n = outs.length;
    if (this.cost.length < n) { this.cost = new Float64Array(2 * n); this.wt = new Float64Array(2 * n); this.cand = new Int32Array(2 * n); }
    let k = 0, cmin = Infinity;
    for (const mid of outs) {
      const m = g.moves[mid]!;
      if (m.turn === 'U' && n > 1) continue;
      const t = m.to, c = this.mcA[mid]! + this.lcA[t]! + (t < D.length ? D[t]! : Infinity);
      if (c === Infinity) continue;
      this.cost[k] = c; this.cand[k] = mid; k++;
      if (c < cmin) cmin = c;
    }
    if (k === 0) return -1;
    const thr = cmin + Math.max(20, 0.25 * cmin), theta = 3 + 0.05 * cmin;
    let tot = 0;
    for (let j = 0; j < k; j++) {
      const c = this.cost[j]!;
      this.wt[j] = c <= thr ? Math.exp(-(c - cmin) / theta) : 0;
      tot += this.wt[j]!;
    }
    let r = rnd() * tot, pick = -1;
    for (let j = 0; j < k; j++) {
      if (this.wt[j]! <= 0) continue;
      pick = this.cand[j]!;
      r -= this.wt[j]!;
      if (r <= 0) break;
    }
    return pick;
  }

  /** the local route from dseg a to dseg e over movements, A* with the straight distance to e's start over H_SPEED as the
   *  heuristic; returns the dsegs after a, ending with e (empty when a is e), or null if none within ASTAR_POPS pops */
  localRoute(a: number, e: number): number[] | null {
    const g = this.g, tgt = g.dsegs[e]!.from, tx = tgt.x, ty = tgt.y, H = this.aHeap;
    const st = ++this.stamp;
    H.clear();
    this.gS[a] = 0; this.gSt[a] = st; this.par[a] = -1; H.push(this.hd(a, tx, ty), a);
    let pops = 0;
    while (pops < ASTAR_POPS && H.pop()) {
      const f = H.id;
      pops++;
      if (this.cl[f] === st) continue;
      this.cl[f] = st;
      if (f === e) {
        const r: number[] = [];
        for (let x = f; x !== a; x = this.par[x]!) r.push(x);
        return r.reverse();
      }
      const gf = this.gS[f]!;
      for (const mid of g.dsegs[f]!.out) {
        const t = this.g.moves[mid]!.to;
        if (this.cl[t] === st || !g.dsegs[t]) continue;
        const gc = gf + this.mcA[mid]! + this.lcA[t]!;
        if (this.gSt[t] !== st || gc < this.gS[t]!) { this.gS[t] = gc; this.gSt[t] = st; this.par[t] = f; H.push(gc + this.hd(t, tx, ty), t); }
      }
    }
    return null;
  }
  /** A* heuristic: seconds of straight-line distance from the end of dseg d to (tx, ty) at H_SPEED */
  private hd(d: number, tx: number, ty: number): number {
    const t = this.g.dsegs[d]!.to;
    return Math.hypot(t.x - tx, t.y - ty) * MPT / H_SPEED;
  }

  /** true if dseg cur's `to` node is within LOCAL_TILES of the point s metres along dseg e's first lane */
  near(cur: number, e: number, s: number): boolean {
    const e0 = this.g.dsegs[e]!.lanes[0];
    if (e0 === undefined) return false; // an empty dseg (a one-way's back direction) has no lanes to be near
    laneAt(this.g.lanes[e0]!, s, this.pt);
    const t = this.g.dsegs[cur]!.to;
    return Math.hypot(t.x - this.pt.x, t.y - this.pt.y) <= LOCAL_TILES;
  }
}
