// The main thread's side of the traffic simulation: it posts edits and settings to the sim worker, keeps the last two
// frames, and interpolates the cars between them so they move smoothly at 60 fps while the sim runs at 10 Hz.
import SimWorker from './sim.worker?worker';
import type { GallerySpot } from '../golf/galleries';
import type { NetOp } from '../ground-protocol';
import { CAR_SCALE, type Drawable } from '../sprites';
import { carHeading, facings } from '../traffic';
import { hash3, paintOf } from '../car-paint';
import { zoneOf } from './routing';
import { sigKey } from './signals';
import { STILL, brakeLamps } from './car-lamps';
import type { FromSim, LotRec, SimStats, ToSim } from './protocol';
import { profileFor, townClockFor, type TownClock } from './townclock';
import type { DisasterNote, DisasterView } from '../city';
import type { DisasterKind } from '../ext/disasters';
import { LV, type LotTuple, type TownEvent } from '../lots/town';
import type { Leg, Pt } from '../network';
import { GOLF_START_MONEY } from '../golf/mode';
import { VTYPES, type CarInfo } from './sim';
import type { Report } from './bottlenecks';
import type { HourStat } from '../beforeafter';
import { Budget, GAME_DAY, START_MONEY, startMoney, type BudgetSave, type Ledger } from '../budget';
import type { CareerSave, Milestone } from '../career';
import { Round, type RoundSave, type RoundView } from '../event/round';
import type { Site } from '../event/site';
import type { CardId } from '../event/config';
import type { CarParkDef, ParkView } from '../event/carpark';
import type { TollDef } from '../event/toll';
import type { BayRowDef } from '../event/rows';
import type { CurbDef } from '../event/curb';
import type { BusRouteDef } from '../event/bus';
import type { BizDef, BizStats, BizView } from '../business/state';
import type { DaySave } from '../event/daysave';

/** frames arrive this often, ms: a car is drawn between the last two frames over that time */
const FRAME_MS = 100;
/** how long the engine's save waits for the worker's tournament day (T209, daySave), ms */
const DAY_WAIT_MS = 1500;
/** a car that moved this far (tiles) between two frames was respawned or re-planned: drawn at its new place, not lerped */
const JUMP = 3;
/** the round before any frame: free, level 1, no runs */
const NO_ROUND: RoundView = new Round().view();
/** no walkers or stops (before a surge, and after it) */
const NO_FLOATS = new Float32Array(0);
const EMPTY: SimStats = { active: 0, target: 0, lanes: 0, stepMs: 0, tickMs: 0, maxTickMs: 0, graphMs: 0, respawned: 0, simT: 0, skipping: false, clock: 0, frozen: false, round: NO_ROUND, parks: [], town: townClockFor(1440) };
/** half a car's length per vehicle type, tiles (its brake lights sit at its rear: car-lamps.ts) */
const HALF = VTYPES.map(v => v.len / 4);

/** a parcel as the worker sent it, with the town's use, level, decline, the lot's seed and the sim s of its last change (0, 0, 0, 0, 0 = EMPTY) */
export interface LotView extends LotRec { use: number; level: number; decline: number; seed: number; since: number }


