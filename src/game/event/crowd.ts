// The crowd of a shuttle round (Phase 5 step 6a), pure TS: the walkers (groups of fans walking straight at WALK_V to a lot stop, a door or a
// gate), each lot stop's queue (a FIFO of parties), the fans on each bus by town, each gate's queue (golf, LEAD.md M2.1: a FIFO of parties
// admitted at the gate's rate) and the fans at the doors (inside). City drives it (see City.step); the counts add up: parked * PARTY =
// walking + at a stop + on a bus + at a gate + at the doors.
import type { Pt } from '../network';
import type { CrowdSave } from './daysave';

/** a group of n fans of town walking from (x, y) to (tx, ty) (tiles): stage 0 to the lot stop of route (then it queues there), stage 1 to a
 *  door (then the fans are at the doors), stage 2 to gate `route` (then it queues there), stage 3 (already inside) to gallery spot `route`
 *  (then they stand there), stage 4 (going home, LEAD.md M2.3) back to the bay of parked car `route` (then onBack); route -1 for a stage 1
 *  group from no route. T377 (#1033): straight at first, now by the way the crowd's router gives it (round water, greens, tees and bunkers, across a fairway
 *  only where it must): `via`, the waypoints after its place (the last is its target) and `vi`, the next one; absent until it first steps (the router is
 *  asked then, once; a save does not keep it: a loaded day works it out again). `id` is its own number (the view seeds each person's pace, phase and
 *  drift from it: a person is the same person from frame to frame) and `v` its pace as a share of the walking speed (0.85 to 1.15): not in step with the next group */
export interface Walker { x: number; y: number; tx: number; ty: number; n: number; town: number; stage: 0 | 1 | 2 | 3 | 4; route: number; id?: number; v?: number; via?: Pt[] | null; vi?: number }
/** T377: the way from (x, y) to (tx, ty): the waypoints after the start (the last the target); null for a straight line (no field, an end off it); an empty way when
 *  the ground has none (the group then does not walk it: it lands at once); undefined when it is not worked out yet (the City's budget of ways a step is spent: the
 *  group waits where it is and asks again next step) */
export type WalkRouter = (x: number, y: number, tx: number, ty: number) => Pt[] | null | undefined;
/** T377: a group's pace from its id, 0.85 to 1.15 of the walking speed (a hash, so a loaded day gives the same groups the same paces) */
export function walkPace(id: number): number {
  let h = Math.imul(id | 0, 0x9e3779b1) ^ 0x7f4a7c15; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return 0.85 + 0.3 * ((h >>> 0) / 4294967296);
}
/** a party waiting at a lot stop or a gate: its town, its fans, and (gates) the time it joined the queue */
export interface Party { town: number; n: number; since?: number }
/** per town: the fans at the doors (arrived: inside), at a lot stop's queue, on a bus, and at a gate's queue */
export interface FanCounts { fans: number[]; atStop: number[]; onBus: number[]; atGate: number[] }
/** what the gates measured: fans admitted, their total wait (fan-seconds, sim s), the longest wait, the fans admitted after waiting over the
 *  grace (Crowd.grace: late for the start, LEAD.md M2.4) */
export interface GateStats { admitted: number; waitSum: number; waitMax: number; late: number }
/** the most walker groups at once: over it the oldest group lands at once (see Crowd.add) */
export const WALK_CAP = 6000;
/** T377: the floats a walker group takes in the frame's buffer (city.walkBuf): x, y, n fans, stage, the point it is heading for, its id */
export const WALK_STRIDE = 7;

/** the crowd of one round: its towns' fans by place (see FanCounts) */
export class Crowd {
  /** the walker groups on the way (in order of their starts) */
  walkers: Walker[] = [];
  /** per route index: the lot stop's queue (the FIFO of parties, head first) */
  queue: Party[][];
  /** per bus slot: the fans on board by town (undefined for no bus) */
  bus: (number[] | undefined)[] = [];
  /** per town: the fans at the doors */
  fans: number[];
  /** per gate index: the gate's queue (the FIFO of parties, head first; golf, see admit) */
  gateQ: Party[][] = [];
  /** the gates' measurements so far (see GateStats) */
  gate: GateStats = { admitted: 0, waitSum: 0, waitMax: 0, late: 0 };
  /** the longest wait at a gate (sim s) a fan may have and still be on time (the City sets ON_TIME_GRACE_MIN in golf) */
  grace = Infinity;
  /** the tournament day (P02/T050): a fan admitted after this sim time is late; null: the old rule (a wait longer than grace) */
  lateAt: number | null = null;
  /** the time now (sim s), set by the City before step and admit: a gate's queue stamps it on each party that joins */
  now = 0;
  /** per gallery spot (golf, LEAD.md M2.2): the fans standing there */
  gallery: number[] = [];
  /** called when fans get in (a gate admits them at (x, y), or a group lands at a door): the City sends them on to a gallery */
  onIn: ((town: number, n: number, x: number, y: number) => void) | null = null;
  /** called when a party going home reaches its car's bay (stage 4; route: the car): the City drives the car home */
  onBack: ((town: number, route: number) => void) | null = null;
  /** T377: the way a walker takes (the City sets it from the day's walk field: golf/walkfield.ts); null: every walker straight at its target */
  router: WalkRouter | null = null;
  /** T377: whether each walker group has a pace of its own (0.85 to 1.15 of the walking speed: the golf tournament day's crowd; the City sets it); false: every group walks at the one speed */
  varied = false;
  /** T377: the next walker id */
  private nextId = 1;
  /** the number of towns (the length of each per-town list) */
  readonly towns: number;

