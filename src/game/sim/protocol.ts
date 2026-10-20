// Messages between the main thread (SimClient) and the city worker (sim.worker.ts): the traffic sim, the parcels and the town.
import type { NetOp } from '../ground-protocol';
import type { LotTuple, TownEvent } from '../lots/town';
import type { BudgetSave, Ledger } from '../budget';
import type { CareerSave, Milestone } from '../career';
import type { Report } from './bottlenecks';
import type { CarInfo } from './sim';
import type { HourStat } from '../beforeafter';
import type { RoundSave, RoundView } from '../event/round';
import type { CardId } from '../event/config';
import type { Site } from '../event/site';
import type { CarParkDef, ParkView } from '../event/carpark';
import type { TollDef } from '../event/toll';
import type { BayRowDef } from '../event/rows';
import type { CurbDef } from '../event/curb';
import type { BusRouteDef } from '../event/bus';
import type { BizDef, BizStats, BizView } from '../business/state';
import type { DisasterNote, DisasterView } from '../city';
import type { DisasterKind } from '../ext/disasters';

/** what the worker measured, sent with every frame (walkers and stops: while a surge or its eval is on: the walking fan groups, 4 floats each (x, y in tiles, fans, stage),
 *  and the lot stops, 4 floats each (x, y in tiles, the fans waiting, the route index)); skipping: a fast-forward is running (simT is then the last frame's, not extrapolated);
 *  clock: the game clock, s (simT + the clock's shift); frozen: the clock is frozen (it does not move while simT does) */
export interface SimStats { active: number; target: number; lanes: number; stepMs: number; tickMs: number; maxTickMs: number; graphMs: number; respawned: number; simT: number; skipping: boolean; clock: number; frozen: boolean; round: RoundView; parks: ParkView[] }
/** a parcel as plain data: origin o, along u and away n (tiles, unit vectors), width w, depth d, the frontage's road class and a corner flag */
export interface LotRec { key: string; o: [number, number]; u: [number, number]; n: [number, number]; w: number; d: number; cls: string; corner: boolean }
/** main thread to worker: network edits, a new valley (terrain classes, the highway entry in tiles, the seed, the town centres as flat x, y pairs in tiles (none: the single town)), the vehicle target, the speed (0 pauses; 1 is real time), the growth option id, a saved town (its lots, the sim time, s, the clock's shift from it (s; 0 if none), and its books, or the treasury of an old save; sent after the net ops of a load), a skip: fast-forward the sim as fast as the worker can until the sim time until (s),
 *  a spend (construction or compensation, $; negative construction gives back), a loan (take or repay one unit), the books replaced (a saved budget, or null for a fresh one; with the career saved with them, or none for a fresh one),
 *  a stamp (the towns built at once: each grows to pop residents; after the net ops of a new valley),
 *  a sandbox (dev options: the growth speed grow (1 = the game's) and unlimited money (money: spending does not move the treasury)) */
export type ToSim = { t: 'net'; ops: NetOp[] } | { t: 'terrain'; cls: Uint8Array; entry: [number, number]; seed: number; towns: number[]; height?: Float32Array } | { t: 'target'; n: number } | { t: 'speed'; k: number } | { t: 'option'; id: string } | { t: 'townState'; lots: LotTuple[]; simT: number; budget?: BudgetSave; money: number; career?: CareerSave; shift?: number; round?: RoundSave; biz?: BizStats[] } | { t: 'skip'; until: number }
  | { t: 'spend'; kind: 'construction' | 'compensation'; n: number } | { t: 'loan'; take: boolean } | { t: 'budget'; save: BudgetSave | null; career?: CareerSave | null } | { t: 'report' } | { t: 'stamp'; pop: number }
  | { t: 'sandbox'; grow: number; money: boolean } | { t: 'inspect'; slot: number } | { t: 'watch'; x: number; y: number } | { t: 'round'; op: 'start' | 'now' | 'close' } | { t: 'round'; op: 'pick'; card: CardId }
  | { t: 'parks'; defs: CarParkDef[] } | { t: 'parkTest'; id: number; n: number } | { t: 'tolls'; defs: TollDef[] } | { t: 'parking'; rows: BayRowDef[]; curbs: CurbDef[]; fee: number } | { t: 'heat'; on: boolean } | { t: 'businesses'; defs: BizDef[] }
  | { t: 'buses'; defs: BusRouteDef[] } | { t: 'buyLot'; key: string } | { t: 'incidents'; on: boolean }
  | { t: 'disastersOn'; on: boolean } | { t: 'repairDisaster'; id: number; key: string } | { t: 'forceDisaster'; kind: DisasterKind };