/** The city worker's side: the cars of the sim, as typed arrays indexed by slot (n = the sim's slot count, 0 before the first frame), the parcels and the town. */
export class SimClient {
  private worker: Worker | null;
  /** the parcels by key (geometry and the town's state) */
  lots = new Map<string, LotView>();
  /** the town's residents, jobs and built lots (from the last town message) and the growth option id */
  pop = 0; jobs = 0; built = 0; option = 'balanced';
  /** T221: a range start's room, the residents its earnings allow (City.townRoom; null in other games) */
  room: number | null = null;
  /** the access per zone (256, 1 = free flow) from the last town message, and the zones with a built lot (1) */
  access: Float32Array = new Float32Array(256).fill(1); builtZone = new Uint8Array(256);
  /** called with the events of each town message (after the lots are updated) */
  onTown?: (events: TownEvent[]) => void;
  /** lots whose rectangle changed while their town state stayed (a road widened or narrowed under them moves its lots' fronts): the engine composes them again */
  onLotsMoved?: (keys: string[]) => void;
  /** called with the gravel extension the town plans (the engine builds it, or skips it); the worker waits for its net ops */
  onGrow?: (legs: Leg[]) => void;
  /** the city's books as the worker last sent them (the treasury is also moved on spend, before the worker's answer), the game day, and called with each day's ledger as it closes */
  budget: BudgetSave = new Budget().toJSON(); day = 1; onLedger?: (l: Ledger) => void;
  /** the career as the worker last sent it (reset with the books), and called with the milestones a step newly reached and whether the city won */
  career: CareerSave = { reached: 0, won: false }; onMilestone?: (newly: Milestone[], won: boolean) => void;
  /** the bottleneck report as the worker last sent it (null until the first; one each game hour, and after requestReport), and called with each one as it arrives */
  report: Report | null = null; onReport?: () => void;
  /** the game hours' snapshots as the worker last sent them with the report (see HourStat), newest last */
  hours: HourStat[] = [];
  /** the desired vehicle count (the sim clamps it to its slots) */
  target = 0;
  /** the inspected car as the worker last sent it (with every frame while one is inspected; null when none, or it is gone) */
  car: CarInfo | null = null;
  /** the junction watch: its node (null: none), the crossings since it was set, and their lines (4 floats each); null when not watching */
  watch: { node: [number, number] | null; n: number; lines: Float32Array } | null = null;
  /** the slot inspected (-1: none), and whether a junction is watched: the worker's answers are kept only while so */
  private slot = -1; private watching = false;
  /** the stats of the last frame received */
  stats: SimStats = { ...EMPTY };
  /** the event round as the worker last sent it (with the frame stats; see startRound), and the stadium's site (null: none; with each terrain) */
  round: RoundView = NO_ROUND; site: Site | null = null;
  /** the player's businesses with their stats as the worker last sent them (see postBiz; a copy each time) */
  biz: BizView[] = [];
  /** called after each businesses message (the list is the worker's, with each one's stats; see biz) */
  onBiz?: () => void;
  /** the car parks' counts as the worker last sent them (with each frame; see ParkView) */
  parks: ParkView[] = [];
  /** the shuttle crowd as the worker last sent it, with each frame of a surge and its eval (empty otherwise): the walking fan groups (6 floats each: x, y in
   *  tiles, fans, stage, tx, ty (the target); stage 0 to a lot stop, 1 to a door) and the lot stops (4 floats each: x, y in tiles, the fans waiting, the route index) */
  walkers: Float32Array = NO_FLOATS; stops: Float32Array = NO_FLOATS;
  /** the galleries' standing crowds (LEAD.md M2.2): 8 floats a spot (x, y, fans, kind, fx, fy, ax, ay) */
  gallery: Float32Array = NO_FLOATS;
  /** T147: the money moved at a place, from the frames since the engine last took it (4 numbers each: x, y in tiles, $ signed, 1 a sale lost; see
   *  City.takeCash): the engine floats it up and clears it */
  cash: number[] = [];
  /** T147: told of every spend (the engine floats a purchase up where it was placed) */
  onSpend: ((kind: 'construction' | 'compensation' | 'business' | 'upkeep', n: number) => void) | null = null;
  /** the active traffic incidents as the worker last sent them (with each frame): 3 floats each, x and y (tiles) and kind (1 crash, 0 breakdown) */
  incidents: Float32Array = NO_FLOATS;
  /** the active natural disaster as the worker last sent it (none: empty); called with the notes (warnings, starts, ends, repairs) of each such message */
  disasters: DisasterView[] = []; onDisasters?: (notes: DisasterNote[]) => void;
  /** the signal states as the worker last sent them (with each frame): the phase served (idx) and the stage, by sigKey of the plan's node */
  sigs = new Map<string, { idx: number; stage: number }>();
  /** the congestion heat map: its geometry as the worker last sent it (6 floats per dseg id: from x, y, to x, y in tiles, the lateral offset
   *  of its lanes' centre in tiles along perp(direction), its lane count; NaN for a dead id; null until the first) and the version it is for */
  heatGeom: Float32Array | null = null; heatGeomVersion = -1;
  /** the heat map's per-dseg speed ratio (mean v / lane vmax, 1 = free) and density (vehicles per km per lane) as the worker last sent them
   *  (null until the first), and the performance.now() of that message (see heatOn) */
  heatRatio: Float32Array | null = null; heatDens: Float32Array | null = null; heatAt = 0;
  /** the congestion over time per dseg id (heatHist, delay per lane-km, EMA of about 6 game hours) and the parking demand per cell (parkDemand, cars per
   *  game hour, cells of PD_CELL tiles), as the worker last sent them (null until the first heat) */
  heatHist: Float32Array | null = null; parkDemand: Float32Array | null = null;
  n = 0;
  alive = new Uint8Array(0); px = new Float32Array(0); py = new Float32Array(0);
  /** 4-facing index of the heading: 0 +x, 1 +y, 2 -x, 3 -y */
  head = new Uint8Array(0); kind = new Uint8Array(0); brake = new Uint8Array(0); tunnel = new Uint8Array(0);
  /** standing still: no move between the last two frames (T192: its brake lights are lit, as when braking) */
  still = new Uint8Array(0);
  /** the current frame's heading per slot, radians; the turn signal per slot: 0 none, 1 left, 2 right */
  ang = new Float32Array(0); sig = new Uint8Array(0);
  private prev: Float32Array | null = null; private cur: Float32Array | null = null; private tCur = 0;
  /** the sim speed last set (sim seconds per second) */
  private speed = 1;
  /** the dev sandbox's unlimited money, as last sent (see sandbox) */
  unlimited = false;
  private pool: Drawable[] = [];

