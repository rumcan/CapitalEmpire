// Trips: where vehicles start and where they want to go. An origin is a link lane weighted by length over the map; the
// destination zone is drawn by a gravity model (zone length times exp(-distance / 1500 m)), then a lane in it by length.
// Rebuilt on every graph update; the weights per origin zone are cached until the next one. Also the lot trips (mode 'lots'):
// the built lots send their trips by the hour and the time of day, from and to their driveways. Pure TS, no DOM.
import { MPT, LK, type LaneGraph, laneAt } from './lanes';
import { ZN, zoneOf } from './routing';
import { dot, norm, perp, sub, type Seg } from '../network';
import type { Lot } from '../lots/lots';
import { LU } from '../lots/town';
import type { Sim } from './sim';

/** sim seconds per in-game day: one game minute per sim second */
export const DAY = 1440;
/** lanes shorter than this take no trips, metres */
const MIN_LEN = 10;
/** the gravity decay length, metres; the origin's own zone counts at OWN_ZONE_M */
const DECAY = 1500, OWN_ZONE_M = 400;
/** a driveway's s is kept this far from the lane's ends, metres */
const DRIVE_END = 3;
/** lot trips: trips per resident per day (0.6, not a real 2+: the game day is 24 minutes while cars drive at real speed, so a
 *  2 km trip lasts hours of game time; each car stands for several people's trips), the share of off-peak trips that shop (RES to COM or TOUR), the trips kept pending per lot,
 *  the draws tried for a destination (rejection sampling on the distance decay) */
const PER_RES = 0.6, SHOP = 0.7, PEND_MAX = 4, PICK_TRIES = 8;
/** a destination is at least MIN_DEST metres (straight line) from its origin when one of DEST_TRIES draws is; else the farthest */
const MIN_DEST = 300, DEST_TRIES = 4;
/** zones: ZN x ZN, each 128 tiles square */
const NZ = ZN * ZN, ZONE_TILES = 128;
/** the demand curve's knots: [hour, share of the peak]; the curve runs from the first knot to the first knot + 24 h */
const KNOTS: [number, number][] = [[3, 0.35], [8, 1], [12, 0.7], [17, 1], [22, 0.5]];

/** the share of the peak demand at sim time t (seconds), hour = (t / 60) % 24: cosine-eased between the knots (3 h 0.35, 8 h 1,
 *  12 h 0.7, 17 h 1, 22 h 0.5, wrapping), so it is flat at each peak and never leaves [0.35, 1] */
export function demandAt(t: number): number {
  let h = (t / 60) % 24; if (h < 0) h += 24; if (h < KNOTS[0]![0]) h += 24;
  for (let k = 0; k < KNOTS.length; k++) {
    const last = k + 1 === KNOTS.length, h0 = KNOTS[k]![0], v0 = KNOTS[k]![1];
    const h1 = last ? KNOTS[0]![0] + 24 : KNOTS[k + 1]![0], v1 = KNOTS[last ? 0 : k + 1]![1];
    if (h >= h0 && h < h1) return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * (h - h0) / (h1 - h0))) / 2;
  }
  return KNOTS[0]![1];
}

/** The trip generator of one Sim: origins over the map, destinations by zone; draws use the sim's random source */
export class Trips {
  private g!: LaneGraph;
  /** the spawn table: link lanes (not tunnels, at least MIN_LEN) and their cumulative lengths over the map */
  private sIds: number[] = []; private sCum: number[] = []; private sTot = 0;
  /** per zone: its link lanes, their cumulative lengths (m), and the total length (m) */
  private zLane: Int32Array[] = []; private zCum: Float64Array[] = []; private zLen = new Float64Array(NZ);
  /** per origin zone (row): cumulative gravity weights over the zones, their total, and 1 once built for this graph */
  private wCum = new Float64Array(NZ * NZ); private wTot = new Float64Array(NZ); private wOk = new Uint8Array(NZ);
  /** the s (m) of the last origin, and of the last destination */
  oS = 0; destS = 0;
  private rnd: () => number;
  /** a scratch lane position (allocation-free) */
  private pt = { x: 0, y: 0, hx: 0, hy: 0 };

  constructor(rnd: () => number) { this.rnd = rnd; }

  /** after a graph update: the spawn table, the zone lanes and their lengths; the weights are rebuilt on demand */
  onGraph(g: LaneGraph) {
    this.g = g; this.sIds = []; this.sCum = []; let tot = 0;
    const lists: number[][] = [];
    for (let z = 0; z < NZ; z++) lists.push([]);
    for (const ln of g.lanes) {
      if (!ln || ln.kind !== LK.LINK || ln.tunnel || ln.len < MIN_LEN) continue;
      tot += ln.len; this.sIds.push(ln.id); this.sCum.push(tot);
      laneAt(ln, ln.len / 2, this.pt); lists[zoneOf(this.pt.x, this.pt.y)]!.push(ln.id);
    }
    this.sTot = tot; this.zLane = []; this.zCum = [];
    for (let z = 0; z < NZ; z++) {
      const ids = Int32Array.from(lists[z]!), cum = new Float64Array(ids.length); let c = 0;
      for (let k = 0; k < ids.length; k++) { c += g.lanes[ids[k]!]!.len; cum[k] = c; }
      this.zLane.push(ids); this.zCum.push(cum); this.zLen[z] = c;
    }
    this.wOk.fill(0);
  }

