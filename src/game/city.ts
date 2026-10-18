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
import { LK, LaneGraph, MPT, laneAt, type DSeg, type Lane } from './sim/lanes';
import { DT, Sim, type CarInfo, type ParkState, type Sink } from './sim/sim';
import { bottlenecks, type Report } from './sim/bottlenecks';
import { zoneOf } from './sim/routing';
import { Budget, GAME_DAY, LOAN, LOAN_RATE, SIGNAL_UPKEEP, saleOf, segUpkeep, startMoney, type BudgetSave, type DayIn, type Ledger, type LotIn, type SegIn } from './budget';
import { Career, type CareerSave, type Milestone } from './career';
import type { HourStat } from './beforeafter';
import { DECK_SEATS, ENTRY_S, EVENT_CLOCK, EXPRESS_ENTRY, GRAVEL_EVERY_H, PARTY, PERFECT_RATE, SURGE_SEED, TOWN_GROWTH, WALK_V, payout, tollPrice, type CardId } from './event/config';
import type { BusRoute, BusRouteDef, BusStop } from './event/bus';
import { Crowd, type FanCounts } from './event/crowd';
import type { TollDef } from './event/toll';
import { Round, type RoundSave, type RoundView } from './event/round';
import { crowdFor, placeStadium, type Site } from './event/site';
import { buildPark, type CarPark, type CarParkDef, type ParkView } from './event/carpark';
import { Surge, matchSink, type SurgeHome, type SurgePark } from './event/surge';

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
/** a shuttle route's buses are spawned this many m apart back along the kerb lane from the lot stop; its stops must be within BUS_REACH tiles of the
 *  player's points, and kept BUS_END m clear of the lane's ends */
const BUS_GAP = 15, BUS_REACH = 4, BUS_END = 3;

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
/** the distance from point p to segment ab (tiles) */
function pointSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const k = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * k, p.y - a.y - dy * k);
}
/** the distance from (x, y) to the segment a → b (tiles) */
function segPointDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
  return Math.hypot(ax + dx * t - x, ay + dy * t - y);
}