  /** starts the city worker, empty: the terrain and the network follow (terrain, then netOps). run false (a light boot, the lot lab: T157,
   *  boot.ts): no worker at all; every message is dropped, so no cars, town growth or books, and this mirror stays empty */
  constructor(run = true) {
    this.worker = run ? new SimWorker() : null;
    if (this.worker) this.worker.onmessage = (e: MessageEvent<FromSim>) => this.onMessage(e.data);
  }
  private post(m: ToSim) { this.worker?.postMessage(m); }
  /** replaces the worker's network (the same ops the ground workers get) */
  netOps(ops: NetOp[]) { if (ops.length) this.post({ t: 'net', ops }); }
  /** a new valley: its terrain classes (copied), the highway entry (tiles), the seed and the town centres (flat x, y pairs in tiles; none: the single town),
   *  and the heights (HS*HS metres, copied; the disasters read them: none gives flat ground); the town starts again. Send before the net ops. */
  terrain(cls: Uint8Array, entry: [number, number], seed: number, towns: number[] = [], height?: Float32Array, golf = false) {
  this.post({ t: 'terrain', cls, entry, seed, towns, height, golf });
  // the town starts again: the lot mirror too, or a lot whose key the new network shares with the old one (the range start's county roads
  // are lattice-aligned, so two games often share one) would keep the old town's state, be saved with it and come back on a load
  this.lots.clear();
  // the worker starts the game clock again (City.terrain, T135): the mirror reads the new game's first instant and day 1 at once, not the last
  // game's month until the next frame (simT runs on: the clock's shift and the town day's start take it up)
  if (this.cur) {
    const t = this.simTime(performance.now()), d = t - this.stats.simT;
    this.stats = { ...this.stats, clock: -d, frozen: false, skipping: false, town: { t0: t, m0: 0, rate: 1440 / this.dayLen } }; this.town = this.stats.town;
  }
  // the worker resets the books and the career with a new valley (City.terrain): the mirror shows the fresh treasury at once
  this.budget = { ...new Budget().toJSON(), money: golf ? GOLF_START_MONEY : startMoney(towns.length > 0), base: Math.floor(this.clockTime(performance.now()) / GAME_DAY) * GAME_DAY };
  this.career = { reached: 0, won: false };
  }
  /** the towns built at once (after a new valley's net ops): each grows to pop residents; the town's lots and totals come back as a town message */
  stamp(pop: number) { this.post({ t: 'stamp', pop }); }
  /** the town's growth option by id (see GROWTH_OPTIONS) */
  setOption(id: string) { this.option = id; this.post({ t: 'option', id }); }
  /** the dev sandbox's options: the growth speed (1 = the game's) and unlimited money (spending does not move the treasury); stored as unlimited */
  sandbox(grow: number, money: boolean) { this.unlimited = money; this.post({ t: 'sandbox', grow, money }); }
  /** a saved town for the worker (its lots, the sim time, s, the clock's shift from it, and its books or the treasury of an old save): after the net ops of a load */
  townState(lots: LotTuple[], simT: number, budget?: BudgetSave, money = START_MONEY, career?: CareerSave, shift = 0, round?: RoundSave, biz?: BizStats[]) { this.post({ t: 'townState', lots, simT, budget, money, career, shift, round, biz }); }
  /** starts an event round (the stadium's crowd comes to kick-off at 18:00 of the clock, which freezes): the build comes first */
  startRound() { this.post({ t: 'round', op: 'start' }); }
  /** the car parks (the full list, each time): the worker builds their bays and entrances on the network it has */
  setParks(defs: CarParkDef[]) { this.post({ t: 'parks', defs }); }
  /** T219: the iconic places' land (tiles, [x, y, w, h], the full list each time): the town never builds there (City.setPlaces) */
  setPlaces(rects: [number, number, number, number][]) { this.post({ t: 'places', rects }); }
  /** the player's businesses (the full list, each time): the worker's stadium site follows (see City.setBusinesses) */
  setBusinesses(defs: BizDef[]) { this.post({ t: 'businesses', defs }); }
  /** golf mode on (with the tournament's tier and its reputation: the season ends with it) or off (see City.setGolf) */
  setGolf(on: boolean, tier: number, rep: number, land?: [number, number, number, number][], range?: { start?: 'range'; exits?: Pt[]; invited?: { at: number }; holes?: number; townBoost?: number }) { this.post({ t: 'golf', on, tier, rep, land, start: range?.start, exits: range?.exits, invited: range?.invited, holes: range?.holes, townBoost: range?.townBoost }); this.golfOn = on; this.sendTownDay(); }
  /** T090: told a range start's new town success after a tournament (the engine keeps it in the save) */
  onTownBoost: ((v: number) => void) | null = null;
  /** the town day (LEAD.md M1): in a golf game the town lives a day of townMinutes (real minutes at 1x; one sim second is one game minute)
   *  with its own commute, separate from the season; townTraffic scales its lot trips. A classic game keeps the classic day (DAY). */
  golfOn = false; townMinutes = 10; townTraffic = 1;
  /** T266: the day/night clock's night, sim seconds (townclock.ts profileFor: the golf hours take the rest of the day), null: the flat clock */
  golfNight: number | null = null;
  /** the town day's length in sim seconds, as last sent */
  dayLen = 1440;
  /** the town day's clock as the worker last sent it (with the frame stats; see townclock.ts) */
  town: TownClock = townClockFor(1440);
  /** the galleries' spots (LEAD.md M2.2): sent with the gates, and when the holes change */
  setSpots(spots: GallerySpot[]) { this.post({ t: 'spots', spots }); }
  /** the golf play's featured holes (docs/GOLF-PLAY.md decision 6): the crowd's spots on these holes draw more; [] none (see City.setFeatured) */
  setFeatured(holes: number[]) { this.post({ t: 'featured', holes }); }
  /** the course's gates (LEAD.md M2.1): sent whenever the placed gate structures change */
  setGates(gates: { x: number; y: number; lanes: number }[]) { this.post({ t: 'gates', gates }); }
  setTownDay(minutes: number, traffic: number) { this.townMinutes = minutes; this.townTraffic = traffic; this.sendTownDay(); }
  private sendTownDay() { this.dayLen = this.golfOn ? Math.max(24, Math.round(this.townMinutes * 60)) : 1440; this.post({ t: 'townDay', dayLen: this.dayLen, traffic: this.golfOn ? this.townTraffic : 1, free: this.golfOn, prof: this.golfOn && this.golfNight ? profileFor(1440 / this.dayLen, this.golfNight) : null }); }
  /** the town day's clock from a save (after townState, and after the golf setup so dayLen is current; see townclock.ts): the worker runs it at the normal rate */
  setTownClock(clock: TownClock) { this.post({ t: 'townClock', clock }); }
  /** T209: the tournament day as the save keeps it (City.daySave, asked of the worker): null when no tournament day is under way, without a worker, or
   *  with no answer within DAY_WAIT_MS (the save is then written without it, as before) */
  daySave(): Promise<DaySave | null> {
    if (!this.worker) return Promise.resolve(null);
    const id = ++this.dayAsk;
    return new Promise(res => {
      const done = (d: DaySave | null) => { clearTimeout(timer); this.dayWait.delete(id); res(d); }, timer = setTimeout(() => done(null), DAY_WAIT_MS);
      this.dayWait.set(id, done); this.post({ t: 'daySave', id });
    });
  }
  private dayAsk = 0; private dayWait = new Map<number, (d: DaySave | null) => void>();
  /** T209: a saved tournament day resumes (after townState and setTownClock; City.resumeDay): the saved round and the day */
  resumeDay(round: RoundSave | undefined, day: DaySave) { this.post({ t: 'resumeDay', round, day }); }
  /** dev test hook: n cars sent to car park id's entrances (round-robin), for the browser check */
  parkTest(id: number, n: number) { this.post({ t: 'parkTest', id, n }); }
  /** the toll gates as the player placed them (the full list): the worker builds their booths (see City.setTolls) */
  setTolls(defs: TollDef[]) { this.post({ t: 'tolls', defs }); }
  /** the bay rows and the on-street runs as the player drew them (the full lists) and the parking fee per car ($): the worker builds them as car parks (see City.setParking) */
  setParking(rows: BayRowDef[], curbs: CurbDef[], fee: number) { this.post({ t: 'parking', rows, curbs, fee }); }
  /** ends the build now: the surge (the crowd's run to kick-off) begins */
  startNow() { this.post({ t: 'round', op: 'now' }); }
  /** closes the round's eval: the round is free again and the clock runs on */
  closeRound() { this.post({ t: 'round', op: 'close' }); }
  /** takes a card of the eval's draft: its effects apply at once (see City.pickCard) */
  pickCard(card: CardId) { this.post({ t: 'round', op: 'pick', card }); }
  /** spends n $ on kind (negative construction gives it back): the treasury drops now, the worker books it into today's ledger */
  spend(kind: 'construction' | 'compensation' | 'business' | 'upkeep', n: number) {  
 if (kind === 'business') { this.budget.money -= n; }  
 else if (kind === 'upkeep') { this.budget.money -= n; }  
 else { this.budget.money -= n; }  
 this.post({ t: 'spend', kind, n }); this.onSpend?.(kind, n);  
 }
  /** takes (true) or repays (false) one loan unit; the worker refuses what the books do not allow */
  loan(take: boolean) { this.post({ t: 'loan', take }); }
  /** replaces the books with a saved budget, or a fresh one for null (based at the sim day's midnight), and the career saved with them (a fresh one if none); the mirrors take it at once, so a save right after sees it */
  setBudget(save: BudgetSave | null, career?: CareerSave | null) { this.budget = save ?? { ...new Budget().toJSON(), base: Math.floor(this.clockTime(performance.now()) / GAME_DAY) * GAME_DAY }; this.career = career ?? { reached: 0, won: false }; this.post({ t: 'budget', save, career }); }
  /** asks the worker for the bottleneck report now (it arrives later, into report) */
  requestReport() { this.post({ t: 'report' }); }
  /** the shuttle routes as the player drew them (the full list, each time): the worker resolves their stops and plans their buses */
  setBusRoutes(defs: BusRouteDef[]) { this.post({ t: 'buses', defs }); }
  /** the player buys the town lot key out (the worker clears it if the books cover it; its 'clear' comes back in a town message) */
  buyLot(key: string) { this.post({ t: 'buyLot', key }); }
  /** sets the number of cars the sim keeps on the network */
  setTarget(n: number) { this.target = n; this.post({ t: 'target', n }); }
  /** the sim speed: 0 pauses, 1 is real time, 2, 4, 8 and 20 are faster */
  setSpeed(k: number) { this.speed = k; this.post({ t: 'speed', k }); }
  /** fast-forwards the sim as fast as the worker can until the sim time until (s); the cars are not drawn between frames meanwhile */
  skip(until: number) { this.post({ t: 'skip', until }); }
  /** inspects the car in slot (-1 stops); its info comes with the next frames, into car */
  inspect(slot: number) { this.slot = slot; this.car = null; this.post({ t: 'inspect', slot }); }
  /** watches the junction within 4 tiles of (x, y) for the routes through it, into watch (no junction there: a watch with no node) */
  watchAt(x: number, y: number) { this.watching = true; this.post({ t: 'watch', x, y }); }
  /** stops the junction watch */
  unwatch() { this.watching = false; this.watch = null; this.post({ t: 'watch', x: -1, y: -1 }); }
  /** turns the congestion heat map on or off (off by default: the worker posts nothing for it then). On: the geometry comes first (heatGeom), then
   *  the heat every 500 ms (heat, heatRatio, heatDens, heatAt); the last values stay after off */
  heatOn(on: boolean) { this.post({ t: 'heat', on }); }
  /** turns the traffic incidents on or off (on by default; off lifts the blocks they made); the active ones come with each frame into incidents */
  incidentsOn(on: boolean) { this.post({ t: 'incidents', on }); }
  /** turns the natural disasters on or off (off by default: no warnings, closures or risk rolls); off lifts their closures. The dev switch: window.__game.traffic.disastersOn(true) */
  disastersOn(on: boolean) { this.post({ t: 'disastersOn', on }); }
  /** dev: the next daily risk roll draws a disaster of this kind (the disasters must be on) */
  forceDisaster(kind: DisasterKind) { this.post({ t: 'forceDisaster', kind }); }
  /** pays for the repair of the quake closure key of disaster id (the worker charges it, or notes it unpaid); the note comes back with the next disasters message */
  repairDisaster(id: number, key: string) { this.post({ t: 'repairDisaster', id, key }); }
  /** true while the worker is fast-forwarding (see skip) */
  get skipping() { return this.stats.skipping; }
  terminate() { this.worker?.terminate(); }

