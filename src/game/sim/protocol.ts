// Messages between the main thread (SimClient) and the city worker (sim.worker.ts): the traffic sim, the parcels and the town.
import type { NetOp } from '../ground-protocol';
import type { TownEvent } from '../lots/town';

/** what the worker measured, sent with every frame */
export interface SimStats { active: number; target: number; lanes: number; stepMs: number; tickMs: number; maxTickMs: number; graphMs: number; respawned: number; simT: number }
/** a parcel as plain data: origin o, along u and away n (tiles, unit vectors), width w, depth d, the frontage's road class and a corner flag */
export interface LotRec { key: string; o: [number, number]; u: [number, number]; n: [number, number]; w: number; d: number; cls: string; corner: boolean }
/** main thread to worker: network edits, a new valley (terrain classes, the highway entry in tiles, the seed), the vehicle target, the speed (0 pauses; 1 is real time), the growth option id */
export type ToSim = { t: 'net'; ops: NetOp[] } | { t: 'terrain'; cls: Uint8Array; entry: [number, number]; seed: number } | { t: 'target'; n: number } | { t: 'speed'; k: number } | { t: 'option'; id: string };
/** worker to main thread: a frame of cap slots (4 floats each, see Sim.writeFrame); the parcels added and removed by a network batch; the town's events and totals; the town's gravel extension (legs: ax, ay, bx, by, ... in tiles) */
export type FromSim = { t: 'frame'; cap: number; buf: Float32Array; stats: SimStats } | { t: 'lots'; added: LotRec[]; removed: string[] } | { t: 'town'; events: TownEvent[]; pop: number; jobs: number; built: number } | { t: 'grow'; legs: number[] } | { t: 'log'; message: string } | { t: 'error'; message: string };
