import type { GroundArt } from './ground-art';
import type { BaseGrassArt } from './base-grass';
import type { PhotoTexEntry } from './grass-art';
import type { GrassTex } from './grass-art';
import type { TexSnapshot } from './texture-share';
import type { ClassId, NodeType } from './network';
import type { LineStyle } from './types';
import type { Waterway } from './terrain/types';
import type { BBox } from './network';
import type { GrassCellView } from './ext/grass-management';
import type { EdgeProfile } from './paint-edges';

/** a painted area's look (the Paint tool, docs/PAINT-TOOL.md): texture scale s, angle a (degrees, tile space, about the map origin), border width b (tiles, 0 = none),
 *  border texture bt (a patch texture or 'kerb'), draw order z (the area's id); the optional tone filter over the fill: t 1 Multiply (darker) or 2 Lighten (screen),
 *  ta its strength (0..1), tc its tint ('#rrggbb'); absent when the area has no tone */
export interface PatchPaint { s: number; a: number; b: number; bt: string; z: number; /** a second texture blended over the fill in soft patches: its texture, share, softness and patch size (PaintArea mtex ...) */ m?: { t: string; s: number; f: number; p: number }; t?: 1 | 2; ta?: number; tc?: string; /** the border's own scale, angle, tone, strength and tint (sent only when they differ from the default) */ bs?: number; ba?: number; bto?: 1 | 2; bta?: number; btc?: string;
  /** how its outline is drawn (paint-edges.ts): a feather and a sun-lit bevel by profile; absent = crisp, as before */ e?: EdgeProfile }

/** a texture as a course layer lays it: the texture (a paint texture or preset), its scale and angle (degrees, tile space about the origin) */
export interface CourseTex { tex: string; sc: number; a: number }
/** one surface of a course chunk (plan P21 sections 3.2 to 3.4, T078), all coordinates flat x0 y0 x1 y1 ... in tiles:
 *  (rings and polylines are Float32Arrays, so a patch posts and clones as plain memory)
 *  - `fill`: closed rings clipped to the chunk box grown by 0.1 tile (filled even-odd; neighbouring chunks overlap, so no seam shows);
 *  - `edges`: open polylines on the true boundary only (the surface on the left of travel), cut exactly at the chunk box and never along
 *    it; a ring wholly inside the chunk is one closed polyline (last point = first). The feather, rims and shade follow these;
 *  - `e`: how its edge is drawn (paint-edges.ts profile: raised green and tee, turf fairway, sunken bunker, water, flat rough and fescue);
 *  - `collar`: its automatic collar (first cut, fringe, the bunker's grass lip, the pond's bank): band rings (even-odd: the surface is
 *    cut out) and the band's outer edges, in its own texture;
 *  - `stripes`: on the fairway, each hole's centre line (tee, aim points, pin) for the mowing stripes (T075), for the holes whose
 *    fairway cells reach this chunk */
export interface CourseLayer extends CourseTex { s: number; e: EdgeProfile; fill: Float32Array[]; edges: Float32Array[];
  /** its edges sorted by the heights on their sides (ext/course-walls, T099): soft (feathered) and joint (a crisp mowing line against its own
   *  collar) runs; the rest of its edges are walls (CoursePatch.walls) or hidden under a later layer, drawn crisp. Absent: feather all edges */
  soft?: Float32Array[]; joint?: Float32Array[];
  collar?: CourseTex & { n: 'first-cut' | 'fringe' | 'lip' | 'bank'; fill: Float32Array[]; edges: Float32Array[]; soft?: Float32Array[] }; stripes?: { hole: number; line: number[] }[] }
/** a course wall (ext/course-walls WallRun, T099): its top edge as x, y, drop triples (tiles, tiles, metres), the higher side on the left so the
 *  face looks along the right-hand normal toward the camera; lo: the layer code it hangs over (2 s a surface's fill, 2 s + 1 its collar, 0 the
 *  map grass), drawn just after that layer; m: its material (0 turf, 1 sand, 2 water) */
export interface CourseWall { p: Float32Array; lo: number; m: number }
/** a lit top edge (ext/course-walls RimRun, T099): a height step whose face turns to the sun at the upper right, as x, y pairs (tiles), the
 *  higher side on the left; hi: the layer code of the higher side, whose top is lit along it */
