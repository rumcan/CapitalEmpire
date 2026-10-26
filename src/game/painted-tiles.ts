import MANIFEST from './painted-tiles.json';
import { HH, HW, mulberry } from './iso';

/** The hand-painted terrain tile sets (T145, #300): each ready material family's three independently authored detail sets (NEAR, MID, FAR) of
 *  four large whole tiles, as the art handoff delivers them (scripts/assets/prep-painted-tiles.mjs writes the manifest painted-tiles.json from
 *  READY-MATERIALS.json, hash-checked), and the rules the ground lays them by:
 *  - **Projection.** A tile is a painting of the ground as the isometric camera sees it, so it is laid axis-aligned in world px (the ground
 *    chunks' own space: screen axes at zoom 1, ground plane at height 0): on screen it keeps its native aspect, its shapes and its painted
 *    light from the upper right; never squashed again, turned, mirrored or flipped. Height displacement and occlusion stay the ground's.
 *  - **Coverage.** The manifest's ladder of steps (each a band and one tile width in world px) is picked from the CSS camera zoom alone (never
 *    the device pixel ratio or the window), with hysteresis: on the reference viewport 2 to 4 whole tile areas show at every zoom, the next set
 *    (or the next step of the same set) takes over before more than four show, and the overview shows a few large FAR tiles. A step is a fixed
 *    world size, so a texture is never stretched continuously under the camera.
 *  - **Placement.** A world-anchored grid of whole tiles from the world origin; each cell shows one of the four tiles, chosen by a seeded stable
 *    permutation, `(ix + 2 iy) mod 4`, so no tile ever touches a copy of itself (all eight neighbours differ). The four tiles butt edge to edge
 *    along their common borders; no overlap, random offset, mosaic, mask, blend or crossfade.
 *  Pure: importable from node tests (the pictures' URLs are found by painted-grass-art.ts paintedUrl). */

export type TileBand = 'near' | 'mid' | 'far';
export const TILE_BANDS: readonly TileBand[] = ['near', 'mid', 'far'];
export interface TileRef { id: string; file: string; sha256: string; mean: string }
export interface TiledLevel { revision: string; folder: string; native: [number, number]; decision: { file: string; sha256: string | null }; tiles: TileRef[] }
export interface TiledFamily {
  /** the game's family id (painted-families.ts, painted-surfaces.json) and READY-MATERIALS' id */
  id: string; materialId: string; name: string; kind: 'grass' | 'sand' | 'water' | 'cut';
  /** the canonical selection's sha256 (its first 12 hex digits: the revision) */
  revision: string; selection: { file: string; sha256: string }; light: string | null; mean: string;
  levels: Record<TileBand, TiledLevel>;
}
/** one coverage step: its band, the CSS zoom range it covers ((zLo, zHi]) and one tile's width in world px (zoom 1) and metres */
export interface CoverageStep { band: TileBand; zHi: number; zLo: number; tileW: number; metres: number }
export interface TilesManifest {
  v: 1; revision: string; source: { file: string; sha256: string; date: string | null };
  display: { minVisibleTiles: number; maxVisibleTiles: number };
  coverage: { refViewport: [number, number]; areas: [number, number]; stepRatio: number; hysteresis: number; zoom: [number, number]; steps: CoverageStep[] };
  families: TiledFamily[];
}
export const TILES = MANIFEST as unknown as TilesManifest;
export const TILED_FAMILIES: readonly TiledFamily[] = TILES.families;
/** the tile sets' revision (every selection's hash): in the workers' composition keys and the chunks' cache keys */
export const TILES_REVISION = TILES.revision;
export const STEPS: readonly CoverageStep[] = TILES.coverage.steps;
const BY_ID = new Map(TILED_FAMILIES.map(f => [f.id, f]));
export const tiledFamily = (id: string): TiledFamily | undefined => BY_ID.get(id);