  /** an empty crowd of towns towns and routes routes */
  constructor(towns: number, routes: number) {
    this.towns = towns; this.fans = new Array<number>(towns).fill(0);
    this.queue = Array.from({ length: routes }, () => []);
  }

  /** the fans waiting in route r's queue */
  waiting(r: number): number { let n = 0; for (const p of this.queue[r] ?? []) n += p.n; return n; }
  /** n gates (their queues empty; a queue already there keeps its fans) */
  setGates(n: number): void { while (this.gateQ.length < n) this.gateQ.push([]); }
  /** n gallery spots (a spot already there keeps its fans) */
  setSpots(n: number): void { while (this.gallery.length < n) this.gallery.push(0); }
  /** the fans waiting at gate g */
  atGate(g: number): number { let n = 0; for (const p of this.gateQ[g] ?? []) n += p.n; return n; }
  /** gate g (at x, y) admits up to n fans from the head of its queue (a party may be split): they are inside (arrive, then onIn); returns the
   *  fans admitted */
  admit(g: number, n: number, x = 0, y = 0): number {
    const q = this.gateQ[g]; let need = Math.floor(n), done = 0;
    while (need > 0 && q && q.length) {
      const h = q[0]!, k = Math.min(need, h.n), w = Math.max(0, this.now - (h.since ?? this.now));
      this.arrive(h.town, k); this.onIn?.(h.town, k, x, y); need -= k; done += k; h.n -= k;
      this.gate.admitted += k; this.gate.waitSum += k * w; this.gate.waitMax = Math.max(this.gate.waitMax, w); const late = this.lateAt !== null ? this.now > this.lateAt : w > this.grace; if (late) this.gate.late += k;
      if (h.n <= 0) q.shift();
    }
    return done;
  }
  /** a bus slot starts with no fans on board */
  newBus(slot: number): void { this.bus[slot] = new Array<number>(this.towns).fill(0); }
  /** bus slot boarded n fans of route r: they come off the head of the queue, in order (the sim has checked the queue holds them) */
  board(r: number, slot: number, n: number): void {
    const q = this.queue[r], b = this.bus[slot];
    if (!b) return;
    let need = n;
    while (need > 0 && q && q.length) {
      const h = q[0]!, k = Math.min(need, h.n);
      b[h.town]! += k; need -= k; h.n -= k;
      if (h.n <= 0) q.shift();
    }
  }
  /** bus slot alighted one fan at the doors: the town of the first fan on board (in town order), or -1 if none is on board */
  unloadOne(slot: number): number {
    const b = this.bus[slot];
    if (!b) return -1;
    for (let k = 0; k < b.length; k++) if (b[k]! > 0) { b[k]!--; return k; }
    return -1;
  }
  /** bus slot is lost with its fans on board: they go back to the front of route r's queue, and the bus has none now */
  requeue(r: number, slot: number): void {
    const b = this.bus[slot], q = this.queue[r];
    this.bus[slot] = undefined;
    if (!b || !q) return;
    for (let k = b.length - 1; k >= 0; k--) if (b[k]! > 0) q.unshift({ town: k, n: b[k]! });
  }
  /** n fans of town arrive at the doors now */
  arrive(town: number, n: number): void { this.fans[town]! += n; }
  /** adds a walker group. Over WALK_CAP the oldest group lands at once (a stage 0 group joins its queue, a stage 1 group arrives) */
  add(w: Walker): void {
    if (this.walkers.length >= WALK_CAP) this.land(this.walkers.shift()!);
    w.id ??= this.nextId++; w.v ??= this.varied ? walkPace(w.id) : 1;
    this.walkers.push(w);
  }
  /** a group at its target: a stage 0 group joins its lot stop's queue, a stage 2 group its gate's queue, a stage 1 group's fans arrive at
   *  the doors (so does a group whose stop or gate is gone) */
  private land(w: Walker): void {
    if (w.stage === 0 && this.queue[w.route]) this.queue[w.route]!.push({ town: w.town, n: w.n });
    else if (w.stage === 2 && this.gateQ[w.route]) this.gateQ[w.route]!.push({ town: w.town, n: w.n, since: this.now });
    else if (w.stage === 3) { if (this.gallery[w.route] !== undefined) this.gallery[w.route]! += w.n; }
    else if (w.stage === 4) this.onBack?.(w.town, w.route);
    else { this.arrive(w.town, w.n); this.onIn?.(w.town, w.n, w.tx, w.ty); }
  }
  /** moves every walker dist tiles (times its own pace, 0.85 to 1.15) along its way: the router's waypoints (asked once, the first time it steps), else
   *  straight at its target; a group that reaches its target lands (see land). A step is the same few operations for any length of way (T377: the way
   *  is worked out once, not each frame) */
  step(dist: number): void {
    let w = 0;
    for (const g of this.walkers) {
      if (g.via === undefined) {
        const r = this.router ? this.router(g.x, g.y, g.tx, g.ty) : null;
        if (r === undefined) { this.walkers[w++] = g; continue; } // (its way is not worked out yet: it waits a step)
        g.via = r; g.vi = 0;
      }
      // (an empty way: the ground has none from here to there, round water say: the group does not cross it, it is there)
      if (g.via && !g.via.length) { this.land(g); continue; }
      const via = g.via; let left = dist * (g.v ?? 1), landed = false;
      for (;;) {
        const tx = via ? via[g.vi!]!.x : g.tx, ty = via ? via[g.vi!]!.y : g.ty, dx = tx - g.x, dy = ty - g.y, L = Math.hypot(dx, dy);
        if (L <= left) {
          g.x = tx; g.y = ty; left -= L;
          if (via && g.vi! < via.length - 1) { g.vi!++; continue; }
          landed = true; break;
        }
        g.x += dx / L * left; g.y += dy / L * left; break;
      }
      if (landed) { this.land(g); continue; }
      this.walkers[w++] = g;
    }
    this.walkers.length = w;
  }
  /** the fans per town: at the doors, in the queues, on the buses */
  counts(): FanCounts {
    const atStop = new Array<number>(this.towns).fill(0), onBus = new Array<number>(this.towns).fill(0), atGate = new Array<number>(this.towns).fill(0);
    for (const q of this.queue) for (const p of q) atStop[p.town]! += p.n;
    for (const b of this.bus) if (b) for (let k = 0; k < this.towns; k++) onBus[k]! += b[k]!;
    for (const q of this.gateQ) for (const p of q) atGate[p.town]! += p.n;
    return { fans: this.fans.slice(), atStop, onBus, atGate };
  }
  /** the crowd as the save keeps it (T209, see daysave.ts). The buses are not saved: the fans on board (routeOf: a bus slot's route, -1 none) are back at
   *  the front of their route's queue, as when a bus is lost (requeue); the onIn and onBack hooks, the grace and lateAt are the City's to set again */
  save(routeOf: (slot: number) => number): CrowdSave {
    const r1 = (v: number) => Math.round(v * 100) / 100, walkers: number[] = [];
    for (const w of this.walkers) walkers.push(r1(w.x), r1(w.y), r1(w.tx), r1(w.ty), w.n, w.town, w.stage, w.route);
    const queue = this.queue.map(q => q.map(p => ({ town: p.town, n: p.n })));
    this.bus.forEach((b, slot) => {
      const q = b ? queue[routeOf(slot)] : undefined;
      if (b && q) for (let k = b.length - 1; k >= 0; k--) if (b[k]! > 0) q.unshift({ town: k, n: b[k]! });
    });
    return { walkers, queue: queue.map(q => q.flatMap(p => [p.town, p.n])), fans: this.fans.slice(), gateQ: this.gateQ.map(q => q.flatMap(p => [p.town, p.n, p.since ?? 0])),
      gate: { ...this.gate }, gallery: this.gallery.slice() };
  }
  /** the crowd's walkers, queues, fans, gates and galleries from a save (T209): kept to this crowd's towns, routes, gates and spots (a list longer than
   *  the save's keeps its zeros; a party or a group of a town or a place that is not there any more is dropped) */
  load(s: CrowdSave): void {
    const T = this.towns, town = (k: number) => k >= 0 && k < T;
    this.walkers = [];
    for (let i = 0; i + 7 < s.walkers.length; i += 8) {
      const [x, y, tx, ty, n, k, stage, route] = s.walkers.slice(i, i + 8) as number[];
      if (town(k!) && stage! >= 0 && stage! <= 4) { const id = this.nextId++; this.walkers.push({ x: x!, y: y!, tx: tx!, ty: ty!, n: n!, town: k!, stage: stage as Walker['stage'], route: route!, id, v: this.varied ? walkPace(id) : 1 }); } // (T377: its way is worked out when it first steps)
    }
    const parties = (a: number[], w: number): Party[] => { const out: Party[] = []; for (let i = 0; i + w - 1 < a.length; i += w) if (town(a[i]!)) out.push(w === 3 ? { town: a[i]!, n: a[i + 1]!, since: a[i + 2]! } : { town: a[i]!, n: a[i + 1]! }); return out; };
    this.queue = this.queue.map((_, r) => parties(s.queue[r] ?? [], 2));
    this.gateQ = this.gateQ.map((_, g) => parties(s.gateQ[g] ?? [], 3));
    this.fans = this.fans.map((_, k) => s.fans[k] ?? 0);
    this.gallery = this.gallery.map((_, i) => s.gallery[i] ?? 0);
    this.gate = { ...s.gate };
  }
  /** the fans per town still walking (the walker groups) */
  walking(): number[] {
    const out = new Array<number>(this.towns).fill(0);
    for (const g of this.walkers) out[g.town]! += g.n;
    return out;
  }
}
