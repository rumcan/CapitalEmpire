// The city (Phase 3 step 7): the road network replica, the lane graph, the traffic Sim, the parcels, the reachable segs, the water
// field, the Town and the growth planner. Pure TS, no worker globals: the city worker (sim/sim.worker.ts) is a thin shell that
// posts what City returns, and the town gate (scripts/sim/town-gate.ts) drives it headless.
import type { NetOp } from './ground-protocol';
import { RoadNetwork, type Leg, type Pt, type Seg } from './network';
import { applyOps } from './netops';
import { MAP } from './iso';
import { TC } from './terrain/types';
import { LotMap, type Lot } from './lots/lots';
import { GROWTH_OPTIONS, LU, LV, Town, builtLots, type LotTuple, type TownCtx, type TownEvent } from './lots/town';
import { needsLand, planExtension, reachableSegs, seededRnd, type RoadPlanCtx } from './lots/roads';
import { LaneGraph } from './sim/lanes';
import { Sim } from './sim/sim';
import { zoneOf } from './sim/routing';
import { Budget, GAME_DAY, type BudgetSave, type DayIn, type Ledger, type LotIn, type SegIn } from './budget';

/** the vehicle slots of the sim, and the ring of step times (calls) kept for the frame stats */
const CAP = 12000, TICKS = 100;
/** the game hour (sim s): the town's access is copied and the built lots given to the sim at its start; the planner runs once per hour */
const GAME_HOUR = 60;
/** the water distance field: 4-tile cells, distances capped at WATER_CAP tiles */
const WATER_N = MAP >> 2, WATER_CAP = 200;

/** the distance (tiles, capped) to the nearest WATER on the 4-tile cells (a cell is wet if one of its tiles is): a two-pass chamfer, in tiles */
function waterField(terr: Uint8Array): Float32Array {
  const N = WATER_N, f = new Float32Array(N * N).fill(1e9), S = Math.SQRT2;
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    let wet = false;
    for (let j = 0; j < 4 && !wet; j++) for (let i = 0; i < 4; i++) if (terr[(cy * 4 + j) * MAP + cx * 4 + i] === TC.WATER) { wet = true; break; }
    if (wet) f[cy * N + cx] = 0;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; let v = f[i];
    if (x > 0) v = Math.min(v, f[i - 1] + 1);
    if (y > 0) { v = Math.min(v, f[i - N] + 1); if (x > 0) v = Math.min(v, f[i - N - 1] + S); if (x < N - 1) v = Math.min(v, f[i - N + 1] + S); }
    f[i] = v;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; let v = f[i];
    if (x < N - 1) v = Math.min(v, f[i + 1] + 1);
    if (y < N - 1) { v = Math.min(v, f[i + N] + 1); if (x < N - 1) v = Math.min(v, f[i + N + 1] + S); if (x > 0) v = Math.min(v, f[i + N - 1] + S); }
    f[i] = v;
  }
  for (let i = 0; i < f.length; i++) f[i] = Math.min(WATER_CAP, f[i] * 4);
  return f;
}
const optionOf = (id: string) => GROWTH_OPTIONS.find(o => o.id === id) ?? GROWTH_OPTIONS[0];

/** One city: feed it the network ops (netOps), the terrain (terrain) and the sim steps (step). The worker and the gate share it. */
export class City {
  /** the road network replica (no paint, no occupancy raster: the lanes and the parcels need the geometry only) */
  readonly net = new RoadNetwork();
  /** the lane graph of the network, and the traffic */
  readonly g = new LaneGraph();
  readonly sim: Sim;
  /** the parcels of the network */
  readonly lots = new LotMap();
  /** the town (replaced by terrain: a new valley starts a new town) */
  town: Town;
  /** the city's books (budget.ts): the treasury, loans, the ledgers; the game day booked last (-1: none yet) and the sim's trade at that booking */
  budget = new Budget();
  private dayIdx = -1; private tradeAt = { arrived: 0, punctual: 0 };
  /** the step calls so far (one per wall-clock frame in the worker), the ring of their times (ms), and the last network batch's times */
  calls = 0; graphMs = 0; lotsMs = 0; lanes = 0;
  /** the segs reachable by road from the entry */
  private reach = new Set<Seg>();
  private cls: Uint8Array | null = null; private water: Float32Array | null = null; private optId = GROWTH_OPTIONS[0].id;
  private ctx: TownCtx;
  /** the game hour the town's access was copied to the town and the built lots given to the sim (-1 = none yet: at the next step) */
  private syncHour = -1;
  /** the town's road plan: its random stream, the game hour planned, a gravel extension posted and not yet back as net ops (and when) */
  /** the growth planner's hourly outcomes (diagnostics): enough land, a leg proposed, short of land but no valid leg */
  growStats = { enough: 0, legs: 0, none: 0 };
  private planRnd = seededRnd(1); private planHour = -1; private pendingGrow = false; private growAt = 0;
  private ticks = new Float64Array(TICKS);

