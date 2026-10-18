// Messages between the main thread (SimClient) and the city worker (sim.worker.ts): the traffic sim, the parcels and the town.
import type { NetOp } from '../ground-protocol';
import type { LotTuple, TownEvent } from '../lots/town';
import type { BudgetSave, Ledger } from '../budget';
import type { Report } from './bottlenecks';

/** what the worker measured, sent with every frame; skipping: a fast-forward is running (simT is then the last frame's, not extrapolated) */
export interface SimStats { active: number; target: number; lanes: number; stepMs: number; tickMs: number; maxTickMs: number; graphMs: number; respawned: number; simT: number; skipping: boolean }
/** a parcel as plain data: origin o, along u and away n (tiles, unit vectors), width w, depth d, the frontage's road class and a corner flag */
export interface LotRec { key: string; o: [number, number]; u: [number, number]; n: [number, number]; w: number; d: number; cls: string; corner: boolean }
/** main thread to worker: network edits, a new valley (terrain classes, the highway entry in tiles, the seed), the vehicle target, the speed (0 pauses; 1 is real time), the growth option id, a saved town (its lots, the sim clock, s, and its books, or the treasury of an old save; sent after the net ops of a load), a skip: fast-forward the sim as fast as the worker can until the sim time until (s),
 *  a spend (construction or compensation, $; negative construction gives back), a loan (take or repay one unit), the books replaced (a saved budget, or null for a fresh one) */
export type ToSim = { t: 'net'; ops: NetOp[] } | { t: 'terrain'; cls: Uint8Array; entry: [number, number]; seed: number } | { t: 'target'; n: number } | { t: 'speed'; k: number } | { t: 'option'; id: string } | { t: 'townState'; lots: LotTuple[]; simT: number; budget?: BudgetSave; money: number } | { t: 'skip'; until: number }
  | { t: 'spend'; kind: 'construction' | 'compensation'; n: number } | { t: 'loan'; take: boolean } | { t: 'budget'; save: BudgetSave | null } | { t: 'report' };
/** (report: a request for the bottleneck report now; the worker also sends one each game hour) */
/** worker to main thread: a frame of cap slots (4 floats each, see Sim.writeFrame); the parcels added and removed by a network batch; the town's events, totals and access per zone (256); the town's gravel extension (legs: ax, ay, bx, by, ... in tiles);
 *  the books (after a day closes, or after a budget message: the save, the game day now, and the ledger of the day that just closed, if any) */
export type FromSim = { t: 'frame'; cap: number; buf: Float32Array; stats: SimStats } | { t: 'lots'; added: LotRec[]; removed: string[] } | { t: 'town'; events: TownEvent[]; pop: number; jobs: number; built: number; access: Float32Array } | { t: 'grow'; legs: number[] } | { t: 'log'; message: string } | { t: 'error'; message: string }
  | { t: 'budget'; save: BudgetSave; day: number; ledger: Ledger | null } | { t: 'report'; report: Report };
