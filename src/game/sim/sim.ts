// The traffic simulation core: IDM car following on the lane graph, vehicles in fixed slots. Pure TS, no DOM.
// Hot paths (step, writeFrame) are allocation-free; plans are only built when a vehicle picks a movement.
import { mulberry } from '../iso';
import { CAR, idm } from './idm';
import { CTL, LK, type Lane, type LaneGraph, type SignalPlan, laneAt } from './lanes';
import { SIG, phaseState } from './signals';
import { Router } from './routing';
import { Trips, demandAt } from './trips';

/** seconds per step */
export const DT = 0.1;
/** metres searched ahead along the plan for a leader and for a plan end */
export const LOOKAHEAD = 150;
/** vehicle types (the renderer's sprite sets): length in metres */
export const VTYPES = [{ len: 4.5 }, { len: 5.5 }, { len: 5.5 }, { len: 5.3 }, { len: 5.3 }];

/** a virtual stop sits this far short of its line, metres (keeps a vehicle from transferring onto it) */
const STOP_MARGIN = 0.05;
/** spawn keeps this many metres clear of other vehicles on the lane (spawnAt) */
const SPAWN_GAP = 8;
/** a spawn (spawn()) is refused when its origin's dseg has a mean speed under this many m/s (a jam), or a vehicle is within SPAWN_CLEAR m */
const THROTTLE_V = 2, SPAWN_CLEAR = 15;
/** spawn attempts per step in fill() */
const FILL_TRIES = 40;
/** towing: a vehicle stuck (under 0.5 m/s) this many seconds in a junction box, or anywhere, is removed */
const TOW_BOX = 60, TOW_ANY = 300;
/** lane changes (MOBIL): evaluated every MOBIL_EVERY steps, politeness, incentive threshold, and the lane ends kept clear, metres */
const MOBIL_EVERY = 5, MOBIL_P = 0.3, MOBIL_TH = 0.2, MOBIL_START = 10, MOBIL_END = 15;
/** a signal lets a vehicle on only if it reaches the line this many seconds before the phase turns red, s */
const SIG_MARGIN = 0.5;

/** The vehicles of one graph. Slot i is one vehicle while alive[i] is 1; the lists hold the vehicles of each lane, front first. */
export class Sim {
  g: LaneGraph; t = 0; steps = 0; cap: number; active = 0;
  alive: Uint8Array; lane: Int32Array; s: Float64Array; v: Float32Array; acc: Float32Array; len: Float32Array;
  vtype: Uint8Array; v0f: Float32Array; lat: Float32Array;
  move: Int32Array; plan: (number[] | null)[]; pi: Int16Array;
  stuck: Float32Array;
  /** junction control per slot: the connector granted (-1), the lane where its room is reserved (-1), seconds waiting at a line,
   *  1 once stopped at a line, the movement it wants at the end of its lane (-1 = none) */
  grant: Int32Array; resv: Int32Array; wait: Float32Array; stopped: Uint8Array; want: Int32Array;
  /** routing per slot: the destination dseg (-1 = none, a random walk), metres along it, the dsegs still to take (null = none),
   *  the junction decisions in a row that found no finite cost */
  dest: Int32Array; destS: Float64Array; route: (number[] | null)[]; noRoute: Uint8Array;
  router = new Router();
  /** per lane: slots granted into it and not yet on it; metres reserved on it by grants */
  granted: number[][] = []; resvLen = new Float64Array(0);
  /** per lane: vehicle slots on it, front first (largest s first) */
  onLane: number[][] = [];
  target = 0;
  /** true: fill() aims at round(target * demandAt(t)) (the daily profile); arrivals bring the count down on their own */
  profile = false;
  rnd: () => number;
  stats = { spawned: 0, respawned: 0, stepMs: 0, towed: 0, throughput: 0, laneChanges: 0, arrived: 0, lost: 0, throttled: 0, tableMs: 0, tables: 0 };
  /** where new trips start and end (origins, destinations by zone) */
  trips: Trips;
  /** a scratch lane position (allocation-free) */
  private pt = { x: 0, y: 0, hx: 0, hy: 0 };
  /** per slot: distance to the nearest virtual stop (plan end or gate), metres; Infinity = none */
  private vg: Float64Array;
  /** every slot below hint is alive */
  private hint = 0;
  private scratch = { x: 0, y: 0, hx: 0, hy: 0 };
  /** lane positions for the lane change (allocation-free) */
  private pa = { x: 0, y: 0, hx: 0, hy: 0 }; private pb = { x: 0, y: 0, hx: 0, hy: 0 };
  /** per lane, cached from the graph in onGraph (the hot loops read these instead of the lane objects): length, speed
   *  limit, 1 = a junction entry the gate controls */
  private lLen = new Float64Array(0); private lVmax = new Float32Array(0); private lGate = new Uint8Array(0);
  /** per lane: 1 = a node lane that merges with others into its next lane (vehicles there follow the mergers ahead of them) */
  private lMerge = new Uint8Array(0);
  /** lanes whose front vehicle passed the end this step (deduped by `overMark`) */
  private over: number[] = []; private overMark = new Uint8Array(0);

