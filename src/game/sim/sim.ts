// The traffic simulation core: IDM car following on the lane graph, vehicles in fixed slots. Pure TS, no DOM.
// Hot paths (step, writeFrame) are allocation-free; plans are only built when a vehicle picks a movement.
import { mulberry } from '../iso';
import { CAR } from './idm';
import { Drivers, accACC, idm, iidm } from '../ext/drivers';
import { CTL, LK, type Lane, type LaneGraph, type Movement, type SignalPlan, laneAt, nearestLink } from './lanes';
import { MIN_GREEN, SIG, demandElsewhere, fixedToRed, phaseState, stepSignals } from './signals';
import { Router } from './routing';
import { LotTrips, Trips, demandAt, type Built } from './trips';
import { LU } from '../lots/town';
import type { Node } from '../network';
import { ALIGHT_S, BOARD_S, BUS_LEN, ENTRY_Q, ENTRY_S, MAX_DWELL, MIN_DWELL, SERVICE_S } from '../event/config';
import type { BusRoute } from '../event/bus';

/** seconds per step */
export const DT = 0.1;
/** steps per sim second (1 / DT): the clock is kept as whole steps over this, so whole seconds are exact */
const PER_S = Math.round(1 / DT);
/** metres searched ahead along the plan for a leader and for a plan end */
export const LOOKAHEAD = 150;
/** vehicle types (the renderer's sprite sets): length in metres. 0 to 4 are the random car types (spawnAt draws among CAR_TYPES of them); the last is the shuttle bus */
export const VTYPES = [{ len: 4.5 }, { len: 5.5 }, { len: 5.5 }, { len: 5.3 }, { len: 5.3 }, { len: BUS_LEN }];
/** the random car types: the first CAR_TYPES of VTYPES */
const CAR_TYPES = 5;
/** the shuttle bus's vehicle type (the last of VTYPES) */
export const BUS_VT = VTYPES.length - 1;

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
/** a trip still on the road after this many sim seconds is abandoned (the driver gives up; a gridlock drains instead of piling up) */
const ABANDON = 1200;
/** lane changes (MOBIL): evaluated every MOBIL_EVERY steps, and the lane ends kept clear, metres (politeness and threshold are per driver: Sim.drivers) */
const MOBIL_EVERY = 5, MOBIL_START = 10, MOBIL_END = 15;
/** an obstacle (Sim.blocks) this close ahead on its lane makes a free neighbour lane worth a change (MOBIL); no car is spawned this close behind one */
const BLOCK_NEAR = 150, BLOCK_SPAWN = 50;
/** the driver mix of the sim's traffic (ext/drivers): shares of aggressive and cautious drivers, and of trucks (none until there is truck art) */
export const DRIVER_MIX = { aggressive: 0.15, cautious: 0.15, truckShare: 0 };
/** a signal lets a vehicle on only if it reaches the line this many seconds before the phase turns red, s */
const SIG_MARGIN = 0.5;
/** a roundabout entry or inner exit gives way to ring traffic that is within this many metres of the crossing (standing or not), plus 4 s of its travel */
const RING_GAP = 10;
/** a roundabout exit waits while a car on the ring lane it leaves from has its rear within this many metres of the point it diverges */
const DIVERGE = 6;
/** a ring exit's gap to a car coming on an outer ring lane it crosses: s at its speed, and m at least (4 s / 10 m: no overlaps on the
 *  bench at 600 veh/h per arm; 2 s / 6 m let cars touch) */
const EXIT_GAP = 4, EXIT_MIN = 10;
/** a dseg shorter than this (m) leaves too little room to change lanes on it: the movement at its end is chosen one junction early (Sim.ahead),
 *  so the lane before it is picked for both (a short last piece of an arterial before a ring let no car reach the ring lane its exit needs:
 *  they went round the inner ring, out and back; the owner's 2-lane ring, 2026-10-19) */
const LOOK = 80;
/** the queue of the junction ahead: the last this many metres of a LINK lane (Sim.lossQ) */
const QUEUE_M = 100;
/** a copy of a Float64Array a in one of length m (the per-lane sums keep their values when the lists grow) */
const grow64 = (a: Float64Array, m: number) => { const b = new Float64Array(m); b.set(a); return b; };
/** the free-flow ratio of a trip (its time over its ideal time, see Sim.score). Measured (output/calib, random mode) on a 10 x 10 street
 *  grid with 50 cars, the mean ratio over the arrivals after one game hour: 1.213 (seeds 1 to 3: 1.217, 1.211, 1.211). With 600 cars
 *  (congested) it is 3.31. access = ratio / FREE reads about 1.0 in free flow; 1.3 and 1.8 are 30% and 80% over it. */
export const FREE = 1.213;
/** the (decayed) number of trips a zone needs before its access counts in full */
export const ACCESS_N = 12;

/** a car park's entrance on a dseg: the vehicles bound for it stop at s metres (a sink, see Sim.setSinks); park is its index in Sim.parks, next the sim time it admits the next car.
 *  q is its entry queue, off the road (FIFO): each waiting car's party town (-1 none), qz its origin zone; both are drained by Sim.drain.
 *  A park has one sink per direction of its frontage road; they share the park's bays (Sim.queuedAt). ux, uy: the dseg's unit direction (City.sinksAt) */
export interface Sink { park: number; dseg: number; s: number; next: number; q: number[]; qz: number[]; ux?: number; uy?: number }
/** a car park's counts: its bays, the cars parked, and the cars turned away (found it full) */
export interface ParkState { bays: number; parked: number; turned: number }

/** a vehicle as the inspector shows it (Sim.inspect): its point, speed and lane limit (m/s), its origin and destination points (tiles),
 *  its trip and ideal times so far (s), the destination's use (LU, 0 = none), and its route ahead as flat tile points [x, y, ...] */
export interface CarInfo { slot: number; x: number; y: number; v: number; vmax: number; ox: number; oy: number; dx: number; dy: number; tripS: number; idealS: number; tag: number; path: number[] }

