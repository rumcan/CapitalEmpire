// The taxi company dispatch brain (T011): ranks, a fleet of taxis (idle, en-route to pickup, carrying a fare,
// returning), requests from a party of 1-4 people from A to B, nearest-idle-taxi dispatch, queueing with a
// wait limit (parties give up), fares (1985 prices: flag fall + per km + per minute), driver cost per hour,
// fuel per km, and rebalancing of idle taxis to ranks with waiting demand. Pure TS: no DOM, no React, no
// WebGL. The lead drives the taxis as sim vehicles via the Order[] returned by step().

import type { Pt } from '../../network';
import { mulberry } from '../../iso';

/** a taxi rank (stand): its id, its position (tiles) and how many taxis can wait there */
export interface Rank { id: number; at: Pt; capacity: number }
/** a request: a party of 1-4 people wants to go from (from) to (to), posted at sim time t, giving up after maxWait seconds */
export interface Request { id: number; from: Pt; to: Pt; people: number; t: number; maxWait: number }
/** an order the caller drives: kind 'pickup' sends taxi to a request's pickup, 'dropoff' to the request's destination,
 *  'rank' sends the taxi to a rank (rebalance / return). taxi is the taxi id, request is the request id for pickup/dropoff,
 *  -1 for rank returns. */
export interface Order { taxi: number; request: number; kind: 'pickup' | 'dropoff' | 'rank'; to: Pt }

/** metres per tile (tiles are 2 m) */
const TILE_M = 2;
/** metres per km */
const M_PER_KM = 1000;
/** tiles per km */
const TILES_PER_KM = M_PER_KM / TILE_M;

// ---- 1985 fares and costs (US dollars, placeholders the lead tunes) ----
/** flag fall (boarding charge) in dollars */
const FLAG_FALL = 1.1;
/** per-km charge in dollars */
const PER_KM = 0.9;
/** per-minute charge in dollars (applies to wait + ride) */
const PER_MIN = 0.2;
/** driver cost in dollars per hour (wages) */
const DRIVER_PER_HR = 6.0;
/** fuel cost in dollars per km */
const FUEL_PER_KM = 0.06;

/** one taxi in the fleet */
interface Taxi {
  id: number;
  /** current position (tiles) – updated when the taxi reaches a target */
  pos: Pt;
  /** state */
  state: 'idle' | 'pickup' | 'dropoff' | 'returning';
  /** the request the taxi is currently serving, or -1 */
  reqId: number;
  /** the rank the taxi is returning to / waiting at, or -1 */
  rankId: number;
  /** sim time the current order was issued (for cost timing) */
  orderT: number;
}

/** a queued request waiting for a taxi */
interface Queued {
  req: Request;
  /** the party is waiting at from – track how long for timeout */
}

/** the dispatch brain */
export class Taxis {
  private ranks: Rank[];
  private rankById: Map<number, Rank>;
  private taxis: Taxi[];
  /** travel-time oracle supplied by the caller: seconds between two tile points */
  private travelTime: (a: Pt, b: Pt) => number;
  /** requests waiting for dispatch (FIFO) */
  private queue: Queued[] = [];
  /** active (served) request ids -> the request (for distance / fare when dropped off) */
  private active = new Map<number, Request>();
  /** already-served count */
  private nServed = 0;
  /** parties that gave up (timeout) */
  private nGaveUp = 0;
  /** total fares earned (dollars) */
  private rev = 0;
  /** total driver + fuel costs so far (dollars) */
  private cost = 0;
  /** summed wait time (s) of served fares, for meanWait */
  private waitSum = 0;
  constructor(seed: number, ranks: Rank[], fleet: number, travelTime: (a: Pt, b: Pt) => number) {
    this.ranks = ranks.slice();
    this.rankById = new Map();
    for (const r of ranks) this.rankById.set(r.id, r);
    this.travelTime = travelTime;
    // seed consumed for determinism; reserved for future tie-breaking/jitter
    void mulberry(seed);
    this.taxis = [];
    // distribute taxis round-robin to ranks' positions; ranks with no capacity get none
    for (let i = 0; i < fleet; i++) {
      // find the next rank with positive capacity (capacity is a soft target the lead enforces)
      let rIdx = i % this.ranks.length;
      for (let k = 0; k < this.ranks.length; k++) {
        const r = this.ranks[rIdx]!;
        if (r.capacity > 0) break;
        rIdx = (rIdx + 1) % this.ranks.length;
      }
      const rank = this.ranks[rIdx]!;
      this.taxis.push({
        id: i,
        pos: { x: rank.at.x, y: rank.at.y },
        state: 'idle',
        reqId: -1,
        rankId: rank.id,
        orderT: 0,
      });
    }
  }