export interface CourseRim { p: Float32Array; hi: number }
/** a course chunk's ground (key cg:<cx>:<cy>; plan P21 section 3.8): its 64-tile chunk (cx, cy, size in tiles), its surfaces in draw
 *  order (rough 1 .. green 8), the growth mask (1 byte per 1 m cell over the chunk box, size * 2 square, row-major; alpha 255 x (1 - the
 *  grass share in quarters): the dirt that shows through while seeded cells grow in; absent when nothing in the chunk grows), and z, its
 *  place among the painted areas (0: under every painted area) */
export interface CoursePatch { cx: number; cy: number; size: number; layers: CourseLayer[]; walls?: CourseWall[]; rims?: CourseRim[]; grow?: Uint8Array; z: number }

/** a ground patch: a polygon (lots: an oriented quad; painted areas: any simple polygon) in tile space, and its surface */
export interface LotPatch { pts: number[] /* x0 y0 x1 y1 ... (tiles, in order) */; tex: 'paving' | 'pad' | 'concrete' | 'asphalt' | 'lotAsphalt' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'gravel' | 'field' | 'slabs' | 'asphaltDark' | 'asphaltWorn' | 'roadgravel' | 'grass' | 'bunkerSand' | 'wasteSand' | 'pineStraw' | 'barkMulch' | 'spectatorPath' | 'woodChips' | 'grassDry' | 'asphaltPatched' | 'chipSeal' | 'concreteStained' | 'concreteCracked' | 'concreteOld' | 'concreteWeathered' | 'waterDark' | 'waterDeep' | 'waterClear' | GrassTex | 'marks' | `preset:${string}`; lines?: number[] /* parking bay lines: x0 y0 x1 y1 ... (tiles) */;
  /** tex 'marks' (nothing filled; pts only bound it): flat decals (lot-decals.ts), five numbers each: index, x, y (tiles, the decal's centre), scale (negative: mirrored), alpha */
  marks?: number[]; paint?: PatchPaint; /** a lawn (lawns.ts): the texture (a preset) laid under the lots' own ground, turned by a (degrees), over share of the
   *  patch in soft patches (1: all of it; soft: the patches' edge, patch: their size, 1 = 24 tiles a period); z: blocks 0 under lots 1 */ lawn?: { a: number; share: number; soft: number; patch: number; z: number }; /** markings over the road (on-street parking): only its lines are drawn, white, with the road's own markings */ top?: boolean; /** the colour of its lines (parking bays; absent: worn off-white) */ lineCol?: 'yellow';
  /** an on-street parking lay-by cut into the sidewalk: drawn after the roads, over the sidewalk and the kerb, with its own kerb on the outer side */ layby?: boolean;
  /** a course chunk (the course grid, T078): drawn with the painted areas (by its z) from its layers; pts is its chunk box grown by
   *  COURSE_PATCH_REACH (the index and the stale box: its feathers and shadows reach past the chunk), tex is unused ('grass') */
  course?: CoursePatch }
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
  | { t: 'grass'; cells: GrassCellView[]; strength: number; heat: boolean; mowing: boolean }
  | { t: 'init'; art: GroundArt & { grassMix?: BaseGrassArt; presets?: PhotoTexEntry[] }; terrain: Uint8Array; height: Float32Array; waters: Waterway[]; build: boolean; peers: number }
  | { t: 'textures'; snap: TexSnapshot }
  | { t: 'net'; ops: NetOp[] }
  | { t: 'lamps'; pts: Float32Array }
  | { t: 'terrain'; cls: Uint8Array; height: Float32Array; waters: Waterway[] }
  | { t: 'blocks'; data: Float32Array }
  /** the course height as a sub-rect of samples (i0, j0, w by h, row-major data), see GroundCache.courseHeight */
  | { t: 'course'; i0: number; j0: number; w: number; h: number; data: Float32Array }
  | { t: 'lotground'; set: [string, LotPatch[]][]; drop: string[] }
  | { t: 'paint'; id: number; kind: TileKind; i: number; j: number; L: number };

export type FromWorker =
  | { t: 'ready'; ms: number }
  | { t: 'texpack'; snaps: TexSnapshot[] }
  | { t: 'tile'; id: number; kind: TileKind; i: number; j: number; L: number; bmp: ImageBitmap; ms: number }
  | { t: 'error'; message: string }
  | { t: 'log'; message: string };
