import type { BBox } from '../../network';
import type { BunkerSettings } from './settings';
import type { BakeRequest } from './package/runtime/capital-empire-adapter.js';
import type { BunkerBakeResult } from './package/baker/bake-client.js';

/** Immutable edit snapshot: exact complete drawn rings in 2 m tiles, with the existing component identity. */
export interface BunkerStageInput { id: string; revision: string | number; ringsTiles: readonly ArrayLike<number>[]; settings: Readonly<BunkerSettings>; sourcePatchKeys: readonly string[] }
/** Expected ownership precedes asynchronous pixels; a wrong-key image can never replace native ground. */
export interface BunkerStageRef { id: string; key: string; ringsTiles: Float64Array[]; sourcePatchKeys: string[]; dirtyBoundsTiles: BBox }
export interface BunkerStageRequest extends BakeRequest { sourcePatchKeys: string[] }
/** One bitmap stores three native-stage pictures vertically; only the original picture is at most 512 px per edge. */
export interface BunkerStageSprite extends BunkerBakeResult { renderWidth: number; renderHeight: number; stagePixels: [number, number, number] }
/** The callback/ground-worker receiver owns this bitmap independently of the source cache. */
export interface BunkerStageReady extends BunkerStageRef { image: ImageBitmap; width: number; height: number; renderWidth: number; renderHeight: number; boundsWorldPx: BBox; rasterScale: number }