  /** an origin: a link lane weighted by length over the map (its s in oS, in [5, len - 5]); -1 if there are no lanes */
  origin(): number {
    const n = this.sIds.length;
    if (!n) return -1;
    const r = this.rnd() * this.sTot, c = this.sCum;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m]! > r) hi = m; else lo = m + 1; }
    const id = this.sIds[lo]!;
    this.oS = this.rnd() * (this.g.lanes[id]!.len - MIN_LEN) + 5;
    return id;
  }

  /** a destination for a trip from (ox, oy): up to DEST_TRIES draws, the first at least MIN_DEST metres away (else the farthest).
   *  Returns the dseg (-1 if there are no lanes); its s is in destS */
  dest(ox: number, oy: number): number {
    const oz = zoneOf(ox, oy);
    let best = -1, bestD = -1, bestS = 0;
    for (let k = 0; k < DEST_TRIES; k++) {
      const id = this.draw(oz);
      if (id < 0) break;
      const ln = this.g.lanes[id]!;
      laneAt(ln, this.destS, this.pt);
      const far = Math.hypot(this.pt.x - ox, this.pt.y - oy) * MPT;
      if (far >= MIN_DEST) return ln.dseg;
      if (far > bestD) { bestD = far; best = ln.dseg; bestS = this.destS; }
    }
    this.destS = bestS;
    return best;
  }

  /** a lane drawn from origin zone oz by the gravity weights, its s in destS; -1 if no zone has any weight */
  private draw(oz: number): number {
    if (!this.wOk[oz]) this.weights(oz);
    const tot = this.wTot[oz]!;
    if (!(tot > 0)) return -1;
    const row = oz * NZ, c = this.wCum, r = this.rnd() * tot;
    let lo = 0, hi = NZ - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[row + m]! > r) hi = m; else lo = m + 1; }
    const ids = this.zLane[lo]!, cum = this.zCum[lo]!, q = this.rnd() * cum[cum.length - 1]!;
    let a = 0, b = ids.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (cum[m]! > q) b = m; else a = m + 1; }
    const id = ids[a]!;
    this.destS = this.rnd() * (this.g.lanes[id]!.len - MIN_LEN) + 5;
    return id;
  }

  /** the cumulative gravity weights from origin zone oz: zone length times exp(-d / DECAY), d the metres between the zone centres
   *  (OWN_ZONE_M for oz itself) */
  private weights(oz: number) {
    const row = oz * NZ, ox = oz % ZN, oy = (oz / ZN) | 0;
    let c = 0;
    for (let z = 0; z < NZ; z++) {
      const L = this.zLen[z]!;
      if (L > 0) {
        const d = z === oz ? OWN_ZONE_M : MPT * ZONE_TILES * Math.hypot(z % ZN - ox, ((z / ZN) | 0) - oy);
        c += L * Math.exp(-d / DECAY);
      }
      this.wCum[row + z] = c;
    }
    this.wTot[oz] = c; this.wOk[oz] = 1;
  }
}

/** the mean of demandAt over a day: a lot's hourly rate is its share of the day's trips over this */
const MEAN_DEMAND = (() => { let s = 0; for (let t = 0; t < DAY; t++) s += demandAt(t); return s / DAY; })();

/** a driveway: the link lane a lot's cars join or leave the road by, and s (m) where the lot's frontage meets it */
export interface Drive { lane: number; s: number }
/** a built lot for the trips: its parcel, its use (LU), residents and jobs */
export interface Built { lot: Lot; use: number; pop: number; jobs: number }

/** the driveway of a lot: the outermost link lane of the directed seg whose traffic has the lot on its right (the lanes sit on
 *  perp(u), the right-hand side of the heading u, so dot(perp(u), lot.n) > 0; a one-way seg has only its forward lanes, so a lot on its left
 *  takes their leftmost lane), with s the projection of the frontage midpoint on
 *  it (m, clamped to [DRIVE_END, len - DRIVE_END]). byseg maps a seg to its dseg ids (else the dsegs are scanned). null if none. */