/** The vehicles of one graph. Slot i is one vehicle while alive[i] is 1; the lists hold the vehicles of each lane, front first. */
export class Sim {
  g: LaneGraph; t = 0; steps = 0; cap: number; active = 0;
  /** the offset of the game clock from t, s (on the DT grid): clock = t + shift. Zero unless the clock was frozen (see freezeAt) */
  shift = 0;
  /** true while the clock is frozen: each step takes DT off shift, so the clock stands still while t (the physics) runs on */
  frozen = false;
  alive: Uint8Array; lane: Int32Array; s: Float64Array; v: Float32Array; acc: Float32Array; len: Float32Array;
  vtype: Uint8Array; v0f: Float32Array; lat: Float32Array;
  move: Int32Array; plan: (number[] | null)[]; pi: Int16Array;
  stuck: Float32Array;
  /** junction control per slot: the connector granted (-1), the lane where its room is reserved (-1), seconds waiting at a line,
   *  1 once stopped at a line, the movement it wants at the end of its lane (-1 = none) */
  grant: Int32Array; resv: Int32Array; wait: Float32Array; stopped: Uint8Array; want: Int32Array;
  /** the movement chosen early at the end of the next dseg when that one is short (see LOOK; -1 none) */
  ahead: Int32Array;
  /** routing per slot: the destination dseg (-1 = none, a random walk), metres along it, the dsegs still to take (null = none),
   *  the junction decisions in a row that found no finite cost */
  dest: Int32Array; destS: Float64Array; route: (number[] | null)[]; noRoute: Uint8Array;
  router = new Router();
  /** per lane: slots granted into it and not yet on it; metres reserved on it by grants */
  granted: number[][] = []; resvLen = new Float64Array(0);
  /** per lane: vehicle slots on it, front first (largest s first) */
  onLane: number[][] = [];
  /** the signal plans of the graph (set in onGraph), stepped each step */
  plans: SignalPlan[] = [];
  /** true: the signals run the fixed-time reference cycle (the A/B baseline) instead of the actuated rules */
  fixedSignals = false;
  target = 0;
  /** true: fill() aims at round(target * demandAt(t)) (the daily profile); arrivals bring the count down on their own */
  profile = false;
  rnd: () => number;
  /** per slot driver parameters (ext/drivers): desired speed factor, headway, acceleration, braking, jam gap, MOBIL politeness and threshold;
   *  drawn from their own seeded stream at spawn (spawnAt, buses) */
  readonly drivers: Drivers;
  stats = { spawned: 0, respawned: 0, stepMs: 0, towed: 0, throughput: 0, laneChanges: 0, arrived: 0, lost: 0, throttled: 0, tableMs: 0, tables: 0, dropped: 0, ratioSum: 0, ratioN: 0, abandoned: 0 };
  /** trade since the sim started: trips that arrived at a non-RES lot (the destination's use tag >= LU.COM), and the sum of their
   *  punctuality min(1, FREE * ideal / actual): 1 is on time, less is late */
  trade = { arrived: 0, punctual: 0 };
  /** per lane, decaying sums (halved every game hour in relax(), so a steady rate r per game hour reads r / ln 2): vehicle-seconds
   *  lost on the lane away from its end (lossL: the shortfall of the speed under 90% of the limit, per step times DT), vehicle-seconds
   *  lost within QUEUE_M m of a LINK lane's end (lossQ: the queue of the junction ahead), and the vehicles that entered the lane */
  lossL = new Float64Array(0); lossQ = new Float64Array(0); enterL = new Float64Array(0);
  /** vehicle-seconds lost since the sim started: the sum of every loss added to lossL and lossQ, never decayed (the game hours' snapshots read it, see HourStat) */
  lostTotal = 0;
  /** standing obstacles by lane id: the positions s (m) of the stretches incidents block (addBlock). A car brakes for the nearest one ahead of it on its
   *  lane, or on its next lane within LOOKAHEAD, as for a booth line; a car is not towed while one holds it (tow) */
  blocks = new Map<number, number[]>();
  /** rubbernecking slow zones by lane id (setSlow): a car at s within [from, to] drives at factor of its desired speed there */
  slow = new Map<number, { from: number; to: number; factor: number }[]>();
  /** where new trips start and end (origins, destinations by zone) */
  trips: Trips;
  /** 'random': the target count with random trips (the bench, the gate, the tests); 'lots': the built lots' trips, no target (lotTrips) */
  mode: 'random' | 'lots' = 'random';
  lotTrips: LotTrips;
  /** access per zone (16 x 16, row-major): the trips that start or end there, sum of actual times over sum of ideal times, over FREE.
   *  The sums decay by half every game hour, so it follows the last few hours; with little evidence (decayed trip count under
   *  ACCESS_N) it is pulled toward 1, so a handful of slow trips in a young town cannot redden a district */
  access = new Float32Array(256).fill(1);
  /** per zone: finished trips since the last game hour; per slot: spawn time (s), ideal time (s: the lanes driven at their speed limit,
   *  less the spawn lane's part before the spawn), origin zone */
  private hits = new Uint32Array(256); private aH = 0;
  /** per zone, decaying sums: actual seconds, ideal seconds, trips */
  private actS = new Float64Array(256); private idlS = new Float64Array(256); private nS = new Float64Array(256);
  private t0: Float64Array; private ideal: Float64Array; private oz: Uint8Array;
  /** per slot: the sink (index into sinks) the vehicle is bound for, -1 none (the car park's entrance, see spawnAt) */
  sink: Int16Array;
  /** per slot: the surge party the car belongs to (its town index), -1 none (see spawnAt); a party car that leaves the sim logs its exit in partyOut
   *  as the pair [town, kind]: kind 0 parked, 1 turned away, 2 lost (see out). The City reads and clears partyOut each step */
  party: Int8Array; partyOut: number[] = [];
  /** per slot: the shuttle route the bus drives (its index in busRoutes; -1 none), its leg (0 to the doors stop, 1 to the lot stop), its fans on board,
   *  the seconds it has dwelt at its stop, and the seconds of its current boarding or alighting (see busStep) */
  bus: Int16Array; busLeg: Uint8Array; busLoad: Int32Array; busDwell: Float32Array; busBoard: Float32Array;
  /** per bus slot: the key of its lane, and its point (tiles) as buses() last saw it: after a graph update a bus whose lane is gone or rebuilt
   *  (another key) moves to the nearest link lane to that point (see busHome) */
  busKey: string[]; busX: Float64Array; busY: Float64Array;
  /** the shuttle routes by index (null: a route with no stops on the network), the fans waiting at each route's lot stop (the City keeps them; a boarding
   *  takes them here), the buses alive, and the boardings and alightings since the City last cleared them as quads [slot, route, kind, count]: kind 0
   *  boarded, 1 alighted, 2 lost with its fans on board (the City requeues them). The City reads and clears busEv each step */
  busRoutes: (BusRoute | null)[] = []; busWait: number[] = []; busEv: number[] = []; busN = 0;
  /** the party cars that parked since the City last cleared it, as triples [town, park, bay]: the City starts their fans walking from the bay */
  partyBays: number[] = [];
  /** the seconds an entrance holds for each car it admits (ENTRY_S; the Express entry card shortens it: see City.applyCards) */
  entryS = ENTRY_S;
  /** the car park entrances (sinks, set by setSinks) and the car parks' counts (parks[k] for sink.park k) */
  sinks: Sink[] = []; parks: ParkState[] = [];
  /** per slot: 1 once the vehicle has paid at a toll booth (or passed its line unserved, see accelerate), 0 while it is still to pay; dwell: the
   *  seconds it has stood within 2 m of its booth's line, slower than 0.5 m/s */
  paid: Uint8Array; dwell: Float32Array;
  /** the toll cars served since the City last cleared it (the City books them, see City.step) */
  tolls = 0;
  /** per lane: vehicles bound for it as a toll booth lane (planned onto it, not yet on it: see planFrom); per slot: the booth lane it is bound to (-1 none) */
  private bound = new Int32Array(0); private boundTo: Int32Array;
  /** the admissions since the City last cleared it: pairs [park, origin zone] for each car parked (the City clears it each step) */
  parkedNow: number[] = [];
  /** per slot: the use (LU) of the destination lot, 0 = none (a trip not to a lot) */
  private tag: Uint8Array;
  /** per slot: the tile point the vehicle spawned at (ox, oy), and its destination point (dX, dY; cached by setDest) */
  private ox: Float32Array; private oy: Float32Array; private dX: Float32Array; private dY: Float32Array;
  /** the junction watched (setWatch; null = none) and a ring of its last 256 crossings, 4 floats each (origin x, y, destination x, y);
   *  watchN counts the crossings since the watch was set */
  watchNode: Node | null = null; watchLog = new Float32Array(4 * 256); watchN = 0;
  /** a scratch lane position (allocation-free) */
  private pt = { x: 0, y: 0, hx: 0, hy: 0 };
  /** a scratch destination point (allocation-free; see destPt) */
  private dp = { x: 0, y: 0, hx: 0, hy: 0 };
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
  /** per lane: the booth line of a toll booth lane (metres), -1 for any other lane */
  private lBooth = new Float64Array(0);
  /** per lane: 1 = a LINK lane (a road lane, not a junction connector or ring arc) */
  private lLink = new Uint8Array(0);
  /** per lane: 1 = a LINK lane or a slip flare-1 lane (an approach or slip body: the vehicles before the gate); the node lanes after it are not */
  private lPre = new Uint8Array(0);
  /** per lane: 1 = a node lane that merges with others into its next lane (vehicles there follow the mergers ahead of them) */
  private lMerge = new Uint8Array(0);
  /** lanes whose front vehicle passed the end this step (deduped by `overMark`) */
  private over: number[] = []; private overMark = new Uint8Array(0);
  /** the live heat per dseg id, updated once per sim second (heatTick): the EMA (about 5 s) of the mean of v / lane vmax over the vehicles on
   *  its lanes, relaxing to 1 when it is empty; the EMA of its density (vehicles per km per lane). heatVersion is bumped when the dseg list changes (onGraph) */
  heatRatio = new Float32Array(0); heatDens = new Float32Array(0); heatVersion = 0;
  /** the heat's bookkeeping: the key and lane count of each dseg id at the last onGraph, and the per-second sums of v / vmax and counts per dseg id */
  private hKey: string[] = []; private hNL: number[] = []; private hSum = new Float64Array(0); private hCnt = new Uint32Array(0);

  /** an empty sim of cap vehicle slots on graph g; call onGraph() after every graph update */
  constructor(g: LaneGraph, cap: number, seed: number) {
    this.g = g; this.cap = cap; this.rnd = mulberry(seed);
    this.drivers = new Drivers(seed * 7919 + 13, DRIVER_MIX); this.drivers.ensure(cap);
    this.alive = new Uint8Array(cap); this.lane = new Int32Array(cap); this.s = new Float64Array(cap);
    this.v = new Float32Array(cap); this.acc = new Float32Array(cap); this.len = new Float32Array(cap);
    this.vtype = new Uint8Array(cap); this.v0f = new Float32Array(cap); this.lat = new Float32Array(cap);
    this.move = new Int32Array(cap).fill(-1); this.plan = new Array<number[] | null>(cap).fill(null);
    this.pi = new Int16Array(cap); this.stuck = new Float32Array(cap); this.vg = new Float64Array(cap).fill(Infinity);
    this.grant = new Int32Array(cap).fill(-1); this.resv = new Int32Array(cap).fill(-1); this.want = new Int32Array(cap).fill(-1); this.ahead = new Int32Array(cap).fill(-1);
    this.wait = new Float32Array(cap); this.stopped = new Uint8Array(cap);
    this.dest = new Int32Array(cap).fill(-1); this.destS = new Float64Array(cap); this.route = new Array<number[] | null>(cap).fill(null);
    this.noRoute = new Uint8Array(cap);
    this.trips = new Trips(this.rnd);
    this.lotTrips = new LotTrips(this.rnd);
    this.t0 = new Float64Array(cap); this.ideal = new Float64Array(cap); this.oz = new Uint8Array(cap); this.tag = new Uint8Array(cap);
    this.ox = new Float32Array(cap); this.oy = new Float32Array(cap); this.dX = new Float32Array(cap); this.dY = new Float32Array(cap);
    this.sink = new Int16Array(cap).fill(-1); this.party = new Int8Array(cap).fill(-1);
    this.paid = new Uint8Array(cap); this.dwell = new Float32Array(cap); this.boundTo = new Int32Array(cap).fill(-1);
    this.bus = new Int16Array(cap).fill(-1); this.busLeg = new Uint8Array(cap); this.busLoad = new Int32Array(cap); this.busDwell = new Float32Array(cap); this.busBoard = new Float32Array(cap);
    this.busKey = new Array<string>(cap).fill(''); this.busX = new Float64Array(cap); this.busY = new Float64Array(cap);
    this.onGraph();
  }

