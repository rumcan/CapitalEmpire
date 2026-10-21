import type { GroundArt } from './ground-art';
import type { GrassTex } from './grass-art';
import type { TexSnapshot } from './texture-share';
import type { ClassId, NodeType } from './network';
import type { LineStyle } from './types';
import type { Waterway } from './terrain/types';
import type { BBox } from './network';

/** a painted area's look (the Paint tool, docs/PAINT-TOOL.md): texture scale s, angle a (degrees, tile space, about the map origin), border width b (tiles, 0 = none),
 *  border texture bt (a patch texture or 'kerb'), draw order z (the area's id); the optional tone filter over the fill: t 1 Multiply (darker) or 2 Lighten (screen),
 *  ta its strength (0..1), tc its tint ('#rrggbb'); absent when the area has no tone */
export interface PatchPaint { s: number; a: number; b: number; bt: string; z: number; t?: 1 | 2; ta?: number; tc?: string }

/** a ground patch: a polygon (lots: an oriented quad; painted areas: any simple polygon) in tile space, and its surface */
export interface LotPatch { pts: number[] /* x0 y0 x1 y1 ... (tiles, in order) */; tex: 'paving' | 'pad' | 'concrete' | 'asphalt' | 'lotAsphalt' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'gravel' | 'field' | 'slabs' | 'asphaltDark' | 'asphaltWorn' | 'roadgravel' | 'grass' | 'bunkerSand' | 'wasteSand' | 'pineStraw' | 'barkMulch' | 'spectatorPath' | 'woodChips' | GrassTex | 'marks'; lines?: number[] /* parking bay lines: x0 y0 x1 y1 ... (tiles) */;
  /** tex 'marks' (nothing filled; pts only bound it): flat decals (lot-decals.ts), five numbers each: index, x, y (tiles, the decal's centre), scale (negative: mirrored), alpha */
  marks?: number[]; paint?: PatchPaint; /** markings over the road (on-street parking): only its lines are drawn, white, with the road's own markings */ top?: boolean; /** the colour of its lines (parking bays; absent: worn off-white) */ lineCol?: 'yellow';
  /** an on-street parking lay-by cut into the sidewalk: drawn after the roads, over the sidewalk and the kerb, with its own kerb on the outer side */ layby?: boolean }
/** the surface of a ground patch */
export type PatchTex = LotPatch['tex'];

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
  | { k: 'legs'; legs: number[]; cls: ClassId; style: LineStyle; kinds?: number[]; town?: true /* the towns' legs (Seg.town) */ }
  | { k: 'piece'; seg: [number, number, number, number]; p0: [number, number]; p1: [number, number] }
  | { k: 'type'; x: number; y: number; type: NodeType }
  | { k: 'flags'; x: number; y: number; wide: boolean; tl: boolean; rl?: 1 | 2 | 3 }
  | { k: 'slips'; x: number; y: number; off: number[] }
  | { k: 'signal'; x: number; y: number; sig: 0 | 1 | 2; split?: number[] }
  | { k: 'speed'; tier: 0 | 1 | 2 | 3 }
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