export function driveway(lot: Lot, g: LaneGraph, byseg?: Map<Seg, number[]>): Drive | null {
  const ids = byseg ? byseg.get(lot.seg) ?? [] : g.dsegs.flatMap(d => d && d.seg === lot.seg ? [d.id] : []);
  for (const id of ids) {
    const d = g.dsegs[id];
    if (!d || d.seg !== lot.seg || !d.lanes.length) continue;
    // a one-way seg's only lanes are its forward dseg's: a lot on its left takes the leftmost lane, one on its right the rightmost
    const side = dot(perp(norm(sub(d.to, d.from))), lot.n);
    if (side <= 0 && !d.seg.cls.oneway) continue;
    const ln = g.lanes[d.lanes[side > 0 ? d.lanes.length - 1 : 0]!]!;
    if (ln.len < 2 * DRIVE_END) return null;
    const p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, u = norm(sub({ x: ln.pts[2]!, y: ln.pts[3]! }, p0));
    const s = Math.min(ln.len - DRIVE_END, Math.max(DRIVE_END, dot(sub(lot.front, p0), u) * MPT));
    return { lane: ln.id, s };
  }
  return null;
}

/** a trip waiting to leave: its destination lot, the sim time it may leave (its departure, within its hour), and the destination's use (LU) */
interface Trip { to: Lot; due: number; use: number }
/** a built lot in the trips' lists: its use, residents, jobs, its fraction of a trip carried over, and its trips waiting to leave */
interface Rec { lot: Lot; use: number; pop: number; jobs: number; acc: number; pend: Trip[]; busy: boolean }
/** the cumulative weights of a list */
const cumOf = (list: Rec[], w: (r: Rec) => number): number[] => { const c: number[] = []; let t = 0; for (const r of list) c.push(t += w(r)); return c; };

/** The lot trips (sim mode 'lots'). Each game hour every built RES lot sends trips at PER_RES * residents / 24 times the demand
 *  share of the hour (over the day's mean); morning hours (6 to 11) go home to a job lot, evening hours (15 to 21) come home from
 *  a job lot, and other hours are 70% shopping (to COM or TOUR) and 30% to any job lot. Destinations are drawn by jobs and the
 *  distance decay exp(-d / DECAY). Each trip leaves at a seeded time within its hour (a platoon at the hour's start inflates the
 *  ratio of the trips behind it), from its origin driveway, and waits there (up to PEND_MAX per lot) until there is room. */
export class LotTrips {
  /** the built lots by key, and the lists trips are drawn from: homes (RES with residents), jobs, shops (COM or TOUR), with the cumulative jobs */
  private recs = new Map<string, Rec>();
  private homes: Rec[] = []; private jobsL: Rec[] = []; private shops: Rec[] = [];
  private jobC: number[] = []; private shopC: number[] = [];
  /** the lots with trips waiting */
  private busy: Rec[] = [];
  /** the driveway of each lot by key (null: none), cleared on every graph update; the dsegs by seg, built on first use */
  private cache = new Map<string, Drive | null>(); private bySeg: Map<Seg, number[]> | null = null;
  /** the road join of two lots (City: the same component of the road network); a destination must be joined to its origin. null: no check */
  joined: ((a: Lot, b: Lot) => boolean) | null = null;
  private g!: LaneGraph;
  /** the game hour generated last (-1 = none yet) */
  private hour = -1;
  private rnd: () => number;

  constructor(rnd: () => number) { this.rnd = rnd; }

  /** after a graph update: the driveways are looked up again */
  onGraph(g: LaneGraph) { this.g = g; this.cache.clear(); this.bySeg = null; }

  /** the built lots (from the town, once a game hour). New lots join; the lots gone lose their waiting trips. Returns the trips dropped. */
  setBuilt(list: Built[]): number {
    let dropped = 0;
    const next = new Map<string, Rec>();
    for (const b of list) {
      let r = this.recs.get(b.lot.key);
      // a new lot starts its trip counter at a random phase, or every lot built in the same hour would leave in the same hour
      if (!r) r = { lot: b.lot, use: b.use, pop: b.pop, jobs: b.jobs, acc: this.rnd(), pend: [], busy: false };
      r.lot = b.lot; r.use = b.use; r.pop = b.pop; r.jobs = b.jobs;
      next.set(b.lot.key, r);
    }
    for (const [k, r] of this.recs) if (!next.has(k)) { dropped += r.pend.length; r.pend.length = 0; }
    this.recs = next;
    this.homes = []; this.jobsL = []; this.shops = [];
    for (const r of next.values()) {
      if (r.use === LU.RES) { if (r.pop > 0) this.homes.push(r); }
      else if (r.jobs > 0) { this.jobsL.push(r); if (r.use === LU.COM || r.use === LU.TOUR) this.shops.push(r); }
    }
    this.jobC = cumOf(this.jobsL, r => r.jobs); this.shopC = cumOf(this.shops, r => r.jobs);
    return dropped;
  }