/* ---- the step: which band and tile size the camera's zoom lays ---- */
/** the step a CSS zoom falls in with no history (a fresh start): step k covers zooms (zLo, zHi]; past either end, the end step */
export function stepAt(z: number): number {
  if (!(z > 0)) return STEPS.length - 1;
  for (let k = 0; k < STEPS.length; k++) if (z > STEPS[k]!.zLo) return k;
  return STEPS.length - 1;
}
/** the step at zoom z after step prev (the hysteresis): zooming out leaves a step as soon as z reaches its far end (where 4 tile areas show:
 *  switch before exceeding four); zooming in leaves it for a finer one only once z is past its near end by the manifest's hysteresis (the
 *  coarser tiles show down to 2 / hysteresis^2 areas meanwhile), so a camera resting at a boundary never flips between two sets */
export function nextStep(z: number, prev: number | null | undefined): number {
  const canon = stepAt(z);
  if (prev == null || !Number.isInteger(prev) || prev < 0 || prev >= STEPS.length || canon === prev) return canon;
  if (canon > prev) return canon; // zoomed out past prev's far end
  return z > STEPS[prev]!.zHi * TILES.coverage.hysteresis ? canon : prev;
}
export const bandOf = (step: number): TileBand => STEPS[Math.max(0, Math.min(STEPS.length - 1, step))]!.band;
/** the cache key a chunk baked with tile sets carries: the revision and the step (so a stale chunk never keeps an old set) */
export const tileKey = (step: number) => `${TILES_REVISION}#${step}`;

/* ---- placement ---- */
/** one tile of a level at a step, in world px (zoom 1): the step's width, the level's own native aspect */
export function tileSize(level: Pick<TiledLevel, 'native'>, step: number): [number, number] {
  const w = STEPS[Math.max(0, Math.min(STEPS.length - 1, step))]!.tileW;
  return [w, w * level.native[1] / level.native[0]];
}
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
/** a family level's seeded stable permutation of its tile indices (the same in every worker, every session) */
export function tilePermutation(familyId: string, band: TileBand, n = 4): number[] {
  const r = mulberry(fnv(`${familyId}:${band}`)), p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
  return p;
}
/** the tile index (into the level's tiles) a grid cell shows: the permutation at (ix + 2 iy) mod 4, so every neighbour of a cell differs */
export function tileIndex(perm: readonly number[], ix: number, iy: number): number {
  const n = perm.length; return perm[(((ix + 2 * iy) % n) + n) % n]!;
}
/** the grid cell under a world point (world px) for tiles w x h */
export const cellOf = (X: number, Y: number, w: number, h: number): [number, number] => [Math.floor(X / w), Math.floor(Y / h)];
/** the cells of a w x h grid a world-px rectangle touches, each with its rectangle */
export function cellsIn(X0: number, Y0: number, X1: number, Y1: number, w: number, h: number): { ix: number; iy: number; x: number; y: number }[] {
  const out: { ix: number; iy: number; x: number; y: number }[] = [];
  for (let iy = Math.floor(Y0 / h); iy * h < Y1; iy++) for (let ix = Math.floor(X0 / w); ix * w < X1; ix++) out.push({ ix, iy, x: ix * w, y: iy * h });
  return out;
}
/** a cell's edges in a raster at s px per world px, snapped to whole px: neighbours share the same edge (no gap, no overlap), and every chunk
 *  of the same raster level agrees, because a chunk's origin is a whole number of px at every cache level */
export function snappedCell(ix: number, iy: number, w: number, h: number, s: number): [number, number, number, number] {
  return [Math.round(ix * w * s), Math.round(iy * h * s), Math.round((ix + 1) * w * s), Math.round((iy + 1) * h * s)];
}

/* ---- the diagnostics ---- */
/** how many whole tiles a view shows: tile areas (the view's area over a tile's), and tiles across and down (CSS px and CSS zoom) */
export function coverageOf(cssW: number, cssH: number, z: number, tile: readonly [number, number]) {
  const tw = tile[0] * z, th = tile[1] * z;
  return { areas: (cssW * cssH) / (tw * th), across: cssW / tw, down: cssH / th };
}
/** the world-px point of a tile-space point at height 0 */
export const worldOfTile = (x: number, y: number): [number, number] => [(x - y) * HW, (x + y) * HH];