  /** an empty sim of cap vehicle slots on graph g; call onGraph() after every graph update */
  constructor(g: LaneGraph, cap: number, seed: number) {
    this.g = g; this.cap = cap; this.rnd = mulberry(seed);
    this.alive = new Uint8Array(cap); this.lane = new Int32Array(cap); this.s = new Float64Array(cap);
    this.v = new Float32Array(cap); this.acc = new Float32Array(cap); this.len = new Float32Array(cap);
    this.vtype = new Uint8Array(cap); this.v0f = new Float32Array(cap); this.lat = new Float32Array(cap);
    this.move = new Int32Array(cap).fill(-1); this.plan = new Array<number[] | null>(cap).fill(null);
    this.pi = new Int16Array(cap); this.stuck = new Float32Array(cap); this.vg = new Float64Array(cap).fill(Infinity);
    this.grant = new Int32Array(cap).fill(-1); this.resv = new Int32Array(cap).fill(-1); this.want = new Int32Array(cap).fill(-1);
    this.wait = new Float32Array(cap); this.stopped = new Uint8Array(cap);
    this.dest = new Int32Array(cap).fill(-1); this.destS = new Float64Array(cap); this.route = new Array<number[] | null>(cap).fill(null);
    this.noRoute = new Uint8Array(cap);
    this.trips = new Trips(this.rnd);
    this.onGraph();
  }