  /** once per sim step (lots mode): at the start of each game hour its trips are made; then the waiting trips try to leave */
  step(sim: Sim) {
    const H = Math.floor(sim.t / 60);
    if (H !== this.hour) { this.hour = H; this.generate(sim, H); }
    if (this.busy.length) this.retry(sim);
  }

  /** the trips of game hour H: each home's share of the day's trips for the hour, by the hour's kind */
  /** the hour H is the sim hour (scheduling); its kind and demand come from the game clock's hour C, so a frozen evening keeps making evening trips */
  private generate(sim: Sim, H: number) {
    const C = Math.floor(sim.clock / 60), hod = ((C % 24) + 24) % 24, k = PER_RES / 24 * demandAt(C * 60 + 30) / MEAN_DEMAND;
    const morning = hod >= 6 && hod <= 11, evening = hod >= 15 && hod <= 21;
    for (const r of this.homes) {
      r.acc += r.pop * k; const n = Math.floor(r.acc); r.acc -= n;
      for (let j = 0; j < n; j++) {
        const due = H * 60 + this.rnd() * 60;
        if (evening) { const o = this.pick(this.jobsL, this.jobC, r.lot); if (o) this.add(sim, o, r.lot, due, LU.RES); }
        else if (morning) { const d = this.pick(this.jobsL, this.jobC, r.lot); if (d) this.add(sim, r, d.lot, due, d.use); }
        else {
          const d = this.rnd() < SHOP ? this.pick(this.shops, this.shopC, r.lot) : this.pick(this.jobsL, this.jobC, r.lot);
          if (d) this.add(sim, r, d.lot, due, d.use);
        }
      }
    }
  }

  /** queues a trip from lot rec `from` to lot `to`, its destination's use `use` (the oldest is dropped when PEND_MAX wait) */
  private add(sim: Sim, from: Rec, to: Lot, due: number, use: number) {
    if (to.key === from.lot.key) return;
    if (from.pend.length >= PEND_MAX) { from.pend.shift(); sim.stats.dropped++; }
    from.pend.push({ to, due, use });
    if (!from.busy) { from.busy = true; this.busy.push(from); }
  }

  /** the waiting trips leave their driveways in order, as far as there is room; a trip whose driveway or destination is gone is
   *  dropped, and so is one that would turn back on its own dseg. Lots with nothing waiting leave the list. */
  private retry(sim: Sim) {
    const B = this.busy;
    for (let b = 0; b < B.length; b++) {
      const r = B[b]!;
      for (let i = 0; i < r.pend.length;) {
        const p = r.pend[i]!;
        if (p.due > sim.t) { i++; continue; }
        const o = this.drive(r.lot), d = this.drive(p.to);
        const dest = d ? this.g.lanes[d.lane]!.dseg : -1;
        if (!o || !d || (dest === this.g.lanes[o.lane]!.dseg && d.s < o.s)) { r.pend.splice(i, 1); sim.stats.dropped++; continue; }
        const res = sim.spawnAt(o.lane, o.s, dest, d.s, p.use);
        if (res === -1) { i++; continue; }
        r.pend.splice(i, 1);
      }
      if (!r.pend.length) { r.busy = false; B.splice(b--, 1); }
    }
  }

  /** the driveway of a lot, cached until the next graph update */
  private drive(lot: Lot): Drive | null {
    let d = this.cache.get(lot.key);
    if (d === undefined) {
      if (!this.bySeg) {
        this.bySeg = new Map();
        for (const ds of this.g.dsegs) if (ds) { const q = this.bySeg.get(ds.seg); if (q) q.push(ds.id); else this.bySeg.set(ds.seg, [ds.id]); }
      }
      d = driveway(lot, this.g, this.bySeg); this.cache.set(lot.key, d);
    }
    return d;
  }

  /** a list entry drawn by its weight (cum) times exp(-d / DECAY), d the metres from `from`: rejection sampling, PICK_TRIES draws.
   *  A draw not joined to `from` (see joined) is rejected and the draw goes on; the last one stands only if it is joined. null if none is
   *  accepted or the list is empty. The joined check reads no random number, so with every entry joined the draws are as before */
  private pick(list: Rec[], cum: number[], from: Lot): Rec | null {
    const n = list.length; if (!n) return null;
    const tot = cum[n - 1]!; let r: Rec | null = null;
    for (let k = 0; k < PICK_TRIES; k++) {
      const x = this.rnd() * tot; let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m]! > x) hi = m; else lo = m + 1; }
      r = list[lo]!;
      const d = Math.hypot(r.lot.c.x - from.c.x, r.lot.c.y - from.c.y) * MPT;
      if (this.rnd() < Math.exp(-d / DECAY) && (!this.joined || this.joined(r.lot, from))) return r;
    }
    return r && (!this.joined || this.joined(r.lot, from)) ? r : null;
  }
}