/** the stadium door nearest point p (tiles): the first of the site's doors at the least distance */
function nearestDoor(doors: Pt[], p: Pt): Pt | null {
  let best: Pt | null = null, bd = Infinity;
  for (const d of doors) { const x = Math.hypot(d.x - p.x, d.y - p.y); if (x < bd) { bd = x; best = d; } }
  return best;
}

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
  /** the towns grown by the last close (closeRound: a perfect run only; null otherwise): the new lots' events, and the residents of each town reached */
  grown: { events: TownEvent[]; pops: number[] } | null = null;
  /** the surge of the round (event/surge.ts: planned at the surge's start, counted through the eval; null outside) and the road components of the
   *  network (comp: the segs joined by road share a number; labelled after each network batch, see labelComps) */
  surge: Surge | null = null; private comp = new Map<Seg, number>();
  /** the car parks as the player placed them (parkDefs, the full list), and the ones built on the network (parks: buildPark; a park with no
   *  frontage or under 10 bays is left out; parks[k] is sim.parks[k] and the sinks' park index) */
  parkDefs: CarParkDef[] = []; parks: CarPark[] = [];
  /** the shuttle routes as the player drew them (busDefs, the full list: a route's index is its sim index), their resolved stops' points (tiles; null:
   *  unresolved, the route is inactive), and the crowd of the surge (event/crowd.ts: the walkers, the queues, the fans on the buses; null outside the
   *  surge, its eval included) */
  busDefs: BusRouteDef[] = []; private busPts: ({ lot: Pt; doors: Pt } | null)[] = []; crowd: Crowd | null = null;
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
  private planRnd = seededRnd(1); private planHour = -1; private pendingGrow = false; private growAt = -Infinity;
  /** the toll gates as the player placed them (setTolls' defs, the full list): their plazas are no-go ground for the town's roads (with towns) */
  private tollDefs: TollDef[] = [];
  /** the no-go zones of the town's roads (with towns, see RoadPlanCtx.blocked): the stadium site padded by 6 tiles, a car park padded by 4, within
   *  12 tiles of a toll plaza seg, within 6 tiles of a bus stop point */
  private blocked = (x: number, y: number): boolean => {
    const s = this.site;
    if (s && x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.h + 6) return true;
    for (const p of this.parkDefs) if (x > p.x - 4 && x < p.x + p.w + 4 && y > p.y - 4 && y < p.y + p.h + 4) return true;
    for (const d of this.tollDefs) if (segPointDist(x, y, d.ax, d.ay, d.bx, d.by) < 12) return true;
    for (const b of this.busPts) if (b && (Math.hypot(b.lot.x - x, b.lot.y - y) < 6 || Math.hypot(b.doors.x - x, b.doors.y - y) < 6)) return true;
    return false;
  };
  private ticks = new Float64Array(TICKS);

  /** a city with no terrain yet: the town of seed (its planner starts with the same seed) */
  constructor(seed: number) {
    this.net.paintData = false; this.net.occRaster = null;
    this.sim = new Sim(this.g, CAP, 1);
    this.ctx = { lots: this.lots, entry: { x: 0, y: 0 }, reachable: (l: Lot) => this.reach.has(l.seg) && !this.reserved(l), water: (x, y) => this.waterAt(x, y) };
    this.town = new Town(seed);
    this.planRnd = seededRnd(seed);
    // the everyday trips to a lot are only to lots on roads joined to the origin (a town apart from the others has no road to it)
    this.sim.lotTrips.joined = (a, b) => this.joinedLots(a, b);
  }

  /** a lot on land the event uses: its box overlaps the stadium site or a car park (padded by a tile), so the town never builds there */
  private reserved(l: Lot): boolean {
    if (!this.site && !this.parkDefs.length) return false;
    const ax = l.o.x + l.u.x * l.w, ay = l.o.y + l.u.y * l.w, bx = l.o.x + l.n.x * l.d, by = l.o.y + l.n.y * l.d, cx = ax + l.n.x * l.d, cy = ay + l.n.y * l.d;
    const x0 = Math.min(l.o.x, ax, bx, cx), x1 = Math.max(l.o.x, ax, bx, cx), y0 = Math.min(l.o.y, ay, by, cy), y1 = Math.max(l.o.y, ay, by, cy);
    const hit = (r: { x: number; y: number; w: number; h: number }) => x1 > r.x - 1 && x0 < r.x + r.w + 1 && y1 > r.y - 1 && y0 < r.y + r.h + 1;
    return (!!this.site && hit(this.site)) || this.parkDefs.some(hit);
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
    this.site = towns.length ? placeStadium(cls, towns) : null; this.round = new Round(); this.grown = null; this.sim.entryS = ENTRY_S;
    this.surge = null; this.sim.dropParty(); this.crowd = null; this.sim.dropBuses();
    // a new valley has no toll gates until the player places them again (their booths are the old roads')
    this.setTolls([]);
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
  private beginSurge(): void { this.round.beginSurge(); this.surge = this.planSurge(); this.startBuses(); }
  /** closes the eval: the round is free again and the clock runs on from where it was frozen. A perfect run's towns grow (growTowns; see grown).
   *  False unless in eval, and while the draft is open (see Round.close) */
  closeRound(): boolean {
    const perfect = !!this.round.last?.perfect;
    this.grown = null;
    if (!this.round.close()) return false;
    this.sim.dropParty(); this.surge = null; this.crowd = null; this.sim.dropBuses();
    // the roads clear after the event: a surge can leave the towns' junctions gridlocked, and the next round must start on an open network
    // (the everyday trips start again on their own)
    for (let i = 0; i < this.sim.cap; i++) if (this.sim.alive[i]) this.sim.despawn(i);
    this.unfreeze(); this.emptyParks();
    if (perfect && this.centres.length) this.grown = this.growTowns();
    return true;
  }
  /** a perfect run's growth: each town is stamped to its residents times 1 + TOWN_GROWTH (the land may run out short of that); returns the new lots'
   *  events and the residents each town reached */
  private growTowns(): { events: TownEvent[]; pops: number[] } {
    const events = this.stamp(0, this.town.popK.map(p => p * (1 + TOWN_GROWTH)));
    return { events, pops: this.town.popK.slice() };
  }
  /** the player takes a card of the eval's draft (see Round.pick); its effects apply at once (applyCards); false if refused */
  pickCard(id: CardId): boolean {
    if (!this.round.pick(id)) return false;
    this.applyCards();
    return true;
  }
  /** the taken cards' effects on the worker's side: express shortens each car park entrance's hold (sim.entryS), and double-decker seats go on
   *  the bus routes (resolveBuses). The other cards (roundabout, booths, buses) are the City's to report only: the engine applies them */
  private applyCards(): void {
    this.sim.entryS = this.round.cards.includes('express') ? ENTRY_S * EXPRESS_ENTRY : ENTRY_S;
    if (this.busDefs.length) this.resolveBuses();
  }

  /** the books replaced: a saved budget, or null for a fresh one (its day 1 starts at the midnight of the current sim day); the career
   *  saved with them, or a fresh one (at the hamlet) if none is given */
  setBudget(s: BudgetSave | null, career?: CareerSave | null): void {
    this.budget = s ? Budget.from(s) : Budget.from(undefined, startMoney(this.centres.length > 0));
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
   *  the trade since the last booking, the residents. With towns (centres) the lots and the trade pay nothing: the event's payouts are the income */
  dayIn(): DayIn {
    const lots: LotIn[] = [], segs: SegIn[] = [], nodes: string[] = [], towns = this.centres.length > 0;
    if (!towns) for (const l of this.lots.lots.values()) {
      const s = this.town.states.get(l.key);
      if (s && s.level >= LV.BUILT) lots.push({ use: s.use, level: s.level, decline: s.decline, cls: l.cls, access: this.sim.access[zoneOf(l.c.x, l.c.y)]! });
    }
    for (const s of this.net.segs) segs.push({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind });
    for (const n of this.net.nodes.values()) nodes.push(n.type);
    const tr = this.sim.trade, t0 = this.tradeAt;
    return { lots, segs, nodes, trade: towns ? { arrived: 0, punctual: 0 } : { arrived: tr.arrived - t0.arrived, punctual: tr.punctual - t0.punctual }, pop: this.town.pop };
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
    this.labelComps();
    if (this.busDefs.length) this.resolveBuses();
    this.sim.onGraph(); this.upkeepC = null;
    // the car parks are built again on the new network (a frontage road split or replaced by the edit leaves the old build on a dead seg;
    // the counts are kept by id), and with them the sinks
    if (this.parkDefs.length) this.setParks(this.parkDefs);
    if (this.surge) { this.surge.relink(this.surgeParks()); this.surge.onGraph(); }
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

  /** the towns built at once (a new valley, or a perfect round's growth, see Town.stamp): each town grows to perTown residents, or to targets[k] when given; returns the 'complete' events (a new array) */
  stamp(perTown: number, targets?: number[]): TownEvent[] { const ev = this.town.stamp(this.ctx, perTown, this.sim.clock, targets); this.syncHour = -1; return ev; }

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
      // with towns (centres) there is no career: its milestones and grants wait (the event's money is the income, see dayIn)
      if (!this.centres.length) {
        const u = this.career.update(this.town.pop);
        for (const m of u.newly) if (m.grant) this.budget.grant(m.grant);
        if (u.newly.length) milestones = u.newly;
        won = u.won;
      }
    }
    for (let k = 0; k < n; k++) this.sim.step();
    this.ticks[(this.calls - 1) % TICKS] = performance.now() - t0;
    // a round under way pays the upkeep as the sim runs; the surge counts down to kick-off (the round goes to eval then)
    const rs = this.round.stage;
    if (rs === 'build' || rs === 'surge') { const u = this.upkeepRate() * n * DT / GAME_DAY; this.budget.upkeepLive(u); this.round.upkeep += u; }
    // the toll booths' takings since the last step: each car served pays the price of the round's level; the books take it, and a round
    // under way counts it (as it counts its upkeep)
    if (this.sim.tolls) { const y = this.sim.tolls * tollPrice(this.round.level); this.budget.toll(y); if (rs === 'build' || rs === 'surge') this.round.toll += y; this.sim.tolls = 0; }
    // the surge: its due cars spawn, then the party cars' exits are counted; kick-off (the round's last step of the surge) gives the result
    if (this.surge && rs === 'surge') this.surge.step(this.sim, this.g);
    this.drainParty();
    this.drainBus();
    if (this.crowd) { this.crowd.step(WALK_V * n * DT / MPT); this.syncWait(); }
    if (rs === 'surge' && this.round.sim(n * DT)) this.kickOff();
    const events = this.town.tick(this.sim.clock, this.ctx);
    const towns = this.centres.length > 0;
    for (const e of events) if (e.kind === 'build') { this.builds++; if (towns) this.sell(e.key); }
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
    if (this.surge) this.surge.relink(this.surgeParks());
  }
  /** the toll gates as the player placed them (defs, the full list, each time): the lane graph's booths (LaneGraph.setTolls); the sim's lanes and
   *  the car parks' sinks follow when a booth changed. The graph keeps the map, so each network batch builds the booths too */
  setTolls(defs: TollDef[]): void {
    this.tollDefs = defs.slice();
    if (!this.g.setTolls(defs, this.net)) return;
    if (this.busDefs.length) this.resolveBuses();
    this.sim.onGraph(); this.upkeepC = null;
    if (this.parks.length) this.resolveSinks();
    if (this.surge) { this.surge.relink(this.surgeParks()); this.surge.onGraph(); }
  }
  /** each car park entrance's sinks (sinksAt), as the sim's sinks; Sim.setSinks keeps the vehicles already bound for them */
  private resolveSinks(): void {
    const sinks: Sink[] = [];
    this.parks.forEach((p, k) => { for (const e of p.entrances) for (const s of this.sinksAt(k, p, e)) sinks.push(s); });
    this.sim.setSinks(sinks);
  }
  /** the sinks of park k at entrance e, one per direction of the frontage road (parallel to the park's side, within 2 tiles of e): the dseg whose
   *  traffic has the park on its right (the lanes sit on perp of the heading, as driveway reads them), and the opposite dseg of its seg. Each sits
   *  on its outermost lane, s at e's projection on that lane, with ux, uy its direction. None if the right-hand dseg is missing or too short */
  private sinksAt(k: number, p: CarPark, e: Pt): Sink[] {
    const near = new Set(this.net.segsNear(e, 2)), side = p.side, vert = side % 2 === 0;
    // the park lies on the side of the road that faces away from the frontage's outward normal
    const pv: Pt = { x: side === 0 ? -1 : side === 2 ? 1 : 0, y: side === 1 ? -1 : side === 3 ? 1 : 0 };
    let R: DSeg | null = null;
    for (const d of this.g.dsegs) {
      if (!d || !d.lanes.length || !near.has(d.seg)) continue;
      const h = norm(sub(d.to, d.from));
      if (Math.abs(vert ? h.y : h.x) < 0.98 || dot(perp(h), pv) <= 0) continue;
      R = d; break;
    }
    if (!R) return [];
    const ds: DSeg[] = [R];
    for (const d of this.g.dsegs) if (d && d !== R && d.seg === R.seg && d.lanes.length) { ds.push(d); break; }
    const out: Sink[] = [];
    for (const d of ds) {
      const ln = this.g.lanes[d.lanes[d.lanes.length - 1]!]!;
      if (ln.len < 2 * SINK_END) { if (d === R) return []; continue; }
      const p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, u = norm({ x: ln.pts[2]! - p0.x, y: ln.pts[3]! - p0.y }), h = norm(sub(d.to, d.from));
      out.push({ park: k, dseg: d.id, s: Math.min(ln.len - SINK_END, Math.max(SINK_END, dot(sub(e, p0), u) * MPT)), next: 0, q: [], qz: [], ux: h.x, uy: h.y });
    }
    return out;
  }
  /** the surge is planned at its start (sim s): each town's homes (its built RES lots with residents, by population), the car parks (surgeParks)
   *  and the crowd, from the surge's own stream (SURGE_SEED, never the sim's or the town's) */
  private planSurge(): Surge {
    const K = this.round.crowd.length, homes: SurgeHome[][] = [];
    for (let k = 0; k < K; k++) homes.push([]);
    for (const b of builtLots(this.town, this.lots)) {
      const k = this.town.townOf(b.lot.key);
      if (b.use === LU.RES && b.pop > 0 && k >= 0 && k < K) homes[k]!.push({ lot: b.lot, town: k, pop: b.pop, comp: this.compOf(b.lot.seg) });
    }
    const s = new Surge();
    s.plan(this.round.crowd, homes, this.surgeParks(), seededRnd(SURGE_SEED), this.sim.t);
    return s;
  }
  /** the car parks for the surge: each with its frontage's component, its bays, and its sinks (indices into sim.sinks), each sink's point and direction */
  private surgeParks(): SurgePark[] {
    const L = this.parks.map(p => ({ comp: this.compOf(p.seg), bays: p.bays.length, sinks: [] as number[], pts: [] as Pt[], dirs: [] as Pt[] }));
    // the component of a car park is its entrances' road as the lane graph has it now (never a stale build)
    this.sim.sinks.forEach((K, j) => {
      const P = L[K.park], d = this.g.dsegs[K.dseg];
      if (!P) return;
      P.sinks.push(j);
      if (d) P.comp = this.compOf(d.seg);
      const q = { x: 0, y: 0, hx: 0, hy: 0 };
      if (d) laneAt(this.g.lanes[d.lanes[d.lanes.length - 1]!]!, K.s, q);
      P.pts.push({ x: q.x, y: q.y }); P.dirs.push({ x: K.ux ?? 0, y: K.uy ?? 0 });
    });
    return L;
  }
  /** the component of a seg (see labelComps; -1 if unknown) */
  private compOf(seg: Seg): number { return this.comp.get(seg) ?? -1; }
  /** the road components: the segs joined by road share a number (a walk over the nodes, after each network batch) */
  private labelComps(): void {
    const comp = new Map<Seg, number>(), seen = new Set<Node>(); let k = 0;
    for (const n0 of this.net.nodes.values()) {
      if (seen.has(n0)) continue;
      seen.add(n0); const q: Node[] = [n0];
      for (let i = 0; i < q.length; i++) for (const s of q[i]!.segs) { comp.set(s, k); const o = s.a === q[i] ? s.b : s.a; if (!seen.has(o)) { seen.add(o); q.push(o); } }
      k++;
    }
    this.comp = comp;
  }
  /** true if lots a and b front the same road component: a trip between them has a road */
  private joinedLots(a: Lot, b: Lot): boolean { const c = this.comp.get(a.seg); return c !== undefined && c === this.comp.get(b.seg); }
  /** kick-off: the result is in (the cars parked, the rate, each town's counts at this moment); the surge spawns no more, and its counts run on through the eval */
  private kickOff(): void {
    const L = this.round.last; if (!L) return;
    const c = this.fanCounts(), by = this.surge ? this.surge.result(c) : [];
    let arrived = 0; for (const f of c.fans) arrived += f;
    L.byTown = by; L.arrived = arrived; L.rate = L.sent > 0 ? arrived / (L.sent * PARTY) : 0;
    // the money: the payout (signed) is paid now, the net is the toll and payout less the upkeep; the bottlenecks as the crowd meets them
    L.perfect = L.rate >= PERFECT_RATE; L.payout = payout(L.rate, L.level); L.net = (L.toll ?? 0) + L.payout - L.upkeep;
    L.stuck = this.report(5).top.map(i => ({ label: i.label, x: i.x, y: i.y, loss: i.loss }));
    this.budget.payout(L.payout);
  }
  /** the party cars' exits since the last step go to the surge (the sim's partyOut, cleared; discarded with no surge) */
  private drainParty(): void {
    const po = this.sim.partyOut;
    for (let k = 0; k < po.length; k += 2) this.surge?.event(po[k]!, po[k + 1]!);
    po.length = 0;
    // the party cars that parked: their fans start walking from their bays
    const pb = this.sim.partyBays;
    for (let k = 0; k < pb.length; k += 3) this.partyWalk(pb[k]!, pb[k + 1]!, pb[k + 2]!);
    pb.length = 0;
  }

  /** the shuttle routes as the player drew them (the full list, each time): their stops are resolved on the lane graph (busStopAt); a route with an
   *  unresolved stop is inactive. The buses on the network are planned to the new stops */
  setBusRoutes(defs: BusRouteDef[]): void {
    this.busDefs = defs.slice();
    this.resolveBuses(); this.sim.refitBuses(); this.syncWait();
  }
  /** resolves every route's two stops on the lane graph (sim.busRoutes: null for an inactive route; busPts: the stops' points) */
  private resolveBuses(): void {
    const pts: ({ lot: Pt; doors: Pt } | null)[] = [], R: (BusRoute | null)[] = [];
    for (const d of this.busDefs) {
      const a = this.busStopAt({ x: d.sx, y: d.sy }), b = this.busStopAt({ x: d.dx, y: d.dy });
      pts.push(a && b ? { lot: a.pt, doors: b.pt } : null);
      R.push(a && b ? { lot: a.stop, doors: b.stop, seats: this.round.cards.includes('doubledecker') ? Math.max(d.seats, DECK_SEATS) : d.seats } : null);
    }
    this.busPts = pts; this.sim.setBusRoutes(R);
  }
  /** the stop nearest point e (tiles): the kerb lane (the rightmost LINK lane) of the ground road whose centre line is nearest e, within BUS_REACH
   *  tiles; the stop is e's projection on that lane, kept BUS_END m clear of its ends. Null if no road is that near */
  private busStopAt(e: Pt): { stop: BusStop; pt: Pt } | null {
    const near = new Set(this.net.segsNear(e, BUS_REACH));
    let best: { dseg: number; s: number; d: number; ln: Lane } | null = null;
    for (const d of this.g.dsegs) {
      if (!d || !d.lanes.length || !near.has(d.seg)) continue;
      const ln = this.g.lanes[d.lanes[d.lanes.length - 1]!];
      if (!ln || ln.kind !== LK.LINK || ln.len < 2 * BUS_END) continue;
      const n = ln.pts.length, p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, p1 = { x: ln.pts[n - 2]!, y: ln.pts[n - 1]! };
      const dist = pointSeg(e, p0, p1);
      if (dist > BUS_REACH || (best && dist >= best.d)) continue;
      const u = norm(sub(p1, p0));
      best = { dseg: d.id, s: Math.min(ln.len - BUS_END, Math.max(BUS_END, dot(sub(e, p0), u) * MPT)), d: dist, ln };
    }
    if (!best) return null;
    laneAt(best.ln, best.s, this.stopPt);
    return { stop: { dseg: best.dseg, s: best.s }, pt: { x: this.stopPt.x, y: this.stopPt.y } };
  }
  /** the surge's crowd and buses start: the crowd (no walkers yet), and each route's buses at its lot stop, BUS_GAP m apart back along the kerb lane */
  private startBuses(): void {
    this.sim.dropBuses();
    const C = new Crowd(this.round.crowd.length, this.busDefs.length);
    this.crowd = C;
    this.busDefs.forEach((d, r) => {
      const R = this.sim.busRoutes[r];
      if (!R) return;
      const dg = this.g.dsegs[R.lot.dseg], lane = dg ? dg.lanes[dg.lanes.length - 1] : undefined;
      if (lane === undefined) return;
      // each bus BUS_GAP m behind the last; where there is no room (the sim keeps its clearance), 1 m further back until there is
      let s = R.lot.s, placed = 0;
      while (placed < d.buses && s >= 0) {
        const slot = this.sim.spawnBus(r, lane, s);
        if (slot >= 0) { C.newBus(slot); placed++; s -= BUS_GAP; } else s -= 1;
      }
    });
    this.syncWait();
  }
  /** the sim's waiting fans per route (busWait) are the crowd's queues (after the crowd changes) */
  private syncWait(): void {
    if (!this.crowd) return;
    for (let r = 0; r < this.sim.busWait.length; r++) this.sim.busWait[r] = this.crowd.waiting(r);
  }
  /** the buses' boardings, alightings and losses since the last step (sim.busEv, cleared): a boarding takes its fan off the stop's queue, an alighting
   *  walks the fan from the doors stop to the nearest door, and a lost bus's fans go back to the front of their lot stop's queue */
  private drainBus(): void {
    const ev = this.sim.busEv, C = this.crowd;
    if (C) for (let k = 0; k < ev.length; k += 4) {
      const slot = ev[k]!, r = ev[k + 1]!, kind = ev[k + 2]!, n = ev[k + 3]!;
      if (kind === 0) C.board(r, slot, n);
      else if (kind === 1) { for (let j = 0; j < n; j++) { const t = C.unloadOne(slot); if (t >= 0) this.walkDoor(t, this.busPts[r]?.doors ?? null, 1, -1); } }
      else C.requeue(r, slot);
    }
    ev.length = 0;
  }
  /** a party car of park k parked at its bay (an index into busPts' park list): its PARTY fans walk from the bay to the lot stop of the route of this
   *  car park with the shortest queue, or else to the nearest door */
  private partyWalk(town: number, k: number, bay: number): void {
    const C = this.crowd, P = this.parks[k], b = P?.bays[bay];
    if (!C || !P || !b) return;
    let r = -1, best = Infinity;
    this.busDefs.forEach((d, q) => { if (d.park === P.id && this.busPts[q] && C.waiting(q) < best) { best = C.waiting(q); r = q; } });
    if (r >= 0) { const t = this.busPts[r]!.lot; C.add({ x: b.x, y: b.y, tx: t.x, ty: t.y, n: PARTY, town, stage: 0, route: r }); return; }
    this.walkDoor(town, b, PARTY, -1);
  }
  /** n fans of town at p walk to the stadium's nearest door (route: the route they came from, -1 none); with no door, they are there already */
  private walkDoor(town: number, p: Pt | null, n: number, route: number): void {
    const C = this.crowd;
    if (!C) return;
    const d = p && this.site ? nearestDoor(this.site.doors, p) : null;
    if (!p || !d) { C.arrive(town, n); return; }
    C.add({ x: p.x, y: p.y, tx: d.x, ty: d.y, n, town, stage: 1, route });
  }
  /** the fans per town now (zeros with no crowd): see FanCounts */
  private fanCounts(): FanCounts {
    if (this.crowd) return this.crowd.counts();
    const z = new Array<number>(this.round.crowd.length).fill(0);
    return { fans: z, atStop: z.slice(), onBus: z.slice() };
  }
  /** the walkers as the frame sends them: 4 floats per group (x, y in tiles, n fans, stage) */
  walkBuf(): Float32Array {
    const W = this.crowd?.walkers ?? [], out = new Float32Array(4 * W.length);
    W.forEach((g, i) => { out[4 * i] = g.x; out[4 * i + 1] = g.y; out[4 * i + 2] = g.n; out[4 * i + 3] = g.stage; });
    return out;
  }
  /** the lot stops as the frame sends them: 4 floats per active route with a lot stop (x, y in tiles, the fans waiting, the route index) */
  stopBuf(): Float32Array {
    const rs: number[] = [];
    this.busPts.forEach((p, r) => { if (p) rs.push(r); });
    const out = new Float32Array(4 * rs.length);
    rs.forEach((r, i) => { const p = this.busPts[r]!.lot; out[4 * i] = p.x; out[4 * i + 1] = p.y; out[4 * i + 2] = this.crowd?.waiting(r) ?? 0; out[4 * i + 3] = r; });
    return out;
  }
  /** the round from a save (see Round.from): any surge under way is dropped with its party cars */
  loadRound(s?: RoundSave): void { this.round = Round.from(s); this.grown = null; this.surge = null; this.sim.dropParty(); this.crowd = null; this.sim.dropBuses(); this.applyCards(); }
  /** the round as the UI and the frame see it: with the surge's counts by town while the surge runs or its result is in (null otherwise) */
  roundView(): RoundView {
    const v = this.round.view();
    if (this.surge && (v.stage === 'surge' || v.stage === 'eval')) v.surge = this.surge.view(this.fanCounts());
    return v;
  }
  /** the car parks' counts for the frame: id, bays, cars parked, cars turned away */
  parkView(): ParkView[] {
    return this.parks.map((p, k) => { const s = this.sim.parks[k]!; return { id: p.id, bays: s.bays, parked: s.parked, turned: s.turned }; });
  }
  /** every car park is empty again (the round's close): the cars parked and turned away are counted from zero */
  emptyParks(): void { for (const s of this.sim.parks) { s.parked = 0; s.turned = 0; } this.sim.clearQueues(); }
  /** dev test hook (the browser check): sends up to n cars from random origins (the trips' origins; at least PARK_TEST_M tiles from the
   *  entrance for the first draws) to the entrances of car park id, round-robin, bound for their sinks; returns the cars sent */
  parkTest(id: number, n: number): number {
    const k = this.parks.findIndex(q => q.id === id);
    if (k < 0) return 0;
    const P = this.surgeParks()[k]!;
    if (!P.sinks.length) return 0;
    const q = { x: 0, y: 0, hx: 0, hy: 0 }, sp = { x: 0, y: 0, hx: 0, hy: 0 };
    // only roads joined to the car park's frontage: the towns start apart, and a car with no way there is lost at once
    const joined = reachableSegs(this.net, this.parks[k]!.entrances[0]!);
    let sent = 0;
    for (let c = 0; c < n; c++) {
      let done = false;
      for (let a = 0; a < 200 && !done; a++) {
        const lane = this.sim.trips.origin();
        if (lane < 0) return sent;
        const s = this.sim.trips.oS;
        laneAt(this.g.lanes[lane]!, s, q);
        // the sink that points from the car's origin toward its entrance (matchSink; round-robin over the cars sent)
        const j = P.sinks[matchSink(P, q, sent)]!, K = this.sim.sinks[j]!, dd = this.g.dsegs[K.dseg]!;
        laneAt(this.g.lanes[dd.lanes[dd.lanes.length - 1]!]!, K.s, sp);
        if (!joined.has(this.g.dsegs[this.g.lanes[lane]!.dseg]!.seg) || (a < 100 && Math.hypot(sp.x - q.x, sp.y - q.y) < PARK_TEST_M)) continue;
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

  /** a scratch lane point (the stops' points, see busStopAt) */
  private stopPt = { x: 0, y: 0, hx: 0, hy: 0 };
  /** the centre of town k: the mean of its BUILT lots (the town's centre while it has none) */
  private townCentre(k: number): Pt {
    let sx = 0, sy = 0, m = 0;
    for (const s of this.town.states.values()) if (s.level >= LV.BUILT && this.town.townOf(s.key) === k) { const l = this.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
    return m ? { x: sx / m, y: sy / m } : this.centres[k]!;
  }

  /** a lot on a paved road the town builds on is sold: the player is paid its price (saleOf: nothing on gravel) */
  private sell(key: string): void { const l = this.lots.lots.get(key), n = l ? saleOf(l.cls) : 0; if (n) this.budget.sale(n); }

  /** the town lays a gravel extension when it is short of land: at most once per game hour, and not while the last one is out
   *  (no net ops back yet: the next net batch clears it, and so does an hour, in case the engine skipped it). With towns, at most one
   *  every GRAVEL_EVERY_H game hours (growAt: the last one laid) */
  private planGrow(): Leg[] | null {
    const cls = this.cls;
    if (!cls) return null;
    const h = Math.floor(this.sim.clock * this.growSpeed / GAME_HOUR);
    if (h === this.planHour) return null;
    this.planHour = h;
    if (this.pendingGrow && this.sim.clock - this.growAt < GAME_HOUR / this.growSpeed) return null;
    const K = this.centres.length, k = K ? this.planHour % K : 0;
    if (K && this.sim.clock - this.growAt < GRAVEL_EVERY_H * GAME_HOUR / this.growSpeed) return null;
    const c: RoadPlanCtx = K
      ? { net: this.net, lots: this.lots, town: this.town, cls, entry: this.centres[k]!, rnd: this.planRnd, centre: this.townCentre(k), built: this.town.builtK[k], blocked: this.blocked, towns: true }
      : { net: this.net, lots: this.lots, town: this.town, cls, entry: this.ctx.entry, rnd: this.planRnd };
    if (!needsLand(c)) { this.growStats.enough++; return null; }
    const legs = planExtension(c);
    if (!legs) { this.growStats.none++; return null; }
    this.growStats.legs++;
    this.pendingGrow = true; this.growAt = this.sim.clock;
    return legs;
  }
}
