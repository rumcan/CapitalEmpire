// Messages between the main thread (SimClient) and the simulation worker (sim.worker.ts).
import type { NetOp } from '../ground-protocol';

/** what the worker measured, sent with every frame */
export interface SimStats { active: number; target: number; lanes: number; stepMs: number; tickMs: number; maxTickMs: number; graphMs: number; respawned: number; simT: number }
/** main thread to worker: network edits, the vehicle target, the speed (0 pauses; 1 is real time) */
export type ToSim = { t: 'net'; ops: NetOp[] } | { t: 'target'; n: number } | { t: 'speed'; k: number };
/** worker to main thread: a frame of cap slots (4 floats each, see Sim.writeFrame) */
export type FromSim = { t: 'frame'; cap: number; buf: Float32Array; stats: SimStats } | { t: 'log'; message: string } | { t: 'error'; message: string };
