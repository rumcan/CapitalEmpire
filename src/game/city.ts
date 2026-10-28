// The city (Phase 3 step 7): the road network replica, the lane graph, the traffic Sim, the parcels, the reachable segs, the water
// field, the Town and the growth planner. Pure TS, no worker globals: the city worker (sim/sim.worker.ts) is a thin shell that
// posts what City returns, and the town gate (scripts/sim/town-gate.ts) drives it headless.
import type { NetOp } from './ground-protocol';
import { RoadNetwork, SK, dot, keyOf, norm, perp, sub, type Leg, type Node, type Pt, type Seg } from './network';
import { applyOps } from './netops';
import { MAP } from './iso';
import { TC, sampleField } from './terrain/types';
import { LotMap, type Lot } from './lots/lots';
import { GROWTH_OPTIONS, LU, LV, Town, builtLots, type LotTuple, type TownCtx, type TownEvent } from './lots/town';
import { needsLand, planExtension, reachableFrom, reachableSegs, seededRnd, type RoadPlanCtx } from './lots/roads';
import { GROWN_IND_FROM, grownIndustrialRect } from './lots/districts';
import { LK, LaneGraph, MPT, laneAt, type DSeg, type Lane } from './sim/lanes';
import { DT, Sim, type CarInfo, type ParkState, type Sink } from './sim/sim';
import { bottlenecks, type Report } from './sim/bottlenecks';
import { Incidents, type Exposure, type Incident, type Passage } from './ext/incidents';
import { Disasters, type Disaster, type DisasterKind, type RoadInfo } from './ext/disasters';
import { zoneOf } from './sim/routing';
import { Budget, CONNECT_FEE, GAME_DAY, LOAN, LOAN_RATE, SIGNAL_UPKEEP, compensation, saleOf, segUpkeep, startMoney, type BudgetSave, type DayIn, type Ledger, type LotIn, type SegIn } from './budget';
import { Career, type CareerSave, type Milestone } from './career';
import type { HourStat } from './beforeafter';
import { retime, jumpTo, townTimeOf } from './sim/townclock';
import { EXIT_END, FIRST_TEE, GATES_OPEN, PLAY_END } from './golf/calendar';
import { LATE_AFTER_MIN, minuteAt, simAt, travelEstimate, wantedLeaves } from './golf/daytimeline';
import { DECK_SEATS, ENTRY_S, EVENT_CLOCK, EXPRESS_ENTRY, GRAVEL_EVERY_H, GROWN_SUCCESS0, GROWN_SUCCESS_K, GROWN_SUCCESS_MAX, GROWN_SUCCESS_MIN, PARTY, PERFECT_RATE, SURGE_SEED, TOWN_GROWTH, WALK_V, payout, promoMul, ticketPrice, tollPrice, type CardId } from './event/config';
import type { BusRoute, BusRouteDef, BusStop } from './event/bus';
import { Crowd, type FanCounts } from './event/crowd';
import type { TollDef } from './event/toll';
import { Round, type RoundSave, type RoundView } from './event/round';
import { crowdFor, placeStadium, siteAt, type Site } from './event/site';
import { freshStats, type BizDef, type BizStats, type BizView } from './business/state';
import { Visits, ON_TIME_RATIO, type Door, type VisitBiz, type VisitHome } from './business/visits';
import { BUSINESS, ESTATE_LOTS, ESTATE_SAT, GOOD_SAT, knownBusinesses, levelFromXp, satisfactionAfter } from './business/catalogue';
import { driveway } from './sim/trips';
import { buildPark, parkBox, type CarPark, type CarParkDef, type ParkView } from './event/carpark';
import { lotPark, rowLots, rowQuad, type BayRowDef } from './event/rows';
import { resolveCurb, type Curb, type CurbDef } from './event/curb';
import { Surge, matchSink, type SurgeHome, type SurgePark, type SurgeStop, type SurgeTimeline } from './event/surge';
import { normalizeDaySave, type DaySave, type Leave } from './event/daysave';
import { Taxis, type Order, type Rank, type TaxiEcon } from './ext/taxi';
import { golfTicketPrice } from './golf/yearend';
import { ON_TIME_GRACE_MIN } from './golf/tournamentday';
import { gateRate } from './golf/venue';
import { hasExpressGates } from './golf/golfcards';
import { pickSpot, type GallerySpot } from './golf/galleries';
import { RELOCATE_EVERY, relocate, spotDraw } from './golf/gallerydraw';
import { dayShare, spectatorDemand, tierInfo, tournamentDue } from './golf/tour';
import { earnedFor, earnedTarget, roundTownGrowthRate, townGrowthTargets } from './golf/towngrowth';
import { applyParkingFeeDemand } from './golf/parkingfee';

/** the vehicle slots of the sim, and the ring of step times (calls) kept for the frame stats */
const CAP = 12000, TICKS = 100;
/** the game hour (sim s): the town's access is copied and the built lots given to the sim at its start; the planner runs once per hour */
const GAME_HOUR = 60;
/** going home (golf, LEAD.md M2.3): the leaving starts this long after kick-off and releases the parked cars' parties over LEAVE_S (sim s); the
 *  tournament day (T050) releases them at the timeline's leave times instead (see kickOff), and these two stay for the other rounds */
const LEAVE_AFTER = 120, LEAVE_S = 300;
/** the tournament day (T048), minutes of the day: the town clock starts at 05:00 and the day ends at 22:00 at the latest (or at EXIT_END once the leaving is done) */
const TOURNEY_START = 5 * 60, TOURNEY_END = 22 * 60;
/** the 95th percentile of some values (0 with none) */
export const p95 = (v: readonly number[]): number => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!; };
/** the game hours' snapshots kept (four game days of them: see beforeafter.ts) */
const HOURS_KEPT = 96;
/** the milestones of a step that reached none (shared: read, never written) */
const NO_MILESTONES: Milestone[] = [];
/** the water distance field: 4-tile cells, distances capped at WATER_CAP tiles */
const WATER_N = MAP >> 2, WATER_CAP = 200;
/** a sink's s is kept this far from its lane's ends, m (as driveway's DRIVE_END), and the dev car park test sends cars at least this far, tiles, where it can */
const SINK_END = 3, PARK_TEST_M = 300;
/** the shuttle riders a round needs for the bus company's good day */
const BUS_GOOD_RIDERS = 100;
/** a shuttle route's buses are spawned this many m apart back along the kerb lane from the lot stop; its stops must be within BUS_REACH tiles of the
 *  player's points, and kept BUS_END m clear of the lane's ends */
const BUS_GAP = 15, BUS_REACH = 4, BUS_END = 3;
/** the visit businesses' own random stream (business/visits.ts), never the sim's */
const VISIT_SEED = 104729;
/** the taxi company's random stream (its requests), never the sim's */
const TAXI_SEED = 7121;
/** the taxis in the company's fleet */
const TAXI_FLEET = 6;
/** the taxi requests a game day per 1000 residents */
const TAXI_RATE = 20;
/** the taxis' clock and money in game time (a game hour is 60 sim s, a game minute 1 s; ext/taxi's defaults are real time): $1 an hour a driver,
 *  $2 flag fall, $1.50 a km and $0.10 a game minute of wait and ride (a 2 km ride takes about 90 game minutes, so about $14), fuel as 1985 */
const TAXI_ECON: TaxiEcon = { hourS: 60, minuteS: 1, driverPerHr: 1, flag: 2, perKm: 1.5, perMin: 0.1, fuelPerKm: 0.06 };
/** the sim seconds a party waits for a taxi before it gives up (ext/taxi maxWait) */
const TAXI_WAIT = 180;
/** the dispatcher's straight-line speed guess, m/s (its travel times; the cars drive their own routes) */
const TAXI_V = 10;
/** the reach, tiles, of a rank's or a request's kerb: the road within this far of the door or the point */
const TAXI_REACH = 8;
/** the rides in a game day that make a taxi company's good day */
const TAXI_GOOD = 10;
/** T147: the money events kept for the next frame at most (4 floats each: see City.takeCash); more are not shown (the books still take them) */
const CASH_MAX = 256;
/** the tourists a level of each tourism-family business, the casino and the stadium draws (the tourist catchment's residents, see planVisits) */
const TOURIST_PER_LEVEL = 300;
/** the reach, tiles, of the highway entry's kerb (and each map exit's, T092): the road within this far of the entry brings the tourists in */
const ENTRY_REACH = 12;
/** T090 (plan P22 2.3.3): the success a tournament's town growth rate gives a range start's grown town */
export const grownSuccess = (rate: number): number => Math.min(GROWN_SUCCESS_MAX, Math.max(GROWN_SUCCESS_MIN, GROWN_SUCCESS0 + GROWN_SUCCESS_K * rate));
/** T090: a range start's grown town plans a leg every this many game hours (plan P22 2.3.3 says every hour; see #159) */
const GROWN_PLAN_H = 0.5;
/** T091: a range start's town roads keep this much room from the golf land (tiles): a leg whose midpoint is nearer scores this much more (plan P22 2.3.5) */
const GOLF_ROOM = 40;

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
/** the lane of dseg d a car park with unit pv (from its frontage road into the park, see CarPark) takes its sinks on: the outermost lane on the park's
 *  side; a one-way seg's only lanes are its forward dseg's, so a park on its left takes the leftmost lane (lanes[0]) */
const sinkLane = (d: DSeg, pv: Pt): number => d.lanes[d.seg.cls.oneway && dot(perp(norm(sub(d.to, d.from))), pv) < 0 ? 0 : d.lanes.length - 1]!;
/** the axis box (x, y, w, h) of a bay row's paved quad (rowQuad: its 4 corners as x, y pairs) */
function rowBox(r: BayRowDef): { x: number; y: number; w: number; h: number } {
  const q = rowQuad(r);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, q[i]!); x1 = Math.max(x1, q[i]!); y0 = Math.min(y0, q[i + 1]!); y1 = Math.max(y1, q[i + 1]!); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** One city: feed it the network ops (netOps), the terrain (terrain) and the sim steps (step). The worker and the gate share it. */
/** a natural disaster as the main thread draws it: its area (tiles, flat x, y pairs), its times (sim s; end Infinity for a quake until repaired) and its
 *  closures (x, y: the seg's midpoint in tiles; cost: the repair, $; repair: a quake closure the player can pay for) */
export interface DisasterView { id: number; kind: DisasterKind; warnAt: number; start: number; end: number; area: number[]; closures: { key: string; x: number; y: number; cost: number; repair: boolean }[] }
/** a disaster's transition or repair, for the toasts: warned (secs: seconds to its start), started or ended (n: its closures), repaired or unpaid (cost, $) */
export interface DisasterNote { k: 'warned' | 'started' | 'ended' | 'repaired' | 'unpaid'; kind: DisasterKind; id: number; secs: number; n: number; cost: number }

