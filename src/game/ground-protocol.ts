import type { GroundArt } from './ground-art';
import type { TexSnapshot } from './texture-share';
import type { ClassId, NodeType } from './network';
import type { LineStyle } from './types';
import type { Waterway } from './terrain/types';

/** A network edit, replayed by every ground worker so their road networks match the main thread's exactly. */
export type NetOp =
  | { k: 'legs'; legs: number[]; cls: ClassId; style: LineStyle; kinds?: number[] }
  | { k: 'piece'; seg: [number, number, number, number]; p0: [number, number]; p1: [number, number] }
  | { k: 'type'; x: number; y: number; type: NodeType }
  | { k: 'rebuild'; full: boolean }
  | { k: 'clear' };

/** g = ground chunk, m = district chunk (MID_K x MID_K, lite), p = planner chunk */
export type TileKind = 'g' | 'm' | 'p';
export type ToWorker =
  | { t: 'init'; art: GroundArt; terrain: Uint8Array; height: Float32Array; waters: Waterway[]; build: boolean; peers: number }
  | { t: 'textures'; snap: TexSnapshot }
  | { t: 'net'; ops: NetOp[] }
  | { t: 'lamps'; pts: Float32Array }
  | { t: 'terrain'; cls: Uint8Array; height: Float32Array; waters: Waterway[] }
  | { t: 'blocks'; data: Float32Array }
  | { t: 'paint'; id: number; kind: TileKind; i: number; j: number; L: number };

export type FromWorker =
  | { t: 'ready'; ms: number }
  | { t: 'texpack'; snaps: TexSnapshot[] }
  | { t: 'tile'; id: number; kind: TileKind; i: number; j: number; L: number; bmp: ImageBitmap; ms: number }
  | { t: 'error'; message: string }
  | { t: 'log'; message: string };
