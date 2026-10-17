// The traffic simulation core: IDM car following on the lane graph, vehicles in fixed slots. Pure TS, no DOM.
// Hot paths (step, writeFrame) are allocation-free; plans are only built when a vehicle picks a movement.
import { mulberry } from '../iso';
import { CAR, idm } from './idm';
import { LK, type LaneGraph, laneAt } from './lanes';

/** seconds per step */
export const DT = 0.1;
/** metres searched ahead along the plan for a leader and for a plan end */
export const LOOKAHEAD = 150;
/** vehicle types (the renderer's sprite sets): length in metres */
export const VTYPES = [{ len: 4.5 }, { len: 5.5 }, { len: 5.5 }, { len: 5.3 }, { len: 5.3 }];

/** a virtual stop sits this far short of its line, metres (keeps a vehicle from transferring onto it) */
const STOP_MARGIN = 0.05;
/** lanes shorter than this take no spawns, metres */
const MIN_SPAWN_LEN = 10;
/** spawn keeps this many metres clear of other vehicles on the lane */
const SPAWN_GAP = 8;

/** The vehicles of one graph. Slot i is one vehicle while alive[i] is 1; the lists hold the vehicles of each lane, front first. */
export class Sim {
  g: LaneGraph; t = 0; steps = 0; cap: number; active = 0;
  alive: Uint8Array; lane: Int32Array; s: Float64Array; v: Float32Array; acc: Float32Array; len: Float32Array;
  vtype: Uint8Array; v0f: Float32Array; lat: Float32Array;
  move: Int32Array; plan: (number[] | null)[]; pi: Int16Array;
  stuck: Float32Array;
  /** per lane: vehicle slots on it, front first (largest s first) */
  onLane: number[][] = [];
  target = 0;
  rnd: () => number;
  stats = { spawned: 0, respawned: 0, stepMs: 0 };
  /** per slot: distance to the nearest virtual stop (plan end or gate), metres; Infinity = none */
  private vg: Float64Array;
  /** every slot below hint is alive */
  private hint = 0;
  private spawnIds: number[] = []; private spawnCum: number[] = []; private spawnTot = 0;
  private scratch = { x: 0, y: 0, hx: 0, hy: 0 };
  /** per lane, cached from the graph in onGraph (the hot loops read these instead of the lane objects): length, speed
   *  limit, 1 = a junction entry the gate controls */
  private lLen = new Float64Array(0); private lVmax = new Float32Array(0); private lGate = new Uint8Array(0);
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
    this.onGraph();
  }

  /** after g.update(net): grow the lane lists, rebuild the spawn table, re-plan or respawn vehicles on changed lanes */
  onGraph() {
    const lanes = this.g.lanes;
    while (this.onLane.length < lanes.length) this.onLane.push([]);
    const n = lanes.length;
    if (this.lLen.length < n) { const m = Math.max(n, this.lLen.length * 2); this.lLen = new Float64Array(m); this.lVmax = new Float32Array(m); this.lGate = new Uint8Array(m); this.overMark = new Uint8Array(m); }
    for (let id = 0; id < n; id++) {
      const l = lanes[id]; this.lLen[id] = l ? l.len : 0; this.lVmax[id] = l ? l.vmax : 0;
      this.lGate[id] = l && (l.kind === LK.CONN || l.kind === LK.RING) && l.prev.length && lanes[l.prev[0]]?.kind === LK.LINK ? 1 : 0;
    }
    for (const q of this.onLane) q.length = 0;
    this.buildSpawn();
    let pending = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const id = this.lane[i], ln = lanes[id] ?? null;
      if (!ln) { this.free(i); this.stats.respawned++; pending++; continue; }
      const s = this.s[i];
      this.s[i] = s < 0 ? 0 : s > ln.len ? ln.len : s;
      if (!this.valid(i)) {
        if (ln.kind === LK.LINK) this.pickMove(i);
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

  /** adds one vehicle on a random link lane (weighted by length) if there is room for it; false if not */
  spawn(): boolean {
    const n = this.spawnIds.length;
    if (!n) return false;
    for (let tries = 0; tries < 8; tries++) {
      const r = this.rnd() * this.spawnTot, c = this.spawnCum;
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] > r) hi = m; else lo = m + 1; }
      const id = this.spawnIds[lo], ln = this.g.lanes[id]!;
      const s = this.rnd() * (ln.len - MIN_SPAWN_LEN) + 5, vt = Math.floor(this.rnd() * VTYPES.length), L = VTYPES[vt].len;
      if (!this.roomOn(id, s, L)) continue;
      let i = this.hint;
      while (i < this.cap && this.alive[i]) i++;
      if (i >= this.cap) return false;
      this.alive[i] = 1; this.lane[i] = id; this.s[i] = s; this.v[i] = 0.5 * ln.vmax; this.acc[i] = 0;
      this.v0f[i] = 0.9 + 0.2 * this.rnd(); this.vtype[i] = vt; this.len[i] = L; this.lat[i] = 0; this.stuck[i] = 0;
      const q = this.onLane[id];
      let k = 0; while (k < q.length && this.s[q[k]] > s) k++;
      q.splice(k, 0, i);
      this.hint = i + 1; this.active++; this.stats.spawned++;
      this.pickMove(i);
      return true;
    }
    return false;
  }

  /** advances the simulation by one DT: accelerations, moves, lane transfers, then refills to the target */
  step() {
    const t0 = performance.now();
    this.accelerate();
    this.integrate();
    this.transfer();
    for (let i = 0; i < this.cap; i++) this.lat[i] *= 0.85;
    this.t += DT; this.steps++;
    this.fill();
    this.stats.stepMs = performance.now() - t0;
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

  /** junction gate hook: false holds vehicle i at the stop line before lane `next` (a CONN or RING entry); always open for now */
  private gate(_i: number, _next: number): boolean { return true; }

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
        // a plan that ends in a lane going nowhere: stop at its end (a plan merely not extended yet ends at a link lane with exits)
        if (j === P.length && d <= LOOKAHEAD && !lanes[P[P.length - 1]]!.next.length) {
          if (d < gap) { gap = d; dv = v; }
          vg = Math.min(vg, d - STOP_MARGIN);
        }
        // a junction entry the gate keeps shut: a stopped obstacle at the end of this lane
        if (pi + 1 < P.length && d0 <= v * v / (2 * CAR.b) + 15) {
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
    const lanes = this.g.lanes, old = this.lane[i];
    this.s[i] -= lanes[old]!.len;
    this.onLane[old].shift();
    const nid = P[p];
    this.pi[i] = p; this.lane[i] = nid; this.onLane[nid].push(i);
    if (lanes[nid]!.kind === LK.LINK && p === P.length - 1) this.pickMove(i);
    return true;
  }

  /** a vehicle on link lane L picks the movement at the end of L's dseg: its plan is [L, ...path] */
  private pickMove(i: number) {
    const g = this.g, L = this.lane[i], d = g.dsegs[g.lanes[L]!.dseg];
    const outs = d ? d.out : [];
    if (!outs.length) { this.plan[i] = [L]; this.pi[i] = 0; this.move[i] = -1; return; }
    let pool = outs.filter(m => this.start(m, L) !== null);
    if (!pool.length) pool = outs.slice();
    const nu = pool.filter(m => g.moves[m]!.turn !== 'U');
    if (nu.length) pool = nu;
    let m = pool[Math.floor(this.rnd() * pool.length)], P = this.start(m, L);
    if (!P) {
      const ok = pool.filter(x => this.start(x, L) !== null);
      if (ok.length) { m = ok[Math.floor(this.rnd() * ok.length)]; P = this.start(m, L); }
    }
    if (!P) { P = this.chain(L); m = -1; }
    this.plan[i] = P; this.pi[i] = 0; this.move[i] = m;
  }

  /** the plan a movement gives from lane L: its path from L, or a path whose second lane L feeds (its first lane replaced by L); null if none */
  private start(mid: number, L: number): number[] | null {
    const m = this.g.moves[mid]!, nx = this.g.lanes[L]!.next;
    for (const p of m.paths) if (p[0] === L) return p.slice();
    for (const p of m.paths) if (nx.includes(p[1])) { const q = p.slice(); q[0] = L; return q; }
    return null;
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

  /** the cumulative spawn table: link lanes of at least MIN_SPAWN_LEN metres, not tunnels, weighted by length */
  private buildSpawn() {
    this.spawnIds = []; this.spawnCum = []; let tot = 0;
    for (const ln of this.g.lanes) if (ln && ln.kind === LK.LINK && !ln.tunnel && ln.len >= MIN_SPAWN_LEN) { tot += ln.len; this.spawnIds.push(ln.id); this.spawnCum.push(tot); }
    this.spawnTot = tot;
  }

  /** frees slot i without touching the lane lists (the caller owns them) */
  private free(i: number) {
    this.alive[i] = 0; this.plan[i] = null; this.active--;
    if (i < this.hint) this.hint = i;
  }

  /** up to 200 spawn attempts per step while below the target (a try can find no room; the next step tries again) */
  private fill() {
    for (let n = 0; n < 200 && this.active < this.target; n++) this.spawn();
  }
}
