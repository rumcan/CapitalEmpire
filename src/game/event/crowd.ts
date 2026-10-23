// The crowd of a shuttle round (Phase 5 step 6a), pure TS: the walkers (groups of fans walking straight at WALK_V to a lot stop, a door or a
// gate), each lot stop's queue (a FIFO of parties), the fans on each bus by town, each gate's queue (golf, LEAD.md M2.1: a FIFO of parties
// admitted at the gate's rate) and the fans at the doors (inside). City drives it (see City.step); the counts add up: parked * PARTY =
// walking + at a stop + on a bus + at a gate + at the doors.

/** a group of n fans of town walking straight from (x, y) to (tx, ty) (tiles): stage 0 to the lot stop of route (then it queues there), stage 1 to a
 *  door (then the fans are at the doors), stage 2 to gate `route` (then it queues there), stage 3 (already inside) to gallery spot `route`
 *  (then they stand there); route -1 for a stage 1 group from no route */
export interface Walker { x: number; y: number; tx: number; ty: number; n: number; town: number; stage: 0 | 1 | 2 | 3; route: number }
/** a party waiting at a lot stop or a gate: its town, its fans, and (gates) the time it joined the queue */
export interface Party { town: number; n: number; since?: number }
/** per town: the fans at the doors (arrived: inside), at a lot stop's queue, on a bus, and at a gate's queue */
export interface FanCounts { fans: number[]; atStop: number[]; onBus: number[]; atGate: number[] }
/** what the gates measured: fans admitted, their total wait (fan-seconds, sim s), the longest wait */
export interface GateStats { admitted: number; waitSum: number; waitMax: number }
/** the most walker groups at once: over it the oldest group lands at once (see Crowd.add) */
export const WALK_CAP = 6000;

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
  gate: GateStats = { admitted: 0, waitSum: 0, waitMax: 0 };
  /** the time now (sim s), set by the City before step and admit: a gate's queue stamps it on each party that joins */
  now = 0;
  /** per gallery spot (golf, LEAD.md M2.2): the fans standing there */
  gallery: number[] = [];
  /** called when fans get in (a gate admits them at (x, y), or a group lands at a door): the City sends them on to a gallery */
  onIn: ((town: number, n: number, x: number, y: number) => void) | null = null;
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
      this.gate.admitted += k; this.gate.waitSum += k * w; this.gate.waitMax = Math.max(this.gate.waitMax, w);
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
    this.walkers.push(w);
  }
  /** a group at its target: a stage 0 group joins its lot stop's queue, a stage 2 group its gate's queue, a stage 1 group's fans arrive at
   *  the doors (so does a group whose stop or gate is gone) */
  private land(w: Walker): void {
    if (w.stage === 0 && this.queue[w.route]) this.queue[w.route]!.push({ town: w.town, n: w.n });
    else if (w.stage === 2 && this.gateQ[w.route]) this.gateQ[w.route]!.push({ town: w.town, n: w.n, since: this.now });
    else if (w.stage === 3) { if (this.gallery[w.route] !== undefined) this.gallery[w.route]! += w.n; }
    else { this.arrive(w.town, w.n); this.onIn?.(w.town, w.n, w.tx, w.ty); }
  }
  /** moves every walker dist tiles straight at its target; a group that reaches it lands (see land) */
  step(dist: number): void {
    let w = 0;
    for (const g of this.walkers) {
      const dx = g.tx - g.x, dy = g.ty - g.y, L = Math.hypot(dx, dy);
      if (L <= dist) { this.land(g); continue; }
      g.x += dx / L * dist; g.y += dy / L * dist; this.walkers[w++] = g;
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
  /** the fans per town still walking (the walker groups) */
  walking(): number[] {
    const out = new Array<number>(this.towns).fill(0);
    for (const g of this.walkers) out[g.town]! += g.n;
    return out;
  }
}