/** a lot's box in tiles [x0, y0, x1, y1] (its corners: o, o + u * w, o + n * d and the fourth) */
function lotBox(l: Lot): [number, number, number, number] {
  const ax = l.o.x + l.u.x * l.w, ay = l.o.y + l.u.y * l.w, bx = l.o.x + l.n.x * l.d, by = l.o.y + l.n.y * l.d, cx = ax + l.n.x * l.d, cy = ay + l.n.y * l.d;
  return [Math.min(l.o.x, ax, bx, cx), Math.min(l.o.y, ay, by, cy), Math.max(l.o.x, ax, bx, cx), Math.max(l.o.y, ay, by, cy)];
}

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
  /** golf mode (null: off): the tournament's tier and its reputation; the season (one game day) ends with the tournament (see startTournament) */
  golf: { tier: number; rep: number; start?: 'range'; exits?: Pt[]; invited?: { at: number } } | null = null;
  /** the player's businesses (setBusinesses: the full list, with each one's stats; the stadium's level is its own, from its fan cars (XP), not the round's) */
  businesses: BizView[] = [];
  /** each placed business's stats by id (kept across setBusinesses while it stands; restoreBiz fills them from a save) */
  private bizStats = new Map<number, BizStats>();
  /** the visit businesses' cars (business/visits.ts) and their random stream; the game day planned last (-1: none) */
  visits = new Visits(); private visitRnd = seededRnd(VISIT_SEED); private visitDay = -1;
  /** the taxi company's dispatcher (ext/taxi; null: no taxi company with a kerb at its door) and its cars: each taxi's position (tiles), the order it is
   *  driving (or waiting to spawn), its car's slot (-1 none), the taxis that reached their targets since the last dispatch step, the day's requests not
   *  yet posted (by time), the key of its ranks, the day planned (-1 none), the request ids, the random stream, the dispatcher's totals booked so far and
   *  the rides booked so far */
  taxis: Taxis | null = null;
  private taxiAt: Pt[] = []; private taxiOrd: (Order | null)[] = []; private taxiCar: number[] = []; private taxiReached: number[] = [];
  private taxiDue: { t: number; from: Pt; to: Pt; people: number }[] = [];
  private taxiKey = ''; private taxiDay = -1; private taxiReq = 1; private taxiRnd = seededRnd(TAXI_SEED);
  private taxiMoney = { rev: 0, cost: 0 }; private taxiServed = 0;
  /** scratch points for the doors and the trip lookups */
  private doorQ = { x: 0, y: 0, hx: 0, hy: 0 };
  /** a new valley gets the game's stadium spot (suggested) as its site; the browser's worker sets this false, so the player places the stadium (setStadium) */
  autoStadium = true;
  /** the game's spot for the stadium on this valley (placeStadium; null without towns): the default site when autoStadium is on */
  suggested: Site | null = null;
  /** the towns grown by the last close (closeRound: a perfect run only; null otherwise): the new lots' events, and the residents of each town reached */
  grown: { events: TownEvent[]; pops: number[] } | null = null;
  /** T090: a range start's town success factor set by the last tournament's close (null: none since the worker last read it: takeTownBoost) */
  private townBoost: number | null = null;
  /** T090: the success factor the last tournament set (once: the worker posts it for the engine's save), null when none is new */
  takeTownBoost(): number | null { const b = this.townBoost; this.townBoost = null; return b; }
  /** the surge of the round (event/surge.ts: planned at the surge's start, counted through the eval; null outside) and the road components of the
   *  network (comp: the segs joined by road share a number; labelled after each network batch, see labelComps) */
  surge: Surge | null = null; private comp = new Map<Seg, number>();
  /** the car parks as the player placed them (parkDefs, the full list), and the ones built on the network (parks: buildPark; a park with no
   *  frontage or under 10 bays is left out; parks[k] is sim.parks[k] and the sinks' park index) */
  parkDefs: CarParkDef[] = []; parks: CarPark[] = [];
  /** the bay rows and on-street runs as the player placed them (full lists), the curbs resolved on the network, and the parking fee per car ($) */
  rowDefs: BayRowDef[] = []; curbDefs: CurbDef[] = []; curbs: Curb[] = []; parkFee = 5;
  /** the shuttle routes as the player drew them (busDefs, the full list: a route's index is its sim index), their resolved stops' points (tiles; null:
   *  unresolved, the route is inactive), and the crowd of the surge (event/crowd.ts: the walkers, the queues, the fans on the buses; null outside the
   *  surge, its eval included) */
  /** the course's gates (golf, LEAD.md M2.1): each gate's point (tiles) and lanes; the fans walk to the nearest and queue there; empty: the
   *  site's doors as before. gateAcc: each gate's admitting carried over between steps (fans) */
  gates: { x: number; y: number; lanes: number }[] = []; private gateAcc: number[] = [];
  setGates(list: { x: number; y: number; lanes: number }[]): void { this.gates = list.map(g => ({ x: g.x, y: g.y, lanes: Math.max(1, g.lanes) })); this.gateAcc = this.gates.map(() => 0); this.crowd?.setGates(this.gates.length); }
  /** T147, the money floats: the money that moved at a place since the worker last took it, 4 floats each: x, y (tiles), $ (+ in, - out) and 1 for
   *  a sale lost (its $ the sale's; the treasury is not charged), else 0. The worker posts it with the frame; capped at CASH_MAX */
  private cash: number[] = [];
  private cashAt(x: number, y: number, n: number, lost = 0): void { if (n && this.cash.length < 4 * CASH_MAX && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(n)) this.cash.push(x, y, n, lost); }
  /** the money moved at a place since the last call (see cash), cleared; null when none */
  takeCash(): Float32Array | null { if (!this.cash.length) return null; const b = Float32Array.from(this.cash); this.cash.length = 0; return b; }
  /** each car park's cars turned away already shown (T147: the parking fee lost), by its sim state */
  private turnSeen = new WeakMap<ParkState, number>();
  /** a business's centre (tiles) */
  private static mid(b: { x: number; y: number; w: number; h: number }): Pt { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  /** the galleries (golf, LEAD.md M2.2): the spots the admitted fans stand at (golf/galleries.ts), and the draws that pick them */
  spots: GallerySpot[] = []; private spotRnd = seededRnd(0x6a11);
  /** the course's hole count (the largest hole of a spot; see spotDraw) and the spots' draws at the minute (reused) */
  private spotHoles = 0; private drawBuf: number[] = [];
  /** the golf play's featured holes (docs/GOLF-PLAY.md decision 6; the engine sends them, see setFeatured): the spots on these holes draw more. Empty:
   *  the day's featuredHole stands in */
  featured = new Set<number>();
  /** the last 30-minute mark the fans moved at (the tournament day; -Infinity until the surge's crowd starts: see startBuses) */
  private relocatedAt = -Infinity;
  setSpots(list: GallerySpot[]): void { this.spots = list; this.spotHoles = Math.max(0, ...list.map(s => s.hole)); this.crowd?.setSpots(list.length); }
  /** the golf play's featured holes (the full set, each time): the spots on them draw more from now (see spotDraw); [] for none */
  setFeatured(holes: number[]): void { this.featured = new Set(holes); }
  /** the spots' draws at the tournament minute (spotDraw: the featured holes, else the day's featured group; the last green in the afternoon), into
   *  drawBuf */
  private spotDraws(): number[] {
    const m = townTimeOf(this.sim.town, this.sim.t).dayMin, F = this.featured.size ? this.featured : undefined, out = this.drawBuf;
    out.length = this.spots.length;
    for (let i = 0; i < this.spots.length; i++) out[i] = spotDraw(this.spots[i]!, m, this.spotHoles, F);
    return out;
  }
  /** fans in at (x, y) walk on to a gallery spot (by the draw at the minute and the room left); with no spots they stay where they are (inside) */
  private toGallery(town: number, n: number, x: number, y: number): void {
    const C = this.crowd; if (!C || !this.golf || !this.spots.length) return;
    const i = pickSpot(this.spots, C.gallery, this.spotRnd(), this.spotDraws()), s = this.spots[i]!;
    C.add({ x, y, tx: s.x + (this.spotRnd() - 0.5) * 3, ty: s.y + (this.spotRnd() - 0.5) * 3, n, town, stage: 3, route: i });
  }
  /** the fans move between the spots at every RELOCATE_EVERY game minute of the tournament day from FIRST_TEE to PLAY_END (each 30-minute mark once;
   *  gallerydraw relocate): a move takes its fans off the `from` spot and sends them on as a stage 3 group to the `to` spot, where they count when
   *  they arrive (so the fans are moved, not lost or made). Golf mode with spots and a crowd only */
  private relocateFans(): void {
    const C = this.crowd; if (!C || !this.golf || !this.tourneyDay || this.spots.length < 2) return;
    const m = Math.floor(townTimeOf(this.sim.town, this.sim.t).dayMin / RELOCATE_EVERY) * RELOCATE_EVERY;
    if (m < FIRST_TEE || m >= PLAY_END || m <= this.relocatedAt) return;
    this.relocatedAt = m;
    const F = this.featured.size ? this.featured : undefined;
    for (const mv of relocate(this.spots, C.gallery, m, this.spotHoles, F)) {
      const from = this.spots[mv.from]!, to = this.spots[mv.to]!, n = Math.min(mv.n, C.gallery[mv.from] ?? 0);
      if (n <= 0) continue;
      C.gallery[mv.from]! -= n;
      // the walk starts and ends within 1.5 tiles of the spots' points, as toGallery's (town 0: a spot does not keep its fans' towns)
      C.add({ x: from.x + (this.spotRnd() - 0.5) * 3, y: from.y + (this.spotRnd() - 0.5) * 3, tx: to.x + (this.spotRnd() - 0.5) * 3, ty: to.y + (this.spotRnd() - 0.5) * 3, n, town: 0, stage: 3, route: mv.to });
    }
  }
  /** going home (golf, LEAD.md M2.3): every party car that parked (its town, car park and bay), the surge's homes by town (where the cars
   *  drive back to), and the leaving: when it starts, the release order, the next to release, the cars waiting to leave their car park, the
   *  counts and the last car's time */
  private parkedCars: { town: number; park: number; bay: number }[] = []; private surgeHomes: SurgeHome[][] = []; private leaveRnd = seededRnd(0x1ea7e);
  /** times: the tournament day's release times (T050; sim s, sorted, the k-th for order[k]); null: the even spread from at */
  leave: Leave | null = null;
  /** the tournament day is running (T048): the town clock runs at 1 minute per sim s from 05:00 */
  tourneyDay = false;
  /** the tournament day's start: sim s at 05:00 (T050; -1 while no tournament day runs) */
  private dayT0 = -1;
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
  /** the no-go zones of the town's roads (with towns, see RoadPlanCtx.blocked): the stadium site padded by 6 tiles, the other businesses padded by 2,
   *  a car park padded by 4, within 12 tiles of a toll plaza seg, within 6 tiles of a bus stop point; in every golf game the golf land padded by 6
   *  too (plan P22 2.3.5, T091: the town's roads crossed the course before) */
  private blocked = (x: number, y: number): boolean => {
    const s = this.site;
    if (s && x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.h + 6) return true;
    if (this.golf) for (const [gx, gy, gw, gh] of this.golfLand) if (x > gx - 6 && x < gx + gw + 6 && y > gy - 6 && y < gy + gh + 6) return true;
    for (const [px, py, pw, ph] of this.placeLand) if (x > px - 2 && x < px + pw + 2 && y > py - 2 && y < py + ph + 2) return true;
    for (const b of this.businesses) if (b.type !== 'stadium' && x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return true;
    for (const p of this.parkDefs) { const b = parkBox(p); if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4) return true; }
    for (const r of this.rowDefs) { const b = rowBox(r); if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return true; }
    for (const d of this.tollDefs) if (segPointDist(x, y, d.ax, d.ay, d.bx, d.by) < 12) return true;
    for (const b of this.busPts) if (b && (Math.hypot(b.lot.x - x, b.lot.y - y) < 6 || Math.hypot(b.doors.x - x, b.doors.y - y) < 6)) return true;
    return false;
  };
  private ticks = new Float64Array(TICKS);
  /** the traffic incidents (ext/incidents): the module, and the switch (false turns them off: the blocks they made are lifted); the incidents whose
   *  blocks the sim carries now (by id, with the lanes they block); the sim second the last tick ran at */
  private inc: Incidents; private incSeed: number; incidents = true;
  private incApplied = new Map<number, { a: Incident; lanes: number[] }>(); private incT = 0;
  /** per lane, the link traffic of the current sim second, summed over the steps (sample): vehicle-metres, vehicle-seconds, and the seconds of the
   *  vehicles slower than 1.5 m/s; and the junction entries (Sim.enterL) at the last tick */
  private expM = new Float64Array(0); private expVS = new Float64Array(0); private expSlow = new Float64Array(0); private enterPrev = new Float64Array(0);
  /** per junction node: its entries over the last minute, decayed (S, at sim time t), see passages */
  private nodeLoad = new Map<Node, { S: number; t: number }>();
  private incPt = { x: 0, y: 0, hx: 0, hy: 0 };
  /** the natural disasters (ext/disasters): the module (made only while the switch is on and there is terrain), the switch (off by default), the seed,
   *  the sim second of its last tick, the notes and the change flag for the main thread; the live disasters with the seg keys they closed (dl); the
   *  closure refcount per seg key (a seg two disasters close stays closed until both lift); the lanes given a closure block (closedLanes); the midpoints
   *  of the closed segs (disMid); the heights (metres, at tile x, y: flat without a height field) */
  private dis: Disasters | null = null; disasters = false; private disSeed = 0; private disT = 0; private disChanged = false; private disNotes: DisasterNote[] = [];
  private dl = new Map<number, { d: Disaster; keys: string[] }>(); private closed = new Map<string, number>(); private closedLanes: number[] = [];
  private disMid = new Map<string, Pt>(); private heightOf: (x: number, y: number) => number = () => 0;
  /** per seg: its RoadInfo for the disasters, kept until its ends move (the water distance and the slope are the terrain's; see segInfo) */
  private segs = new WeakMap<Seg, { ax: number; ay: number; bx: number; by: number; kind: number; info: RoadInfo }>(); private roadBuf: RoadInfo[] = [];

  /** a city with no terrain yet: the town of seed (its planner starts with the same seed) */
  constructor(seed: number) {
    this.net.paintData = false; this.net.occRaster = null;
    this.sim = new Sim(this.g, CAP, 1);
    this.ctx = { lots: this.lots, entry: { x: 0, y: 0 }, reachable: (l: Lot) => this.reach.has(l.seg) && !this.reserved(l), water: (x, y) => this.waterAt(x, y) };
    this.town = new Town(seed);
    this.planRnd = seededRnd(seed);
    this.inc = new Incidents(seed); this.incSeed = seed;
    // the everyday trips to a lot are only to lots on roads joined to the origin (a town apart from the others has no road to it)
    this.sim.lotTrips.joined = (a, b) => this.joinedLots(a, b);
  }

  /** a lot on land the event uses: its box overlaps the stadium site or a car park (padded by a tile), or another business (padded by 2 tiles), or
   *  the golf land (the course and the player's parcels), so the town never builds there */
  private reserved(l: Lot): boolean {
    if (!this.site && !this.parkDefs.length && !this.rowDefs.length && !this.businesses.length && !this.golfLand.length && !this.placeLand.length) return false;
    const [x0, y0, x1, y1] = lotBox(l);
    const hit = (r: { x: number; y: number; w: number; h: number }) => x1 > r.x - 1 && x0 < r.x + r.w + 1 && y1 > r.y - 1 && y0 < r.y + r.h + 1;
    return (!!this.site && hit(this.site)) || this.parkDefs.some(p => hit(parkBox(p))) || this.rowDefs.some(r => hit(rowBox(r))) || this.businesses.some(b => b.type !== 'stadium' && hit({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 })) || this.onGolfLand(l) || this.onLand(l, this.placeLand);
  }
  /** T219 (P27): the iconic places' land (the engine's, lots/iconic.ts: tiles, [x, y, w, h]): no lot builds there and the town's roads keep off */
  private placeLand: [number, number, number, number][] = [];
  /** the iconic places' land, the full list each time: a town lot on it (a building site or a house, which the engine's free check leaves out
   *  but a lot may have started since) goes as the course's lots go; its 'clear' events are returned */
  setPlaces(rects: [number, number, number, number][]): TownEvent[] {
    this.placeLand = rects.map(r => [r[0], r[1], r[2], r[3]]);
    const out: TownEvent[] = [];
    for (const key of [...this.town.states.keys()]) { const l = this.lots.lots.get(key); if (l && this.onLand(l, this.placeLand)) { const e = this.town.clear(key); if (e) out.push(e); } }
    if (out.length) this.syncHour = -1;
    return out;
  }
  /** the golf land: the course first, then the parcels the player owns (tiles, [x, y, w, h]; empty in a classic game); the game hour the
   *  course was last cleared of town lots */
  private golfLand: [number, number, number, number][] = []; private courseHour = -1;
  /** a lot whose box overlaps one of the rectangles by more than half a tile (a lot across the road from it is not on it) */
  private onLand(l: Lot, rs: [number, number, number, number][]): boolean {
    const [x0, y0, x1, y1] = lotBox(l);
    return rs.some(([x, y, w, h]) => Math.min(x1, x + w) - Math.max(x0, x) > 0.5 && Math.min(y1, y + h) - Math.max(y0, y) > 0.5);
  }
  /** no new lot starts anywhere on the golf land */
  private onGolfLand(l: Lot): boolean { return this.onLand(l, this.golfLand); }
  /** the town's lots inside the course (a building site or a house) go, as a bought-out lot does (no compensation); their 'clear' events go
   *  into out. Houses on the player's other land stay (the bulldozer buys them out) */
  private clearCourse(out: TownEvent[]) {
    const course = this.golfLand.slice(0, 1); if (!course.length) return;
    for (const key of [...this.town.states.keys()]) { const l = this.lots.lots.get(key); if (l && this.onLand(l, course)) { const e = this.town.clear(key); if (e) out.push(e); } }
    if (out.length) this.syncHour = -1;
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

  /** a new valley: its terrain classes, the water field, the highway entry (tiles), the seed, the town centres (tiles; none: the single town) and the
   *  heights (HS*HS metres, the terrain's height field: the disasters' flood and slope tests; none: flat); the town starts again, at the sim time (no lots yet) */
  terrain(cls: Uint8Array, entry: Pt, seed: number, towns: Pt[] = [], height?: Float32Array, golf = false): void {
  this.cls = cls; this.water = waterField(cls); this.ctx.entry = { x: entry.x, y: entry.y }; this.endTourneyDay();
    // a new game starts at its own month (T135): the game clock at the season's first instant and the town day at day 1, not the last game's
    // (the season month is read from the clock, so it carried over); the clock-keyed timers with it. A load sets its own clock after (restore)
    this.sim.restartClock(); this.growAt = -Infinity; this.courseHour = -1;
    this.heightOf = height ? (x, y) => sampleField(height, x, y) : () => 0; this.segs = new WeakMap();
    this.centres = towns;
    this.town = new Town(seed); this.town.setCentres(towns); this.town.option = optionOf(this.optId); this.town.speed = this.growSpeed; this.town.tick(this.sim.clock, this.ctx); this.syncHour = -1;
    this.hours = []; this.builds = 0;
    this.planRnd = seededRnd(seed); this.planHour = -1; this.pendingGrow = false;
    this.suggested = towns.length ? placeStadium(cls, towns) : null; this.site = this.autoStadium ? this.suggested : null; this.round = new Round(); this.grown = null; this.sim.entryS = ENTRY_S;
    this.surge = null; this.sim.dropParty(); this.crowd = null; this.sim.dropBuses();
    // a new valley has no incidents: the old ones' blocks are lifted, the module starts again
    this.resetIncidents(seed);
    this.resetDisasters(seed);
    // a new valley has no toll gates until the player places them again (their booths are the old roads')
    this.setTolls([]);
    if (!golf) this.golf = null;
    this.setBudget(null, null, golf);
    }

  /** the road upkeep per game day, $: the sum of the road stretches' upkeep (segUpkeep, as dayIn builds them), the junctions' signal upkeep,
   *  and the loans' interest; cached until a net batch, a loan change or new books */
  upkeepRate(): number {
    if (this.upkeepC !== null) return this.upkeepC;
    let r = 0;
    for (const s of this.net.segs) if (!s.town) r += segUpkeep({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind }); // the towns' roads cost the player nothing (Seg.town)
    for (const n of this.net.nodes.values()) r += SIGNAL_UPKEEP[n.type] ?? 0;
    r += this.budget.loans * LOAN * LOAN_RATE;
    return this.upkeepC = r;
  }

  /** the businesses as the player placed them (defs, the full list, each time): each keeps its stats by id (a new id gets fresh ones; a removed one's go),
   *  and the site is siteAt of the stadium entry, else of the clubhouse (null: neither). While a round is under way the stadium and the clubhouse do not
   *  change: the current ones stay in place of whatever defs say about them */
  setBusinesses(defs: BizDef[]): void {
    defs = knownBusinesses(defs, 'city'); // a type the catalogue does not have (an old save's) would throw in the visit plan every frame (T135)
    const cur = this.businesses.find(b => b.type === 'stadium'), club = this.businesses.find(b => b.type === 'clubhouse'), locked = this.round.stage !== 'free';
    const others = defs.filter(d => d.type !== 'stadium' && d.type !== 'clubhouse'), keep: BizDef[] = [cur, club].filter((b): b is BizView => !!b).map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h }));
    const next: BizDef[] = locked ? [...keep, ...others] : defs;
    const stats = new Map<number, BizStats>(), old = new Set(this.businesses.map(b => b.id));
    this.businesses = next.map(d => { const s = this.bizStats.get(d.id) ?? freshStats(d.id); stats.set(d.id, s); return { ...d, ...s }; });
    this.bizStats = stats;
    const st = this.businesses.find(b => b.type === 'stadium'), cl = this.businesses.find(b => b.type === 'clubhouse');
    this.site = st ? siteAt(st.x, st.y, st.w, st.h) : cl ? siteAt(cl.x, cl.y, cl.w, cl.h) : null;
    // a business taken away loses its pending cars; the doors follow the new list, and the day's plan takes the new one in (the rest of its hours)
    for (const id of old) if (!stats.has(id)) this.visits.drop(id);
    this.visits.onGraph(this.visitDoors());
    if (this.round.stage === 'free') this.planVisits(); else this.visitDay = -1;
    this.setupTaxis();
  }
  /** fills the stats of the placed businesses from a save (by id; after setBusinesses, see the townState message) */
  restoreBiz(stats: BizStats[] = []): void {
    for (const s of stats) this.bizStats.set(s.id, { ...s, today: { ...s.today } });
    this.businesses = this.businesses.map(b => ({ ...b, ...(this.bizStats.get(b.id) ?? freshStats(b.id)) }));
  }
  /** the businesses as the UI and the frame see them: copies (the stadium's level is its business level; the round's own level is RoundView.level) */
  bizView(): BizView[] {
    return this.businesses.map(b => ({ ...b, ...this.bizStats.get(b.id)!, today: { ...this.bizStats.get(b.id)!.today } }));
  }
  /** places the stadium with its footprint at [x, y, w, h] tiles (siteAt), or takes it away (null); refused (false, nothing changes) while a round is under way.
   *  Its id is the stadium's own, else the next after the highest */
  setStadium(at: [number, number, number, number] | null): boolean {
    if (this.round.stage !== 'free') return false;
    const old = this.businesses.find(b => b.type === 'stadium'), defs: BizDef[] = this.businesses.filter(b => b.type !== 'stadium').map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h }));
    if (at) defs.push({ id: old?.id ?? Math.max(0, ...this.businesses.map(b => b.id)) + 1, type: 'stadium', x: at[0], y: at[1], w: at[2], h: at[3] });
    this.setBusinesses(defs); return true;
  }
  /** starts a round (free only, with a site): the crowd by town population (crowdFor at the round's level), and the clock frozen at the next
   *  EVENT_CLOCK (18:00 today, or tomorrow's if the clock is past it); false if there is no site or a round is under way */
  startRound(): boolean {
    if (!this.site || this.round.stage !== 'free') return false;
    if (!this.round.start(crowdFor(this.round.level, this.town.popK))) return false;
    const c = this.sim.clock, day = Math.floor(c / GAME_DAY) * GAME_DAY;
    const to = c <= day + EVENT_CLOCK ? day + EVENT_CLOCK : day + GAME_DAY + EVENT_CLOCK;
    // the clock jumps to the event evening: the town skips the hours between (no catch-up burst of growth or land sales)
    this.town.skipTo(to);
    this.freeze(to);
    return true;
  }
  /** golf mode on (with the tournament's tier and its reputation) or off (null): a new valley keeps it (terrain does not touch it) */
  setGolf(g: { tier: number; rep: number; land?: [number, number, number, number][]; start?: 'range'; exits?: Pt[]; invited?: { at: number }; holes?: number; townBoost?: number } | null): TownEvent[] {
    // a range start's start, exits and invitation (plan P22) are kept for the range-start rules that read them (T088-T094); an old start's golf
    // state has none of these keys, exactly as before
    this.golf = g ? { tier: g.tier, rep: g.rep } : null; this.round.golf = !!g; this.golfLand = g?.land ?? [];
    if (this.golf && g?.start === 'range') { this.golf.start = 'range'; if (g.exits) this.golf.exits = g.exits; if (g.invited) this.golf.invited = g.invited; }
    // a range start's grown town (T091): its industrial district toward the nearer exit, opening at GROWN_IND_FROM built lots
    this.town.grownInd = this.golf?.start === 'range' && this.centres.length ? { rect: this.grownIndustrial(), from: GROWN_IND_FROM } : null;
    // and its lot growth (T090, plan P22 2.3.2-2.3.3): the holes built and the tournaments' success (1 until the first tournament)
    this.town.setGrown(this.golf?.start === 'range' && this.centres.length ? { holes: g?.holes ?? 0, success: g?.townBoost ?? 1 } : null);
    // the town's lots inside the course go now (and every game hour: a loaded town's lots may come after this): the events to post
    const ev: TownEvent[] = []; this.clearCourse(ev);
    return ev;
  }
  /** starts the season's tournament at the day's boundary `at` (see step), in golf mode with a site and a free round: the round takes one tournament day's
   *  crowd (spectatorDemand of the tier and reputation, a car per PARTY fans, over the towns by population), the clock is frozen at `at` as startRound
   *  freezes it, and the surge begins at once (the season was the build). False, and nothing changes, otherwise */
  private startTournament(at: number): boolean {
    const g = this.golf;
    if (!g || !this.site || this.round.stage !== 'free') return false;
    // a range start's founding seasons end with no tournament: it is held only once the tour's invitation is due (plan P22 2.5.3)
    if (g.start === 'range' && !tournamentDue(g.invited?.at, at)) return false;
    const day1Spectators = applyParkingFeeDemand(Math.round(spectatorDemand(g.tier, g.rep) * dayShare(0, tierInfo(g.tier).days)), this.parkFee);
    if (!this.round.start(crowdFor(this.round.level, this.town.popK, Math.round(day1Spectators / PARTY)))) return false;
    this.town.skipTo(at);
    this.freeze(at);
    // the tournament day (T048): the town clock jumps to 05:00 and runs at 1 game minute per sim s until endTourneyDay
    this.sim.town = jumpTo(this.sim.town, this.sim.t, TOURNEY_START, 1, null); this.tourneyDay = true; this.dayT0 = this.sim.t;
    this.round.startNow(); this.beginSurge();
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
  private beginSurge(): void { this.round.beginSurge(); this.surge = this.planSurge(); this.startBuses(); this.busRiders = 0; }
  /** the shuttle riders of the round so far (the bus company's good day: BUS_GOOD_RIDERS or more) */
  private busRiders = 0;
  /** closes the eval: the round is free again and the clock runs on from where it was frozen. A perfect run's towns grow (growTowns; see grown).
   *  False unless in eval, and while the draft is open (see Round.close) */
  closeRound(): boolean {
    const last = this.round.last, perfect = !!last?.perfect;
    this.grown = null;
    if (!this.round.close()) return false;
    this.sim.dropParty(); this.surge = null; this.crowd = null; this.sim.dropBuses(); this.leave = null; this.parkedCars = [];
    // the roads clear after the event: a surge can leave the towns' junctions gridlocked, and the next round must start on an open network
    // (the everyday trips start again on their own)
    for (let i = 0; i < this.sim.cap; i++) if (this.sim.alive[i]) this.sim.despawn(i);
    this.unfreeze(); this.emptyParks(); this.endTourneyDay();
    // a range start's grown town (T090, plan P22 2.3.3): no stamp after the tournament; its success sets the town's pace (townBoost, kept by the
    // engine in the save), so its growth is always seen happening
    if (this.golf?.start === 'range' && this.town.grown) { const rate = last ? roundTownGrowthRate(last, this.golf.tier, this.golf.rep) : 0; this.townBoost = grownSuccess(rate); this.town.grown.success = this.townBoost; }
    else if (this.golf) { const rate = last ? roundTownGrowthRate(last, this.golf.tier, this.golf.rep) : 0; if (rate > 0 && this.centres.length) this.grown = this.growTowns(rate); } else if (perfect && this.centres.length) this.grown = this.growTowns();
    return true;
  }
  /** the tournament day's end (T048): the town clock returns to the normal rate (the day length as last set: see the townDay message); a no-op otherwise */
  private endTourneyDay(): void { if (!this.tourneyDay) return; this.sim.town = retime(this.sim.town, this.sim.t, GAME_DAY / this.sim.dayLen, this.sim.prof); this.tourneyDay = false; this.dayT0 = -1; }
  /** the tournament day is over (T048): the round is free again, or the town reads 22:00, or the leaving is done (every parked car out: leave.gone of
   *  leave.cars) and it reads EXIT_END (19:30) */
  private dayOver(): boolean {
    if (this.round.stage === 'free') return true;
    const m = townTimeOf(this.sim.town, this.sim.t).dayMin, lv = this.leave;
    return m >= TOURNEY_END || (!!lv && lv.gone >= lv.cars && m >= EXIT_END);
  }
  /** a perfect run's growth: each town is stamped to its residents times 1 + TOWN_GROWTH (the land may run out short of that); returns the new lots'
   *  events and the residents each town reached */
  private growTowns(rate = TOWN_GROWTH): { events: TownEvent[]; pops: number[] } {
    const events = this.stamp(0, townGrowthTargets(this.town.popK, rate));
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
  setBudget(s: BudgetSave | null, career?: CareerSave | null, golf = false): void {
  this.budget = s ? Budget.from(s) : Budget.from(undefined, (golf || this.golf) ? 600000 : startMoney(this.centres.length > 0));
    this.feeKeys = new Set(s?.feeKeys ?? []);
    this.budget.unlimited = this.unlimited;
    if (!s) this.budget.base = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    this.career = Career.from(career ?? undefined);
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade }; this.upkeepC = null; this.resetVisits();
  }
  /** the visit cars start again (a new book or valley: the plans are not saved; the day's plan is made again at the next step) */
  private resetVisits(): void {
    this.visits.endDay(); this.visitDay = -1;
    this.taxis = null; this.taxiDue = []; this.setupTaxis();
  }

  /** the dev sandbox's options: the growth speed k (the town's Town.speed, and the planner's slots and window) and unlimited money (every budget); the defaults are the game's */
  setGrowth(k: number): void { this.growSpeed = k; this.town.speed = k; }
  setUnlimited(on: boolean): void { this.unlimited = on; this.budget.unlimited = on; }

  /** T221 (#610): the residents a range start's grown town has room for with the money the club has made (golf/towngrowth.ts earnedTarget of
   *  Budget.earned, the tournaments' success a bonus on it); null for any other game, whose towns grow as before. An old save's books, from
   *  before the money made was kept, start from the earnings the town's size stands for (earnedFor), so a loaded town never stalls */
  townRoom(): number | null {
    const g = this.town.grown, b = this.budget;
    if (!g || this.golf?.start !== 'range') return null;
    if (b.earnedUnknown) { b.earned = Math.max(b.earned, earnedFor(this.town.pop + this.town.pending, g.success)); b.earnedUnknown = false; }
    return earnedTarget(b.earned, g.success);
  }
  /** spends n $ on kind (see Budget.spend); a negative construction n gives it back */
  spend(kind: 'construction' | 'compensation' | 'business' | 'upkeep', n: number): void { this.budget.spend(kind, n); }
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
    for (const s of this.net.segs) if (!s.town) segs.push({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind });
    for (const n of this.net.nodes.values()) nodes.push(n.type);
    const tr = this.sim.trade, t0 = this.tradeAt;
    let bizUpkeep = 0;
    for (const b of this.businesses) bizUpkeep += BUSINESS[b.type].upkeepPerDay;
    return { lots, segs, nodes, trade: towns ? { arrived: 0, punctual: 0 } : { arrived: tr.arrived - t0.arrived, punctual: tr.punctual - t0.punctual }, pop: this.town.pop, bizUpkeep };
  }

  /** the growth option by id (see GROWTH_OPTIONS) */
  option(id: string): void { this.optId = id; this.town.option = optionOf(id); }

  /** the traffic incidents on or off (on by default; the dev switch): off lifts the blocks and slow zones they made and forgets them; on starts
   *  the sim second clock and the junction counts here */
  setIncidents(on: boolean): void {
    if (on === this.incidents) return;
    this.incidents = on;
    this.resetIncidents(this.incSeed);
  }
  /** starts the incidents afresh (a new valley, a loaded game, the switch): the blocks lift, the module is made with seed, and the sim second, the
   *  sample and the junction counts start at the sim's time now */
  private resetIncidents(seed: number): void {
    this.liftAll(); this.inc = new Incidents(seed); this.incSeed = seed; this.incT = this.sim.t;
    this.expM.fill(0); this.expVS.fill(0); this.expSlow.fill(0); this.enterPrev = this.sim.enterL.slice(); this.nodeLoad.clear();
    // liftAll clears every block on the sim: the disasters' closures (if any) go back on
    if (this.closed.size) this.applyClosures();
  }
  /** the active incidents for the renderer: 3 floats each, x and y (tiles, on the lane at its s) and kind (1 crash, 0 breakdown) */
  incidentBuf(): Float32Array {
    const act = this.incidents ? this.inc.active(this.sim.t) : [], o = new Float32Array(3 * act.length);
    let n = 0;
    for (const a of act) {
      const ln = this.g.lanes[a.lane]; if (!ln) continue;
      laneAt(ln, a.s, this.incPt); o[3 * n] = this.incPt.x; o[3 * n + 1] = this.incPt.y; o[3 * n + 2] = a.kind === 'crash' ? 1 : 0; n++;
    }
    return n === act.length ? o : o.slice(0, 3 * n);
  }

  /** replays a batch of network ops (a rebuild ends each part; the lane graph follows each one, so each part is measured on its own),
   *  then the parcels, the reachable segs and the town's lots. Returns the parcels added and removed and the town's events. */
  netOps(ops: NetOp[]): { lotsAdded: Lot[]; lotsRemoved: string[]; events: TownEvent[] } {
    const t0 = performance.now();
    this.pendingGrow = false;
    let part: NetOp[] = [], rebuilt = false;
    for (const op of ops) {
      part.push(op);
      if (op.k === 'rebuild') { applyOps(this.net, part); this.g.update(this.net); this.incidentsOnGraph(); part = []; rebuilt = true; }
    }
    if (part.length) applyOps(this.net, part);
    this.labelComps();
    if (this.busDefs.length) this.resolveBuses();
    this.sim.onGraph(); this.upkeepC = null; this.visits.onGraph(this.visitDoors()); this.setupTaxis();
    // the closure blocks follow the lanes: the new graph's lanes of the closed segs get them (the old ids' are lifted there)
    if (rebuilt && this.closed.size) this.applyClosures();
    // the car parks are built again on the new network (a frontage road split or replaced by the edit leaves the old build on a dead seg;
    // the counts are kept by id), and with them the sinks
    if (this.curbDefs.length) this.applyCurbs();
    if (this.parkDefs.length || this.rowDefs.length || this.curbDefs.length) this.setParks(this.parkDefs);
    if (this.surge) { this.surge.relink(this.surgeParks()); this.surge.onGraph(); }
    this.graphMs = performance.now() - t0;
    this.lanes = 0; for (const ln of this.g.lanes) if (ln) this.lanes++;
    return this.lotsOps();
  }

  /** after a network batch: the parcels that changed, the reachable segs, the town's lots */
  private lotsOps(): { lotsAdded: Lot[]; lotsRemoved: string[]; events: TownEvent[] } {
    const t0 = performance.now();
    // T177: in a range start's grown town a lot the town has started or built keeps its footprint through the re-partition (new streets
    // partition round it). Classic towns keep today's partition: there the block lots' subdivision replacing the frontage is what fills a
    // town's interior (with the rule, town:gate's town reached 4,395 residents in 40 days instead of 5,094)
    const keep = this.golf?.start === 'range' ? (key: string) => (this.town.states.get(key)?.level ?? LV.EMPTY) >= LV.BUILDING : undefined;
    const { added, removed } = this.lots.update(this.net, this.cls, keep);
    this.reach = this.centres.length ? reachableFrom(this.net, [this.ctx.entry, ...this.centres], [Infinity, ...this.centres.map(() => 80)]) : reachableSegs(this.net, this.ctx.entry);
    const events = this.town.onLots(added, removed);
    this.lotsMs = performance.now() - t0;
    return { lotsAdded: added, lotsRemoved: removed, events };
  }

  /** a saved town (after the load's net ops): the sim time (s), the clock's offset from it (shift, s; 0 if none), then the lots' states;
   *  returns the 'complete' event per restored lot */
  restore(saved: LotTuple[], simT: number, budget?: BudgetSave, money?: number, career?: CareerSave, shift = 0): TownEvent[] {
    this.sim.t = simT; this.sim.shift = shift; this.resetIncidents(this.incSeed); this.resetDisasters(this.disSeed);
    this.budget = Budget.from(budget, money); this.budget.unlimited = this.unlimited; this.feeKeys = new Set(budget?.feeKeys ?? []); if (!budget) this.budget.base = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    this.career = Career.from(career);
    this.dayIdx = -1; this.tradeAt = { ...this.sim.trade }; this.upkeepC = null; this.resetVisits();
    const ev = this.town.restore(saved, this.sim.clock); this.syncHour = -1;
    return ev;
  }

  /** freezes the game clock at c (s, the time of day): the sim keeps running, the town, the books and the planner stand still (see Sim.freezeAt) */
  freeze(c: number): void { this.sim.freezeAt(c); }
  /** the game clock runs again (see Sim.unfreeze) */
  unfreeze(): void { this.sim.unfreeze(); }

  /** the towns built at once (a new valley, or a perfect round's growth, see Town.stamp): each town grows to perTown residents, or to targets[k] when given; returns the 'complete' events (a new array) */
  stamp(perTown: number, targets?: number[]): TownEvent[] {
    const ev = this.town.stamp(this.ctx, perTown, this.sim.clock, targets), n0 = this.cash.length; this.syncHour = -1; if (this.centres.length) for (const e of ev) if (e.kind === 'complete') this.connect(e);
    this.cash.length = n0; // T147: the towns built at once float no fees (money as you watch it only)
    return ev;
  }

  /** n sim steps (a frame at speed n), then the town to the sim time, then the planner (once a game hour). Returns the town's events
   *  (the array is reused: read it before the next call), the gravel extension the town lays now, if any (legs in tiles), and the
   *  ledger of the game day that closed in these steps, if one did (else null). At a game hour's start the career is updated: the
   *  milestones newly reached (their grants paid then) and the win, if it came; milestones is the shared empty array most calls. */
  step(n: number): { events: TownEvent[]; grow: Leg[] | null; ledger: Ledger | null; milestones: Milestone[]; won: boolean } {
    const t0 = performance.now();
    this.calls++;
    // the parking fees of the cars parked since the last step (sim.parkedNow holds a pair per car, read before it is cleared): the books take them,
    // and a round under way counts them (as it counts its tolls)
    const pk = this.sim.parkedNow.length >> 1, rs0 = this.round.stage;
    if (pk && this.parkFee > 0 && !this.golf) { const y = pk * this.parkFee; this.budget.parking(y); if (rs0 === 'build' || rs0 === 'surge') this.round.parking += y; }
    // T147: each car's fee floats up at its car park's entrance (golf: the tournament's cars, whose fees the close books)
    if (pk && this.parkFee > 0 && (!this.golf || rs0 === 'build' || rs0 === 'surge')) {
      const pn = this.sim.parkedNow; for (let k = 0; k < pn.length; k += 2) { const P = this.parks[pn[k]!], e = P?.entrances[0]; if (e) this.cashAt(e.x, e.y, this.parkFee); }
    }
    this.sim.parkedNow.length = 0;
    const hr = Math.floor(this.sim.clock / GAME_HOUR);
    let milestones = NO_MILESTONES, won = false;
    if (hr !== this.syncHour) {
      this.pushHour(hr); this.syncHour = hr; this.town.access.set(this.sim.access); this.builtSync();
      // once a game hour a visit business with no plan yet today (no road or no homes when it was placed) gets another try
      this.visitDay = -1;
      // with towns (centres) there is no career: its milestones and grants wait (the event's money is the income, see dayIn); a range start's
      // grown town pays the milestones' grants as county development grants (T090, plan P22 2.1.5: the town's growth is the player's), no win
      if (!this.centres.length) {
        const u = this.career.update(this.town.pop);
        for (const m of u.newly) if (m.grant) this.budget.grant(m.grant);
        if (u.newly.length) milestones = u.newly;
        won = u.won;
      } else if (this.golf?.start === 'range') {
        const u = this.career.update(this.town.pop);
        for (const m of u.newly) if (m.grant) this.budget.grant(m.grant);
        if (u.newly.length) milestones = u.newly;
      }
    }
    if (this.incidents) { for (let k = 0; k < n; k++) { this.sim.step(); this.sample(); } if (this.sim.t - this.incT >= 0.999) this.incidentTick(); }
    else for (let k = 0; k < n; k++) this.sim.step();
    // the disasters run on the same sim clock (once a sim second, the module's own days on top)
    if (this.dis && this.sim.t - this.disT >= 0.999) this.disasterTick(this.dis);
    this.ticks[(this.calls - 1) % TICKS] = performance.now() - t0;
    // a round under way pays the upkeep as the sim runs; the surge counts down to kick-off (the round goes to eval then)
    const rs = this.round.stage;
    if (rs === 'build' || rs === 'surge') { const u = this.upkeepRate() * n * DT / GAME_DAY; this.budget.upkeepLive(u); this.round.upkeep += u; }
    // the toll booths' takings since the last step: each car served pays the price of the round's level; the books take it, and a round
    // under way counts it (as it counts its upkeep)
    if (this.sim.tolls) {
      const p = tollPrice(this.round.level), y = this.sim.tolls * p; this.budget.toll(y); if (rs === 'build' || rs === 'surge') this.round.toll += y; this.sim.tolls = 0;
      // T147: each car's toll floats up at its booth
      const ta = this.sim.tollAt; for (let k = 0; k + 1 < ta.length; k += 2) this.cashAt(ta[k]!, ta[k + 1]!, p);
    }
    this.sim.tollAt.length = 0;
    // T147: a car park that turned cars away (full) lost their fees: red at its entrance (the treasury is not charged)
    if (this.parkFee > 0 && (!this.golf || rs === 'build' || rs === 'surge')) this.lostParking();
    // the surge: its due cars spawn, then the party cars' exits are counted; kick-off (the round's last step of the surge) gives the result
    if (this.surge && rs === 'surge') this.surge.step(this.sim, this.g, this.busWalk);
    this.drainParty();
    this.drainBus();
    this.drainVisits();
    this.drainTaxis();
    // the visit businesses' cars: planned once a day (and once a business is placed), spawned while no round is under way
    if (rs === 'free') {
      if (this.visitDay < 0) this.planVisits();
      this.visits.step(this.sim, this.g, this.sim.clock);
      this.stepTaxis();
    }
    if (this.crowd) { this.crowd.now = this.sim.t; this.crowd.step(WALK_V * n * DT / MPT); this.admitGates(n * DT); this.relocateFans(); this.stepLeaving(); this.syncWait(); }
    if (rs === 'surge' && this.round.sim(n * DT)) this.kickOff();
    if (this.tourneyDay && this.dayOver()) this.endTourneyDay();
    if (this.town.grown) this.town.grown.cap = this.townRoom() ?? Infinity;
    const events = this.town.tick(this.sim.clock, this.ctx);
    const ch = Math.floor(this.sim.clock / GAME_HOUR); if (this.golfLand.length && ch !== this.courseHour) { this.courseHour = ch; this.clearCourse(events); }
    const towns = this.centres.length > 0;
    for (const e of events) { if (e.kind === 'build') { this.builds++; if (towns) this.sell(e.key); } else if (e.kind === 'complete' && towns) this.connect(e); }
    const d = this.budget.dayOf(this.sim.clock); let ledger: Ledger | null = null;
    if (this.dayIdx < 0) this.dayIdx = d;
    else if (d > this.dayIdx) {
      this.closeVisits();
      ledger = this.budget.endDay(this.dayIdx, this.dayIn()); this.tradeAt = { ...this.sim.trade }; this.dayIdx = d;
      // golf mode: the season ends at this boundary, the start of game day d (base + (d - 1) * GAME_DAY), and the tournament starts there
      this.startTournament(this.budget.base + (d - 1) * GAME_DAY);
      // the new day's visits are planned now, or when the round is free again (step)
      this.visitDay = -1; if (this.round.stage === 'free') this.planVisits();
    }
    return { events, grow: this.planGrow(), ledger, milestones, won };
  }

  /** after each sim step (the incidents on): the link lanes' vehicles, summed over the second (metres, seconds, and the seconds slower than 1.5 m/s) */
  private sample(): void {
    const Q = this.sim.onLane, V = this.sim.v, lanes = this.g.lanes;
    if (this.expM.length < Q.length) this.growExp(Q.length);
    for (let id = 0; id < Q.length; id++) {
      const q = Q[id]!; if (!q.length) continue;
      const ln = lanes[id]; if (!ln || ln.kind !== LK.LINK) continue;
      for (const i of q) { const v = V[i]!; this.expM[id]! += v * DT; this.expVS[id]! += DT; if (v < 1.5) this.expSlow[id]! += DT; }
    }
  }
  /** the sample arrays grow to n lanes (the lanes added since, copied) */
  private growExp(n: number): void {
    const m = Math.max(n, 2 * this.expM.length);
    const g = (a: Float64Array) => { const b = new Float64Array(m); b.set(a); return b; };
    this.expM = g(this.expM); this.expVS = g(this.expVS); this.expSlow = g(this.expSlow);
  }
  /** a junction node's lanes that the vehicles entered this second, as the exposure's passages: each node of 3 or more arms with its entries (count)
   *  and its load (conflictLoad, veh/h: the entries over the last minute, decayed with a 60 s time constant, times 60) */
  private passages(t: number, w: number): Passage[] {
    const E = this.sim.enterL, lanes = this.g.lanes, out: Passage[] = [];
    // a game hour's relax halves every entry count at its start (the step it turns): the count of this window is what it added since
    const k = Math.floor((t - w) / 60) !== Math.floor(t / 60) ? 0.5 : 1;
    if (this.enterPrev.length < E.length) { const b = new Float64Array(E.length); b.set(this.enterPrev); this.enterPrev = b; }
    const per = new Map<Node, { n: number; lane: number }>();
    const n = Math.min(lanes.length, E.length);
    for (let id = 0; id < n; id++) {
      const c = E[id]!, p = this.enterPrev[id]!;
      this.enterPrev[id] = c;
      let d = c - p * k; if (d < 0) d = c;
      const ln = lanes[id];
      if (!ln || d <= 0 || ln.kind === LK.LINK || !ln.node || ln.node.arms.length < 3) continue;
      const o = per.get(ln.node);
      if (o) { o.n += d; o.lane = id; } else per.set(ln.node, { n: d, lane: id });
    }
    for (const [nd, o] of per) {
      let L = this.nodeLoad.get(nd); if (!L) { L = { S: 0, t }; this.nodeLoad.set(nd, L); }
      L.S = L.S * Math.exp(-(t - L.t) / 60) + o.n; L.t = t;
      out.push({ node: `${nd.x},${nd.y}`, conflictLoad: L.S * 60, count: o.n, lane: o.lane, s: lanes[o.lane]!.len / 2 });
    }
    for (const [nd, L] of this.nodeLoad) if (t - L.t > 600) this.nodeLoad.delete(nd);
    return out;
  }
  /** the link lanes' exposure of the window (w sim s) from the sample; the sample is cleared */
  private exposure(w: number): Exposure[] {
    const out: Exposure[] = [], Q = this.sim.onLane, lanes = this.g.lanes, dsegs = this.g.dsegs;
    const n = Math.min(Q.length, this.expM.length);
    for (let id = 0; id < n; id++) {
      const m = this.expM[id]!; if (!(m > 0)) continue;
      const ln = lanes[id]; if (!ln || ln.kind !== LK.LINK || !(ln.len > 0)) continue;
      const vs = this.expVS[id]!;
      out.push({ lane: id, metres: m, density: vs / w / (ln.len / 1000), stopGo: vs > 0 ? this.expSlow[id]! / vs : 0, len: ln.len, lanes: dsegs[ln.dseg]?.lanes.length ?? 1 });
    }
    this.expM.fill(0); this.expVS.fill(0); this.expSlow.fill(0);
    return out;
  }
  /** one sim second (or more) of incidents: the exposure and the junction passages go to the module, the incidents it starts get their blocks and
   *  slow zones on the sim, and the blocks of the incidents no longer active are lifted */
  private incidentTick(): void {
    const t = this.sim.t, w = t - this.incT;
    this.incT = t;
    const fresh = this.inc.step(t, this.exposure(w), this.passages(t, w));
    for (const a of fresh) this.applyIncident(a);
    const live = new Set<number>();
    for (const a of this.inc.active(t)) live.add(a.id);
    for (const id of [...this.incApplied.keys()]) if (!live.has(id)) this.liftIncident(id);
  }
  /** an incident's blocks on the sim: its lane at s, and for a two-lane crash the neighbour lane (right, else left) when there is one; its slow zones */
  private applyIncident(a: Incident): void {
    const lanes = this.g.lanes, ls = [a.lane], ln = lanes[a.lane];
    if (a.blocks >= 2 && ln) { const nb = ln.right >= 0 && lanes[ln.right] ? ln.right : ln.left >= 0 && lanes[ln.left] ? ln.left : -1; if (nb >= 0) ls.push(nb); }
    for (const l of ls) this.sim.addBlock(l, a.s);
    for (const z of a.slowZone) this.sim.setSlow(z.lane, [...(this.sim.slow.get(z.lane) ?? []), z]);
    this.incApplied.set(a.id, { a, lanes: ls });
  }
  /** lifts an incident's blocks and slow zones from the sim (the incident is over, or gone) */
  private liftIncident(id: number): void {
    const ap = this.incApplied.get(id); if (!ap) return;
    this.incApplied.delete(id);
    for (const l of ap.lanes) this.sim.removeBlock(l, ap.a.s);
    for (const z of ap.a.slowZone) this.sim.setSlow(z.lane, (this.sim.slow.get(z.lane) ?? []).filter(x => x !== z));
  }
  /** lifts every incident's blocks and slow zones, and clears the sim's lists */
  private liftAll(): void {
    for (const id of [...this.incApplied.keys()]) this.liftIncident(id);
    this.sim.blocks.clear(); this.sim.slow.clear();
  }
  /** after a graph update: an active incident on a lane the update removed or rebuilt is cleared (its blocks lift at the next tick) */
  private incidentsOnGraph(): void {
    if (!this.incidents || (!this.g.removed.length && !this.g.changed.length)) return;
    for (const a of this.inc.active(this.sim.t)) if (this.g.removed.includes(a.lane) || this.g.changed.includes(a.lane)) this.inc.clear(a.id);
  }

  /** the natural disasters on or off (off by default: no module, no closures). Off lifts the closures and forgets the live disasters; on starts a fresh
   *  module with the terrain's seed (the sim's clock: the day rolls go on from now) */
  setDisasters(on: boolean): void {
    if (on === this.disasters) return;
    this.disasters = on; this.resetDisasters(this.disSeed);
  }
  /** a new module (made here only while the switch is on, with terrain): the closures lift and the live disasters are forgotten; the clock starts at the sim's time now */
  private resetDisasters(seed: number): void {
    this.liftClosures(); this.dl.clear(); this.closed.clear(); this.disMid.clear(); this.disNotes = [];
    this.disSeed = seed; this.disT = this.sim.t;
    this.dis = this.disasters && this.cls ? new Disasters(seed, this.cls, this.heightOf) : null;
    // Enabling mid-game advances the scheduler without replaying historical road closures.
    this.dis?.step(this.sim.t, []);
    this.applyClosures(); this.disChanged = true;
  }
  /** dev and tests: the next daily roll of the disasters is kind (Disasters.force); false when they are off */
  forceDisaster(kind: DisasterKind): boolean { if (!this.dis) return false; this.dis.force(kind); return true; }
  /** pays the repair of the quake closure key of disaster id: the cost goes out as construction. False (with an 'unpaid' note) when the treasury
   *  cannot pay (or unless unlimited); false too when there is no such closure */
  repairDisaster(id: number, key: string): boolean {
    const e = this.dl.get(id); if (!this.dis || !e) return false;
    const c = e.d.closures.find(x => x.key === key && x.until === 'repair'); if (!c) return false;
    const cost = c.repairCost;
    if (!this.budget.unlimited && this.budget.money < cost) { this.disNote('unpaid', e.d, cost); return false; }
    this.spend('construction', cost);
    this.dis.repair(id, key);
    this.disNote('repaired', e.d, cost);
    this.reconcileDisaster(id);
    return true;
  }
  /** the disasters for the main thread, when they changed since the last call (else null): the active one (if any) and the notes since the last call */
  disasterFrame(): { active: DisasterView[]; notes: DisasterNote[] } | null {
    if (!this.disChanged) return null;
    this.disChanged = false;
    const notes = this.disNotes; this.disNotes = [];
    const active: DisasterView[] = [];
    if (this.dis) for (const d of this.dis.active()) active.push(this.disasterView(d));
    return { active, notes };
  }
  /** the view of a live disaster: its area flat (x, y pairs) and its closures' midpoints (the seg's, from disMid) */
  private disasterView(d: Disaster): DisasterView {
    const area: number[] = []; for (const p of d.area) area.push(p.x, p.y);
    return { id: d.id, kind: d.kind, warnAt: d.warnAt, start: d.start, end: d.end, area, closures: d.closures.map(c => {
      const m = this.disMid.get(c.key);
      return { key: c.key, x: m?.x ?? 0, y: m?.y ?? 0, cost: c.repairCost, repair: c.until === 'repair' };
    }) };
  }
  /** a disaster's note for the toasts (the closures' count is the module's now) */
  private disNote(k: DisasterNote['k'], d: Disaster, cost = 0, secs = 0): void {
    this.disNotes.push({ k, kind: d.kind, id: d.id, secs, n: d.closures.length, cost }); this.disChanged = true;
  }
  /** one sim second (or more) of disasters: the module steps with the roads; the closures of the disasters that start are counted and their blocks and
   *  router closures applied, and those of the ones that end lifted; the transitions go out as notes */
  private disasterTick(dis: Disasters): void {
    const t = this.sim.t; this.disT = t;
    const roads = this.roadInfos(), r = dis.step(t, roads);
    if (!r.warned.length && !r.started.length && !r.ended.length) return;
    for (const d of r.warned) this.disNote('warned', d, 0, d.start - t);
    for (const d of r.ended) { this.releaseDisaster(d.id); this.disNote('ended', d); }
    if (r.started.length) {
      const by = new Map<string, RoadInfo>(); for (const info of roads) by.set(info.key, info);
      for (const d of r.started) {
        // A skipped clock may contain both start and end; never reinstall its expired closure.
        if (d.end <= t) continue;
        const keys = d.closures.map(c => c.key);
        for (const k of keys) {
          this.closed.set(k, (this.closed.get(k) ?? 0) + 1);
          const info = by.get(k); if (info) this.disMid.set(k, { x: (info.a.x + info.b.x) / 2, y: (info.a.y + info.b.y) / 2 });
        }
        this.dl.set(d.id, { d, keys }); this.disNote('started', d);
      }
    }
    if (r.started.length || r.ended.length) this.applyClosures();
  }
  /** a live disaster's closures come off the refcount (its seg keys, as they are still closed) */
  private releaseDisaster(id: number): void {
    const e = this.dl.get(id); if (!e) return;
    for (const k of e.keys) this.unclose(k);
    this.dl.delete(id);
  }
  /** one closure of a seg off the refcount; the seg is open again (and its midpoint dropped) at zero */
  private unclose(k: string): void {
    const n = (this.closed.get(k) ?? 0) - 1;
    if (n > 0) this.closed.set(k, n); else { this.closed.delete(k); this.disMid.delete(k); }
  }
  /** after a repair: the seg keys that disaster no longer closes come off the refcount, and the blocks follow */
  private reconcileDisaster(id: number): void {
    const e = this.dl.get(id); if (!e) return;
    const left: string[] = [];
    for (const k of e.keys) { if (e.d.closures.some(c => c.key === k)) left.push(k); else this.unclose(k); }
    e.keys = left; this.applyClosures();
  }
  /** the closed segs (both directions) get a standing block at 1 m on each of their lanes, and the router closes their dsegs; the blocks made before
   *  are lifted first (by the lane ids they were put on: after a graph update the ids of the new lanes are the ones given) */
  private applyClosures(): void {
    this.liftClosures();
    const shut = new Set<string>();
    if (this.closed.size) for (const d of this.g.dsegs) {
      if (!d || !this.closed.has(this.segInfo(d.seg).key)) continue;
      shut.add(d.key);
      for (const l of d.lanes) { this.sim.addBlock(l, 1); this.closedLanes.push(l); }
    }
    this.sim.router.setShut(shut);
  }
  /** lifts the closure blocks this city put on the sim */
  private liftClosures(): void {
    for (const l of this.closedLanes) this.sim.removeBlock(l, 1);
    this.closedLanes = [];
  }
  /** the roads as the disasters read them: one RoadInfo per seg (cached per seg, see segInfo) */
  private roadInfos(): RoadInfo[] {
    const out = this.roadBuf; out.length = 0;
    for (const s of this.net.segs) out.push(this.segInfo(s));
    return out;
  }
  /** the RoadInfo of seg s: its key (its two end keys, sorted: both directions share it), its kind, the distance to water at its middle (tiles) and its
   *  slope (rise over run, the heights at its ends). Cached per seg, recomputed when its ends move */
  private segInfo(s: Seg): RoadInfo {
    const c = this.segs.get(s);
    if (c && c.ax === s.a.x && c.ay === s.a.y && c.bx === s.b.x && c.by === s.b.y && c.kind === s.kind) return c.info;
    const ka = keyOf(s.a), kb = keyOf(s.b), len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const info: RoadInfo = {
      key: ka < kb ? ka + '~' + kb : kb + '~' + ka, a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y },
      kind: s.kind === SK.BRIDGE ? 'bridge' : s.kind === SK.TUNNEL ? 'tunnel' : 'ground',
      nearWater: this.waterAt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2),
      slope: len ? Math.abs(this.heightOf(s.b.x, s.b.y) - this.heightOf(s.a.x, s.a.y)) / (2 * len) : 0,
    };
    this.segs.set(s, { ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, kind: s.kind, info });
    return info;
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
    // each built park keeps its counts by id (the car parks, then the bay-row lots, then the on-street curbs, whose ids are -curb id)
    const add = (p: CarPark): void => {
      const k = old.findIndex(q => q.id === p.id), o = k >= 0 ? st[k] : undefined;
      parks.push(p); states.push({ bays: p.bays.length, parked: o?.parked ?? 0, turned: o?.turned ?? 0 });
    };
    for (const d of defs) { const p = buildPark(this.net, d); if (p) add(p); }
    for (const rs of rowLots(this.rowDefs)) { const p = lotPark(this.net, rs); if (p) add(p); }
    for (const c of this.curbs) add({ id: -c.id, x: c.entrance.x, y: c.entrance.y, w: 0, h: 0, side: 0, seg: c.seg, entrances: [c.entrance], bays: c.bays, pv: c.pv, curb: true });
    this.parks = parks; this.sim.parks = states; this.resolveSinks();
    if (this.surge) this.surge.relink(this.surgeParks());
  }
  /** the bay rows, the on-street runs and the parking fee as the player set them (the full lists, each time): the runs resolve on the network
   *  (applyCurbs), then every car park is built again (setParks) with the lots and the curbs */
  setParking(rows: BayRowDef[], curbs: CurbDef[], fee: number): void {
    this.rowDefs = rows.slice(); this.curbDefs = curbs.slice(); this.parkFee = fee;
    this.applyCurbs();
    this.setParks(this.parkDefs);
  }
  /** the on-street runs resolved on the network (curbs: resolveCurb); the kerb lanes of the runs that drop them leave the lane graph (LaneGraph.setCurbs).
   *  As the toll booths: the sim's lanes and the buses follow when a kerb changed; the sinks follow in setParks */
  private applyCurbs(): void {
    this.curbs = this.curbDefs.map(d => resolveCurb(this.net, d)).filter((c): c is Curb => !!c);
    const keys: string[] = [];
    for (const c of this.curbs) if (c.drop) for (const k of c.keys) keys.push(k);
    if (!this.g.setCurbs(keys, this.net)) return;
    if (this.busDefs.length) this.resolveBuses();
    this.sim.onGraph(); this.upkeepC = null;
    if (this.closed.size) this.applyClosures();
  }
  /** the toll gates as the player placed them (defs, the full list, each time): the lane graph's booths (LaneGraph.setTolls); the sim's lanes and
   *  the car parks' sinks follow when a booth changed. The graph keeps the map, so each network batch builds the booths too */
  setTolls(defs: TollDef[]): void {
    this.tollDefs = defs.slice();
    if (!this.g.setTolls(defs, this.net)) return;
    if (this.busDefs.length) this.resolveBuses();
    this.sim.onGraph(); this.upkeepC = null; this.visits.onGraph(this.visitDoors()); this.setupTaxis();
    if (this.closed.size) this.applyClosures();
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
    const near = new Set(this.net.segsNear(e, 2)), pv = p.pv;
    // the park lies on the side of the road that faces away from the frontage (its pv); the road runs along the frontage (perp of pv)
    let R: DSeg | null = null;
    for (const d of this.g.dsegs) {
      if (!d || !d.lanes.length || !near.has(d.seg)) continue;
      const h = norm(sub(d.to, d.from));
      if (Math.abs(dot(h, perp(pv))) < 0.98 || (dot(perp(h), pv) <= 0 && !d.seg.cls.oneway)) continue;
      R = d; break;
    }
    if (!R) return [];
    // an on-street run's sinks are on its own direction only (no U-turn into the kerb)
    const ds: DSeg[] = [R];
    if (!p.curb) for (const d of this.g.dsegs) if (d && d !== R && d.seg === R.seg && d.lanes.length) { ds.push(d); break; }
    const out: Sink[] = [];
    for (const d of ds) {
      const ln = this.g.lanes[sinkLane(d, pv)]!;
      if (ln.len < 2 * SINK_END) { if (d === R) return []; continue; }
      const p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, u = norm({ x: ln.pts[2]! - p0.x, y: ln.pts[3]! - p0.y }), h = norm(sub(d.to, d.from));
      out.push({ park: k, dseg: d.id, s: Math.min(ln.len - SINK_END, Math.max(SINK_END, dot(sub(e, p0), u) * MPT)), next: 0, q: [], qz: [], ux: h.x, uy: h.y });
    }
    return out;
  }
  /** each town's homes for the surge (its built RES lots with residents, by population, with their frontage's component), the round's towns */
  private surgeHomesNow(): SurgeHome[][] {
    const K = this.round.crowd.length, homes: SurgeHome[][] = [];
    for (let k = 0; k < K; k++) homes.push([]);
    for (const b of builtLots(this.town, this.lots)) {
      const k = this.town.townOf(b.lot.key);
      if (b.use === LU.RES && b.pop > 0 && k >= 0 && k < K) homes[k]!.push({ lot: b.lot, town: k, pop: b.pop, comp: this.compOf(b.lot.seg) });
    }
    return homes;
  }
  /** the surge is planned at its start (sim s): each town's homes (its built RES lots with residents, by population), the car parks (surgeParks)
   *  and the crowd, from the surge's own stream (SURGE_SEED, never the sim's or the town's) */
  private planSurge(): Surge {
    const homes = this.surgeHomesNow();
    // the town bus stops: a route with a town (its lot stop beside the town's car park) and a resolved stop
    const stops: SurgeStop[] = [];
    this.busDefs.forEach((d, r) => { const p = this.busPts[r]?.lot; if (d.town !== undefined && p) stops.push({ route: r, town: d.town, x: p.x, y: p.y }); });
    const s = new Surge(); this.surgeHomes = homes; this.parkedCars = []; this.leave = null;
    const parks = this.surgeParks();
    // the tournament day (T050): the departures follow its timeline, each car's travel from its home to the gate (see surgeTravel)
    const timeline: SurgeTimeline | undefined = this.tourneyDay && this.dayT0 >= 0 ? { t0: this.dayT0, seed: SURGE_SEED, travel: (home: SurgeHome, park: number, bus: number) => this.surgeTravel(home, park, bus, parks, stops) } : undefined;
    s.plan(this.round.crowd, homes, parks, seededRnd(SURGE_SEED), this.sim.t, stops, timeline);
    return s;
  }
  /** a party's travel on the tournament day (T050, sim s): by road from its home's centre to its car park's entrance (a car party) or its bus stop
   *  (a bus party), at 1.3 times the straight distance (a street grid's detour), then the walk from there to the nearest gate (the site's middle with no
   *  gate; none: no walk). Tiles, 2 m each (see travelEstimate) */
  private surgeTravel(home: SurgeHome, park: number, bus: number, parks: SurgePark[], stops: SurgeStop[]): number {
    const l = home.lot, fx = l.o.x + l.u.x * l.w / 2 + l.n.x * l.d / 2, fy = l.o.y + l.u.y * l.w / 2 + l.n.y * l.d / 2;
    const stop = bus >= 0 ? stops.find(q => q.route === bus) : undefined;
    const to = stop ?? (park >= 0 ? parks[park]?.pts?.[0] : undefined), tx = to?.x ?? fx, ty = to?.y ?? fy;
    let walk = Infinity;
    for (const g of this.gates) walk = Math.min(walk, Math.hypot(g.x - tx, g.y - ty));
    if (!this.gates.length && this.site) walk = Math.hypot(this.site.c.x - tx, this.site.c.y - ty);
    return travelEstimate(1.3 * Math.hypot(tx - fx, ty - fy), 9, 2 * (Number.isFinite(walk) ? walk : 0));
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
      if (d) laneAt(this.g.lanes[sinkLane(d, this.parks[K.park]!.pv)]!, K.s, q);
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
    // the course's gates (golf, LEAD.md M2.1): what they measured, for the results (M2.4)
    if (this.golf && this.crowd && this.gates.length) { const G = this.crowd.gate; let q = 0; for (const n of c.atGate) q += n; L.gates = { admitted: G.admitted, avgWait: G.admitted ? G.waitSum / G.admitted : 0, maxWait: G.waitMax, queuing: q, late: G.late }; }
    // the money: the payout (signed) is paid now in classic mode (golf mode replaces it with purse and sponsors), the net is the toll and payout less the upkeep
    L.perfect = L.rate >= PERFECT_RATE; L.payout = this.golf ? 0 : payout(L.rate, L.level);
    // the tickets: a ticket per fan at the doors (golf tier ticket price in golf mode, stadium ticket price in classic mode; booked as business takings)
    const tk = Math.round(arrived * (this.golf ? golfTicketPrice(this.golf.tier, this.round.cards) : ticketPrice(this.round.cards)));
    if (tk > 0) { L.tickets = tk; this.budget.bizIncome(tk); } else if (this.golf) { L.tickets = 0; }
    L.net = (L.toll ?? 0) + (L.tickets ?? 0) + L.payout - L.upkeep;
    const st = this.businesses.find(b => b.type === 'stadium'), s = st ? this.bizStats.get(st.id) : undefined;
    if (s) {
      s.revenue += tk; s.visitors += arrived; s.xp += Math.round(arrived / PARTY); s.level = levelFromXp(s.xp); s.today.visitors += arrived; s.today.revenue += tk;
      s.sat = Math.min(1, Math.max(0, s.sat + 0.3 * (L.rate - s.sat))); if (L.perfect) s.goodDays++;
    }
    // the bus company: a round whose shuttles carried BUS_GOOD_RIDERS or more is a good day
    const bc = this.businesses.find(b => b.type === 'buscompany'), bs = bc ? this.bizStats.get(bc.id) : undefined;
    if (bs && this.busRiders >= BUS_GOOD_RIDERS) bs.goodDays++;
    L.stuck = this.report(5).top.map(i => ({ label: i.label, x: i.x, y: i.y, loss: i.loss }));
    if (!this.golf) this.budget.payout(L.payout);
    // golf: the crowd goes home (LEAD.md M2.3) LEAVE_AFTER sim s from now, the parked cars' parties in a seeded random order; on the tournament day
    // (T050) the cars leave at the timeline's wanted leave times instead (never before kick-off), in that same order
    if (this.golf) {
      const order = this.parkedCars.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.leaveRnd() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
      const times = this.dayT0 >= 0 ? wantedLeaves(order.length, SURGE_SEED + 7).map(m => Math.max(this.sim.t, simAt(m, this.dayT0))) : null;
      this.leave = { at: times ? (times[0] ?? this.sim.t) : this.sim.t + LEAVE_AFTER, times, order, next: 0, pending: [], cars: order.length, gone: 0, last: 0, waits: [] };
      L.leave = { cars: order.length, gone: 0, start: this.leave.at, last: 0 };
    }
  }
  /** the party cars' exits since the last step go to the surge (the sim's partyOut, cleared; discarded with no surge) */
  private drainParty(): void {
    const po = this.sim.partyOut;
    for (let k = 0; k < po.length; k += 2) this.surge?.event(po[k]!, po[k + 1]!);
    po.length = 0;
    // the party cars that parked: their fans start walking from their bays
    const pb = this.sim.partyBays;
    for (let k = 0; k < pb.length; k += 3) { this.parkedCars.push({ town: pb[k]!, park: pb[k + 1]!, bay: pb[k + 2]! }); this.partyWalk(pb[k]!, pb[k + 1]!, pb[k + 2]!); }
    pb.length = 0;
  }

  /** the player buys a town lot out (the bulldozer): its compensation is spent, and the town clears and holds it (Town.clear). Returns the town's events
   *  to post (the 'clear'); none if the lot is not built, or the books refuse the price */
  buyLot(key: string): TownEvent[] {
    const s = this.town.states.get(key);
    if (!s) return [];
    const c = compensation(s);
    if (!this.budget.unlimited && c > this.budget.money) return [];
    const e = this.town.clear(key);
    if (!e) return [];
    this.spend('compensation', c); this.syncHour = -1;
    return [e];
  }
  /** a town bus party's walk (Surge.step): from its home to its route's lot stop, a group of PARTY fans that queues there at its arrival; false if the stop is gone */
  private busWalk = (home: Lot, r: number, k: number): boolean => {
    const C = this.crowd, p = this.busPts[r]?.lot;
    if (!C || !p) return false;
    C.add({ x: home.c.x, y: home.c.y, tx: p.x, ty: p.y, n: PARTY, town: k, stage: 0, route: r });
    return true;
  };
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
    this.crowd = C; C.setGates(this.gates.length); this.gateAcc = this.gates.map(() => 0); this.relocatedAt = -Infinity;
    C.setSpots(this.spots.length); C.onIn = (town, n, x, y) => this.toGallery(town, n, x, y);
    C.onBack = (_town, route) => { this.leave?.pending.push({ k: route, at: this.sim.t }); };
    if (this.golf) C.grace = ON_TIME_GRACE_MIN;
    if (this.dayT0 >= 0) C.lateAt = simAt(LATE_AFTER_MIN, this.dayT0);
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
      if (kind === 0) { C.board(r, slot, n); this.busFares(n, slot); }
      else if (kind === 1) { for (let j = 0; j < n; j++) { const t = C.unloadOne(slot); if (t >= 0) this.walkDoor(t, this.busPts[r]?.doors ?? null, 1, -1); } }
      else C.requeue(r, slot);
    }
    ev.length = 0;
  }
  /** n fans boarded a shuttle: with a bus company, each pays its fare (booked as business takings, the company's visitors and revenue) */
  private busFares(n: number, slot = -1): void {
    this.busRiders += n;
    const b = this.businesses.find(x => x.type === 'buscompany'), s = b ? this.bizStats.get(b.id) : undefined;
    if (!s) return;
    const r = n * BUSINESS.buscompany.pricePerVisitor;
    s.revenue += r; s.today.revenue += r; s.visitors += n; s.today.visitors += n; s.xp += n; this.budget.bizIncome(r);
    // T147: the fares float up at the bus they boarded
    if (slot >= 0 && this.sim.pointOf(slot, this.cashPt)) this.cashAt(this.cashPt.x, this.cashPt.y, r);
  }
  private cashPt = { x: 0, y: 0 };
  /** T147: the cars each car park turned away since the last look (it was full): their fees lost, red at its entrance */
  private lostParking(): void {
    for (let k = 0; k < this.parks.length; k++) {
      const st = this.sim.parks[k], e = this.parks[k]!.entrances[0]; if (!st) continue;
      const seen = this.turnSeen.get(st) ?? st.turned; this.turnSeen.set(st, st.turned);
      if (st.turned > seen && e) this.cashAt(e.x, e.y, -(st.turned - seen) * this.parkFee, 1);
    }
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
  /** going home (LEAD.md M2.3): from LEAVE_AFTER after kick-off the parked cars' parties are released evenly over LEAVE_S (on the tournament day, T050:
   *  each at its timeline leave time, see kickOff), each walking from a gallery spot with fans (taking its fans off the spot) back to its car's bay;
   *  the cars whose party is back leave their car park in order as the road has room (driveHome). The round's result follows the counts (RoundResult.leave) */
  private stepLeaving(): void {
    const Lv = this.leave, C = this.crowd, t = this.sim.t; if (!Lv || !C) return;
    if (t >= Lv.at && Lv.next < Lv.order.length) {
      // the cars due by now: with times, every car whose time has come (sorted); without, the even spread
      let due = Math.min(Lv.order.length, Math.floor((t - Lv.at) / LEAVE_S * Lv.order.length) + 1);
      if (Lv.times) { due = Lv.next; while (due < Lv.order.length && Lv.times[due]! <= t) due++; }
      while (Lv.next < due) {
        const k = Lv.order[Lv.next++]!, car = this.parkedCars[k]!, b = this.parks[car.park]?.bays[car.bay];
        if (!b) { Lv.gone++; continue; }
        const from = this.leaveFrom(C, b);
        C.add({ x: from.x, y: from.y, tx: b.x, ty: b.y, n: PARTY, town: car.town, stage: 4, route: k });
      }
    }
    let out = false;
    for (let i = 0; i < Lv.pending.length;) { const p = Lv.pending[i]!; if (this.driveHome(p.k)) { Lv.pending.splice(i, 1); Lv.gone++; Lv.last = t; Lv.waits.push(t - p.at); out = true; } else i++; }
    // the exit measure (M2.4): the 95th percentile of the waits of the cars out so far
    const L = this.round.last; if (L?.leave) { L.leave.gone = Lv.gone; L.leave.last = Lv.last; if (out) L.leave.p95 = p95(Lv.waits); }
  }
  /** where a leaving party starts: a gallery spot with fans (a seeded pick among them; PARTY fans come off it), else the nearest gate, else
   *  the site's middle, else its car's bay */
  private leaveFrom(C: Crowd, bay: Pt): Pt {
    const withFans: number[] = []; C.gallery.forEach((n, i) => { if (n > 0) withFans.push(i); });
    if (withFans.length && this.spots.length) { const i = withFans[Math.floor(this.leaveRnd() * withFans.length)]!; C.gallery[i] = Math.max(0, C.gallery[i]! - PARTY); return this.spots[i]!; }
    if (this.gates.length) { let best = this.gates[0]!; for (const g of this.gates) if (Math.hypot(g.x - bay.x, g.y - bay.y) < Math.hypot(best.x - bay.x, best.y - bay.y)) best = g; return best; }
    return this.site ? this.site.c : bay;
  }
  /** parked car k leaves its car park at its entrance, bound for a home of its town (the surge's homes, by population): true when it is on the
   *  road (or can never be: no entrance or no home), false to try again (no room at the entrance yet) */
  private driveHome(k: number): boolean {
    const car = this.parkedCars[k]; if (!car) return true;
    const j = this.sim.sinks.findIndex(K => K.park === car.park), K = this.sim.sinks[j], d = K ? this.g.dsegs[K.dseg] : undefined, P = this.parks[car.park];
    const homes = this.surgeHomes[car.town] ?? [];
    if (!K || !d || !P || !homes.length) return true;
    let sum = 0; for (const h of homes) sum += h.pop;
    let x = this.leaveRnd() * sum, home = homes[homes.length - 1]!; for (const h of homes) { x -= h.pop; if (x < 0) { home = h; break; } }
    const dw = driveway(home.lot, this.g); if (!dw) return true;
    const dest = this.g.lanes[dw.lane]!.dseg;
    if (this.sim.spawnAt(sinkLane(d, P.pv), K.s, dest, dw.s) < 0) return false;
    const sp = this.sim.parks[car.park]; if (sp) sp.parked = Math.max(0, sp.parked - 1);
    return true;
  }
  /** each gate admits its lanes' rate (golf/venue.ts gateRate: a game minute is a sim second) from its queue; capacity a gate does not use
   *  (its queue ran dry) is carried over for at most a second. On the tournament day (T050) the gates stay shut until GATES_OPEN: the early fans queue */
  private admitGates(dt: number): void {
    const C = this.crowd; if (!C || !this.gates.length) return;
    if (this.dayT0 >= 0 && minuteAt(this.sim.t, this.dayT0) < GATES_OPEN) { this.gateAcc.fill(0); return; }
    const express = hasExpressGates(this.round.cards);
    this.gates.forEach((g, i) => {
      const rate = gateRate(g.lanes, express), acc = (this.gateAcc[i] ?? 0) + rate * dt, done = C.admit(i, Math.floor(acc), g.x, g.y);
      this.gateAcc[i] = Math.min(acc - done, rate);
      // T147: the fans let in before kick-off hold the tickets kick-off books (a ticket a fan at the doors): their money floats up at the gate
      if (done > 0 && this.golf && this.round.stage === 'surge') this.cashAt(g.x, g.y, done * golfTicketPrice(this.golf.tier, this.round.cards));
    });
  }
  /** n fans of town at p walk to the stadium's nearest door (route: the route they came from, -1 none); with no door, they are there already.
   *  Golf with gates (LEAD.md M2.1): to the nearest gate instead, where they queue (stage 2) */
  private walkDoor(town: number, p: Pt | null, n: number, route: number): void {
    const C = this.crowd;
    if (!C) return;
    if (this.golf && this.gates.length && p) {
      let gi = 0, bd = Infinity; this.gates.forEach((g, i) => { const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < bd) { bd = d; gi = i; } });
      const g = this.gates[gi]!; C.add({ x: p.x, y: p.y, tx: g.x, ty: g.y, n, town, stage: 2, route: gi }); return;
    }
    const d = p && this.site ? nearestDoor(this.site.doors, p) : null;
    if (!p || !d) { C.arrive(town, n); return; }
    C.add({ x: p.x, y: p.y, tx: d.x, ty: d.y, n, town, stage: 1, route });
  }
  /** the fans per town now (zeros with no crowd): see FanCounts */
  private fanCounts(): FanCounts {
    if (this.crowd) return this.crowd.counts();
    const z = new Array<number>(this.round.crowd.length).fill(0);
    return { fans: z, atStop: z.slice(), onBus: z.slice(), atGate: z.slice() };
  }
  /** the walkers as the frame sends them: 6 floats per group (x, y in tiles, n fans, stage, tx, ty: the group's target) */
  walkBuf(): Float32Array {
    const W = this.crowd?.walkers ?? [], out = new Float32Array(6 * W.length);
    W.forEach((g, i) => { const o = 6 * i; out[o] = g.x; out[o + 1] = g.y; out[o + 2] = g.n; out[o + 3] = g.stage; out[o + 4] = g.tx; out[o + 5] = g.ty; });
    return out;
  }
  /** the lot stops as the frame sends them: 4 floats per active route with a lot stop (x, y in tiles, the fans waiting, the route index) */
  stopBuf(): Float32Array {
    const rs: number[] = [];
    this.busPts.forEach((p, r) => { if (p) rs.push(r); });
    const out = new Float32Array(4 * rs.length);
    rs.forEach((r, i) => { const p = this.busPts[r]!.lot; out[4 * i] = p.x; out[4 * i + 1] = p.y; out[4 * i + 2] = this.crowd?.waiting(r) ?? 0; out[4 * i + 3] = r; });
    // the gates' queues (LEAD.md M2.1) follow, drawn as the stops are: index -1 - g
    if (!this.gates.length) return out;
    const all = new Float32Array(out.length + 4 * this.gates.length); all.set(out);
    this.gates.forEach((g, i) => { const o = out.length + 4 * i; all[o] = g.x; all[o + 1] = g.y; all[o + 2] = this.crowd?.atGate(i) ?? 0; all[o + 3] = -1 - i; });
    return all;
  }
  /** the galleries as the frame sends them (LEAD.md M2.2): 8 floats a spot (x, y in tiles, the fans standing there, the kind: 0 green, 1 tee,
   *  2 stand, 3 tent; fx, fy: what the fans face; ax, ay: where play aims) */
  galleryBuf(): Float32Array {
    const K = { green: 0, tee: 1, stand: 2, tent: 3 } as const, out = new Float32Array(8 * this.spots.length);
    this.spots.forEach((s, i) => { const o = 8 * i; out[o] = s.x; out[o + 1] = s.y; out[o + 2] = this.crowd?.gallery[i] ?? 0; out[o + 3] = K[s.kind]; out[o + 4] = s.fx; out[o + 5] = s.fy; out[o + 6] = s.ax; out[o + 7] = s.ay; });
    return out;
  }
  /** the round from a save (see Round.from): any surge under way is dropped with its party cars */
  loadRound(s?: RoundSave): void { const g = !!this.golf; this.round = Round.from(s); this.round.golf = g; this.grown = null; this.surge = null; this.sim.dropParty(); this.crowd = null; this.sim.dropBuses(); this.applyCards(); }
  /** the tournament day as the save keeps it (T209, event/daysave.ts): the clocks, the surge's counts and the departures still to come, the crowd, the
   *  car parks' counts and parked cars, the party cars on the road or at an entrance (their town and car park), and going home. Null unless golf is on
   *  and its round is in its surge or its eval on the tournament day, so every other save is as before */
  daySave(): DaySave | null {
    const st = this.round.stage, sim = this.sim;
    if (!this.golf || !this.tourneyDay || this.dayT0 < 0 || (st !== 'surge' && st !== 'eval')) return null;
    const id = (k: number) => this.parks[k]?.id ?? 0, cars: number[] = [], parks: number[] = [], road: number[] = [];
    for (const c of this.parkedCars) cars.push(c.town, id(c.park), c.bay);
    this.parks.forEach((p, k) => { const s = sim.parks[k]; parks.push(p.id, s?.parked ?? 0, s?.turned ?? 0); });
    for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.party[i]! >= 0) road.push(sim.party[i]!, id(sim.sinks[sim.sink[i]!]?.park ?? -1));
    for (const K of sim.sinks) for (const town of K.q) if (town >= 0) road.push(town, id(K.park));
    return {
      t: sim.t, shift: sim.shift, frozen: sim.frozen, town: { t0: sim.town.t0, m0: sim.town.m0, rate: sim.town.rate }, t0: this.dayT0, left: this.round.surgeLeft,
      featured: [...this.featured], surge: this.surge ? this.surge.save(id) : null, crowd: this.crowd ? this.crowd.save(slot => sim.bus[slot] ?? -1) : null, cars, parks, road,
      relocatedAt: Number.isFinite(this.relocatedAt) ? this.relocatedAt : null, busRiders: this.busRiders, gateAcc: this.gateAcc.slice(),
      leave: this.leave ? { ...this.leave, order: this.leave.order.slice(), pending: this.leave.pending.map(p => ({ ...p })), waits: this.leave.waits.slice(), times: this.leave.times?.slice() ?? null } : null,
    };
  }
  /** the tournament day from a save (T209; the worker's resumeDay message, after townState and townClock), on the network, car parks, gates and spots of
   *  the load: the round in its surge or eval again (Round.from live, with the surge's sim s left), the clocks as they stood (the sim time, the frozen game
   *  clock, the town clock at a game minute per sim second, the day's start), the surge with its counts and the departures still to come, a new crowd with
   *  the saved walkers, queues, fans, gates and galleries (the buses start again at their lot stops; the fans that were on a bus are at the front of its
   *  queue), the car parks' counts and parked cars, the party cars that were on the road queued at their car park's entrance (the road's traffic is not
   *  saved), and going home. False, and nothing changes, unless golf is on, the saved round was in its surge or eval and the day is well formed: the
   *  round then stays as loadRound left it (a surge as free, before T209) */
  resumeDay(s: RoundSave | undefined, raw: unknown): boolean {
    const d = normalizeDaySave(raw), sim = this.sim;
    if (!d || !s || !this.golf || (s.stage !== 'surge' && s.stage !== 'eval')) return false;
    this.round = Round.from(s, true); this.round.golf = true; if (this.round.stage === 'surge') this.round.surgeLeft = Math.max(0, d.left);
    this.grown = null; sim.dropParty(); sim.dropBuses(); this.applyCards();
    sim.t = d.t; sim.shift = d.shift; sim.frozen = d.frozen; sim.town = { t0: d.town.t0, m0: d.town.m0, rate: d.town.rate };
    this.tourneyDay = true; this.dayT0 = d.t0; this.visitDay = -1; this.featured = new Set(d.featured);
    // the car parks by id (the load built them again from the same lists; one that is gone is -1)
    const idx = (id: number) => (id === 0 ? -1 : this.parks.findIndex(p => p.id === id));
    this.surgeHomes = this.surgeHomesNow();
    this.surge = d.surge ? Surge.load(d.surge, this.surgeParks(), key => this.lots.lots.get(key), idx) : null;
    if (d.crowd) { this.startBuses(); this.crowd!.load(d.crowd); } else this.crowd = null;
    this.relocatedAt = d.relocatedAt ?? -Infinity; this.busRiders = d.busRiders; this.gateAcc = this.gates.map((_, i) => d.gateAcc[i] ?? 0);
    for (let i = 0; i + 2 < d.parks.length; i += 3) { const st = sim.parks[idx(d.parks[i]!)]; if (st) { st.parked = Math.min(st.bays, d.parks[i + 1]!); st.turned = d.parks[i + 2]!; } }
    // the parked cars keep their places in the list (going home's order is indices into it); one whose car park is gone goes home at once
    this.parkedCars = [];
    for (let i = 0; i + 2 < d.cars.length; i += 3) this.parkedCars.push({ town: d.cars[i]!, park: idx(d.cars[i + 1]!), bay: d.cars[i + 2]! });
    // the cars that were on the road join their car park's entrance queues (round-robin over its entrances); with no entrance left they are lost
    const rr = new Map<number, number>();
    for (let i = 0; i + 1 < d.road.length; i += 2) {
      const town = d.road[i]!, k = idx(d.road[i + 1]!), ks = sim.sinks.filter(q => q.park === k);
      if (!ks.length || k < 0) { this.surge?.event(town, 2); continue; }
      const j = rr.get(k) ?? 0, K = ks[j % ks.length]!; rr.set(k, j + 1);
      K.q.push(town); K.qz.push(0);
    }
    this.leave = d.leave ? { ...d.leave, order: d.leave.order.slice(), pending: d.leave.pending.map(p => ({ k: p.k, at: p.at })), waits: d.leave.waits.slice(), times: d.leave.times?.slice() ?? null } : null;
    this.syncWait();
    return true;
  }
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
        laneAt(this.g.lanes[sinkLane(dd, this.parks[k]!.pv)]!, K.s, sp);
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
  /** a range start's planner centre (plan P22 2.3.2, T091): the midpoint of the town's seed and its built lots' mean, so its heart stays at the
   *  range (the seed itself while nothing is built) */
  private anchoredCentre(k: number): Pt { const s = this.centres[k]!, m = this.townCentre(k); return { x: (s.x + m.x) / 2, y: (s.y + m.y) / 2 }; }
  private townCentre(k: number): Pt {
    let sx = 0, sy = 0, m = 0;
    for (const s of this.town.states.values()) if (s.level >= LV.BUILT && this.town.townOf(s.key) === k) { const l = this.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
    return m ? { x: sx / m, y: sy / m } : this.centres[k]!;
  }

  /** the lots whose connection fee is paid (for the whole game; saved with the books, see booksSave) */
  private feeKeys = new Set<string>();
  /** a town lot that completes (BUILT) beside one of the player's roads pays the player its CONNECT_FEE once per lot key; a lot on a town's road pays nothing */
  private connect(e: TownEvent): void { const l = this.lots.lots.get(e.key), n = CONNECT_FEE[e.use] ?? 0; if (!l || !n || l.seg.town || this.feeKeys.has(e.key)) return; this.feeKeys.add(e.key); this.budget.fee(n); this.cashAt(l.c.x, l.c.y, n); }
  /** the books as saved: the budget's, with the lots whose connection fee is paid (feeKeys) */
  booksSave(): BudgetSave { return { ...this.budget.toJSON(), feeKeys: [...this.feeKeys] }; }
  /** a lot on a paved road the town builds on is sold: the player is paid its price (saleOf: nothing on gravel) */
  private sell(key: string): void { const l = this.lots.lots.get(key), n = l ? saleOf(l.cls) : 0; if (n) { this.budget.sale(n); this.cashAt(l!.c.x, l!.c.y, n); } }

  /** a visit business's door on the road (see Door): for each of the footprint's 4 door points, the dseg of the segs within 6 tiles that has its
   *  business on its right (a one-way seg has one dseg), nearest the door point; null when no road is near or the lane is under 6 m. Visit types only */
  private bizDoor(b: BizDef): Door | null {
    if (BUSINESS[b.type].kind !== 'visit') return null;
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, q = this.doorQ;
    let best: Door | null = null, bd = Infinity;
    for (const p of siteAt(b.x, b.y, b.w, b.h).doors) {
      const near = new Set(this.net.segsNear(p, 6));
      for (const d of this.g.dsegs) {
        if (!d || !d.lanes.length || !near.has(d.seg)) continue;
        const h = norm(sub(d.to, d.from)), toC = sub(c, p), side = dot(perp(h), toC);
        if (!d.seg.cls.oneway && (Math.abs(side) > 1e-6 ? side <= 0 : dot(h, toC) <= 0)) continue;
        const ln = this.g.lanes[d.lanes[d.lanes.length - 1]!]!;
        if (ln.len < 6) continue;
        const p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, u = norm({ x: ln.pts[2]! - p0.x, y: ln.pts[3]! - p0.y });
        const s = Math.min(ln.len - 3, Math.max(3, dot(sub(p, p0), u) * MPT));
        laneAt(ln, s, q);
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist < bd) { bd = dist; best = { dseg: d.id, s }; }
      }
    }
    return best;
  }
  /** each visit business's door by id (bizDoor; null: none) */
  private visitDoors(): Map<number, Door | null> {
    const out = new Map<number, Door | null>();
    for (const b of this.businesses) if (BUSINESS[b.type].kind === 'visit') out.set(b.id, this.bizDoor(b));
    return out;
  }
  /** the day's visit plans: each visit business (the ones with no plan yet today) gets its departures (Visits.plan) from the towns' homes, with the
   *  trip times from each town's most populous home's driveway to its door. With a road at a map exit (kerbAt, ENTRY_REACH) the tourists are one
   *  more catchment an exit (no lot: they start at the exit's kerb), drawn by the tourism businesses, the casino and the clubhouse only. Needs the
   *  town centres and a visit business; sets visitDay */
  private planVisits(): void {
    // a range start's driving range is the main thread's (golf/rangebiz.ts RangeSim, plan P24 D2): its golfers drive in and pay there, so the
    // worker plans no range cars (they would book the money twice and vanish at the door)
    const K = this.centres.length, list = this.businesses.filter(b => BUSINESS[b.type].kind === 'visit' && !(b.type === 'range' && this.golf?.start === 'range'));
    if (!K || !list.length) return;
    const dayStart = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    const homes: VisitHome[][] = [], pops: number[] = [], from: number[] = [];
    for (let k = 0; k < K; k++) { homes.push([]); pops.push(0); from.push(-1); }
    for (const b of builtLots(this.town, this.lots)) {
      const k = this.town.townOf(b.lot.key);
      if (b.use === LU.RES && b.pop > 0 && k >= 0 && k < K) homes[k]!.push({ lot: b.lot, town: k, pop: b.pop });
    }
    // a town's trips start at its most populous home's driveway (the dseg it leaves from; -1 none)
    for (let k = 0; k < K; k++) {
      let h: VisitHome | null = null;
      for (const x of homes[k]!) { pops[k]! += x.pop; if (!h || x.pop > h.pop) h = x; }
      const dr = h?.lot ? driveway(h.lot, this.g) : null;
      from[k] = dr ? this.g.lanes[dr.lane]!.dseg : -1;
    }
    // the tourists come in from the map's exits (visitExits: a range start's two, any other game's one highway entry; T092, plan P22 2.2.2): each
    // exit's kerb (within ENTRY_REACH) starts a catchment of its own after the towns, its residents the levels of the tourism businesses, the
    // casino, the stadium and the clubhouse, TOURIST_PER_LEVEL each (every exit draws them all)
    // (a range start's exit kerbs take the lane into the map; the one entry of any other game keeps its kerb as it was)
    const multi = this.visitExits().length > 1 || this.golf?.start === 'range', centre = { x: MAP / 2, y: MAP / 2 };
    const ents = this.visitExits().map(e => this.kerbAt(e, ENTRY_REACH, multi ? centre : undefined)).filter((k): k is NonNullable<typeof k> => k !== null);
    let touristPop = 0;
    if (ents.length) for (const b of this.businesses) {
      const t = BUSINESS[b.type];
      if (t.family === 'tourism' || b.type === 'casino' || b.type === 'stadium' || b.type === 'clubhouse') touristPop += TOURIST_PER_LEVEL * this.bizStats.get(b.id)!.level;
    }
    const tourists = touristPop > 0 ? ents : [], ecs = tourists.map(t => this.compOf(this.g.dsegs[t.dseg]!.seg));
    tourists.forEach((t, i) => { homes.push([{ lot: null, town: K + i, pop: touristPop, drive: { lane: t.lane, s: t.s } }]); pops.push(touristPop); });
    const vb: VisitBiz[] = [], q = this.doorQ;
    for (const b of list) {
      const st = this.bizStats.get(b.id)!, door = this.bizDoor(b), tripMin: number[] = [];
      // the door's point on its lane: where the trip ends (the time to its zone from each town's driveway)
      if (door) { const dd = this.g.dsegs[door.dseg]!; laneAt(this.g.lanes[dd.lanes[dd.lanes.length - 1]!]!, door.s, q); }
      // a town whose roads do not join the door's road sends no one (the zone table's time is to the door's zone, which a road of another
      // component can share)
      const dc = door ? this.compOf(this.g.dsegs[door.dseg]!.seg) : -1;
      for (let k = 0; k < K; k++) {
        if (!door || from[k]! < 0 || this.compOf(this.g.dsegs[from[k]!]!.seg) !== dc) { tripMin.push(Infinity); continue; }
        tripMin.push(this.sim.router.timeTo(from[k]!, zoneOf(q.x, q.y)) / 60);
      }
      // the tourist catchments: only the tourism businesses, the casino and the clubhouse draw tourists, and only from an exit's road on the door's
      // component
      const draws = BUSINESS[b.type].family === 'tourism' || b.type === 'casino' || b.type === 'clubhouse';
      tourists.forEach((t, i) => tripMin.push(draws && door && ecs[i] === dc ? this.sim.router.timeTo(t.dseg, zoneOf(q.x, q.y)) / 60 : Infinity));
      vb.push({ id: b.id, type: BUSINESS[b.type], level: st.level, sat: st.sat, door, tripMin });
    }
    this.visits.plan(dayStart, this.sim.clock, vb, homes, pops, this.visitRnd, promoMul(this.round.cards));    this.visitDay = pops.some(p => p > 0) ? this.budget.dayOf(this.sim.clock) : -1;
  }
  /** the visit cars that left the sim (Sim.visitOut, cleared): each is counted by the visits; an arrival is a sale (the business's price times its party,
   *  booked as business takings) and a visitor; a lost car is a miss */
  private drainVisits(): void {
    const vo = this.sim.visitOut;
    for (let k = 0; k < vo.length; k += 3) {
      const id = vo[k]!, kind = vo[k + 1]!, ratio = vo[k + 2]!;
      this.visits.event(id, kind, ratio);
      const s = this.bizStats.get(id), b = s ? this.businesses.find(x => x.id === id) : undefined;
      if (!s || !b) continue;
      const type = BUSINESS[b.type], r = type.pricePerVisitor * type.party, c = City.mid(b);
      // T147: a lost car is the sale it would have made (red at the business, not charged); a visit's takings float up green there
      if (kind === 1) { s.today.missed++; this.cashAt(c.x, c.y, -r, 1); continue; }
      s.revenue += r; s.today.revenue += r; s.today.visitors++; s.visitors++;
      if (ratio > ON_TIME_RATIO) s.today.late++;
      this.budget.bizIncome(r); this.cashAt(c.x, c.y, r);
    }
    vo.length = 0;
  }
  /** the day's close for the visits: each visit business's counts make its satisfaction move, its xp and level, and a good day; then every business's
   *  today is cleared; then the golf estates sell their lots (see below) */
  private closeVisits(): void {
    const counts = this.visits.endDay();
    for (const b of this.businesses) {
      const s = this.bizStats.get(b.id); if (!s) continue;
      const c = counts.get(b.id);
      if (c) {
        s.sat = satisfactionAfter(s.sat, c.onTime, c.late, c.missed); s.xp += c.onTime; s.level = levelFromXp(s.xp);
        if (s.sat >= GOOD_SAT && c.onTime + c.late > 0) s.goodDays++;
      }
      // a taxi company's good day: enough rides today (its rides are booked as they are made, see bookTaxis)
      if (b.type === 'taxi' && s.today.visitors >= TAXI_GOOD) s.goodDays++;
      s.today = { visitors: 0, late: 0, missed: 0, revenue: 0 };
    }
    // the golf estates' lots: the best golf course (its highest level, with satisfaction at least ESTATE_SAT) sells its level's lots a day, up to
    // ESTATE_LOTS in all; today shows the day's sales (the close's), and the takings are the day's business
    // (a golf course counts only with players on the day closed: a course nobody can reach keeps its starting satisfaction but sells nothing)
    const played = (id: number) => { const c = counts.get(id); return !!c && c.onTime + c.late > 0; };
    const gl = Math.max(0, ...this.businesses.filter(b => b.type === 'golf' && this.bizStats.get(b.id)!.sat >= ESTATE_SAT && played(b.id)).map(b => this.bizStats.get(b.id)!.level));
    for (const b of this.businesses) {
      const s = this.bizStats.get(b.id);
      if (b.type !== 'estate' || !s) continue;
      const n = Math.min(gl, ESTATE_LOTS - s.visitors);
      if (!(n > 0)) continue;
      const r = n * BUSINESS[b.type].pricePerVisitor;
      s.visitors += n; s.today.visitors = n; s.revenue += r; s.today.revenue = r; s.xp += n; s.goodDays++;
      this.budget.bizIncome(r); const c = City.mid(b); this.cashAt(c.x, c.y, r);
    }
  }
  /** the map exits the tourists come in by (planVisits, T092; plan P22 2.2.2): a range start's two (golf.exits, its county road's ends), any
   *  other game's one highway entry (a classic game and an old golf start keep exits = [entry]) */
  private visitExits(): Pt[] { const ex = this.golf?.start === 'range' ? this.golf.exits : undefined; return ex?.length ? ex : [this.ctx.entry]; }
  /** a range start's industrial district (districts.ts grownIndustrialRect): from the town's seed toward the nearer map exit along the road's axis */
  private grownIndustrial(): [number, number, number, number] | null {
    const seed = this.centres[0], ex = this.golf?.exits ?? [];
    if (!seed || !ex.length) return null;
    const near = ex.reduce((a, b) => (Math.hypot(b.x - seed.x, b.y - seed.y) < Math.hypot(a.x - seed.x, a.y - seed.y) ? b : a)), dx = near.x - seed.x, dy = near.y - seed.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
    return grownIndustrialRect(seed, dir, this.golfLand);
  }
  /** the highway entry (tiles) and whether a road is within ENTRY_REACH tiles of it (open: the tourists come in from it, see planVisits) */
  touristEntry(): { x: number; y: number; open: boolean } { return { x: this.ctx.entry.x, y: this.ctx.entry.y, open: this.kerbAt(this.ctx.entry, ENTRY_REACH) !== null }; }

  /** the kerb of a point e (tiles): the outermost LINK lane of the road within reach tiles of e whose centre line is nearest e (as busStopAt, with the reach
   *  given), and e's projection on it, kept BUS_END m clear of its ends: its lane, its dseg, its s (m) and its point (tiles). Null if no road is that near */
  private kerbAt(e: Pt, reach: number, toward?: Pt): { lane: number; dseg: number; s: number; pt: Pt } | null {
    const near = new Set(this.net.segsNear(e, reach));
    let best: { dseg: number; lane: number; s: number; d: number; ln: Lane } | null = null;
    for (const d of this.g.dsegs) {
      if (!d || !d.lanes.length || !near.has(d.seg)) continue;
      const lane = d.lanes[d.lanes.length - 1]!, ln = this.g.lanes[lane];
      if (!ln || ln.kind !== LK.LINK || ln.len < 2 * BUS_END) continue;
      const n = ln.pts.length, p0 = { x: ln.pts[0]!, y: ln.pts[1]! }, p1 = { x: ln.pts[n - 2]!, y: ln.pts[n - 1]! };
      const dist = pointSeg(e, p0, p1);
      if (dist > reach || (best && dist >= best.d)) continue;
      const u = norm(sub(p1, p0));
      // toward (T092: a map exit's kerb): only a lane heading that way (into the map, not off its edge)
      if (toward && dot(u, sub(toward, e)) <= 0) continue;
      best = { dseg: d.id, lane, s: Math.min(ln.len - BUS_END, Math.max(BUS_END, dot(sub(e, p0), u) * MPT)), d: dist, ln };
    }
    if (!best) return null;
    laneAt(best.ln, best.s, this.stopPt);
    return { lane: best.lane, dseg: best.dseg, s: best.s, pt: { x: this.stopPt.x, y: this.stopPt.y } };
  }
  /** the kerb of a business's door: the door of its footprint (siteAt) nearest its kerb (kerbAt, within TAXI_REACH), as that kerb; null if no door has one */
  private doorKerb(b: { x: number; y: number; w: number; h: number }): { lane: number; dseg: number; s: number; pt: Pt } | null {
    let best: { lane: number; dseg: number; s: number; pt: Pt } | null = null, bd = Infinity;
    for (const p of siteAt(b.x, b.y, b.w, b.h).doors) {
      const k = this.kerbAt(p, TAXI_REACH); if (!k) continue;
      const d = Math.hypot(k.pt.x - p.x, k.pt.y - p.y);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  /** the taxi company's dispatcher: its ranks are the company's door kerb (TAXI_FLEET taxis) and the stadium's door kerb (2 taxis, if a stadium stands).
   *  Set up when the company has a kerb (rebuilt when the ranks move: taxiKey), else dropped with its cars. Called after each change of the businesses, the
   *  roads and the tolls. A rebuilt dispatcher takes its cars off the road; the taxis start at their ranks, round-robin as Taxis places them */
  private setupTaxis(): void {
    const co = this.businesses.find(b => b.type === 'taxi'), ranks: Rank[] = [];
    const door = co ? this.doorKerb(co) : null;
    if (door) {
      ranks.push({ id: 0, at: door.pt, capacity: TAXI_FLEET });
      const st = this.businesses.find(b => b.type === 'stadium'), kerb = st ? this.doorKerb(st) : null;
      if (kerb) ranks.push({ id: 1, at: kerb.pt, capacity: 2 });
    }
    const key = ranks.map(r => `${r.at.x.toFixed(2)},${r.at.y.toFixed(2)}`).join(';');
    if (this.taxis && key === this.taxiKey) return;
    this.bookTaxis();
    this.sim.dropTaxis(); this.sim.taxiOut.length = 0;
    this.taxis = null; this.taxiDue = []; this.taxiKey = key;
    if (!ranks.length) return;
    this.taxis = new Taxis(TAXI_SEED, ranks, TAXI_FLEET, (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * MPT / TAXI_V, TAXI_ECON);
    this.taxiAt = []; this.taxiOrd = []; this.taxiCar = []; this.taxiReached = [];
    for (let i = 0; i < TAXI_FLEET; i++) { this.taxiAt.push({ ...ranks[i % ranks.length]!.at }); this.taxiOrd.push(null); this.taxiCar.push(-1); }
    this.taxiMoney = { rev: 0, cost: 0 }; this.taxiServed = 0; this.taxiDay = -1;
  }
  /** books the dispatcher's totals since the last booking: the fares into the treasury (and the company's revenue and today's), the driver and fuel costs
   *  as the upkeep, and the rides served as the company's visitors (and xp) */
  private bookTaxis(): void {
    const T = this.taxis; if (!T) return;
    const st = T.stats(), dRev = st.revenue - this.taxiMoney.rev, dCost = st.costs - this.taxiMoney.cost, dServed = st.served - this.taxiServed;
    this.taxiMoney = { rev: st.revenue, cost: st.costs }; this.taxiServed = st.served;
    const co = this.businesses.find(b => b.type === 'taxi'), s = co ? this.bizStats.get(co.id) : undefined;
    if (dRev > 0) { this.budget.bizIncome(dRev); if (s) { s.revenue += dRev; s.today.revenue += dRev; } }
    if (dCost > 0) this.budget.upkeepLive(dCost);
    // T147: the fares green and the drivers' and fuel costs red at the taxi company
    if (co) { const c = City.mid(co); if (dRev > 0) this.cashAt(c.x, c.y, dRev); if (dCost > 0) this.cashAt(c.x, c.y, -dCost); }
    if (s && dServed > 0) { s.visitors += dServed; s.today.visitors += dServed; s.xp += dServed; }
  }
  /** the day's taxi requests (once a game day, with the taxis): n = round(TAXI_RATE / 1000 * residents) parties, each from a built home (by population) to
   *  a visit business's door (half of them, when one has a door) or else to a home of another town (by population); its time uniform in the hours 7 to 24
   *  of the day (none before now) and its party 1 to 3; only homes and doors on the road network of the company's rank. A home's point is its driveway's (as the visit cars leave from there: a lot's centre is too far from
   *  the road for a kerb, TAXI_REACH). Sorted by time into taxiDue */
  private planTaxis(): void {
    this.taxiDay = this.budget.dayOf(this.sim.clock);
    this.taxiDue = [];
    // only rides the taxis can drive: homes and doors on the road network of the company's rank (towns start unjoined)
    const co = this.businesses.find(b => b.type === 'taxi'), rk = co ? this.doorKerb(co) : null, rc = rk ? this.compOf(this.g.dsegs[rk.dseg]!.seg) : -2;
    const homes: { town: number; pop: number; at: Pt }[] = [], q = this.doorQ;
    for (const b of builtLots(this.town, this.lots)) {
      if (b.use !== LU.RES || !(b.pop > 0)) continue;
      const dr = driveway(b.lot, this.g); if (!dr || this.compOf(this.g.dsegs[this.g.lanes[dr.lane]!.dseg]!.seg) !== rc) continue;
      laneAt(this.g.lanes[dr.lane]!, dr.s, q);
      homes.push({ town: this.town.townOf(b.lot.key), pop: b.pop, at: { x: q.x, y: q.y } });
    }
    if (!homes.length) return;
    const doors: Pt[] = [];
    for (const b of this.businesses) {
      if (BUSINESS[b.type].kind !== 'visit') continue;
      const d = this.bizDoor(b); if (!d || this.compOf(this.g.dsegs[d.dseg]!.seg) !== rc) continue;
      const dd = this.g.dsegs[d.dseg]!;
      laneAt(this.g.lanes[dd.lanes[dd.lanes.length - 1]!]!, d.s, q);
      doors.push({ x: q.x, y: q.y });
    }
    // a home by population (of the list given)
    const pick = <H extends { pop: number }>(list: H[]): H => {
      let tot = 0; for (const h of list) tot += h.pop;
      let x = this.taxiRnd() * tot;
      for (const h of list) { x -= h.pop; if (x < 0) return h; }
      return list[list.length - 1]!;
    };
    const dayStart = Math.floor(this.sim.clock / GAME_DAY) * GAME_DAY;
    const n = Math.round(TAXI_RATE / 1000 * this.town.pop), due: { t: number; from: Pt; to: Pt; people: number }[] = [];
    for (let i = 0; i < n; i++) {
      const from = pick(homes);
      let to: Pt;
      if (doors.length && this.taxiRnd() < 0.5) to = doors[Math.floor(this.taxiRnd() * doors.length)]!;
      else { const others = homes.filter(h => h.town !== from.town); to = pick(others.length ? others : homes).at; }
      const t = dayStart + (7 + this.taxiRnd() * 17) * 60, people = 1 + Math.floor(this.taxiRnd() * 3);
      if (t < this.sim.clock) continue;
      due.push({ t, from: from.at, to, people });
    }
    due.sort((a, b) => a.t - b.t);
    this.taxiDue = due;
  }
  /** the taxi company's step (the round free, after the visits): the day's requests are planned, the due ones posted, the dispatcher steps on the taxis that
   *  reached their targets, its totals are booked, and each taxi with a new order drives it as a car */
  private stepTaxis(): void {
    const T = this.taxis; if (!T) return;
    if (this.taxiDay < this.budget.dayOf(this.sim.clock)) this.planTaxis();
    while (this.taxiDue.length && this.taxiDue[0]!.t <= this.sim.clock) {
      const d = this.taxiDue.shift()!;
      T.request({ id: this.taxiReq++, from: d.from, to: d.to, people: d.people, t: this.sim.t, maxWait: TAXI_WAIT });
    }
    const reached = this.taxiReached; this.taxiReached = [];
    for (const o of T.step(this.sim.t, reached)) this.taxiOrd[o.taxi] = o;
    this.bookTaxis();
    for (let i = 0; i < TAXI_FLEET; i++) if (this.taxiOrd[i] && this.taxiCar[i]! < 0) this.driveTaxi(i);
  }
  /** drives taxi i's order as a car: spawned at its kerb (taxiAt) bound for the order's kerb (kerbAt). A taxi with no kerb at either end, or whose destination
   *  is on its own dseg just behind it, is there at once (reached at the next dispatch step). A car with no room on the kerb waits for the next step; a car
   *  lost at once was logged by the sim in taxiOut (drainTaxis reaches the taxi) */
  private driveTaxi(i: number): void {
    const o = this.taxiOrd[i]!, from = this.kerbAt(this.taxiAt[i]!, TAXI_REACH), to = this.kerbAt(o.to, TAXI_REACH);
    if (!from || !to || (from.dseg === to.dseg && to.s <= from.s + 5)) {
      this.taxiAt[i] = { x: o.to.x, y: o.to.y }; this.taxiOrd[i] = null; this.taxiReached.push(i); return;
    }
    const slot = this.sim.spawnAt(from.lane, from.s, to.dseg, to.s, 0, -1, -1, -1, i);
    if (slot >= 0) this.taxiCar[i] = slot;
  }
  /** the taxi cars that left the sim (Sim.taxiOut, cleared): a taxi whose car arrived or was lost is at its order's point, its order done, and it is reached
   *  at the next dispatch step. Discarded with no taxis */
  private drainTaxis(): void {
    const to = this.sim.taxiOut;
    if (this.taxis) for (let k = 0; k < to.length; k += 2) {
      const i = to[k]!, o = this.taxiOrd[i];
      if (!o) continue;
      this.taxiAt[i] = { x: o.to.x, y: o.to.y }; this.taxiOrd[i] = null; this.taxiCar[i] = -1; this.taxiReached.push(i);
    }
    to.length = 0;
  }

  /** the town lays a gravel extension when it is short of land: at most once per game hour, and not while the last one is out
   *  (no net ops back yet: the next net batch clears it, and so does an hour, in case the engine skipped it). With towns, at most one
   *  every GRAVEL_EVERY_H game hours (growAt: the last one laid) */
  private planGrow(): Leg[] | null {
    const cls = this.cls;
    if (!cls) return null;
    // a range start's grown town plans every GROWN_PLAN_H game hours (T090: one leg an hour leaves its growth short of land from year 8)
    const period = (this.golf?.start === 'range' ? GROWN_PLAN_H : 1) * GAME_HOUR, h = Math.floor(this.sim.clock * this.growSpeed / period);
    // a range start's first street rolls out at the first growth hour (plan P22 2.8: about 60 s in at 1x, with the first house frame), not at once
    if (this.golf?.start === 'range' && this.sim.clock * this.growSpeed < GAME_HOUR) return null;
    if (h === this.planHour) return null;
    this.planHour = h;
    if (this.pendingGrow && this.sim.clock - this.growAt < period / this.growSpeed) return null;
    const K = this.centres.length, k = K ? this.planHour % K : 0, grown = this.golf?.start === 'range';
    // with towns a leg every GRAVEL_EVERY_H game hours; a range start's grown town a leg every game hour (plan P22 2.3.3, T091)
    if (K && !grown && this.sim.clock - this.growAt < GRAVEL_EVERY_H * GAME_HOUR / this.growSpeed) return null;
    const c: RoadPlanCtx = K
      ? { net: this.net, lots: this.lots, town: this.town, cls, entry: this.centres[k]!, rnd: this.planRnd, centre: grown ? this.anchoredCentre(k) : this.townCentre(k), built: this.town.builtK[k], blocked: this.blocked, towns: true }
      : { net: this.net, lots: this.lots, town: this.town, cls, entry: this.ctx.entry, rnd: this.planRnd };
    // every golf game counts only the lots that can build (not on golf land: they stalled the growth); a range start's legs keep their room from
    // the golf land (a leg's midpoint within GOLF_ROOM tiles of it scores GOLF_ROOM more: the town grows away from the land the player may buy)
    if (this.golf && this.golfLand.length) c.canBuild = l => !this.reserved(l);
    if (grown && this.golfLand.length) c.penalty = mid => (this.golfLand.some(([gx, gy, gw, gh]) => Math.hypot(Math.max(gx - mid.x, 0, mid.x - gx - gw), Math.max(gy - mid.y, 0, mid.y - gy - gh)) < GOLF_ROOM) ? GOLF_ROOM : 0);
    if (!needsLand(c)) { this.growStats.enough++; return null; }
    const legs = planExtension(c);
    if (!legs) { this.growStats.none++; return null; }
    this.growStats.legs++;
    this.pendingGrow = true; this.growAt = this.sim.clock;
    return legs;
  }
}