  private onMessage(m: FromSim) {
    if (m.t === 'log') { console.log('[sim]', m.message); return; }
    if (m.t === 'error') { console.error('[sim]', m.message); return; }
    if (m.t === 'lots') { this.applyLots(m.added, m.removed); return; }
    if (m.t === 'budget') { this.budget = m.save; this.career = m.career; this.day = m.day; if (m.ledger) this.onLedger?.(m.ledger); return; }
    if (m.t === 'milestone') { this.onMilestone?.(m.newly, m.won); return; }
    if (m.t === 'report') { this.report = m.report; this.hours = m.hours; this.onReport?.(); return; }
    // a null car is the inspected one gone (the worker stops then); a car of another slot is a late answer to an earlier inspect
    if (m.t === 'car') { if (this.slot >= 0 && (!m.info || m.info.slot === this.slot)) this.car = m.info; return; }
    if (m.t === 'watch') { if (this.watching) this.watch = { node: m.node, n: m.n, lines: m.lines }; return; }
    if (m.t === 'site') { this.site = m.site; return; }
    if (m.t === 'biz') { this.biz = m.list; this.onBiz?.(); return; }
    if (m.t === 'daySave') { this.dayWait.get(m.id)?.(m.day); return; }
    if (m.t === 'heatGeom') { this.heatGeom = m.geom; this.heatGeomVersion = m.version; return; }
    if (m.t === 'heat') { this.heatRatio = m.ratio; this.heatDens = m.dens; this.heatHist = m.hist; this.parkDemand = m.pdem; this.heatAt = performance.now(); return; }
    if (m.t === 'disasters') { this.disasters = m.active; this.onDisasters?.(m.notes); return; }
    if (m.t === 'grow') {
      const legs: Leg[] = [];
      for (let i = 0; i + 3 < m.legs.length; i += 4) legs.push({ a: { x: m.legs[i], y: m.legs[i + 1] }, b: { x: m.legs[i + 2], y: m.legs[i + 3] } });
      this.onGrow?.(legs); return;
    }
    if (m.t === 'townBoost') { this.onTownBoost?.(m.v); return; }
    if (m.t === 'town') {
      for (const e of m.events) { const v = this.lots.get(e.key); if (v) { v.use = e.use; v.level = e.level; v.decline = e.decline; v.seed = e.seed; v.since = e.since; } }
      this.pop = m.pop; this.jobs = m.jobs; this.built = m.built; this.access = m.access; this.room = m.room ?? null;
      this.builtZone.fill(0);
      for (const v of this.lots.values()) if (v.level >= LV.BUILT && v.use) this.builtZone[zoneOf(v.o[0] + v.u[0] * v.w / 2 + v.n[0] * v.d / 2, v.o[1] + v.u[1] * v.w / 2 + v.n[1] * v.d / 2)] = 1;
      this.onTown?.(m.events); return;
    }
    this.stats = m.stats; this.round = m.stats.round; this.parks = m.stats.parks; this.town = m.stats.town;
    this.walkers = m.walkers ?? NO_FLOATS; this.stops = m.stops ?? NO_FLOATS; this.gallery = m.gallery ?? NO_FLOATS; this.incidents = m.inc;
    if (m.money && this.cash.length < 4096) for (let k = 0; k < m.money.length; k++) this.cash.push(m.money[k]!);
    const S = new Map<string, { idx: number; stage: number }>(), G = m.sig;
    for (let k = 0; k + 3 < G.length; k += 4) S.set(sigKey(G[k]!, G[k + 1]!), { idx: G[k + 2]!, stage: G[k + 3]! });
    this.sigs = S;
    if (m.cap !== this.n) this.resize(m.cap);
    this.prev = this.cur; this.cur = m.buf; this.tCur = performance.now();
  }
  /** the parcels changed: the removed keys go, the added ones are set (a key re-added keeps its town state) */
  private applyLots(added: LotRec[], removed: string[]) {
    const keep = new Set<string>();
    for (const r of added) keep.add(r.key);
    for (const k of removed) if (!keep.has(k)) this.lots.delete(k);
    const moved: string[] = [];
    // every lot that came, moved or went is handed on (an empty lot is composed too: its share of the fence grid)
    for (const k of removed) if (!keep.has(k)) moved.push(k);
    for (const r of added) { const old = this.lots.get(r.key); moved.push(r.key); this.lots.set(r.key, { ...r, use: old?.use ?? 0, level: old?.level ?? 0, decline: old?.decline ?? 0, seed: old?.seed ?? 0, since: old?.since ?? 0 }); }
    if (moved.length) this.onLotsMoved?.(moved);
  }
  private resize(cap: number) {
    this.n = cap; this.prev = null;
    this.alive = new Uint8Array(cap); this.px = new Float32Array(cap); this.py = new Float32Array(cap);
    this.head = new Uint8Array(cap); this.kind = new Uint8Array(cap); this.brake = new Uint8Array(cap); this.tunnel = new Uint8Array(cap); this.still = new Uint8Array(cap);
    this.ang = new Float32Array(cap); this.sig = new Uint8Array(cap);
  }