  /** a city with no terrain yet: the town of seed (its planner starts with the same seed) */
  constructor(seed: number) {
    this.net.paintData = false; this.net.occRaster = null;
    this.sim = new Sim(this.g, CAP, 1);
    this.ctx = { lots: this.lots, entry: { x: 0, y: 0 }, reachable: (l: Lot) => this.reach.has(l.seg), water: (x, y) => this.waterAt(x, y) };
    this.town = new Town(seed);
    this.planRnd = seededRnd(seed);
  }

  /** the access per zone (256): the sim's live copy (the town reads its own copy, taken each game hour) */
  get access(): Float32Array { return this.sim.access; }
  /** the last step call's time (ms), and the largest of the last TICKS calls */
  get tickMs(): number { return this.ticks[(this.calls - 1) % TICKS]!; }
  get maxTickMs(): number { let m = 0; for (const v of this.ticks) if (v > m) m = v; return m; }

  /** the distance to WATER from a tile: 200 before the terrain arrives */
  private waterAt(x: number, y: number): number {
    if (!this.water) return WATER_CAP;
    const cx = Math.min(WATER_N - 1, Math.max(0, Math.floor(x / 4))), cy = Math.min(WATER_N - 1, Math.max(0, Math.floor(y / 4)));
    return this.water[cy * WATER_N + cx]!;
  }

  /** a new valley: its terrain classes, the water field, the highway entry (tiles) and the seed; the town starts again, at the sim time (no lots yet) */
  terrain(cls: Uint8Array, entry: Pt, seed: number): void {
    this.cls = cls; this.water = waterField(cls); this.ctx.entry = { x: entry.x, y: entry.y };
    this.town = new Town(seed); this.town.option = optionOf(this.optId); this.town.tick(this.sim.t, this.ctx); this.syncHour = -1;
    this.planRnd = seededRnd(seed); this.planHour = -1; this.pendingGrow = false;
    this.setBudget(null);
  }

