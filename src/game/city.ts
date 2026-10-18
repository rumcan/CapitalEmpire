// The city (Phase 3 step 7): the road network replica, the lane graph, the traffic Sim, the parcels, the reachable segs, the water
// field, the Town and the growth planner. Pure TS, no worker globals: the city worker (sim/sim.worker.ts) is a thin shell that
// posts what City returns, and the town gate (scripts/sim/town-gate.ts) drives it headless.
import type { NetOp } from './ground-protocol';
import { RoadNetwork, dot, norm, perp, sub, type Leg, type Node, type Pt, type Seg } from './network';
import { applyOps } from './netops';
import { MAP } from './iso';
import { TC } from './terrain/types';
import { LotMap, type Lot } from './lots/lots';
import { GROWTH_OPTIONS, LU, LV, Town, builtLots, type LotTuple, type TownCtx, type TownEvent } from './lots/town';
import { needsLand, planExtension, reachableFrom, reachableSegs, seededRnd, type RoadPlanCtx } from './lots/roads';
import { LaneGraph, MPT, laneAt } from './sim/lanes';
import { DT, Sim, type CarInfo, type ParkState, type Sink } from './sim/sim';
import { bottlenecks, type Report } from './sim/bottlenecks';
import { zoneOf } from './sim/routing';
import { Budget, GAME_DAY, LOAN, LOAN_RATE, SIGNAL_UPKEEP, segUpkeep, type BudgetSave, type DayIn, type Ledger, type LotIn, type SegIn } from './budget';
import { Career, type CareerSave, type Milestone } from './career';
import type { HourStat } from './beforeafter';
import { EVENT_CLOCK } from './event/config';
import { Round } from './event/round';
import { crowdFor, placeStadium, type Site } from './event/site';
import { buildPark, type CarPark, type CarParkDef, type ParkView } from './event/carpark';