  /** after g.update(net): grow the lane lists, rebuild the spawn table and the routing graph, re-plan or respawn vehicles on
   *  changed lanes; routes are dropped, and a vehicle whose destination dseg went gets a new one */
  onGraph() {
    const lanes = this.g.lanes;
    while (this.onLane.length < lanes.length) this.onLane.push([]);
    const n = lanes.length;
    if (this.lLen.length < n) { const m = Math.max(n, this.lLen.length * 2); this.lLen = new Float64Array(m); this.lVmax = new Float32Array(m); this.lGate = new Uint8Array(m); this.lMerge = new Uint8Array(m); this.overMark = new Uint8Array(m); }
    for (let id = 0; id < n; id++) {
      const l = lanes[id]; this.lLen[id] = l ? l.len : 0; this.lVmax[id] = l ? l.vmax : 0;
      // gated: a junction connector from a link lane, and every ring arc (a ring arc yields to the room granted on it)
      this.lMerge[id] = l && l.kind !== LK.LINK && l.next.length === 1 && (lanes[l.next[0]]?.prev.length ?? 0) > 1 ? 1 : 0;
      this.lGate[id] = l && (l.kind === LK.RING || (l.kind === LK.CONN && l.prev.length && lanes[l.prev[0]]?.kind === LK.LINK)) ? 1 : 0;
    }
    // grants and reservations do not survive a graph update: the vehicles are re-planned or respawned below
    while (this.granted.length < n) this.granted.push([]);
    for (const q of this.granted) q.length = 0;
    if (this.resvLen.length < n) this.resvLen = new Float64Array(Math.max(n, 2 * this.resvLen.length));
    this.resvLen.fill(0); this.grant.fill(-1); this.resv.fill(-1);
    for (const q of this.onLane) q.length = 0;
    this.trips.onGraph(this.g);
    this.router.onGraph(this.g);
    let pending = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.route[i] = null;
      const id = this.lane[i], ln = lanes[id] ?? null;
      if (!ln) { this.free(i); this.stats.respawned++; pending++; continue; }
      const s = this.s[i];
      this.s[i] = s < 0 ? 0 : s > ln.len ? ln.len : s;
      if (this.dest[i] >= 0 && this.router.gone(this.dest[i]!)) this.retarget(i);
      if (!this.valid(i)) {
        if (ln.kind === LK.LINK) { if (!this.pickMove(i)) continue; }
        else if (ln.next.length) { this.plan[i] = this.chain(id); this.pi[i] = 0; }
        else { this.free(i); this.stats.respawned++; pending++; continue; }
      }
      this.onLane[id].push(i);
    }
    for (const q of this.onLane) if (q.length > 1) q.sort((a, b) => this.s[b] - this.s[a]);
    for (let k = 0; k < pending; k++) this.spawn();
  }

  /** removes vehicle i from its lane and frees its slot */
  despawn(i: number) {
    if (!this.alive[i]) return;
    const q = this.onLane[this.lane[i]], k = q.indexOf(i);
    if (k >= 0) q.splice(k, 1);
    this.free(i);
  }

  /** sets the desired vehicle count (clamped to cap); lowering despawns the highest slots first */
  setTarget(n: number) {
    this.target = Math.max(0, Math.min(this.cap, Math.floor(n)));
    for (let i = this.cap - 1; i >= 0 && this.active > this.target; i--) this.despawn(i);
  }

  /** one spawn attempt: an origin (Trips) and a destination at least 300 m away. Refused, and counted in stats.throttled, when the
   *  origin's dseg is jammed (a mean speed under THROTTLE_V m/s) or a vehicle is within SPAWN_CLEAR m of the origin; else spawnAt.
   *  Returns true if a vehicle was added */
  spawn(): boolean {
    const id = this.trips.origin();
    if (id < 0) return false;
    const ln = this.g.lanes[id]!, s = this.trips.oS;
    if (this.router.vEma[ln.dseg]! < THROTTLE_V || !this.clearOn(id, s, SPAWN_CLEAR)) { this.stats.throttled++; return false; }
    laneAt(ln, s, this.pt);
    const d = this.trips.dest(this.pt.x, this.pt.y);
    return this.spawnAt(id, s, d, this.trips.destS) >= 0;
  }

  /** adds one vehicle at s metres on link lane `lane`, heading for `dest` (a dseg; -1 = a random walk) at destS metres along it;
   *  returns its slot, or -1 if there is no room on the lane or no free slot (or it was lost at once) */
  spawnAt(lane: number, s: number, dest: number, destS: number): number {
    const ln = this.g.lanes[lane];
    if (!ln) return -1;
    const vt = Math.floor(this.rnd() * VTYPES.length), L = VTYPES[vt].len;
    if (!this.roomOn(lane, s, L)) return -1;
    let i = this.hint;
    while (i < this.cap && this.alive[i]) i++;
    if (i >= this.cap) return -1;
    this.alive[i] = 1; this.lane[i] = lane; this.s[i] = s; this.v[i] = 0.5 * ln.vmax; this.acc[i] = 0;
    this.v0f[i] = 0.9 + 0.2 * this.rnd(); this.vtype[i] = vt; this.len[i] = L; this.lat[i] = 0; this.stuck[i] = 0;
    this.grant[i] = -1; this.resv[i] = -1; this.wait[i] = 0; this.stopped[i] = 0;
    this.dest[i] = dest; this.destS[i] = destS; this.route[i] = null; this.noRoute[i] = 0;
    const q = this.onLane[lane];
    let k = 0; while (k < q.length && this.s[q[k]] > s) k++;
    q.splice(k, 0, i);
    this.hint = i + 1; this.active++; this.stats.spawned++;
    return this.pickMove(i) ? i : -1;
  }

  /** gives vehicle i a new destination from where it is now */
  private retarget(i: number) {
    laneAt(this.g.lanes[this.lane[i]]!, this.s[i], this.pt);
    this.dest[i] = this.trips.dest(this.pt.x, this.pt.y); this.destS[i] = this.trips.destS; this.noRoute[i] = 0;
  }
  /** true if no vehicle on lane id is within m metres of s */
  private clearOn(id: number, s: number, m: number): boolean {
    for (const j of this.onLane[id]!) if (Math.abs(this.s[j]! - s) < m) return false;
    return true;
  }

  /** advances the simulation by one DT: accelerations, lane changes, moves, lane transfers, towing, then refills to the target */
  step() {
    const t0 = performance.now();
    this.accelerate();
    this.changeLanes();
    this.integrate();
    this.transfer();
    this.arrive();
    this.tow();
    for (let i = 0; i < this.cap; i++) this.lat[i] *= 0.85;
    this.t += DT; this.steps++;
    this.router.tick(this);
    this.fill();
    this.stats.stepMs = performance.now() - t0;
  }

  /** removes the vehicles that have reached their destination (on the destination dseg, at destS or further) */
  private arrive() {
    const lanes = this.g.lanes;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || this.dest[i]! < 0) continue;
      const ln = lanes[this.lane[i]]!;
      if (ln.kind === LK.LINK && ln.dseg === this.dest[i] && this.s[i] >= this.destS[i]!) { this.stats.arrived++; this.despawn(i); }
    }
  }

  /** packs the vehicles into buf: 4 floats per slot [x, y, angle, flags]; x, y in tiles, angle in radians, dead slots 0 */
  writeFrame(buf: Float32Array) {
    const o = this.scratch, lanes = this.g.lanes;
    for (let i = 0; i < this.cap; i++) {
      const k = 4 * i, ln = this.alive[i] ? lanes[this.lane[i]] ?? null : null;
      if (!ln) { buf[k] = 0; buf[k + 1] = 0; buf[k + 2] = 0; buf[k + 3] = 0; continue; }
      laneAt(ln, this.s[i], o);
      const la = this.lat[i];
      buf[k] = o.x - o.hy * la; buf[k + 1] = o.y + o.hx * la;
      buf[k + 2] = Math.atan2(o.hy, o.hx);
      buf[k + 3] = 1 | (this.acc[i] < -0.5 ? 2 : 0) | (ln.tunnel ? 4 : 0) | (this.vtype[i] << 4);
    }
  }

  /** junction gate for vehicle i before gated lane c (a CONN or RING entry from a LINK lane): true lets it on and grants c.
   *  Order: a grant holds (unless the light is red and it can stop), the signal, the stop sign, the vehicle ahead is granted,
   *  room beyond the box, conflicts. */
  private gate(i: number, c: number): boolean {
    const C = this.g.lanes[c]!, v = this.v[i], dLine = this.lLen[this.lane[i]] - this.s[i];
    // a ring arc: wait while an entry holds room on it (a vehicle may take the room it holds itself; ring traffic is otherwise
    // followed by the IDM, there is no grant)
    if (C.kind === LK.RING) return this.resv[i] === c || this.resvLen[c] <= 0;
    const sp = C.ctl === CTL.SIGNAL ? this.g.signals.get(C.node!) : undefined;
    const st = sp ? phaseState(sp, C.phase, this.t) : SIG.GREEN;
    const canStop = dLine > v * v / (2 * CAR.b);
    if (this.grant[i] === c) {
      // a granted vehicle gives its grant back if the light turns red while it can still stop
      if (!(st === SIG.RED && canStop)) return true;
      this.unGrant(i); if (this.resv[i] >= 0) this.unReserve(i);
    }
    if (sp) {
      if (st === SIG.RED) return false;
      // a vehicle must clear the line before red: its time to the line, at the slower of its speed and the box's speed,
      // against the time left before the phase turns red (with a margin); an amber only lets through a vehicle that cannot stop
      const ta = dLine / Math.max(Math.min(v, this.lVmax[c] * this.v0f[i]), 1);
      if (ta + SIG_MARGIN > this.toRed(sp)) return false;
      if (st === SIG.AMBER && canStop) return false;
    }
    if (C.ctl === CTL.STOP && !this.stopped[i]) return false;
    // queue order: the vehicle directly ahead on this lane goes first (a grant held behind a waiting leader blocks it for good)
    const q = this.onLane[this.lane[i]], si = this.s[i];
    let lead = -1; for (const w of q) { if (this.s[w] > si) lead = w; else break; }
    if (lead >= 0 && this.grant[lead] < 0) return false;
    const nd = C.node, ring = !!nd && nd.rb > 0;
    const out = nd && (ring || nd.arms.length >= 3) ? this.outOf(this.plan[i]!, this.pi[i] + 1, ring) : -1;
    if (out >= 0 && !this.roomFor(i, out)) return false;
    if (!this.clearOf(i, C)) return false;
    this.grant[i] = c; this.granted[c].push(i);
    if (out >= 0) { this.resv[i] = out; this.resvLen[out] += this.needOn(i, out); }
    return true;
  }

  /** seconds until signal plan p turns the phase now green or amber red (the phase is not red now) */
  private toRed(p: SignalPlan): number {
    const seg = p.green + p.amber + p.allRed, C = p.phases * seg;
    let tt = (this.t + p.offset) % C; if (tt < 0) tt += C;
    return Math.floor(tt / seg) * seg + p.green + p.amber - tt;
  }
  /** the state (SIG) of the signal showing the phase of connector C now (green when it has no plan) */
  private signalState(C: Lane): number { const p = this.g.signals.get(C.node!); return p ? phaseState(p, C.phase, this.t) : SIG.GREEN; }
  /** the lane a vehicle leaves node lane P[ci] into: the ring arc after a roundabout entry, else the first LINK lane after it; -1 if none */
  private outOf(P: number[], ci: number, ring: boolean): number {
    if (ring) return ci + 1 < P.length ? P[ci + 1] : -1;
    const lanes = this.g.lanes;
    for (let j = ci + 1; j < P.length; j++) if (lanes[P[j]]!.kind === LK.LINK) return P[j];
    return -1;
  }
  /** the room vehicle i needs on lane out: its length + 2 m, or the whole lane when that is shorter (a roundabout arc) */
  private needOn(i: number, out: number): number { return Math.min(this.len[i] + 2, this.lLen[out]); }
  /** true if vehicle i can go on to lane out: the room left there (beyond its rearmost vehicle and the grants made on it) is
   *  what it needs, or the rearmost vehicle there is moving faster than 4 m/s */
  private roomFor(i: number, out: number): boolean {
    const q = this.onLane[out], S = this.s, LEN = this.len;
    let rear = this.lLen[out];
    for (const w of q) { const r = S[w] - LEN[w]; if (r < rear) rear = r; }
    if (rear - this.resvLen[out] >= this.needOn(i, out)) return true;
    return q.length > 0 && this.v[q[q.length - 1]] > 4;
  }
  /** the conflict rules: no vehicle still short of a conflicting connector's point, none granted into it, and none approaching it
   *  with right of way (higher priority, or equal priority and waiting longer) */
  private clearOf(i: number, C: Lane): boolean {
    const lanes = this.g.lanes, Q = this.onLane, S = this.s, LEN = this.len, V = this.v, lLen = this.lLen, P = this.plan, pI = this.pi;
    for (const cf of C.conflicts) {
      const c2 = cf.lane, L2 = lanes[c2]!;
      if (cf.merge) {
        // a merge: go only behind the vehicles already on the other lane (each must be a length clear ahead of us at the merge
        // point); the zipper rule in accelerate() keeps the gap from there
        const myRem = lLen[this.lane[i]] - S[i] + C.len;
        for (const w of Q[c2]) if (lLen[c2] - S[w] + LEN[w] + 1 > myRem) return false;
      } else for (const w of Q[c2]) if (S[w] - LEN[w] < cf.os + 1) return false;
      if (this.granted[c2].length) return false;
      if (L2.ctl === CTL.SIGNAL && this.signalState(L2) === SIG.RED) continue;
      if (L2.prio > C.prio) {
        for (const p of L2.prev) for (const w of Q[p]) {
          if (this.grant[w] >= 0 || V[w] < 0.5 || P[w]![pI[w] + 1] !== c2) continue;
          if ((lLen[p] - S[w] + cf.os) / V[w] < (cf.merge ? 5 : 4)) return false;
        }
      } else if (L2.prio === C.prio) {
        for (const p of L2.prev) for (const w of Q[p]) {
          if (P[w]![pI[w] + 1] !== c2 || lLen[p] - S[w] >= 20) continue;
          if (this.wait[w] > this.wait[i] || (this.wait[w] === this.wait[i] && w < i)) return false;
        }
      }
    }
    return true;
  }
  /** removes vehicle i from the granted list of its connector */
  private unGrant(i: number) { const q = this.granted[this.grant[i]], k = q.indexOf(i); if (k >= 0) q.splice(k, 1); this.grant[i] = -1; }
  /** gives back the room vehicle i reserved on its out lane */
  private unReserve(i: number) { const r = this.resv[i]; this.resvLen[r] = Math.max(0, this.resvLen[r] - this.needOn(i, r)); this.resv[i] = -1; }

  /** step 1: every vehicle's acceleration (IDM against its leader, a plan end, a closed gate, and the speed limit ahead) */
  private accelerate() {
    const lanes = this.g.lanes, Q = this.onLane;
    for (let id = 0; id < Q.length; id++) {
      const q = Q[id];
      if (!q.length) continue;
      const lenL = this.lLen[id], v0L = this.lVmax[id];
      for (let k = 0; k < q.length; k++) {
        const i = q[k], v = this.v[i], si = this.s[i], P = this.plan[i]!, pi = this.pi[i];
        const v0 = v0L * this.v0f[i], d0 = lenL - si;
        let gap = Infinity, dv = 0, vg = Infinity;
        if (k > 0) { const ld = q[k - 1]; gap = this.s[ld] - this.len[ld] - si; dv = v - this.v[ld]; }
        // walk the plan ahead: the first lane with vehicles gives the leader, the end of the plan may be a stop
        let d = d0, found = k > 0, j = pi + 1;
        for (; j < P.length; j++) {
          if (d > LOOKAHEAD) break;
          const nid = P[j], q2 = Q[nid];
          if (!found && q2.length) { const ld = q2[q2.length - 1]; gap = d + this.s[ld] - this.len[ld]; dv = v - this.v[ld]; found = true; }
          d += this.lLen[nid];
        }
        // a merge (zipper): the nearest vehicle ahead of us on the other lanes that merge into our next lane is a leader too,
        // by the distance each has left to the merge point
        if (this.lMerge[id]) {
          const nN = lanes[id]!.next[0], N = lanes[nN]!, mine = this.resv[i] === nN;
          for (const p of N.prev) {
            if (p === id) continue;
            const q2 = Q[p], lp = this.lLen[p];
            for (let m = q2.length - 1; m >= 0; m--) {
              const w = q2[m], rem = lp - this.s[w];
              // holding the room on the merged lane outranks a merger without it (it waits for our reservation: following it
              // would deadlock)
              if (rem >= d0 || (mine && this.resv[w] !== nN)) continue;
              const gm = d0 - rem - this.len[w];
              if (gm < gap) { gap = gm; dv = v - this.v[w]; }
              break;
            }
          }
        }
        // a plan that ends in a lane going nowhere: stop at its end (a plan merely not extended yet ends at a link lane with exits)
        if (j === P.length && d <= LOOKAHEAD && !lanes[P[P.length - 1]]!.next.length) {
          if (d < gap) { gap = d; dv = v; }
          vg = Math.min(vg, d - STOP_MARGIN);
        }
        // a junction entry the gate keeps shut: a stopped obstacle at the end of this lane
        if (pi + 1 < P.length && d0 <= v * v / (2 * CAR.b) + 4) {
          const nid = P[pi + 1];
          if (this.lGate[nid] && !this.gate(i, nid)) {
            if (d0 < gap) { gap = d0; dv = v; }
            vg = Math.min(vg, d0 - STOP_MARGIN);
          }
        }
        // the next lane is slower than we are: brake for it once the comfortable braking curve is reached (keeps speed before that)
        let ac = Infinity;
        if (pi + 1 < P.length && d0 > 0.5) {
          const vn = this.lVmax[P[pi + 1]] * this.v0f[i];
          if (vn < v) { const need = (vn * vn - v * v) / (2 * d0); if (need < -CAR.b) ac = need; }
        }
        let a = idm(CAR, v, v0, gap, dv);
        if (ac < Infinity) a = Math.min(a, Math.max(ac, -3));
        this.acc[i] = a; this.vg[i] = vg;
      }
    }
  }

  /** MOBIL lane changes: a vehicle on a link lane with a neighbour lane is evaluated every MOBIL_EVERY steps (slots staggered),
   *  between the lane ends it keeps clear of; it moves to the neighbour with the best incentive, if above the threshold */
  private changeLanes() {
    const lanes = this.g.lanes, st = this.steps;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || (i + st) % MOBIL_EVERY !== 0 || this.grant[i] >= 0) continue;
      const cur = this.lane[i], ln = lanes[cur]!;
      if (ln.kind !== LK.LINK || (ln.left < 0 && ln.right < 0)) continue;
      const s = this.s[i];
      if (s < MOBIL_START || s > this.lLen[cur] - MOBIL_END) continue;
      const k = this.onLane[cur].indexOf(i);
      let best = MOBIL_TH, to = -1;
      if (ln.left >= 0 && lanes[ln.left]) { const x = this.gainTo(i, ln.left, k); if (x > best) { best = x; to = ln.left; } }
      if (ln.right >= 0 && lanes[ln.right]) { const x = this.gainTo(i, ln.right, k); if (x > best) { best = x; to = ln.right; } }
      if (to >= 0) this.moveLane(i, to, k);
    }
  }
  /** the MOBIL incentive of vehicle i (at index k of its lane) moving to the neighbour lane T: its own gain, plus politeness times
   *  the gains of the new follower and of the old follower, plus the movement bias; -Infinity if the move is unsafe */
  private gainTo(i: number, T: number, k: number): number {
    const cur = this.lane[i], S = this.s, V = this.v, LEN = this.len, A = this.acc, VG = this.vg, Q = this.onLane;
    const LC = this.lLen[cur], LT = this.lLen[T], sN = S[i] * LT / LC, qt = Q[T], qc = Q[cur];
    const vi = V[i], v0T = this.lVmax[T] * this.v0f[i];
    // the new leader and follower on T by position (the list is front first)
    let j = 0; while (j < qt.length && S[qt[j]] > sN) j++;
    const ld = j > 0 ? qt[j - 1] : -1, fo = j < qt.length ? qt[j] : -1;
    let gap = Infinity, dv = 0;
    if (ld >= 0) { gap = S[ld] - LEN[ld] - sN; dv = vi - V[ld]; if (gap <= 1) return -Infinity; }
    // a stop ahead (a closed gate or a plan end) counts as an obstacle here too, as it does in accelerate()
    if (VG[i] < gap) { gap = VG[i] + (LT - sN) - (LC - S[i]); dv = vi; }
    const aT = idm(CAR, vi, v0T, gap, dv);
    let gain = 0;
    if (fo >= 0) {
      const gf = sN - LEN[i] - S[fo];
      if (gf <= 1) return -Infinity;
      let g2 = gf, dv2 = V[fo] - vi;
      if (VG[fo] < g2) { g2 = VG[fo]; dv2 = V[fo]; }
      const af = idm(CAR, V[fo], this.lVmax[T] * this.v0f[fo], g2, dv2);
      if (af < -4) return -Infinity;
      gain += af - A[fo];
    }
    // the old follower: i's old leader becomes its leader once i has gone
    const o = k + 1 < qc.length ? qc[k + 1] : -1;
    if (o >= 0) {
      const lo = k > 0 ? qc[k - 1] : -1;
      let g3 = Infinity, dv3 = 0;
      if (lo >= 0) { g3 = S[lo] - LEN[lo] - S[o]; dv3 = V[o] - V[lo]; }
      if (VG[o] < g3) { g3 = VG[o]; dv3 = V[o]; }
      gain += idm(CAR, V[o], this.lVmax[cur] * this.v0f[o], g3, dv3) - A[o];
    }
    let bias = 0;
    const w = this.want[i];
    if (w >= 0) {
      const here = this.reach(w, cur), there = this.reach(w, T);
      if (!here && there) bias = 1 + 2 * Math.max(0, 1 - (LC - S[i]) / 150);
      else if (here && !there) bias = -1000;
    }
    return (aT - A[i]) + MOBIL_P * gain + bias;
  }
  /** moves vehicle i (index k of its lane) onto the neighbour lane T at the same place: its lateral offset is set so it is drawn
   *  where it was, then it is re-planned from T */
  private moveLane(i: number, T: number, k: number) {
    const lanes = this.g.lanes, cur = this.lane[i], S = this.s, Q = this.onLane;
    const LC = this.lLen[cur], LT = this.lLen[T], sN = S[i] * LT / LC, a = this.pa, b = this.pb;
    laneAt(lanes[cur]!, S[i], a); laneAt(lanes[T]!, sN, b);
    // the drawn point (on the old lane, at the old offset), as an offset from the new lane's centre line
    const la = this.lat[i], dx = a.x - a.hy * la - b.x, dy = a.y + a.hx * la - b.y;
    const lat = -b.hy * dx + b.hx * dy;
    Q[cur].splice(k, 1);
    const qt = Q[T]; let j = 0; while (j < qt.length && S[qt[j]] > sN) j++; qt.splice(j, 0, i);
    S[i] = sN; this.lane[i] = T; this.lat[i] = lat;
    this.planFrom(i, T, this.move[i]);
    this.stats.laneChanges++;
  }

  /** step 2: move every vehicle one DT, stopping exactly when it brakes to a stop, never past a virtual stop */
  private integrate() {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const v = this.v[i], a = this.acc[i];
      let vn = v + a * DT; if (vn < 0) vn = 0;
      let ds = vn === 0 && a < 0 ? -v * v / (2 * a) : v * DT + 0.5 * a * DT * DT;
      const lim = this.vg[i];
      if (ds > lim) { ds = lim > 0 ? lim : 0; vn = 0; }
      this.s[i] += ds; this.v[i] = vn;
      const id = this.lane[i];
      if (this.s[i] >= this.lLen[id] && !this.overMark[id]) { this.overMark[id] = 1; this.over.push(id); }
      this.stuck[i] = vn < 0.5 ? this.stuck[i] + DT : 0;
      const dEnd = this.lLen[id] - this.s[i];
      if (vn < 0.3 && dEnd < 4) this.stopped[i] = 1;
      if (vn < 0.5 && dEnd < 20) this.wait[i] += DT;
    }
  }

  /** step 3: vehicles past the end of their lane move on along their plan; front vehicles first, up to 4 rounds */
  private transfer() {
    const Q = this.onLane, L = this.lLen;
    // only the lanes integrate() flagged, in id order (deterministic); a vehicle that lands past the end of its new lane
    // flags that lane for the next round
    for (let round = 0; round < 4 && this.over.length; round++) {
      const ids = this.over.sort((a, b) => a - b); this.over = [];
      for (const id of ids) this.overMark[id] = 0;
      for (const id of ids) {
        const q = Q[id];
        while (q.length && this.s[q[0]] >= L[id]) {
          const i = q[0];
          if (!this.advance(i)) { this.s[i] = L[id]; this.v[i] = 0; break; }
          const nid = this.lane[i];
          if (this.s[i] >= L[nid] && !this.overMark[nid]) { this.overMark[nid] = 1; this.over.push(nid); }
        }
      }
    }
    for (const id of this.over) this.overMark[id] = 0;
    this.over.length = 0;
  }

  /** moves vehicle i (the front of its lane) onto the next lane of its plan; false if the plan ends here */
  private advance(i: number): boolean {
    const P = this.plan[i]!, p = this.pi[i] + 1;
    if (p >= P.length) return false;
    const lanes = this.g.lanes, old = this.lane[i], ln = lanes[old]!;
    this.s[i] -= ln.len;
    this.onLane[old].shift();
    const nid = P[p], nl = lanes[nid]!;
    if (ln.kind !== LK.LINK && nl.kind === LK.LINK) this.stats.throughput++;
    if (this.grant[i] === nid) this.unGrant(i);
    if (this.resv[i] === nid) this.unReserve(i);
    // entering the first node lane of a movement: its junction delay is the time this vehicle waited at the line
    if (ln.kind === LK.LINK && nl.kind !== LK.LINK && this.move[i]! >= 0) this.router.feed(this.move[i]!, this.wait[i]!);
    this.stopped[i] = 0; if (nl.kind !== LK.LINK) this.wait[i] = 0;
    this.pi[i] = p; this.lane[i] = nid; this.onLane[nid].push(i);
    // a vehicle may be removed here (lost, no route): pickMove despawns it, and the callers check alive
    if (nl.kind === LK.LINK && p === P.length - 1) this.pickMove(i);
    return true;
  }

  /** safety valve: a vehicle stuck for TOW_BOX s in a junction box, or TOW_ANY s anywhere, is removed (fill() spawns a new one) */
  private tow() {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const st = this.stuck[i];
      if (st > TOW_ANY || (st > TOW_BOX && this.g.lanes[this.lane[i]]!.kind !== LK.LINK)) { this.stats.towed++; this.stats.respawned++; this.despawn(i); }
    }
  }

  /** a vehicle on link lane L picks the movement it wants at the end of L's dseg and plans through it. A vehicle with a
   *  destination steers by the router (see steer); one without walks at random (any non-U one, U only when that is all there is).
   *  Returns false if the vehicle was lost and removed. */
  private pickMove(i: number): boolean {
    const g = this.g, L = this.lane[i], dsId = g.lanes[L]!.dseg, d = g.dsegs[dsId];
    const outs = d ? d.out : [];
    if (!outs.length) { this.plan[i] = [L]; this.pi[i] = 0; this.move[i] = -1; this.want[i] = -1; return true; }
    let w: number;
    if (this.dest[i]! < 0) w = this.randomMove(outs);
    else {
      w = this.steer(i, dsId, outs);
      if (w === -2) { this.lose(i); return false; }
      if (w < 0) {
        // no finite cost from here: a random walk this time; three in a row and the vehicle is lost
        if (++this.noRoute[i]! >= 3) { this.lose(i); return false; }
        w = this.randomMove(outs);
      } else this.noRoute[i] = 0;
    }
    this.want[i] = w;
    this.planFrom(i, L, -1);
    return true;
  }
  /** a random movement out of a dseg, U only when it is the only one */
  private randomMove(outs: number[]): number {
    const g = this.g;
    let nu = 0;
    for (const m of outs) if (g.moves[m]!.turn !== 'U') nu++;
    if (nu) { let k = Math.floor(this.rnd() * nu); for (const m of outs) if (g.moves[m]!.turn !== 'U' && k-- === 0) return m; }
    return outs[Math.floor(this.rnd() * outs.length)]!;
  }
  /** the movement among outs that leads to dseg nx, or -1 */
  private toward(outs: number[], nx: number): number {
    for (const m of outs) if (this.g.moves[m]!.to === nx) return m;
    return -1;
  }
  /** removes vehicle i, which has no route to its destination */
  private lose(i: number) { this.stats.lost++; this.despawn(i); }
  /** the movement vehicle i (on lane L, at the end of dseg cur, with movements outs) takes toward its destination: the next dseg of
   *  its local route when in the destination zone or within LOCAL_TILES of the destination (planned by A* when needed), else the
   *  router's logit choice by zone cost. -1 if no movement has a finite cost, -2 if the local route is not found. */
  private steer(i: number, cur: number, outs: number[]): number {
    const R = this.router, e = this.dest[i]!;
    if (cur !== e && (R.zoneD[cur]! === R.zoneD[e]! || R.near(cur, e, this.destS[i]!))) {
      const r0 = this.route[i];
      if (r0 && r0.length) { const m = this.toward(outs, r0[0]!); if (m >= 0) { r0.shift(); if (!r0.length) this.route[i] = null; return m; } }
      const r = R.localRoute(cur, e);
      if (r === null) return -2;
      if (r.length) {
        const m = this.toward(outs, r[0]!);
        if (m >= 0) { r.shift(); if (r.length) this.route[i] = r; return m; }
      }
    }
    this.route[i] = null;
    return R.choose(outs, R.zoneD[e]!, this.rnd);
  }
  /** plans vehicle i from its lane L: the wanted movement if it has a path from L, else `prefer` if it has one, else a random
   *  movement that has one, else the fallback chain */
  private planFrom(i: number, L: number, prefer: number) {
    const g = this.g, d = g.dsegs[g.lanes[L]!.dseg], outs = d ? d.out : [];
    let m = -1;
    if (this.reach(this.want[i], L)) m = this.want[i];
    else if (this.reach(prefer, L)) m = prefer;
    else {
      let n = 0; for (const x of outs) if (this.reach(x, L)) n++;
      if (n) { let k = Math.floor(this.rnd() * n); for (const x of outs) if (this.reach(x, L) && k-- === 0) { m = x; break; } }
    }
    this.move[i] = m;
    this.plan[i] = m >= 0 ? this.start(m, L) ?? this.chain(L) : this.chain(L);
    this.pi[i] = 0;
  }

  /** the plan a movement gives from lane L: its path from L, or a path whose second lane L feeds (its first lane replaced by L); null if none */
  private start(mid: number, L: number): number[] | null {
    const m = this.g.moves[mid]!, nx = this.g.lanes[L]!.next;
    for (const p of m.paths) if (p[0] === L) return p.slice();
    for (const p of m.paths) if (nx.includes(p[1])) { const q = p.slice(); q[0] = L; return q; }
    return null;
  }
  /** true if movement mid has a plan from lane L (the same test as start(), without building the plan) */
  private reach(mid: number, L: number): boolean {
    const m = mid >= 0 ? this.g.moves[mid] : null;
    if (!m) return false;
    const nx = this.g.lanes[L]!.next;
    for (const p of m.paths) if (p[0] === L) return true;
    for (const p of m.paths) if (nx.includes(p[1])) return true;
    return false;
  }

  /** lane L followed by next[0] lanes up to and including the first LINK lane (the fallback plan) */
  private chain(L: number): number[] {
    const lanes = this.g.lanes, P = [L];
    let c = lanes[L]!;
    for (let k = 0; k < 16 && c.next.length; k++) {
      const id = c.next[0], o = lanes[id];
      if (!o) break;
      P.push(id);
      if (o.kind === LK.LINK) break;
      c = o;
    }
    return P;
  }

  /** true if vehicle i's plan is intact from its current lane: every lane exists and follows the previous one */
  private valid(i: number): boolean {
    const P = this.plan[i], p0 = this.pi[i];
    if (!P || P[p0] !== this.lane[i]) return false;
    const lanes = this.g.lanes;
    for (let j = p0; j < P.length; j++) {
      if (!lanes[P[j]]) return false;
      if (j > p0 && !lanes[P[j - 1]]!.next.includes(P[j])) return false;
    }
    return true;
  }

  /** true if no vehicle on lane id is within SPAWN_GAP metres of a vehicle at s with length L */
  private roomOn(id: number, s: number, L: number): boolean {
    for (const j of this.onLane[id]) {
      const gap = this.s[j] >= s ? this.s[j] - this.len[j] - s : s - L - this.s[j];
      if (gap < SPAWN_GAP) return false;
    }
    return true;
  }

  /** frees slot i (giving back its grant and reservation) without touching the lane lists (the caller owns them) */
  private free(i: number) {
    if (this.grant[i] >= 0) this.unGrant(i);
    if (this.resv[i] >= 0) this.unReserve(i);
    this.alive[i] = 0; this.plan[i] = null; this.route[i] = null; this.active--;
    if (i < this.hint) this.hint = i;
  }

  /** up to FILL_TRIES spawn attempts per step while below the aim (the target, or the daily profile's share of it) */
  private fill() {
    const aim = this.profile ? Math.round(this.target * demandAt(this.t)) : this.target;
    for (let n = 0; n < FILL_TRIES && this.active < aim; n++) this.spawn();
  }
}