/** (parking: the bay rows and on-street runs as the player drew them (the full lists) and the fee per parked car ($); disastersOn: the natural disasters on or off (off by default; off lifts their closures); repairDisaster: the player pays the repair of the quake closure key of disaster id) */
/** (buses: the shuttle routes as the player drew them (the full list, each time: the worker resolves their stops); heat: the congestion heat map on or off (off by default: nothing is posted then); report: a request for the bottleneck report now; the worker also sends one each game hour; inspect: the car in slot is inspected, a car message with every frame, -1 stops;
 *  watch: the junction within 4 tiles of (x, y) is watched for the routes through it, x < 0 stops; businesses: the player's businesses (the full list: see City.setBusinesses); biz (in townState): the businesses' saved stats) */
/** worker to main thread: a frame of cap slots (4 floats each, see Sim.writeFrame), the signal states, and the active traffic incidents (inc: 3 floats each, x and y in tiles and kind, 1 crash or 0 breakdown);the parcels added and removed by a network batch; the town's events, totals and access per zone (256); the town's gravel extension (legs: ax, ay, bx, by, ... in tiles);
 *  the books (after a day closes, or after a budget message: the save, the career's save, the game day now, and the ledger of the day that just closed, if any);
 *  the milestones a step newly reached (in order; their grants are paid) and whether the city won, when a game hour's start brought either */
/** worker to main thread: the disasters, when they changed (active: the one under way; notes: the transitions and repairs since the last such message) */
export type FromSim = { t: 'frame'; cap: number; buf: Float32Array; stats: SimStats; sig: Float32Array; inc: Float32Array; walkers?: Float32Array; stops?: Float32Array } | { t: 'disasters'; active: DisasterView[]; notes: DisasterNote[] } |{ t: 'lots'; added: LotRec[]; removed: string[] } | { t: 'town'; events: TownEvent[]; pop: number; jobs: number; built: number; access: Float32Array } | { t: 'grow'; legs: number[] } | { t: 'log'; message: string } | { t: 'error'; message: string }
  | { t: 'budget'; save: BudgetSave; career: CareerSave; day: number; ledger: Ledger | null } | { t: 'milestone'; newly: Milestone[]; won: boolean } | { t: 'report'; report: Report; hours: HourStat[] }
  | { t: 'car'; info: CarInfo | null } | { t: 'watch'; node: [number, number] | null; n: number; lines: Float32Array } | { t: 'site'; site: Site | null }
  | { t: 'biz'; list: BizView[] }
  | { t: 'heatGeom'; version: number; geom: Float32Array } | { t: 'heat'; version: number; ratio: Float32Array; dens: Float32Array; hist: Float32Array; pdem: Float32Array };
/** (heatGeom: the heat map's geometry for heatVersion version, 6 floats per dseg id (see Sim.heatGeometry), posted when the version changed while on;
 *  heat: each dseg's speed ratio and density (copies) for that version, every 500 ms while on, and its congestion over time (hist: heatHist, the delay per lane-km
 *  as an EMA of about 6 game hours) and the parking demand per PD_CELL cell (pdem: parkDemand, cars per game hour); report: the bottleneck report, and the game hours' snapshots (HourStat, newest last), a copy; car: the inspected car, with every frame (null once it is gone); watch: the watched junction's x, y (null: none), the crossings since it was set, and their lines, 4 floats each (origin x, y, destination x, y), at most 256) */