/** the vehicle slots of the sim, and the ring of step times (calls) kept for the frame stats */
const CAP = 12000, TICKS = 100;
/** the game hour (sim s): the town's access is copied and the built lots given to the sim at its start; the planner runs once per hour */
const GAME_HOUR = 60;
/** the game hours' snapshots kept (four game days of them: see beforeafter.ts) */
const HOURS_KEPT = 96;
/** the milestones of a step that reached none (shared: read, never written) */
const NO_MILESTONES: Milestone[] = [];
/** the water distance field: 4-tile cells, distances capped at WATER_CAP tiles */
const WATER_N = MAP >> 2, WATER_CAP = 200;
/** a sink's s is kept this far from its lane's ends, m (as driveway's DRIVE_END), and the dev car park test sends cars at least this far, tiles, where it can */
const SINK_END = 3, PARK_TEST_M = 300;

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
  /** dev sandbox: the growth speed (1 = the game's; see Town.speed) and unlimited money (see Budget.unlimited); each budget gets the money flag */
  growSpeed = 1; unlimited = false;
  /** the town's career (career.ts): the milestones reached (their grants paid, their road classes, junctions and tunnels unlocked) and the win; a fresh one with each valley or book */
  career = new Career();
  private dayIdx = -1; private tradeAt = { arrived: 0, punctual: 0 };
  /** the step calls so far (one per wall-clock frame in the worker), the ring of their times (ms), and the last network batch's times */
  calls = 0; graphMs = 0; lotsMs = 0; lanes = 0;
  /** the segs reachable by road from the entry (or from the town centres, when there are some) */
  private reach = new Set<Seg>();
  /** the town centres (tiles) of the valley (none on the single-town path): each is a town the planner grows in turn, hour by hour */
  centres: Pt[] = [];
  /** the stadium's site (none without towns: see event/site.ts) and the event round (event/round.ts: a fresh one with each valley) */
  site: Site | null = null; round = new Round();
  /** the car parks as the player placed them (parkDefs, the full list), and the ones built on the network (parks: buildPark; a park with no
   *  frontage or under 10 bays is left out; parks[k] is sim.parks[k] and the sinks' park index) */
  parkDefs: CarParkDef[] = []; parks: CarPark[] = [];
  /** the road, signal and loan upkeep per game day, $ (cached: null when stale, after a net batch, a loan change or new books) */
  private upkeepC: number | null = null;
  private cls: Uint8Array | null = null; private water: Float32Array | null = null; private optId = GROWTH_OPTIONS[0].id;
  private ctx: TownCtx;
  /** the game hour the town's access was copied to the town and the built lots given to the sim (-1 = none yet: at the next step) */
  private syncHour = -1;
  /** the town's road plan: its random stream, the game hour planned, a gravel extension posted and not yet back as net ops (and when) */
  /** the growth planner's hourly outcomes (diagnostics): enough land, a leg proposed, short of land but no valid leg */
  growStats = { enough: 0, legs: 0, none: 0 };
  /** the game hours' snapshots (see HourStat), newest last, at most HOURS_KEPT; the lots started (town 'build' events) since the terrain came */
  hours: HourStat[] = []; builds = 0;
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

  /** a new valley: its terrain classes, the water field, the highway entry (tiles), the seed and the town centres (tiles; none: the single town); the town starts again, at the sim time (no lots yet) */
  terrain(cls: Uint8Array, entry: Pt, seed: number, towns: Pt[] = []): void {
    this.cls = cls; this.water = waterField(cls); this.ctx.entry = { x: entry.x, y: entry.y };
    this.centres = towns;
    this.town = new Town(seed); this.town.setCentres(towns); this.town.option = optionOf(this.optId); this.town.speed = this.growSpeed; this.town.tick(this.sim.clock, this.ctx); this.syncHour = -1;
    this.hours = []; this.builds = 0;
    this.planRnd = seededRnd(seed); this.planHour = -1; this.pendingGrow = false;
    this.site = towns.length ? placeStadium(cls, towns) : null; this.round = new Round();
    this.setBudget(null, null);
  }

  /** the road upkeep per game day, $: the sum of the road stretches' upkeep (segUpkeep, as dayIn builds them), the junctions' signal upkeep,
   *  and the loans' interest; cached until a net batch, a loan change or new books */
  upkeepRate(): number {
    if (this.upkeepC !== null) return this.upkeepC;
    let r = 0;
    for (const s of this.net.segs) r += segUpkeep({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind });
    for (const n of this.net.nodes.values()) r += SIGNAL_UPKEEP[n.type] ?? 0;
    r += this.budget.loans * LOAN * LOAN_RATE;
    return this.upkeepC = r;
  }

  /** starts a round (free only, with a site): the crowd by town population (crowdFor at the round's level), and the clock frozen at the next
   *  EVENT_CLOCK (18:00 today, or tomorrow's if the clock is past it); false if there is no site or a round is under way */
  startRound(): boolean {
    if (!this.site || this.round.stage !== 'free') return false;
    if (!this.round.start(crowdFor(this.round.level, this.town.popK))) return false;
    const c = this.sim.clock, day = Math.floor(c / GAME_DAY) * GAME_DAY;
    this.freeze(c <= day + EVENT_CLOCK ? day + EVENT_CLOCK : day + GAME_DAY + EVENT_CLOCK);
    return true;
  }
  /** ends the build now: the surge begins; false unless in build */
  startNow(): boolean {
    if (!this.round.startNow()) return false;
    this.beginSurge();
    return true;
  }
  /** the build's wall-clock time (dt s): when it is done the surge begins */
  wall(dt: number): void { if (this.round.wall(dt)) this.beginSurge(); }
  /** the surge's clock starts (see Round.beginSurge; idempotent with the round's own start) */
  private beginSurge(): void { this.round.beginSurge(); }
  /** closes the eval: the round is free again and the clock runs on from where it was frozen; false unless in eval */
  closeRound(): boolean {
    if (!this.round.close()) return false;
    this.unfreeze(); this.emptyParks();
    return true;
  }

  /** the books replaced: a saved budget, or null for a fresh one (its day 1 starts at the midnight of the current sim day); the career
   *  saved with them, or a fresh one (at the hamlet) if none is given */
  setBudget(s: BudgetSave | null, career?: CareerSave | null): void {
    this.budget = s ? Budget.from(s) : new Budget();
    this.budget.unlimited = this.unlimited;
    if (!s) this.budget.base = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    this.career = Career.from(career ?? undefined);
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade }; this.upkeepC = null;
  }

  /** the dev sandbox's options: the growth speed k (the town's Town.speed, and the planner's slots and window) and unlimited money (every budget); the defaults are the game's */
  setGrowth(k: number): void { this.growSpeed = k; this.town.speed = k; }
  setUnlimited(on: boolean): void { this.unlimited = on; this.budget.unlimited = on; }

  /** spends n $ on kind (see Budget.spend); a negative construction n gives it back */
  spend(kind: 'construction' | 'compensation', n: number): void { this.budget.spend(kind, n); }
  /** takes a loan unit (true: borrow, if the town can hold one) or repays one (false); false if the books refuse */
  loan(take: boolean): boolean { this.upkeepC = null; return take ? this.budget.borrow(this.town.pop) : this.budget.repay(); }

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
    this.sim.onGraph(); this.upkeepC = null;
    if (this.parks.length) this.resolveSinks();
    this.graphMs = performance.now() - t0;
    this.lanes = 0; for (const ln of this.g.lanes) if (ln) this.lanes++;
    return this.lotsOps();
  }

  /** after a network batch: the parcels that changed, the reachable segs, the town's lots */
  private lotsOps(): { lotsAdded: Lot[]; lotsRemoved: string[]; events: TownEvent[] } {
    const t0 = performance.now();
    const { added, removed } = this.lots.update(this.net, this.cls);
    this.reach = this.centres.length ? reachableFrom(this.net, [this.ctx.entry, ...this.centres], [Infinity, ...this.centres.map(() => 80)]) : reachableSegs(this.net, this.ctx.entry);
    const events = this.town.onLots(added, removed);
    this.lotsMs = performance.now() - t0;
    return { lotsAdded: added, lotsRemoved: removed, events };
  }

  /** a saved town (after the load's net ops): the sim time (s), the clock's offset from it (shift, s; 0 if none), then the lots' states;
   *  returns the 'complete' event per restored lot */
  restore(saved: LotTuple[], simT: number, budget?: BudgetSave, money?: number, career?: CareerSave, shift = 0): TownEvent[] {
    this.sim.t = simT; this.sim.shift = shift;
    this.budget = Budget.from(budget, money); this.budget.unlimited = this.unlimited; if (!budget) this.budget.base = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    this.career = Career.from(career);
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade }; this.upkeepC = null;
    const ev = this.town.restore(saved, this.sim.clock); this.syncHour = -1;
    return ev;
  }

  /** freezes the game clock at c (s, the time of day): the sim keeps running, the town, the books and the planner stand still (see Sim.freezeAt) */
  freeze(c: number): void { this.sim.freezeAt(c); }
  /** the game clock runs again (see Sim.unfreeze) */
  unfreeze(): void { this.sim.unfreeze(); }

  /** the towns built at once (a new valley, see Town.stamp): each town grows to perTown residents; returns the 'complete' events (a new array) */
  stamp(perTown: number): TownEvent[] { const ev = this.town.stamp(this.ctx, perTown, this.sim.clock); this.syncHour = -1; return ev; }

  /** n sim steps (a frame at speed n), then the town to the sim time, then the planner (once a game hour). Returns the town's events
   *  (the array is reused: read it before the next call), the gravel extension the town lays now, if any (legs in tiles), and the
   *  ledger of the game day that closed in these steps, if one did (else null). At a game hour's start the career is updated: the
   *  milestones newly reached (their grants paid then) and the win, if it came; milestones is the shared empty array most calls. */
  step(n: number): { events: TownEvent[]; grow: Leg[] | null; ledger: Ledger | null; milestones: Milestone[]; won: boolean } {
    const t0 = performance.now();
    this.calls++;
    this.sim.parkedNow.length = 0;
    const hr = Math.floor(this.sim.clock / GAME_HOUR);
    let milestones = NO_MILESTONES, won = false;
    if (hr !== this.syncHour) {
      this.pushHour(hr); this.syncHour = hr; this.town.access.set(this.sim.access); this.builtSync();
      const u = this.career.update(this.town.pop);
      for (const m of u.newly) if (m.grant) this.budget.grant(m.grant);
      if (u.newly.length) milestones = u.newly;
      won = u.won;
    }
    for (let k = 0; k < n; k++) this.sim.step();
    this.ticks[(this.calls - 1) % TICKS] = performance.now() - t0;
    // a round under way pays the upkeep as the sim runs; the surge counts down to kick-off (the round goes to eval then)
    const rs = this.round.stage;
    if (rs === 'build' || rs === 'surge') { const u = this.upkeepRate() * n * DT / GAME_DAY; this.budget.upkeepLive(u); this.round.upkeep += u; }
    if (rs === 'surge') this.round.sim(n * DT);
    const events = this.town.tick(this.sim.clock, this.ctx);
    for (const e of events) if (e.kind === 'build') this.builds++;
    const d = this.budget.dayOf(this.sim.clock); let ledger: Ledger | null = null;
    if (this.dayIdx < 0) this.dayIdx = d;
    else if (d > this.dayIdx) { ledger = this.budget.endDay(this.dayIdx, this.dayIn()); this.tradeAt = { ...this.sim.trade }; this.dayIdx = d; }
    return { events, grow: this.planGrow(), ledger, milestones, won };
  }

  /** the snapshot of game hour h, at its start: the sim's cumulative counts, the builds, and the town's residents and built lots now */
  private pushHour(h: number) {
    const s = this.sim.stats;
    this.hours.push({ h, lost: this.sim.lostTotal, arrived: s.arrived, ratioSum: s.ratioSum, ratioN: s.ratioN, abandoned: s.abandoned, builds: this.builds, pop: this.town.pop, built: this.town.built });
    if (this.hours.length > HOURS_KEPT) this.hours.shift();
  }

  /** the car parks as the player placed them (defs, the full list, each time): each is built on the network (buildPark), keeping its counts
   *  by id; then the sinks (resolveSinks) */
  setParks(defs: CarParkDef[]): void {
    const old = this.parks, st = this.sim.parks, parks: CarPark[] = [], states: ParkState[] = [];
    this.parkDefs = defs.slice();
    for (const d of defs) {
      const p = buildPark(this.net, d);
      if (!p) continue;
      const k = old.findIndex(q => q.id === p.id), o = k >= 0 ? st[k] : undefined;
      parks.push(p); states.push({ bays: p.bays.length, parked: o?.parked ?? 0, turned: o?.turned ?? 0 });
    }
    this.parks = parks; this.sim.parks = states; this.resolveSinks();
  }
  /** each car park entrance's sink (sinkAt), as the sim's sinks; Sim.setSinks keeps the vehicles already bound for them */
  private resolveSinks(): void {
    const sinks: Sink[] = [];
    this.parks.forEach((p, k) => { for (const e of p.entrances) { const s = this.sinkAt(k, p, e); if (s) sinks.push(s); } });
    this.sim.setSinks(sinks);
  }
  /** the sink of park k at entrance e: the dseg of the frontage road (parallel to the park's side, within 2 tiles of e) whose traffic has the
   *  park on its right (the lanes sit on perp of the heading, as driveway reads them); its outermost lane, s at e's projection on it; null if none */
  private sinkAt(k: number, p: CarPark, e: Pt): Sink | null {
    const near = new Set(this.net.segsNear(e, 2)), side = p.side, vert = side % 2 === 0;
    // the park lies on the side of the road that faces away from the frontage's outward normal
    const pv: Pt = { x: side === 0 ? -1 : side === 2 ? 1 : 0, y: side === 1 ? -1 : side === 3 ? 1 : 0 };
    for (const d of this.g.dsegs) {
      if (!d || !d.lanes.length || !near.has(d.seg)) continue;
      const h = norm(sub(d.to, d.from));
      if (Math.abs(vert ? h.y : h.x) < 0.98 || dot(perp(h), pv) <= 0) continue;
      const ln = this.g.lanes[d.lanes[d.lanes.length - 1]!]!;
      if (ln.len < 2 * SINK_END) return null;
      const p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, u = norm({ x: ln.pts[2]! - p0.x, y: ln.pts[3]! - p0.y });
      return { park: k, dseg: d.id, s: Math.min(ln.len - SINK_END, Math.max(SINK_END, dot(sub(e, p0), u) * MPT)), next: 0 };
    }
    return null;
  }
  /** the car parks' counts for the frame: id, bays, cars parked, cars turned away */
  parkView(): ParkView[] {
    return this.parks.map((p, k) => { const s = this.sim.parks[k]!; return { id: p.id, bays: s.bays, parked: s.parked, turned: s.turned }; });
  }
  /** every car park is empty again (the round's close): the cars parked and turned away are counted from zero */
  emptyParks(): void { for (const s of this.sim.parks) { s.parked = 0; s.turned = 0; } }
  /** dev test hook (the browser check): sends up to n cars from random origins (the trips' origins; at least PARK_TEST_M tiles from the
   *  entrance for the first draws) to the entrances of car park id, round-robin, bound for their sinks; returns the cars sent */
  parkTest(id: number, n: number): number {
    const k = this.parks.findIndex(q => q.id === id), js: number[] = [];
    this.sim.sinks.forEach((s, j) => { if (s.park === k) js.push(j); });
    if (k < 0 || !js.length) return 0;
    const q = { x: 0, y: 0, hx: 0, hy: 0 }, sp = { x: 0, y: 0, hx: 0, hy: 0 };
    let sent = 0;
    for (let c = 0; c < n; c++) {
      let done = false;
      for (let a = 0; a < 40 && !done; a++) {
        const lane = this.sim.trips.origin();
        if (lane < 0) return sent;
        const s = this.sim.trips.oS, j = js[sent % js.length]!, K = this.sim.sinks[j]!, dd = this.g.dsegs[K.dseg]!;
        laneAt(this.g.lanes[lane]!, s, q); laneAt(this.g.lanes[dd.lanes[dd.lanes.length - 1]!]!, K.s, sp);
        if (a < 20 && Math.hypot(sp.x - q.x, sp.y - q.y) < PARK_TEST_M) continue;
        done = this.sim.spawnAt(lane, s, K.dseg, K.s, 0, j) >= 0;
      }
      if (done) sent++;
    }
    return sent;
  }

  /** the bottleneck report of the traffic now: the junctions' levels of service, the links' v/c, and the topN entries by time lost */
  report(topN = 10): Report { return bottlenecks(this.g, this.sim, topN); }

  /** the car in slot i as the inspector shows it (see Sim.inspect), or null */
  inspect(slot: number): CarInfo | null { return this.sim.inspect(slot); }
  /** watches the junction (3 or more segs, or a roundabout) nearest (x, y) within 4 tiles: its x, y, or null (no watch then) */
  watchAt(x: number, y: number): [number, number] | null {
    let best: Node | null = null, bd = 16;
    for (const n of this.net.nodes.values()) {
      if (n.segs.length < 3 && n.rb <= 0) continue;
      const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    this.sim.setWatch(best);
    return best ? [best.x, best.y] : null;
  }
  /** stops the junction watch */
  unwatch(): void { this.sim.setWatch(null); }

  /** the built lots go to the sim (once a game hour); the sim switches from random trips to the lots' trips once a RES lot is built */
  private builtSync() {
    const list = builtLots(this.town, this.lots);
    if (this.sim.mode === 'random' && list.some(b => b.use === LU.RES)) { this.sim.mode = 'lots'; this.sim.setTarget(0); }
    this.sim.setBuilt(list);
  }

  /** the centre of town k: the mean of its BUILT lots (the town's centre while it has none) */
  private townCentre(k: number): Pt {
    let sx = 0, sy = 0, m = 0;
    for (const s of this.town.states.values()) if (s.level >= LV.BUILT && this.town.townOf(s.key) === k) { const l = this.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
    return m ? { x: sx / m, y: sy / m } : this.centres[k]!;
  }

  /** the town lays a gravel extension when it is short of land: at most once per game hour, and not while the last one is out
   *  (no net ops back yet: the next net batch clears it, and so does an hour, in case the engine skipped it) */
  private planGrow(): Leg[] | null {
    const cls = this.cls;
    if (!cls) return null;
    const h = Math.floor(this.sim.clock * this.growSpeed / GAME_HOUR);
    if (h === this.planHour) return null;
    this.planHour = h;
    if (this.pendingGrow && this.sim.clock - this.growAt < GAME_HOUR / this.growSpeed) return null;
    const K = this.centres.length, k = K ? this.planHour % K : 0;
    const c: RoadPlanCtx = K
      ? { net: this.net, lots: this.lots, town: this.town, cls, entry: this.centres[k]!, rnd: this.planRnd, centre: this.townCentre(k), built: this.town.builtK[k] }
      : { net: this.net, lots: this.lots, town: this.town, cls, entry: this.ctx.entry, rnd: this.planRnd };
    if (!needsLand(c)) { this.growStats.enough++; return null; }
    const legs = planExtension(c);
    if (!legs) { this.growStats.none++; return null; }
    this.growStats.legs++;
    this.pendingGrow = true; this.growAt = this.sim.clock;
    return legs;
  }
}