  /** Euclidean tile distance (used to convert tile distance to km for fares/fuel when route km is not known) */
  private tileDist(a: Pt, b: Pt): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** queue a new request. Assignments to idle taxis happen on the next step() call (the API returns
   *  Orders only via step, since request() returns void). */
  request(r: Request): void {
    this.queue.push({ req: r });
  }

  /** assign queued requests to idle taxis, nearest-idle first by travel time to the pickup point.
   *  Appends newly issued pickup Orders to out. */
  private assignQueued(t: number, out: Order[]): void {
    if (this.queue.length === 0) return;
    // build a list of idle taxi indices once
    const idleIdx: number[] = [];
    for (let i = 0; i < this.taxis.length; i++) if (this.taxis[i]!.state === 'idle') idleIdx.push(i);
    if (idleIdx.length === 0) return;
    // greedy: for each queued request in FIFO order, assign to nearest idle taxi; the taxi is no longer
    // idle after assignment, so one taxi can only take one request per step.
    const remaining: Queued[] = [];
    for (const q of this.queue) {
      let bestI = -1;
      let bestT = Infinity;
      for (const k of idleIdx) {
        const tx = this.taxis[k]!;
        if (tx.state !== 'idle') continue;
        const tt = this.travelTime(tx.pos, q.req.from);
        if (tt < bestT) { bestT = tt; bestI = k; }
      }
      if (bestI >= 0) {
        out.push(this.assignPickup(bestI, q.req, t));
      } else {
        remaining.push(q);
      }
    }
    this.queue = remaining;
  }

  /** assign taxi txi to pick up req, issuing a 'pickup' order and accruing driver cost to now */
  private assignPickup(txi: number, req: Request, tNow: number): Order {
    const tx = this.taxis[txi]!;
    // accrue costs accumulated on the previous idle/return leg
    this.accrueCosts(tx, tNow);
    tx.state = 'pickup';
    tx.reqId = req.id;
    tx.rankId = -1;
    tx.orderT = tNow;
    this.active.set(req.id, req);
    return { taxi: tx.id, request: req.id, kind: 'pickup', to: { x: req.from.x, y: req.from.y } };
  }

  /** accrue driver costs for the current leg (called when a leg ends or a new leg begins).
   *  fuel cost is added separately when the leg length is known. */
  private accrueCosts(tx: Taxi, tNow: number): void {
    if (tx.orderT > 0 && tNow > tx.orderT) {
      const dt = tNow - tx.orderT;
      // driver cost proportional to on-order seconds (active taxi = on the clock)
      this.cost += (dt / 3600) * DRIVER_PER_HR;
    }
    tx.orderT = tNow;
  }