  /** after g.update(net): grow the lane lists, rebuild the spawn table and the routing graph, re-plan or respawn vehicles on
   *  changed lanes; routes are dropped, and a vehicle whose destination dseg went gets a new one */
  onGraph() {
    const lanes = this.g.lanes;
    this.plans = [...this.g.signals.values()];
    while (this.onLane.length < lanes.length) this.onLane.push([]);
    const n = lanes.length;
    if (this.lLen.length < n) { const m = Math.max(n, this.lLen.length * 2); this.lLen = new Float64Array(m); this.lVmax = new Float32Array(m); this.lGate = new Uint8Array(m); this.lMerge = new Uint8Array(m); this.overMark = new Uint8Array(m); this.lLink = new Uint8Array(m); this.lPre = new Uint8Array(m); this.lossL = grow64(this.lossL, m); this.lossQ = grow64(this.lossQ, m); this.enterL = grow64(this.enterL, m); this.lBooth = grow64(this.lBooth, m); }
    for (let id = 0; id < n; id++) {
      const l = lanes[id]; this.lLen[id] = l ? l.len : 0; this.lVmax[id] = l ? l.vmax : 0; this.lLink[id] = l && l.kind === LK.LINK ? 1 : 0; this.lPre[id] = l && (l.kind === LK.LINK || l.flare === 1) ? 1 : 0;
      this.lBooth[id] = l && l.booth !== undefined ? l.booth : -1;
      // gated: a junction connector from a link lane, an approach lane or a slip body (not a flare lane itself: a slip mouth is gated after its
      // body, a departure lane is not), a roundabout exit (it waits for a ring car that crosses or merges, and for a car just past its
      // diverge), and no ring arc (ring traffic never waits for an entry)
      this.lMerge[id] = l && l.kind !== LK.LINK && l.next.length === 1 && (lanes[l.next[0]]?.prev.length ?? 0) > 1 ? 1 : 0;
      this.lGate[id] = l && l.kind === LK.CONN && !l.flare && l.prev.length && (lanes[l.prev[0]]?.kind === LK.LINK || lanes[l.prev[0]]?.kind === LK.RING || lanes[l.prev[0]]?.flare === 1) ? 1 : 0;
    }
    // the booth bindings: recounted over the lanes as they are now (a binding to a lane that is gone, or no booth, is dropped)
    if (this.bound.length < n) this.bound = new Int32Array(Math.max(n, 2 * this.bound.length));
    this.bound.fill(0);
    for (let i = 0; i < this.cap; i++) {
      const b = this.boundTo[i]!;
      if (b < 0) continue;
      if (!this.alive[i] || b >= n || this.lBooth[b]! < 0) this.boundTo[i] = -1; else this.bound[b]!++;
    }
    // the losses of the lanes this update freed or rebuilt (lane ids) start again
    for (const id of this.g.removed) if (id < n) { this.lossL[id] = 0; this.lossQ[id] = 0; this.enterL[id] = 0; }
    for (const id of this.g.changed) if (id < n) { this.lossL[id] = 0; this.lossQ[id] = 0; this.enterL[id] = 0; }
    // grants and reservations do not survive a graph update: the vehicles are re-planned or respawned below
    while (this.granted.length < n) this.granted.push([]);
    for (const q of this.granted) q.length = 0;
    if (this.resvLen.length < n) this.resvLen = new Float64Array(Math.max(n, 2 * this.resvLen.length));
    this.resvLen.fill(0); this.grant.fill(-1); this.resv.fill(-1);
    for (const q of this.onLane) q.length = 0;
    this.heatGraph();
    this.trips.onGraph(this.g); this.lotTrips.onGraph(this.g);
    this.router.onGraph(this.g);
    let pending = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.route[i] = null; this.ahead[i] = -1;
      const bus = this.bus[i]! >= 0;
      // a bus is kept on its lane (or moved to the nearest one) and planned to its stop again (busHome); only a bus whose route is gone is removed (its fans logged)
      if (bus && !this.busHome(i)) { this.free(i); continue; }
      const id = this.lane[i], ln = lanes[id] ?? null;
      if (!ln) { this.out(i, 2); this.free(i); this.stats.respawned++; pending++; continue; }
      const s = this.s[i];
      this.s[i] = s < 0 ? 0 : s > ln.len ? ln.len : s;
      if (!bus && this.dest[i] >= 0 && this.router.gone(this.dest[i]!)) this.retarget(i);
      if (!this.valid(i)) {
        if (ln.kind === LK.LINK) { if (!this.pickMove(i)) continue; }
        else if (ln.next.length) { this.unbind(i); this.plan[i] = this.chain(id); this.pi[i] = 0; }
        else { this.out(i, 2); this.free(i); this.stats.respawned++; if (!bus) pending++; continue; }
      }
      this.onLane[id].push(i);
    }
    for (const q of this.onLane) if (q.length > 1) q.sort((a, b) => this.s[b] - this.s[a]);
    for (let k = 0; k < pending; k++) this.spawn();
  }

  /** the heat arrays follow the dseg list: a dseg id whose key or lane count changed (or that is new) starts neutral (ratio 1, density 0),
   *  and any change bumps heatVersion */
  private heatGraph() {
    const g = this.g, nD = g.dsegs.length, N = Math.max(nD, this.hKey.length);
    if (this.heatRatio.length < N) {
      const m = Math.max(N, 2 * this.heatRatio.length), r = new Float32Array(m).fill(1), e = new Float32Array(m);
      r.set(this.heatRatio); e.set(this.heatDens);
      this.heatRatio = r; this.heatDens = e; this.hSum = new Float64Array(m); this.hCnt = new Uint32Array(m);
    }
    let bump = false;
    for (let d = 0; d < N; d++) {
      const dg = g.dsegs[d] ?? null, k = dg ? dg.key : '', nl = dg ? dg.lanes.length : 0;
      if (this.hKey[d] === k && this.hNL[d] === nl) continue;
      bump = true; this.hKey[d] = k; this.hNL[d] = nl; this.heatRatio[d] = 1; this.heatDens[d] = 0;
    }
    if (bump) this.heatVersion++;
  }

  /** the 1 s heat update (every 10 steps, from step): per dseg, over the vehicles on its LINK lanes, the mean of v / lane vmax and the count;
   *  the ratio moves toward the mean by 0.2 (an EMA of about 5 s), or toward 1 when it is empty; the density moves toward n / (km x lanes) */
  private heatTick() {
    const g = this.g, nD = g.dsegs.length, Q = this.onLane, V = this.v, lanes = g.lanes, S = this.hSum, C = this.hCnt, R = this.heatRatio, D = this.heatDens;
    S.fill(0, 0, nD); C.fill(0, 0, nD);
    for (let id = 0; id < Q.length; id++) {
      const q = Q[id]!;
      if (!q.length || !this.lLink[id]) continue;
      const ln = lanes[id]; if (!ln) continue;
      const d = ln.dseg, vm = this.lVmax[id]!;
      for (const i of q) { S[d]! += V[i]! / vm; C[d]!++; }
    }
    for (let d = 0; d < nD; d++) {
      const dg = g.dsegs[d]; if (!dg) continue;
      const n = C[d]!, per = dg.len / 1000 * dg.lanes.length;
      R[d] = n ? R[d]! + 0.2 * (S[d]! / n - R[d]!) : R[d]! + 0.2 * (1 - R[d]!);
      D[d] = D[d]! + 0.2 * ((per > 0 ? n / per : 0) - D[d]!);
    }
  }

  /** the heat map's geometry, 6 floats per dseg id: from x, y and to x, y (tiles), the lateral offset (tiles) of the centre of its lanes
   *  along perp(direction), the side its lanes are on, and its lane count; NaN for a dead id. A new array each call (on a heatVersion change) */
  heatGeometry(): Float32Array {
    const g = this.g, nD = g.dsegs.length, out = new Float32Array(6 * nD).fill(NaN);
    for (let d = 0; d < nD; d++) {
      const dg = g.dsegs[d]; if (!dg) continue;
      const fx = dg.from.x, fy = dg.from.y, tx = dg.to.x, ty = dg.to.y, L = Math.hypot(tx - fx, ty - fy) || 1;
      const rx = -(ty - fy) / L, ry = (tx - fx) / L;
      let off = 0, k = 0;
      for (const id of dg.lanes) { const ln = g.lanes[id]; if (!ln) continue; off += (ln.pts[0]! - fx) * rx + (ln.pts[1]! - fy) * ry; k++; }
      const o = 6 * d;
      out[o] = fx; out[o + 1] = fy; out[o + 2] = tx; out[o + 3] = ty; out[o + 4] = k ? off / k : 0; out[o + 5] = dg.lanes.length;
    }
    return out;
  }

  /** vehicle i has paid at its toll booth: counted in tolls (the City books the takings) */
  private serve(i: number) { this.paid[i] = 1; this.tolls++; }
  /** removes vehicle i from its lane and frees its slot */
  despawn(i: number) {
    if (!this.alive[i]) return;
    this.out(i, 2);
    const q = this.onLane[this.lane[i]], k = q.indexOf(i);
    if (k >= 0) q.splice(k, 1);
    this.free(i);
  }

  /** a party car leaves the sim as kind (0 parked, 1 turned away, 2 lost): logged in partyOut as [town, kind]; a car of no party logs nothing. Called before
   *  its slot is freed (despawn logs a lost car; a car is logged once: the party is cleared) */
  private out(i: number, kind: number) { const p = this.party[i]!; if (p >= 0) { this.partyOut.push(p, kind); this.party[i] = -1; } }
  /** removes the surge party's cars without logging them (the round's close) */
  dropParty(): void { for (let i = 0; i < this.cap; i++) if (this.alive[i] && this.party[i]! >= 0) { this.party[i] = -1; this.despawn(i); } }

  /** sets the desired vehicle count (clamped to cap); lowering despawns the highest slots first */
  setTarget(n: number) {
    this.target = Math.max(0, Math.min(this.cap, Math.floor(n)));
    // the buses are not cars: the trim takes cars only (fill aims at the cars the same way)
    for (let i = this.cap - 1; i >= 0 && this.active - this.busN > this.target; i--) if (this.bus[i]! < 0) this.despawn(i);
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

  /** adds one vehicle at s metres on link lane `lane`, heading for `dest` (a dseg; -1 = a random walk) at destS metres along it,
   *  its trip tagged with the destination lot's use (LU; 0 = none), and bound for sink (an index into sinks; -1 = none: a car park
   *  bound vehicle has dest = the sink's dseg and destS = the sink's s); returns its slot, -1 if there is no room on the lane or no
   *  free slot, or -2 if it was lost at once (no route) */
  spawnAt(lane: number, s: number, dest: number, destS: number, tag = 0, sink = -1, party = -1): number {
    const ln = this.g.lanes[lane];
    if (!ln) return -1;
    // a car bound for a sink is refused on its line or past it (it would arrive at once, past a gate that is not held for it)
    if (sink >= 0) { const K = this.sinks[sink]; if (!K || (ln.kind === LK.LINK && ln.dseg === K.dseg && s >= K.s)) return -1; }
    const vt = Math.floor(this.rnd() * CAR_TYPES), L = VTYPES[vt].len;
    if (!this.roomOn(lane, s, L)) return -1;
    // no car starts within BLOCK_SPAWN m behind an obstacle on its lane
    if (this.blocks.size && this.blockAhead(lane, s) <= BLOCK_SPAWN) return -1;
    let i = this.hint;
    while (i < this.cap && this.alive[i]) i++;
    if (i >= this.cap) return -1;
    this.alive[i] = 1; this.lane[i] = lane; this.s[i] = s; this.v[i] = 0.5 * ln.vmax; this.acc[i] = 0;
    // the sim's stream keeps its draw here (the rest stays aligned); the car's v0f comes from its driver
    this.rnd(); this.drivers.assign(i, 'car'); this.v0f[i] = this.drivers.v0f[i]!; this.vtype[i] = vt; this.len[i] = L; this.lat[i] = 0; this.stuck[i] = 0;
    this.grant[i] = -1; this.resv[i] = -1; this.wait[i] = 0; this.stopped[i] = 0;
    this.t0[i] = this.t; this.ideal[i] = -s / ln.vmax; this.oz[i] = this.router.zoneD[ln.dseg]!; this.tag[i] = tag;
    this.dest[i] = dest; this.destS[i] = destS; this.route[i] = null; this.noRoute[i] = 0; this.sink[i] = sink; this.party[i] = party;
    laneAt(ln, s, this.pt); this.ox[i] = this.pt.x; this.oy[i] = this.pt.y; this.setDest(i);
    const q = this.onLane[lane];
    let k = 0; while (k < q.length && this.s[q[k]] > s) k++;
    q.splice(k, 0, i);
    this.hint = i + 1; this.active++; this.stats.spawned++;
    if (!this.pickMove(i)) return -2;
    return i;
  }

  /** the lot trips' buildings: the built lots (see LotTrips.setBuilt); the trips dropped are counted in stats.dropped */
  setBuilt(list: Built[]) { this.stats.dropped += this.lotTrips.setBuilt(list); }
  /** a finished trip (arrival on ln): its ratio, its time over max(ideal, 10 s), over FREE; the EMA of access in its origin zone and in its destination zone */
  private score(i: number, ln: Lane) {
    const ideal = Math.max(this.ideal[i]! + this.s[i]! / ln.vmax, 10), act = Math.min(this.t - this.t0[i]!, 6 * ideal);
    this.stats.ratioSum += act / ideal; this.stats.ratioN++;
    if (this.tag[i]! >= LU.COM) { this.trade.arrived++; this.trade.punctual += Math.min(1, act > 0 ? FREE * ideal / act : 1); }
    this.bump(this.oz[i]!, act, ideal); this.bump(this.router.zoneD[ln.dseg]!, act, ideal);
  }
  /** one trip (actual and ideal seconds, the actual capped at 6x) into zone z's sums, and its access */
  private bump(z: number, act: number, ideal: number) {
    this.actS[z] += act; this.idlS[z] += ideal; this.nS[z] += 1; this.hits[z]++;
    const raw = this.actS[z]! / this.idlS[z]! / FREE, w = Math.min(1, this.nS[z]! / ACCESS_N);
    this.access[z] = 1 + w * (raw - 1);
  }
  /** once per game hour: every zone's sums decay by half (and its access with the weight of its evidence) */
  private relax() {
    const n = this.g.lanes.length;
    for (let id = 0; id < n; id++) { this.lossL[id] *= 0.5; this.lossQ[id] *= 0.5; this.enterL[id] *= 0.5; }
    for (let z = 0; z < 256; z++) {
      this.actS[z] *= 0.5; this.idlS[z] *= 0.5; this.nS[z] *= 0.5; this.hits[z] = 0;
      if (this.idlS[z]! > 0) { const raw = this.actS[z]! / this.idlS[z]! / FREE, w = Math.min(1, this.nS[z]! / ACCESS_N); this.access[z] = 1 + w * (raw - 1); } else this.access[z] = 1;
    }
  }

  /** gives vehicle i a new destination from where it is now */
  private retarget(i: number) {
    // a party car that gets a new destination is no longer counted by the surge: logged as lost
    this.out(i, 2);
    laneAt(this.g.lanes[this.lane[i]]!, this.s[i], this.pt);
    this.dest[i] = this.trips.dest(this.pt.x, this.pt.y); this.destS[i] = this.trips.destS; this.noRoute[i] = 0; this.sink[i] = -1; this.setDest(i);
  }
  /** the destination point of vehicle i (tiles) into dp: the last lane of its destination dseg at destS; with no destination (a random walk), the point it is at */
  private destPt(i: number) {
    const d = this.dest[i]!, ds = d >= 0 ? this.g.dsegs[d] : null, last = ds && ds.lanes.length ? this.g.lanes[ds.lanes[ds.lanes.length - 1]!] : null;
    if (last) laneAt(last, this.destS[i]!, this.dp); else laneAt(this.g.lanes[this.lane[i]]!, this.s[i]!, this.dp);
  }
  /** caches the destination point of vehicle i (dX, dY) once its destination is set (spawnAt, retarget) */
  private setDest(i: number) { this.destPt(i); this.dX[i] = this.dp.x; this.dY[i] = this.dp.y; }
  /** true if no vehicle on lane id is within m metres of s */
  private clearOn(id: number, s: number, m: number): boolean {
    for (const j of this.onLane[id]!) if (Math.abs(this.s[j]! - s) < m) return false;
    return true;
  }

  /** the game clock, s: the time of day and the game day (the town, the budget, the demand curve, the lot trips' hours). Equal to t
   *  unless the clock was frozen; the physics, the trips' ages, the signals and the hourly decay read t */
  get clock(): number { return this.t + this.shift; }
  /** freezes the clock at c (s): shift becomes c - t, on the DT grid; the sim keeps running, and each step takes DT off shift */
  freezeAt(c: number) { this.shift = Math.round((c - this.t) * PER_S) / PER_S; this.frozen = true; }
  /** the clock runs again from where it stopped (shift stays) */
  unfreeze() { this.frozen = false; }

  /** advances the simulation by one DT: accelerations, lane changes, moves, lane transfers, towing, then refills to the target */
  step() {
    const t0 = performance.now();
    stepSignals(this.plans, this.onLane, this.s, this.v, this.lLen, DT, this.fixedSignals, this.t);
    this.accelerate();
    this.changeLanes();
    this.integrate();
    this.transfer();
    this.arrive();
    this.tow();
    if (this.busN) this.buses();
    for (let i = 0; i < this.cap; i++) this.lat[i] *= 0.85;
    // on the DT grid: summing 0.1 drifts (52,380 steps read 52,379.99999), which moved hour and day boundaries a step late
    this.t = Math.round((this.t + DT) * PER_S) / PER_S; this.steps++;
    // a frozen clock: the shift gives back the DT that t just gained, so the clock stands still
    if (this.frozen) this.shift = Math.round((this.shift - DT) * PER_S) / PER_S;
    this.router.tick(this);
    if (this.steps % 10 === 0) this.heatTick();
    const H = Math.floor(this.t / 60);
    if (H !== this.aH) { this.aH = H; this.relax(); }
    if (this.mode === 'lots') this.lotTrips.step(this); else this.fill();
    this.stats.stepMs = performance.now() - t0;
  }

  /** an obstacle on lane at s metres (a crash or a breakdown, from the incidents): the cars behind it stop short of it and change lanes off it when
   *  they can; no vehicle is spawned within BLOCK_SPAWN m behind it. Cheap: a list per lane */
  addBlock(lane: number, s: number): void { const b = this.blocks.get(lane); if (b) b.push(s); else this.blocks.set(lane, [s]); }
  /** lifts the obstacle at s on lane (the one addBlock placed); the traffic behind it moves on */
  removeBlock(lane: number, s: number): void {
    const b = this.blocks.get(lane); if (!b) return;
    const k = b.indexOf(s); if (k >= 0) b.splice(k, 1);
    if (!b.length) this.blocks.delete(lane);
  }
  /** the slow zones of lane (replaces its list; none removes them) */
  setSlow(lane: number, zones: { from: number; to: number; factor: number }[]): void { if (zones.length) this.slow.set(lane, zones); else this.slow.delete(lane); }
  /** the distance from s to the nearest obstacle ahead of it on lane (Infinity if none) */
  private blockAhead(lane: number, s: number): number {
    const b = this.blocks.get(lane); let d = Infinity;
    if (b) for (const o of b) if (o > s && o - s < d) d = o - s;
    return d;
  }
  /** the position of the nearest obstacle on lane (Infinity if none) */
  private minBlock(lane: number): number {
    const b = this.blocks.get(lane); let m = Infinity;
    if (b) for (const o of b) if (o < m) m = o;
    return m;
  }
  /** true if car i has an obstacle ahead on its lane, or on its next lane (the cars it holds, see tow) */
  private held(i: number): boolean {
    const P = this.plan[i] ?? [], p = this.pi[i]! + 1;
    return this.blockAhead(this.lane[i]!, this.s[i]!) < Infinity || (p < P.length && this.minBlock(P[p]!) < Infinity);
  }

  /** removes the vehicles that have reached their destination (on the destination dseg, at destS or further) */
  private arrive() {
    const lanes = this.g.lanes;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || this.dest[i]! < 0 || this.bus[i]! >= 0) continue;
      const ln = lanes[this.lane[i]]!;
      if (ln.kind === LK.LINK && ln.dseg === this.dest[i] && this.s[i] >= this.destS[i]!) {
        const k = this.sink[i];
        if (k >= 0) this.enter(i, k, ln); else { this.score(i, ln); this.stats.arrived++; this.despawn(i); }
      }
    }
    this.drain();
  }
  /** a vehicle bound for sink k reached its line: turned away if its park has no bay left (the bays its entry queue holds count as taken),
   *  else it leaves the road into the entry queue (its party town and origin zone wait in the sink; drain parks it) and counts as an arrival.
   *  Either way it leaves the sim */
  private enter(i: number, k: number, ln: Lane) {
    const K = this.sinks[k]!, P = this.parks[K.park]!;
    if (P.parked + this.queuedAt(K.park) >= P.bays) { P.turned++; this.out(i, 1); this.despawn(i); return; }
    K.q.push(this.party[i]!); K.qz.push(this.oz[i]!); this.party[i] = -1;
    this.score(i, ln); this.stats.arrived++; this.despawn(i);
  }
  /** the entry queues (after the arrivals): a sink whose gate is open (t >= next) parks the first car of its queue (parked++, the gate shuts for
   *  entryS, logged in parkedNow and partyBays; a party car's exit is logged as parked). A park that has lost its bays turns the car away */
  private drain() {
    for (const K of this.sinks) {
      if (!K.q.length || this.t < K.next) continue;
      const town = K.q.shift()!, z = K.qz.shift()!, P = this.parks[K.park]!;
      if (P.parked >= P.bays) { P.turned++; if (town >= 0) this.partyOut.push(town, 1); continue; }
      P.parked++; K.next = this.t + this.entryS; this.parkedNow.push(K.park, z);
      if (town >= 0) { this.partyOut.push(town, 0); this.partyBays.push(town, K.park, P.parked - 1); }
    }
  }
  /** the cars waiting in the entry queues of park k, over all its sinks (they hold bays with the parked cars) */
  queuedAt(k: number): number { let n = 0; for (const K of this.sinks) if (K.park === k) n += K.q.length; return n; }
  /** empties the entry queues (the round's close, with City.emptyParks): the cars in them are not logged */
  clearQueues(): void { for (const K of this.sinks) { K.q.length = 0; K.qz.length = 0; } }
  /** the car park entrances (City.resolveSinks after each graph update): a vehicle keeps its sink when the new list has one of the same
   *  park and dseg (taking that sink's next time), else it has none (-1); a new sink starts open */
  setSinks(list: Sink[]) {
    const old = this.sinks;
    if (!old.length && !list.length) return;
    const map = new Int16Array(old.length).fill(-1);
    for (let j = 0; j < list.length; j++) {
      const n = list[j]!, o = old.findIndex(q => q.park === n.park && q.dseg === n.dseg);
      if (o >= 0) { map[o] = j; n.next = old[o]!.next; n.q = old[o]!.q; n.qz = old[o]!.qz; }
    }
    // the entry queues of the gone entrances: their party cars are lost
    for (let o = 0; o < old.length; o++) if (map[o]! < 0) for (const p of old[o]!.q) if (p >= 0) this.partyOut.push(p, 2);
    for (let i = 0; i < this.cap; i++) {
      const k = this.sink[i]!;
      if (k < 0) continue;
      this.sink[i] = k < old.length ? map[k]! : -1;
      // a party car whose entrance is gone is lost
      if (this.sink[i]! < 0 && this.party[i]! >= 0) { this.out(i, 2); this.despawn(i); }
    }
    this.sinks = list;
  }

  /** the shuttle routes (by index; null where a route has no stops) as the City resolved them: the buses are planned to the new stops by onGraph,
   *  or by refitBuses; a route's waiting fans (busWait) grow to its index */
  setBusRoutes(list: (BusRoute | null)[]): void {
    this.busRoutes = list;
    while (this.busWait.length < list.length) this.busWait.push(0);
  }
  /** plans every bus to its target stop again (after setBusRoutes, with the graph as it is); a bus whose route is gone is removed (its fans logged) */
  refitBuses(): void {
    for (let i = 0; i < this.cap; i++) if (this.bus[i]! >= 0 && this.alive[i] && !this.busHome(i)) this.despawn(i);
  }
  /** removes the buses (the round's close): their fans are not logged, and the waiting fans are cleared */
  dropBuses(): void {
    for (let i = 0; i < this.cap; i++) if (this.bus[i]! >= 0 && this.alive[i]) { this.busLoad[i] = 0; this.despawn(i); }
    this.busWait.fill(0); this.busEv.length = 0; this.partyBays.length = 0;
  }
  /** adds a shuttle bus of route r at s metres on link lane lane (its lot stop's kerb lane), heading for the lot stop (leg 1): it waits there for
   *  fans. Returns its slot; -1 if there is no room on the lane, no free slot or no such route, -2 if it was lost at once (no route) */
  spawnBus(r: number, lane: number, s: number): number {
    const R = this.busRoutes[r], ln = this.g.lanes[lane];
    if (!R || !ln || ln.kind !== LK.LINK || !this.roomOn(lane, s, BUS_LEN)) return -1;
    let i = this.hint;
    while (i < this.cap && this.alive[i]) i++;
    if (i >= this.cap) return -1;
    this.alive[i] = 1; this.lane[i] = lane; this.s[i] = s; this.v[i] = 0; this.acc[i] = 0;
    // a bus keeps v0f 1 and drives with the car's constants (no driver variety)
    this.drivers.assign(i, 'car'); const D = this.drivers; D.T[i] = CAR.T; D.a[i] = CAR.a; D.b[i] = CAR.b; D.s0[i] = CAR.s0;
    this.v0f[i] = 1; this.vtype[i] = BUS_VT; this.len[i] = BUS_LEN; this.lat[i] = 0; this.stuck[i] = 0;
    this.grant[i] = -1; this.resv[i] = -1; this.wait[i] = 0; this.stopped[i] = 0;
    this.t0[i] = this.t; this.ideal[i] = -s / ln.vmax; this.oz[i] = this.router.zoneD[ln.dseg]!; this.tag[i] = 0;
    this.dest[i] = R.lot.dseg; this.destS[i] = R.lot.s; this.route[i] = null; this.noRoute[i] = 0; this.sink[i] = -1; this.party[i] = -1;
    this.bus[i] = r; this.busLeg[i] = 1; this.busLoad[i] = 0; this.busDwell[i] = 0; this.busBoard[i] = 0; this.busN++;
    laneAt(ln, s, this.pt); this.ox[i] = this.pt.x; this.oy[i] = this.pt.y; this.setDest(i);
    this.busKey[i] = ln.key; this.busX[i] = this.pt.x; this.busY[i] = this.pt.y;
    const q = this.onLane[lane];
    let k = 0; while (k < q.length && this.s[q[k]] > s) k++;
    q.splice(k, 0, i);
    this.hint = i + 1; this.active++; this.stats.spawned++;
    if (!this.pickMove(i)) return -2;
    return i;
  }
  /** a bus slot stops being a bus (it is freed): a bus with fans on board logs them as lost (quads in busEv); its bus state is cleared */
  private busOff(i: number) {
    if (this.bus[i]! < 0) return;
    if (this.busLoad[i]) this.busEv.push(i, this.bus[i]!, 2, this.busLoad[i]!);
    this.bus[i] = -1; this.busLoad[i] = 0; this.busDwell[i] = 0; this.busBoard[i] = 0; this.busN--;
  }
  /** points bus i at its target stop (the lot stop on leg 1, the doors stop on leg 0): its dest and destS, its route cleared. A stop that does not
   *  resolve (null route) leaves the bus with no destination (it waits, see hold); false only if the route itself is gone */
  private busFit(i: number): boolean {
    const r = this.bus[i]!, R = this.busRoutes[r];
    this.route[i] = null; this.noRoute[i] = 0;
    if (!R) { this.dest[i] = -1; return r < this.busRoutes.length; }
    const T = this.busLeg[i] ? R.lot : R.doors;
    this.dest[i] = T.dseg; this.destS[i] = T.s; this.setDest(i);
    return true;
  }
  /** a bus after a graph update (or a route change): its lane is kept while the lane has the key it had, else the bus moves to the nearest link lane
   *  to its last point (busX, busY); it is pointed at its stop (busFit) and planned on from its lane. False if its route is gone (the caller removes it) */
  private busHome(i: number): boolean {
    const lanes = this.g.lanes, cur = lanes[this.lane[i]!] ?? null;
    if (!cur || cur.key !== this.busKey[i]) {
      const at = nearestLink(this.g, this.busX[i]!, this.busY[i]!);
      if (!at) return false;
      const nl = lanes[at.id]!;
      this.lane[i] = at.id; this.s[i] = at.s; this.busKey[i] = nl.key; this.plan[i] = null; this.pi[i] = 0;
    }
    if (!this.busFit(i)) return false;
    if (lanes[this.lane[i]!]!.kind === LK.LINK) this.pickMove(i);
    return true;
  }
  /** a bus with no stop to drive to waits where it is: no destination (dest -1), a plan that is its lane alone, and it holds still (accelerate);
   *  the next graph update or route change points it at its stop again */
  private hold(i: number): boolean {
    this.dest[i] = -1; this.unbind(i); this.plan[i] = [this.lane[i]!]; this.pi[i] = 0; this.move[i] = -1; this.want[i] = -1; this.ahead[i] = -1;
    return true;
  }
  /** the bus step (once per step, after tow): a bus within its jam gap s0 + 1 m of its target stop and under 0.5 m/s is at the stop and dwells there. At the lot
   *  stop it boards one fan of the queue per BOARD_S while seats are free (busWait counts the queue), and leaves when full, or when the queue is
   *  empty after MIN_DWELL, or at MAX_DWELL. At the doors stop it alights one fan per ALIGHT_S and leaves when empty. Each boarding or alighting is
   *  logged in busEv. A bus whose route is gone is removed */
  private buses() {
    for (let i = 0; i < this.cap; i++) {
      const r = this.bus[i]!;
      if (r < 0 || !this.alive[i]) continue;
      if (r >= this.busRoutes.length) { this.despawn(i); continue; }
      const ln = this.g.lanes[this.lane[i]!]!;
      laneAt(ln, this.s[i]!, this.pt); this.busX[i] = this.pt.x; this.busY[i] = this.pt.y;
      // a stop that does not resolve: the bus waits (no dwell)
      const R = this.busRoutes[r];
      if (!R) continue;
      const leg = this.busLeg[i]!, T = leg ? R.lot : R.doors;
      if (ln.dseg !== T.dseg || Math.abs(T.s - this.s[i]!) > this.drivers.s0[i]! + 1 || this.v[i]! >= 0.5) continue;
      this.busDwell[i] = this.busDwell[i]! + DT;
      if (leg) {
        let b = this.busBoard[i]! + DT, w = this.busWait[r]!;
        while (b >= BOARD_S - DT / 2 && this.busLoad[i]! < R.seats && w > 0) {
          b -= BOARD_S; this.busLoad[i]!++; w--; this.busWait[r] = w; this.busEv.push(i, r, 0, 1);
        }
        this.busBoard[i] = this.busLoad[i]! < R.seats && w > 0 ? b : 0;
        const d = this.busDwell[i]!;
        if (this.busLoad[i]! >= R.seats || (w === 0 && d >= MIN_DWELL - DT / 2) || d >= MAX_DWELL - DT / 2) this.depart(i);
      } else {
        let b = this.busBoard[i]! + DT;
        while (b >= ALIGHT_S - DT / 2 && this.busLoad[i]! > 0) { b -= ALIGHT_S; this.busLoad[i]!--; this.busEv.push(i, r, 1, 1); }
        this.busBoard[i] = this.busLoad[i]! > 0 ? b : 0;
        if (this.busLoad[i]! === 0) this.depart(i);
      }
    }
  }
  /** bus i leaves its stop for the other one: its target flips, its dwell and boarding clock start again, and it is planned on from here */
  private depart(i: number) {
    this.busLeg[i] = this.busLeg[i] ? 0 : 1; this.busDwell[i] = 0; this.busBoard[i] = 0;
    if (!this.busFit(i)) { this.despawn(i); return; }
    this.pickMove(i);
  }

  /** watches the crossings of node n (null stops): the count starts again at 0 */
  setWatch(n: Node | null) { this.watchNode = n; this.watchN = 0; }

  /** what the inspector shows of vehicle i (null unless alive): its point, speed and lane limit, origin, destination point, trip and
   *  ideal times so far (ideal as score() computes it), the destination's use, and its route ahead as flat tile points: now, the end of
   *  its current dseg, the ends of the dsegs of its local route but the last, the destination point (no end when on the destination's dseg) */
  inspect(i: number): CarInfo | null {
    if (!this.alive[i]) return null;
    const lanes = this.g.lanes, ln = lanes[this.lane[i]]!, P = this.plan[i] ?? [], dest = this.dest[i]!;
    laneAt(ln, this.s[i]!, this.pt); const x = this.pt.x, y = this.pt.y;
    this.destPt(i); const dx = this.dp.x, dy = this.dp.y;
    // the dseg the vehicle is on, or (on a node lane) the one its plan enters next
    let cur = -1;
    if (ln.kind === LK.LINK) cur = ln.dseg;
    else for (let j = this.pi[i]!; j < P.length; j++) { const l = lanes[P[j]!]; if (l && l.kind === LK.LINK) { cur = l.dseg; break; } }
    const ds = cur >= 0 ? this.g.dsegs[cur] : null, dst = dest >= 0 && !!this.g.dsegs[dest], path = [x, y];
    if (ds && (!dst || cur !== dest)) path.push(ds.to.x, ds.to.y);
    if (ds && dst && cur !== dest) { const r = this.router.localRoute(cur, dest); if (r) for (let k = 0; k + 1 < r.length; k++) { const to = this.g.dsegs[r[k]!]!.to; path.push(to.x, to.y); } }
    if (dst || !ds) path.push(dx, dy);
    return { slot: i, x, y, v: this.v[i]!, vmax: ln.vmax, ox: this.ox[i]!, oy: this.oy[i]!, dx, dy, tripS: this.t - this.t0[i]!, idealS: Math.max(this.ideal[i]! + this.s[i]! / ln.vmax, 10), tag: this.tag[i]!, path };
  }

  /** packs the vehicles into buf: 4 floats per slot [x, y, angle, flags]; x, y in tiles, angle in radians, dead slots 0.
   *  flags: 1 alive, 2 braking, 4 tunnel, 8 left signal, 16 right signal, vtype << 5 */
  writeFrame(buf: Float32Array) {
    const o = this.scratch, lanes = this.g.lanes, moves = this.g.moves;
    for (let i = 0; i < this.cap; i++) {
      const k = 4 * i, ln = this.alive[i] ? lanes[this.lane[i]] ?? null : null;
      if (!ln) { buf[k] = 0; buf[k + 1] = 0; buf[k + 2] = 0; buf[k + 3] = 0; continue; }
      laneAt(ln, this.s[i], o);
      const la = this.lat[i];
      buf[k] = o.x - o.hy * la; buf[k + 1] = o.y + o.hx * la;
      buf[k + 2] = Math.atan2(o.hy, o.hx);
      buf[k + 3] = 1 | (this.acc[i] < -0.5 ? 2 : 0) | (ln.tunnel ? 4 : 0) | this.signal(i, ln, moves) | (this.vtype[i] << 5);
    }
  }
  /** the turn signal of vehicle i on lane ln: 8 left, 16 right, 0 none. A vehicle signals the turn of the movement it follows
   *  (move[i], turn L or R) while it is on that movement's in lane within 40 m of the end, or on its node lanes */
  private signal(i: number, ln: Lane, moves: (Movement | null)[]): number {
    const m = this.move[i]; if (m === undefined || m < 0) return 0;
    const mv = moves[m]; if (!mv || (mv.turn !== 'L' && mv.turn !== 'R')) return 0;
    const bit = mv.turn === 'L' ? 8 : 16, near = this.s[i] >= ln.len - 40;
    for (let q = 0; q < mv.paths.length; q++) {
      const p = mv.paths[q]!;
      if (near && p[0] === ln.id) return bit;
      for (let j = 1; j < p.length - 1; j++) if (p[j] === ln.id) return bit;
    }
    return 0;
  }

  /** junction gate for vehicle i before gated lane c (a CONN or RING entry from a LINK lane): true lets it on and grants c.
   *  Order: a grant holds (unless the light is red and it can stop), the signal, the stop sign, the vehicle ahead is granted,
   *  room beyond the box, conflicts. */
  private gate(i: number, c: number): boolean {
    const C = this.g.lanes[c]!, v = this.v[i], dLine = this.lLen[this.lane[i]] - this.s[i];
    // a roundabout exit: a car on the ring lane it leaves that has just passed the diverge (on the through arc) is not left alongside: the
    // separation along the shared path (our distance to the fork plus its tail past it) must be DIVERGE m, or its tail that far when it stands
    // (counting only its tail made every exit behind a through car stop on the ring and hold the lane)
    const from = this.g.lanes[this.lane[i]]!, toFork = this.lLen[this.lane[i]] - this.s[i];
    if (from.kind === LK.RING && this.grant[i] !== c) for (const nx of from.next) if (nx !== c && this.g.lanes[nx]!.kind === LK.RING) for (const w of this.onLane[nx]!) if (this.s[w]! - this.len[w]! + (this.v[w]! > 1 ? toFork : 0) < DIVERGE) return false;
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
    // a roundabout entry is granted only when its ring lane is clear for its length plus 2 m from the merge (strict: no reservation on it either)
    if (out >= 0 && !this.roomFor(i, out, ring && this.lLink[this.lane[i]] === 1)) return false;
    if (!this.clearOf(i, C)) return false;
    this.grant[i] = c; this.granted[c].push(i);
    if (this.resv[i] >= 0) this.unReserve(i);
    if (out >= 0) { this.resv[i] = out; this.resvLen[out] += this.needOn(i, out); }
    return true;
  }

  /** seconds until signal plan p turns the phase now green or amber red (the plan is not red for that phase): the amber left; a green
   *  lasts at least MIN_GREEN s when another phase is called, and never ends while none is (Infinity). Fixed-time plans (mode 0) and the
   *  fixed-time reference (fixedSignals) read the cycle */
  private toRed(p: SignalPlan): number {
    if (this.fixedSignals || p.mode === 0) return fixedToRed(p, this.t);
    if (p.stage === 1) return p.amber - p.el;
    return demandElsewhere(p, this.onLane, this.s, this.lLen) ? Math.max(0, MIN_GREEN - p.el) + p.amber : Infinity;
  }
  /** the state (SIG) of the signal showing the phase of connector C now (green when it has no plan) */
  private signalState(C: Lane): number { const p = this.g.signals.get(C.node!); return p ? phaseState(p, C.phase, this.t) : SIG.GREEN; }
  /** the signal plans' runtime states for the renderer: x, y (tiles), idx and stage, 4 floats per plan (in plans order) */
  signalFrame(): Float32Array {
    const P = this.plans, o = new Float32Array(4 * P.length);
    for (let k = 0; k < P.length; k++) { const p = P[k]!; o[4 * k] = p.node.x; o[4 * k + 1] = p.node.y; o[4 * k + 2] = p.idx; o[4 * k + 3] = p.stage; }
    return o;
  }
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
   *  what it needs, or the rearmost vehicle there is moving faster than 4 m/s. strict (a roundabout entry): the room must be
   *  there with no grant made on the lane, and a moving vehicle does not count */
  private roomFor(i: number, out: number, strict = false): boolean {
    const q = this.onLane[out], S = this.s, LEN = this.len;
    let rear = this.lLen[out];
    for (const w of q) { const r = S[w] - LEN[w]; if (r < rear) rear = r; }
    if (strict) return rear >= this.needOn(i, out) && this.resvLen[out] <= 0;
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
        // at a roundabout entry a car on the ring that is coming (or standing) within RING_GAP m plus 4 s of its travel holds the crossing;
        // a ring exit crossing the outer lanes takes a short gap instead (with the entry rule an inner-lane exit waited for 40 m of empty
        // outer lane, never came on a busy ring, and held its whole lane: the owner's 3-lane ring, 2026-10-19)
        const ringX = !!C.node && C.node.rb > 0 && C.prev.every(p => lanes[p]!.kind !== LK.RING);
        if (ringX && this.ringComing(c2, cf.os)) return false;
        for (const p of L2.prev) for (const w of Q[p]) {
          if (this.grant[w] >= 0 || P[w]![pI[w] + 1] !== c2) continue;
          const dist = lLen[p] - S[w] + cf.os;
          // (a ring car may speed up to its lane's limit before it reaches the crossing, so the faster of the two counts)
          if (ringX) { if (dist < RING_GAP + 4 * Math.max(V[w]!, this.lVmax[p]!)) return false; continue; }
          // a ring exit crossing the outer lanes: an ordinary gap (EXIT_MIN m, EXIT_GAP s at the other car's speed)
          if (C.node!.rb > 0) { if (dist < EXIT_MIN || (V[w] >= 0.5 && dist / V[w] < EXIT_GAP)) return false; continue; }
          if (V[w] < 0.5) continue;
          if (dist / V[w] < (cf.merge ? 5 : 4)) return false;
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
  /** a roundabout entry's look-back along the ring: true if a car is coming to ring lane c2 (its plan reaches c2 within the next few lanes)
   *  within RING_GAP m plus 4 s of its travel of the conflict point os m along c2, on ring lanes up to that far back (one lane back was
   *  not enough: ring arcs are 10-20 m, so a car two arcs back reached the merge while an entering car was still crossing to an inner
   *  lane, and the two held each other there) */
  private ringComing(c2: number, os: number): boolean {
    const lanes = this.g.lanes, Q = this.onLane, S = this.s, V = this.v, P = this.plan, pI = this.pi, lLen = this.lLen, far = RING_GAP + 4 * 12;
    let front: [number, number][] = [[c2, os]];
    for (let depth = 0; depth < 4 && front.length; depth++) {
      const nxt: [number, number][] = [];
      for (const [l, base] of front) for (const p of lanes[l]!.prev) {
        if (depth > 0 && lanes[p]!.kind !== LK.RING) continue;
        for (const w of Q[p]) {
          if (this.grant[w] >= 0) continue;
          const plan = P[w]!, k = plan.indexOf(c2, pI[w]); if (k < 0 || k > pI[w] + depth + 1) continue;
          if (lLen[p] - S[w] + base < RING_GAP + 4 * Math.max(V[w]!, this.lVmax[p]!)) return true;
        }
        if (lanes[p]!.kind === LK.RING && base + lLen[p] < far) nxt.push([p, base + lLen[p]]);
      }
      front = nxt;
    }
    return false;
  }
  /** removes vehicle i from the granted list of its connector */
  private unGrant(i: number) { const q = this.granted[this.grant[i]], k = q.indexOf(i); if (k >= 0) q.splice(k, 1); this.grant[i] = -1; }
  /** gives back the room vehicle i reserved on its out lane */
  private unReserve(i: number) { const r = this.resv[i]; this.resvLen[r] = Math.max(0, this.resvLen[r] - this.needOn(i, r)); this.resv[i] = -1; }

  /** step 1: every vehicle's acceleration (IDM against its leader, a plan end, a closed gate, and the speed limit ahead) */
  private accelerate() {
    const lanes = this.g.lanes, Q = this.onLane, D = this.drivers;
    for (let id = 0; id < Q.length; id++) {
      const q = Q[id];
      if (!q.length) continue;
      const lenL = this.lLen[id], v0L = this.lVmax[id], zn = this.slow.size ? this.slow.get(id) : undefined;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], v = this.v[i], si = this.s[i], P = this.plan[i]!, pi = this.pi[i];
        let v0 = v0L * this.v0f[i]; const d0 = lenL - si;
        if (zn) for (const z of zn) if (si >= z.from && si <= z.to) v0 *= z.factor;
        // the gap to the leader: its speed vl and acceleration al (no leader, a free road: vl = v, al = 0; an obstacle: vl = al = 0)
        let gap = Infinity, vl = v, al = 0, vg = Infinity, hard = false;
        if (k > 0) { const ld = q[k - 1]; gap = this.s[ld] - this.len[ld] - si; vl = this.v[ld]; al = this.acc[ld]; }
        // walk the plan ahead: the first lane with vehicles gives the leader, the end of the plan may be a stop
        let d = d0, found = k > 0, j = pi + 1;
        for (; j < P.length; j++) {
          if (d > LOOKAHEAD) break;
          const nid = P[j], q2 = Q[nid];
          if (!found && q2.length) { const ld = q2[q2.length - 1]; gap = d + this.s[ld] - this.len[ld]; vl = this.v[ld]; al = this.acc[ld]; found = true; }
          d += this.lLen[nid];
        }
        // a merge (zipper): the nearest vehicle ahead of us on the other lanes that merge into our next lane is a leader too,
        // by the distance each has left to the merge point
        if (this.lMerge[id]) {
          // a ring lane takes no reservation's precedence: ring traffic never waits for an entry, so an entry follows it
          const nN = lanes[id]!.next[0], N = lanes[nN]!, mine = this.resv[i] === nN && N.kind !== LK.RING;
          for (const p of N.prev) {
            if (p === id) continue;
            const q2 = Q[p], lp = this.lLen[p];
            for (let m = q2.length - 1; m >= 0; m--) {
              const w = q2[m], rem = lp - this.s[w];
              // holding the room on the merged lane outranks a merger without it (it waits for our reservation: following it
              // would deadlock)
              if (rem >= d0 || (mine && this.resv[w] !== nN)) continue;
              const gm = d0 - rem - this.len[w];
              if (gm < gap) { gap = gm; vl = this.v[w]; al = this.acc[w]; hard = true; }
              break;
            }
          }
        }
        // a plan that ends in a lane going nowhere: stop at its end (a plan merely not extended yet ends at a link lane with exits)
        if (j === P.length && d <= LOOKAHEAD && !lanes[P[P.length - 1]]!.next.length) {
          if (d < gap) { gap = d; vl = 0; al = 0; hard = true; }
          vg = Math.min(vg, d - STOP_MARGIN);
        }
        // a junction entry the gate keeps shut: a stopped obstacle at the end of this lane
        if (pi + 1 < P.length && d0 <= v * v / (2 * CAR.b) + 4) {
          const nid = P[pi + 1];
          if (this.lGate[nid] && !this.gate(i, nid)) {
            if (d0 < gap) { gap = d0; vl = 0; al = 0; hard = true; }
            vg = Math.min(vg, d0 - STOP_MARGIN);
          }
        }
        // a car park's entrance (sink): a car bound for it holds at the line (a stopped obstacle there) only while the entry queue is full
        // (ENTRY_Q cars off the road) and its park has a bay left for it; else it drives on to the line and leaves the road there (see enter)
        const sk = this.sink[i];
        if (sk >= 0) {
          const K = this.sinks[sk]!, P = this.parks[K.park]!, ln = lanes[id]!;
          if (ln.kind === LK.LINK && ln.dseg === K.dseg && si <= K.s && K.q.length >= ENTRY_Q && P.parked + this.queuedAt(K.park) < P.bays) {
            const dd = K.s - si;
            if (dd < gap) { gap = dd; vl = 0; al = 0; hard = true; }
            vg = Math.min(vg, dd - STOP_MARGIN);
          }
        }
        // a shuttle bus stops at its target stop (its dwell, see buses) until it leaves for the other one: the obstacle a sink is
        const bu = this.bus[i]!;
        if (bu >= 0 && lanes[id]!.kind === LK.LINK) {
          const R = this.busRoutes[bu], T = R ? (this.busLeg[i] ? R.lot : R.doors) : null;
          if (T && T.dseg === lanes[id]!.dseg && si <= T.s) {
            const dd = T.s - si;
            if (dd < gap) { gap = dd; vl = 0; al = 0; hard = true; }
            vg = Math.min(vg, dd - STOP_MARGIN);
          }
        }
        // an obstacle ahead on this lane, or near the start of the next one (within LOOKAHEAD): stopped short of it, as at a booth line
        if (this.blocks.size) {
          let dd = this.blockAhead(id, si);
          if (pi + 1 < P.length) { const nb = d0 + this.minBlock(P[pi + 1]!); if (nb <= LOOKAHEAD && nb < dd) dd = nb; }
          if (dd < gap) { gap = dd; vl = 0; al = 0; hard = true; }
          if (dd < Infinity) vg = Math.min(vg, dd - STOP_MARGIN);
        }
        // a toll booth: an unpaid vehicle stops at the booth's line until it has stood there SERVICE_S (dwell); one already past the line
        // unserved (spawned there) pays at once
        const bo = this.lBooth[id]!;
        if (bo >= 0 && !this.paid[i]) {
          if (si > bo + 0.5) this.serve(i);
          else {
            if (si >= bo - D.s0[i]! - 1 && v < 0.5) this.dwell[i] += DT;
            if (this.dwell[i]! >= SERVICE_S - DT / 2) this.serve(i);
            else {
              const dd = bo - si;
              if (dd < gap) { gap = dd; vl = 0; al = 0; hard = true; }
              vg = Math.min(vg, dd - STOP_MARGIN);
            }
          }
        }
        // the next lane is slower than we are: brake for it once the comfortable braking curve is reached (keeps speed before that)
        let ac = Infinity;
        if (pi + 1 < P.length && d0 > 0.5) {
          const vn = this.lVmax[P[pi + 1]] * this.v0f[i];
          if (vn < v) { const need = (vn * vn - v * v) / (2 * d0); if (need < -CAR.b) ac = need; }
        }
        const useIidm = hard || this.lLink[id] === 0;
        let a = useIidm ? iidm(v, v0, gap, v - vl, D.a[i]!, D.b[i]!, D.T[i]!, D.s0[i]!) : accACC(v, v0, gap, vl, al, D.a[i]!, D.b[i]!, D.T[i]!, D.s0[i]!);
        if (ac < Infinity) a = Math.min(a, Math.max(ac, -3));
        // a bus waiting for its stop holds still (see hold)
        if (this.busN && this.bus[i]! >= 0 && this.dest[i]! < 0) vg = 0;
        this.acc[i] = a; this.vg[i] = vg;
      }
    }
  }

  /** MOBIL lane changes: a vehicle on a link lane with a neighbour lane is evaluated every MOBIL_EVERY steps (slots staggered),
   *  between the lane ends it keeps clear of; it moves to the neighbour with the best incentive, if above the threshold */
  private changeLanes() {
    const lanes = this.g.lanes, st = this.steps, D = this.drivers;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || (i + st) % MOBIL_EVERY !== 0 || this.grant[i] >= 0 || this.bus[i]! >= 0) continue;
      const cur = this.lane[i], ln = lanes[cur]!;
      // no lane changes on a toll booth lane (the booths are the lanes; see accelerate)
      if (ln.kind !== LK.LINK || (ln.left < 0 && ln.right < 0) || this.lBooth[cur]! >= 0) continue;
      const s = this.s[i];
      if (s < MOBIL_START || s > this.lLen[cur] - MOBIL_END) continue;
      const k = this.onLane[cur].indexOf(i);
      let best = D.threshold[i]!, to = -1;
      if (ln.left >= 0 && lanes[ln.left]) { const x = this.gainTo(i, ln.left, k); if (x > best) { best = x; to = ln.left; } }
      if (ln.right >= 0 && lanes[ln.right]) { const x = this.gainTo(i, ln.right, k); if (x > best) { best = x; to = ln.right; } }
      if (to >= 0) this.moveLane(i, to, k);
    }
  }
  /** the MOBIL incentive of vehicle i (at index k of its lane) moving to the neighbour lane T: its own gain, plus politeness times
   *  the gains of the new follower and of the old follower, plus the movement bias; -Infinity if the move is unsafe */
  private gainTo(i: number, T: number, k: number): number {
    const cur = this.lane[i], S = this.s, V = this.v, LEN = this.len, A = this.acc, VG = this.vg, Q = this.onLane, D = this.drivers;
    const LC = this.lLen[cur], LT = this.lLen[T], sN = S[i] * LT / LC, qt = Q[T], qc = Q[cur];
    const vi = V[i], v0T = this.lVmax[T] * this.v0f[i];
    // the new leader and follower on T by position (the list is front first)
    let j = 0; while (j < qt.length && S[qt[j]] > sN) j++;
    const ld = j > 0 ? qt[j - 1] : -1, fo = j < qt.length ? qt[j] : -1;
    let gap = Infinity, dv = 0;
    if (ld >= 0) { gap = S[ld] - LEN[ld] - sN; dv = vi - V[ld]; if (gap <= 1) return -Infinity; }
    // an obstacle ahead on the target lane is a stopped leader there
    if (this.blocks.size) { const bT = this.blockAhead(T, sN); if (bT < gap) { gap = bT; dv = vi; } }
    // a stop ahead (a closed gate or a plan end) counts as an obstacle here too, as it does in accelerate()
    if (VG[i] < gap) { gap = VG[i] + (LT - sN) - (LC - S[i]); dv = vi; }
    const aT = idm(vi, v0T, gap, dv, D.a[i]!, D.b[i]!, D.T[i]!, D.s0[i]!);
    let gain = 0;
    if (fo >= 0) {
      const gf = sN - LEN[i] - S[fo];
      if (gf <= 1) return -Infinity;
      let g2 = gf, dv2 = V[fo] - vi;
      if (VG[fo] < g2) { g2 = VG[fo]; dv2 = V[fo]; }
      const af = idm(V[fo], this.lVmax[T] * this.v0f[fo], g2, dv2, D.a[fo]!, D.b[fo]!, D.T[fo]!, D.s0[fo]!);
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
      gain += idm(V[o], this.lVmax[cur] * this.v0f[o], g3, dv3, D.a[o]!, D.b[o]!, D.T[o]!, D.s0[o]!) - A[o];
    }
    let bias = 0;
    const w = this.want[i];
    if (w >= 0) {
      const here = this.reach(w, cur), there = this.reach(w, T);
      if (!here && there) bias = 1 + 2 * Math.max(0, 1 - (LC - S[i]) / 150);
      else if (here && !there) bias = -1000;
      // both reach it: the lane whose path through w lands where the movement chosen early (ahead) can be reached
      else if (here && this.ahead[i]! >= 0) {
        const h2 = this.reach2(w, cur, this.ahead[i]!), t2 = this.reach2(w, T, this.ahead[i]!);
        if (!h2 && t2) bias = 1 + 2 * Math.max(0, 1 - (LC - S[i]) / 150);
        else if (h2 && !t2) bias = -1000;
      }
    }
    // an obstacle near ahead on this lane and none near on the target: a strong reason to change
    if (this.blocks.size && this.blockAhead(cur, S[i]) <= BLOCK_NEAR && this.blockAhead(T, sN) > BLOCK_NEAR) bias += 2;
    return (aT - A[i]) + D.politeness[i]! * gain + bias;
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
      if (vn < 0.3 && dEnd < this.drivers.s0[i]! + 2) this.stopped[i] = 1;
      if (vn < 0.5 && dEnd < 20) this.wait[i] += DT;
      // the time lost this step: the shortfall under 90% of the limit, on a link lane's queue (lossQ) or on the lane (lossL)
      const vm = this.lVmax[id];
      if (vm > 0) { const loss = DT * Math.max(0, 1 - vn / (0.9 * vm)); if (this.lLink[id] && dEnd < QUEUE_M) this.lossQ[id] += loss; else this.lossL[id] += loss; this.lostTotal += loss; }
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
    this.s[i] -= ln.len; this.ideal[i] += ln.len / ln.vmax;
    this.onLane[old].shift();
    const nid = P[p], nl = lanes[nid]!;
    if (ln.kind !== LK.LINK && nl.kind === LK.LINK) this.stats.throughput++;
    if (this.grant[i] === nid) this.unGrant(i);
    if (this.resv[i] === nid) this.unReserve(i);
    // entering the first node lane of a movement: its junction delay is the time this vehicle waited at the line
    if (this.lPre[old] && !this.lPre[nid] && this.move[i]! >= 0) this.router.feed(this.move[i]!, this.wait[i]!);
    this.stopped[i] = 0; if (!this.lPre[nid]) this.wait[i] = 0;
    this.pi[i] = p; this.lane[i] = nid; this.onLane[nid].push(i); this.enterL[nid] += 1;
    // on its booth lane, the vehicle counts there, not as bound
    if (this.lBooth[nid]! >= 0) this.unbind(i);
    // a watched junction (setWatch): a vehicle entering its node lanes from a link lane is logged with its origin and destination
    if (this.watchNode && ln.kind === LK.LINK && nl.kind !== LK.LINK && nl.node === this.watchNode) {
      const k = 4 * (this.watchN % 256), W = this.watchLog;
      W[k] = this.ox[i]; W[k + 1] = this.oy[i]; W[k + 2] = this.dX[i]; W[k + 3] = this.dY[i]; this.watchN++;
    }
    // a vehicle may be removed here (lost, no route): pickMove despawns it, and the callers check alive
    if (nl.kind === LK.LINK && p === P.length - 1) this.pickMove(i);
    return true;
  }

  /** safety valve: a vehicle stuck for TOW_BOX s in a junction box, or TOW_ANY s anywhere, is removed (fill() spawns a new one) */
  private tow() {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const st = this.stuck[i];
      // a bus standing at its stop, or waiting for one (see hold), is never towed (see buses)
      if (this.bus[i]! >= 0 && (this.busDwell[i]! > 0 || this.dest[i]! < 0)) continue;
      // a car stuck behind an obstacle (see held) is not towed while the obstacle stands; its stuck clock starts again at once, so a queue
      // that clears after the obstacle is lifted is not towed in the first steps
      if (st > TOW_BOX && this.blocks.size && this.held(i)) { this.stuck[i] = 0; continue; }
      if (st > TOW_ANY || (st > TOW_BOX && !this.lPre[this.lane[i]!])) { this.stats.towed++; this.stats.respawned++; this.despawn(i); continue; }
      // an abandoned trip counts as a very slow one (capped at 6x) in the zones it came from and was going to
      if (this.dest[i]! >= 0 && this.bus[i]! < 0 && this.t - this.t0[i]! > ABANDON) {
        const ideal = Math.max(this.ideal[i]!, 10), act = this.t - this.t0[i]!, d = this.g.dsegs[this.dest[i]!];
        this.bump(this.oz[i]!, act, ideal); if (d) this.bump(this.router.zoneD[d.id]!, act, ideal);
        this.stats.abandoned++; this.despawn(i);
      }
    }
  }

  /** a vehicle on link lane L picks the movement it wants at the end of L's dseg and plans through it. A vehicle with a
   *  destination steers by the router (see steer); one without walks at random (any non-U one, U only when that is all there is).
   *  Returns false if the vehicle was lost and removed. */
  private pickMove(i: number): boolean {
    const g = this.g, L = this.lane[i], dsId = g.lanes[L]!.dseg, d = g.dsegs[dsId], bus = this.bus[i]! >= 0;
    // a bus with no stop to drive to waits (see hold); a car with none walks at random
    if (bus && this.dest[i]! < 0) return this.hold(i);
    const outs = d ? d.out : [];
    const early = this.ahead[i]!; this.ahead[i] = -1;
    if (!outs.length) { this.unbind(i); this.plan[i] = [L]; this.pi[i] = 0; this.move[i] = -1; this.want[i] = -1; return true; }
    let w: number;
    if (this.dest[i]! < 0) w = this.randomMove(outs);
    // chosen one junction early (the dseg is short, see LOOK)
    else if (early >= 0 && outs.includes(early)) w = early;
    else {
      w = this.steer(i, dsId, outs);
      if (w < 0 && bus) return this.hold(i);
      if (w === -2) { this.lose(i); return false; }
      if (w < 0) {
        // no finite cost from here: a random walk this time; three in a row and the vehicle is lost
        if (++this.noRoute[i]! >= 3) { this.lose(i); return false; }
        w = this.randomMove(outs);
      } else this.noRoute[i] = 0;
    }
    this.want[i] = w;
    // the dseg after w is short: its movement is chosen now too, so the lane here is picked for both (see LOOK)
    const m = g.moves[w], d2 = m ? g.dsegs[m.to] : null;
    if (!bus && this.dest[i]! >= 0 && d2 && d2.len < LOOK && d2.out.length > 1 && m!.to !== this.dest[i]) { const w2 = this.steer(i, m!.to, d2.out); if (w2 >= 0) this.ahead[i] = w2; }
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
  /** plans vehicle i from its lane L: the wanted movement if it has a path from L, else `prefer` if it has one, else (with a destination)
   *  the router's choice among the movements that have one, else a random movement that has one, else the fallback chain. (A random one
   *  sent a car stuck in the left lane of a jammed 3-lane ring round the inner lane on a U-turn, back out the way it came and in again:
   *  the owner's 3-lane ring, 2026-10-19) */
  private planFrom(i: number, L: number, prefer: number) {
    const g = this.g, d = g.dsegs[g.lanes[L]!.dseg], outs = d ? d.out : [];
    this.unbind(i);
    let m = -1;
    if (this.reach(this.want[i], L)) m = this.want[i];
    else if (this.reach(prefer, L)) m = prefer;
    else if (this.dest[i]! >= 0 && (m = this.router.choose(outs.filter(x => this.reach(x, L)), this.router.zoneD[this.dest[i]!]!, this.rnd)) >= 0) this.route[i] = null;
    else {
      let n = 0; for (const x of outs) if (this.reach(x, L)) n++;
      if (n) { let k = Math.floor(this.rnd() * n); for (const x of outs) if (this.reach(x, L) && k-- === 0) { m = x; break; } }
    }
    this.move[i] = m;
    this.plan[i] = m >= 0 ? this.start(m, L, m === this.want[i] ? this.ahead[i]! : -1) ?? this.chain(L) : this.chain(L);
    this.pi[i] = 0;
    // a plan from an approach lane onto a booth: the vehicle is bound to that booth lane until it is on it (or leaves the plan)
    const P = this.plan[i]!;
    if (P.length > 2 && this.lBooth[P[2]!]! >= 0 && this.lBooth[P[0]!]! < 0) { this.boundTo[i] = P[2]!; this.bound[P[2]!]++; }
  }
  /** releases vehicle i's booth binding (see planFrom): the bound count of its booth lane drops */
  private unbind(i: number) { const b = this.boundTo[i]!; if (b >= 0) { this.bound[b]!--; this.boundTo[i] = -1; } }

  /** the plan a movement gives from lane L: its path from L, or a path whose second lane L feeds (its first lane replaced by L); null if none */
  private start(mid: number, L: number, w2 = -1): number[] | null {
    const m = this.g.moves[mid]!, nx = this.g.lanes[L]!.next;
    // several paths from L (a toll gate's fan-out to its booths): the one whose booth lane (its third) has the fewest vehicles, the lowest index on a tie;
    // with a movement chosen early (w2), only those whose last lane reaches it, if any does
    const ok = (p: number[]) => w2 < 0 || this.reach(w2, p[p.length - 1]!), any = w2 >= 0 && m.paths.some(p => p[0] === L && ok(p));
    let best: number[] | null = null, bn = Infinity;
    for (const p of m.paths) if (p[0] === L && (!any || ok(p))) { const b = p[2]!, c = this.onLane[b]!.length + this.bound[b]!; if (c < bn) { bn = c; best = p; } }
    if (best) return best.slice();
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

  /** true if movement mid has a path from lane L whose last lane has a plan for movement w2 (the lane before a short dseg, see LOOK) */
  private reach2(mid: number, L: number, w2: number): boolean {
    const m = this.g.moves[mid]; if (!m) return false;
    const nx = this.g.lanes[L]!.next;
    for (const p of m.paths) if ((p[0] === L || nx.includes(p[1]!)) && this.reach(w2, p[p.length - 1]!)) return true;
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
    this.busOff(i);
    if (this.grant[i] >= 0) this.unGrant(i);
    if (this.resv[i] >= 0) this.unReserve(i);
    this.alive[i] = 0; this.plan[i] = null; this.route[i] = null; this.sink[i] = -1; this.party[i] = -1; this.paid[i] = 0; this.dwell[i] = 0; this.unbind(i); this.active--;
    if (i < this.hint) this.hint = i;
  }

  /** up to FILL_TRIES spawn attempts per step while below the aim (the target, or the daily profile's share of it) */
  private fill() {
    const aim = this.profile ? Math.round(this.target * demandAt(this.clock)) : this.target;
    for (let n = 0; n < FILL_TRIES && this.active - this.busN < aim; n++) this.spawn();
  }
}