  /** the sim's time now, s: the time of the last frame, moved on at the sim speed since it arrived (0 before the first frame) */
  simTime(now: number): number { if (!this.cur) return 0; return this.stats.skipping ? this.stats.simT : this.stats.simT + Math.max(0, now - this.tCur) / 1000 * this.speed; }
  /** the game clock now, s (the time of day and the game day): the clock of the last frame, moved on at the sim speed like simTime, but
   *  not while it is frozen or the sim is skipping (0 before the first frame) */
  clockTime(now: number): number { if (!this.cur) return 0; const s = this.stats; return s.clock + (s.frozen || s.skipping ? 0 : Math.max(0, now - this.tCur) / 1000 * this.speed); }

  /** unpacks the current frame into the arrays, lerping each car from its place in the previous frame (at now) */
  update(_now: number) {
    const cur = this.cur;
    if (!cur) return;
    // performance.now(), not the rAF time: a frame that arrived after the rAF timestamp would get a negative alpha
    const prev = this.prev, alpha = Math.min(1, Math.max(0, (performance.now() - this.tCur) / FRAME_MS));
    for (let i = 0; i < this.n; i++) {
      const k = 4 * i, flags = cur[k + 3] | 0;
      if (!(flags & 1)) { this.alive[i] = 0; continue; }
      this.alive[i] = 1;
      let x = cur[k], y = cur[k + 1]; this.still[i] = 0;
      if (prev && (prev[k + 3] | 0) & 1) {
        const x0 = prev[k], y0 = prev[k + 1], dx = x - x0, dy = y - y0;
        if (dx * dx + dy * dy < JUMP * JUMP) { x = x0 + dx * alpha; y = y0 + dy * alpha; }
        if (dx * dx + dy * dy < STILL * STILL) this.still[i] = 1;
      }
      this.px[i] = x; this.py[i] = y;
      const a = cur[k + 2], dx = Math.cos(a), dy = Math.sin(a);
      this.head[i] = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      this.kind[i] = flags >> 5; this.brake[i] = (flags >> 1) & 1; this.tunnel[i] = (flags >> 2) & 1;
      this.ang[i] = a; this.sig[i] = (flags >> 3) & 3;
    }
  }