  /** step the dispatcher at sim time t (seconds). reached is the list of taxi ids that just
   *  reached their previous Order target. Returns new orders for the caller to drive. */
  step(t: number, reached: number[]): Order[] {
    const out: Order[] = [];
    // expire queued requests that exceeded their maxWait
    if (this.queue.length) {
      const keep: Queued[] = [];
      for (const q of this.queue) {
        if (t - q.req.t >= q.req.maxWait) {
          this.nGaveUp++;
        } else {
          keep.push(q);
        }
      }
      this.queue = keep;
    }
    // process taxis that reached their target this step
    for (const id of reached) {
      const tx = this.taxis[id];
      if (!tx) continue;
      if (tx.state === 'pickup' && tx.reqId >= 0) {
        const req = this.active.get(tx.reqId);
        if (req) {
          const km = this.tileDist(tx.pos, req.from) / TILES_PER_KM;
          this.cost += km * FUEL_PER_KM;
          tx.pos = { x: req.from.x, y: req.from.y };
          this.accrueCosts(tx, t);
          tx.state = 'dropoff';
          out.push({ taxi: tx.id, request: req.id, kind: 'dropoff', to: { x: req.to.x, y: req.to.y } });
          continue;
        }
      } else if (tx.state === 'dropoff' && tx.reqId >= 0) {
        const req = this.active.get(tx.reqId);
        if (req) {
          const km = this.tileDist(tx.pos, req.to) / TILES_PER_KM;
          this.cost += km * FUEL_PER_KM;
          tx.pos = { x: req.to.x, y: req.to.y };
          const totalMin = Math.max(0, t - req.t) / 60;
          const tripKm = this.tileDist(req.from, req.to) / TILES_PER_KM;
          const fare = FLAG_FALL + PER_KM * tripKm + PER_MIN * totalMin;
          this.rev += fare;
          this.waitSum += Math.max(0, t - req.t);
          this.nServed++;
          this.active.delete(tx.reqId);
          this.accrueCosts(tx, t);
          tx.state = 'idle';
          tx.reqId = -1;
          tx.rankId = -1;
        }
      } else if (tx.state === 'returning') {
        if (tx.rankId >= 0) {
          const r = this.rankById.get(tx.rankId);
          if (r) {
            const km = this.tileDist(tx.pos, r.at) / TILES_PER_KM;
            this.cost += km * FUEL_PER_KM;
            tx.pos = { x: r.at.x, y: r.at.y };
          }
        }
        this.accrueCosts(tx, t);
        tx.state = 'idle';
      }
    }
    // assign idle taxis to queued requests (FIFO, nearest idle taxi per request)
    this.assignQueued(t, out);
    // rebalance idle taxis that remain idle toward the rank with waiting demand (or the nearest rank)
    for (let i = 0; i < this.taxis.length; i++) {
      const tx = this.taxis[i]!;
      if (tx.state !== 'idle') continue;
      const target = this.rebalanceTarget(tx);
      if (target && (Math.abs(target.at.x - tx.pos.x) > 1e-6 || Math.abs(target.at.y - tx.pos.y) > 1e-6)) {
        this.accrueCosts(tx, t);
        tx.state = 'returning';
        tx.rankId = target.id;
        tx.reqId = -1;
        out.push({ taxi: tx.id, request: -1, kind: 'rank', to: { x: target.at.x, y: target.at.y } });
      }
    }
    return out;
  }

  /** pick the rank an idle taxi should return to: the one with the most waiting demand (queued
   *  requests closer to it than to any other rank). Ties broken by smallest rank id. If no rank
   *  has any demand, returns the nearest rank (so idle taxis don't drift). */
  private rebalanceTarget(tx: Taxi): Rank | null {
    if (this.ranks.length === 0) return null;
    // count demand "at" each rank (queue requests assigned by nearest rank to req.from)
    const demand = new Array<number>(this.ranks.length).fill(0);
    for (const q of this.queue) {
      let best = 0;
      let bestD = this.tileDist(this.ranks[0]!.at, q.req.from);
      for (let ri = 1; ri < this.ranks.length; ri++) {
        const d = this.tileDist(this.ranks[ri]!.at, q.req.from);
        if (d < bestD) { bestD = d; best = ri; }
      }
      demand[best]!++;
    }
    // pick rank with highest demand > 0
    let bestRi = -1;
    let bestDem = 0;
    for (let ri = 0; ri < this.ranks.length; ri++) {
      if (demand[ri]! > bestDem) { bestDem = demand[ri]!; bestRi = ri; }
    }
    if (bestRi < 0) {
      // no demand anywhere: send to nearest rank if not already at one
      let nearest = 0;
      let bestD = this.tileDist(tx.pos, this.ranks[0]!.at);
      for (let ri = 1; ri < this.ranks.length; ri++) {
        const d = this.tileDist(tx.pos, this.ranks[ri]!.at);
        if (d < bestD) { bestD = d; nearest = ri; }
      }
      return bestD < 1e-6 ? null : this.ranks[nearest]!;
    }
    const target = this.ranks[bestRi]!;
    // already there?
    if (this.tileDist(tx.pos, target.at) < 1e-6) return null;
    return target;
  }

  /** aggregate stats the lead can display */
  stats(): { served: number; gaveUp: number; revenue: number; costs: number; meanWait: number } {
    return {
      served: this.nServed,
      gaveUp: this.nGaveUp,
      revenue: this.rev,
      costs: this.cost,
      meanWait: this.nServed > 0 ? this.waitSum / this.nServed : 0,
    };
  }
}
