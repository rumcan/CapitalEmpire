import type { GroundArt } from './ground-art';
import type { TexSnapshot } from './texture-share';
import type { ClassId, NodeType } from './network';
import type { LineStyle } from './types';
import type { Waterway } from './terrain/types';
import type { BBox } from './network';

/** a ground patch of a lot: an oriented quad (4 corners, tiles, in order) and its surface */
export interface LotPatch { pts: number[] /* x0 y0 x1 y1 x2 y2 x3 y3 */; tex: 'paving' | 'pad' | 'asphalt' | 'dirt' | 'gravel' | 'field'; lines?: number[] /* parking bay lines: x0 y0 x1 y1 ... (tiles) */ }

/** the tile box of one patch (its corners, floored and ceiled) */
export function quadBox(pts: number[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k + 1 < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); y0 = Math.min(y0, pts[k + 1]); x1 = Math.max(x1, pts[k]); y1 = Math.max(y1, pts[k + 1]); }
  return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
}

/** the union tile box of a list of patches, or null when the list is empty */
export function patchBox(patches: LotPatch[]): BBox | null {
  let b: BBox | null = null;
  for (const p of patches) { const q = quadBox(p.pts); b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q; }
  return b;
}

/** a pending batch of lot ground edits (key -> patches, or null to drop) as the set and drop lists of one message; last write per key wins */
export function lotBatch(pending: Map<string, LotPatch[] | null>): { set: [string, LotPatch[]][]; drop: string[] } {
  const set: [string, LotPatch[]][] = [], drop: string[] = [];
  for (const [k, ps] of pending) { if (ps) set.push([k, ps]); else drop.push(k); }
  return { set, drop };
}

/** A network edit, replayed by every ground worker so their road networks match the main thread's exactly. */
export type NetOp =
  | { k: 'legs'; legs: number[]; cls: ClassId; style: LineStyle; kinds?: number[] }
  | { k: 'piece'; seg: [number, number, number, number]; p0: [number, number]; p1: [number, number] }
  | { k: 'type'; x: number; y: number; type: NodeType }
  | { k: 'flags'; x: number; y: number; wide: boolean; tl: boolean }
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
  | { t: 'lotground'; set: [string, LotPatch[]][]; drop: string[] }
  | { t: 'paint'; id: number; kind: TileKind; i: number; j: number; L: number };

export type FromWorker =
  | { t: 'ready'; ms: number }
  | { t: 'texpack'; snaps: TexSnapshot[] }
  | { t: 'tile'; id: number; kind: TileKind; i: number; j: number; L: number; bmp: ImageBitmap; ms: number }
  | { t: 'error'; message: string }
  | { t: 'log'; message: string };