  /** drawables for the cars inside a tile box (reused objects; tunnel cars are not drawn); lamps: each carries its brake lights (T192,
   *  car-lamps.ts: lit while braking or standing still, only when its rear faces the viewer), drawn in the sprite pass right after it */
  visible(x0: number, y0: number, x1: number, y1: number, lamps = false): Drawable[] {
    const F = facings(), out: Drawable[] = []; let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.tunnel[i]) continue;
      const x = this.px[i], y = this.py[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const f = F[this.kind[i] % F.length][carHeading(this.ang[i])];
      let d = this.pool[k]; if (!d) this.pool.push((d = { item: 0, x: 0, y: 0, flip: false, scale: CAR_SCALE, x0: 0, y0: 0, x1: 0, y1: 0, moving: true }));
      // drawn at its size (CAR_SCALE times the car's owner size) about the car's centre: the anchor and footprint offsets scale with it
      const z = CAR_SCALE * f.size;
      // (T228: its paint from its slot: the same car keeps its colour all its trip; a bus is no car model, so it has none)
      d.item = f.item; d.flip = f.flip; d.scale = z; d.paint = paintOf(hash3(i, 0x51)); d.x = x - f.ox * z; d.y = y - f.oy * z; d.x0 = x - f.hx * z; d.x1 = x + f.hx * z; d.y0 = y - f.hy * z; d.y1 = y + f.hy * z;
      // its brake lights at its rear as drawn (its size: the lamps sit on the car's picture)
      const lit = lamps && (this.brake[i] === 1 || this.still[i] === 1);
      if (lit) { const L = (d.lamps ??= []), n = brakeLamps(x, y, this.ang[i]!, z, HALF[this.kind[i]! % HALF.length]! * z, true, L); L.length = n; if (!n) d.lamps = undefined; }
      else if (d.lamps) d.lamps = undefined;
      out.push(d); k++;
    }
    return out;
  }
}