  /** the books replaced: a saved budget, or null for a fresh one (its day 1 starts at the midnight of the current sim day) */
  setBudget(s: BudgetSave | null): void {
    this.budget = s ? Budget.from(s) : new Budget();
    if (!s) this.budget.base = Math.floor(this.sim.t / GAME_DAY) * GAME_DAY;
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade };
  }

  /** spends n $ on kind (see Budget.spend); a negative construction n gives it back */
  spend(kind: 'construction' | 'compensation', n: number): void { this.budget.spend(kind, n); }
  /** takes a loan unit (true: borrow, if the town can hold one) or repays one (false); false if the books refuse */
  loan(take: boolean): boolean { return take ? this.budget.borrow(this.town.pop) : this.budget.repay(); }

  /** the day's books as Budget.endDay reads them: the lots with a town state of BUILT or more, the road stretches, the junction types,
   *  the trade since the last booking, the residents */
  dayIn(): DayIn {
    const lots: LotIn[] = [], segs: SegIn[] = [], nodes: string[] = [];
    for (const l of this.lots.lots.values()) {
      const s = this.town.states.get(l.key);
      if (s && s.level >= LV.BUILT) lots.push({ use: s.use, level: s.level, decline: s.decline, cls: l.cls, access: this.sim.access[zoneOf(l.c.x, l.c.y)]! });
    }
    for (const s of this.net.segs) segs.push({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind });
    for (const n of this.net.nodes.values()) nodes.push(n.type);
    const tr = this.sim.trade, t0 = this.tradeAt;
    return { lots, segs, nodes, trade: { arrived: tr.arrived - t0.arrived, punctual: tr.punctual - t0.punctual }, pop: this.town.pop };
  }

  /** the growth option by id (see GROWTH_OPTIONS) */
  option(id: string): void { this.optId = id; this.town.option = optionOf(id); }

  /** replays a batch of network ops (a rebuild ends each part; the lane graph follows each one, so each part is measured on its own),
   *  then the parcels, the reachable segs and the town's lots. Returns the parcels added and removed and the town's events. */
  netOps(ops: NetOp[]): { lotsAdded: Lot[]; lotsRemoved: string[]; events: TownEvent[] } {
    const t0 = performance.now();
    this.pendingGrow = false;
    let part: NetOp[] = [];
    for (const op of ops) {
      part.push(op);
      if (op.k === 'rebuild') { applyOps(this.net, part); this.g.update(this.net); part = []; }
    }
    if (part.length) applyOps(this.net, part);
    this.sim.onGraph();
    this.graphMs = performance.now() - t0;
    this.lanes = 0; for (const ln of this.g.lanes) if (ln) this.lanes++;
    return this.lotsOps();
  }

  /** after a network batch: the parcels that changed, the reachable segs, the town's lots */
  private lotsOps(): { lotsAdded: Lot[]; lotsRemoved: string[]; events: TownEvent[] } {
    const t0 = performance.now();
    const { added, removed } = this.lots.update(this.net, this.cls);
    this.reach = reachableSegs(this.net, this.ctx.entry);
    const events = this.town.onLots(added, removed);
    this.lotsMs = performance.now() - t0;
    return { lotsAdded: added, lotsRemoved: removed, events };
  }

  /** a saved town (after the load's net ops): the sim clock (s), then the lots' states; returns the 'complete' event per restored lot */
  restore(saved: LotTuple[], simT: number, budget?: BudgetSave, money?: number): TownEvent[] {
    this.sim.t = simT;
    this.budget = Budget.from(budget, money); if (!budget) this.budget.base = Math.floor(simT / GAME_DAY) * GAME_DAY;
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade };
    const ev = this.town.restore(saved, this.sim.t); this.syncHour = -1;
    return ev;
  }

  /** n sim steps (a frame at speed n), then the town to the sim time, then the planner (once a game hour). Returns the town's events
   *  (the array is reused: read it before the next call), the gravel extension the town lays now, if any (legs in tiles), and the
   *  ledger of the game day that closed in these steps, if one did (else null). */
  step(n: number): { events: TownEvent[]; grow: Leg[] | null; ledger: Ledger | null } {
    const t0 = performance.now();
    this.calls++;
    const hr = Math.floor(this.sim.t / GAME_HOUR);
    if (hr !== this.syncHour) { this.syncHour = hr; this.town.access.set(this.sim.access); this.builtSync(); }
    for (let k = 0; k < n; k++) this.sim.step();
    this.ticks[(this.calls - 1) % TICKS] = performance.now() - t0;
    const events = this.town.tick(this.sim.t, this.ctx);
    const d = this.budget.dayOf(this.sim.t); let ledger: Ledger | null = null;
    if (this.dayIdx < 0) this.dayIdx = d;
    else if (d > this.dayIdx) { ledger = this.budget.endDay(this.dayIdx, this.dayIn()); this.tradeAt = { ...this.sim.trade }; this.dayIdx = d; }
    return { events, grow: this.planGrow(), ledger };
  }

  /** the built lots go to the sim (once a game hour); the sim switches from random trips to the lots' trips once a RES lot is built */
  private builtSync() {
    const list = builtLots(this.town, this.lots);
    if (this.sim.mode === 'random' && list.some(b => b.use === LU.RES)) { this.sim.mode = 'lots'; this.sim.setTarget(0); }
    this.sim.setBuilt(list);
  }

  /** the town lays a gravel extension when it is short of land: at most once per game hour, and not while the last one is out
   *  (no net ops back yet: the next net batch clears it, and so does an hour, in case the engine skipped it) */
  private planGrow(): Leg[] | null {
    const cls = this.cls;
    if (!cls) return null;
    const h = Math.floor(this.sim.t / GAME_HOUR);
    if (h === this.planHour) return null;
    this.planHour = h;
    if (this.pendingGrow && this.sim.t - this.growAt < GAME_HOUR) return null;
    const c: RoadPlanCtx = { net: this.net, lots: this.lots, town: this.town, cls, entry: this.ctx.entry, rnd: this.planRnd };
    if (!needsLand(c)) { this.growStats.enough++; return null; }
    const legs = planExtension(c);
    if (!legs) { this.growStats.none++; return null; }
    this.growStats.legs++;
    this.pendingGrow = true; this.growAt = this.sim.t;
    return legs;
  }
}
