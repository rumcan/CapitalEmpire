import MANIFEST from './painted-tiles.json';
import { HH, HW, ZOOM_MIN, mulberry } from './iso';

/** The hand-painted terrain tile sets (T145, #300; their size and zoom, T150, #315): each ready material family's three independently
 *  authored detail sets (NEAR, MID, FAR) of four large whole tiles, as the art handoff delivers them (scripts/assets/prep-painted-tiles.mjs
 *  writes the manifest painted-tiles.json from READY-MATERIALS.json, hash-checked), and the rules the ground lays them by:
 *  - **Projection.** A tile is a painting of the ground as the isometric camera sees it, so it is laid axis-aligned in world px (the ground
 *    chunks' own space: screen axes at zoom 1, ground plane at height 0): on screen it keeps its native aspect, its shapes and its painted
 *    light from the upper right; never squashed again, turned, mirrored or flipped. Height displacement and occlusion stay the ground's.
 *  - **Size (T150).** Each set has one world size: the size at which it draws at its native pixels (1 painting px = 1 device px) at its
 *    anchor zoom (the manifest's anchors, CSS zooms: NEAR the closest zoom, MID the mid reference's camera, FAR the furthest zoom), so
 *    native / (anchor x DPR) world px. Inside a band zooming is a real zoom (no steps, no re-lay): the tiles shrink on screen as the camera
 *    zooms out. A set is never drawn larger than its native pixels: zooming in past a set's anchor switches to the finer set at once; zooming
 *    out, the finer set shrinks below native until the coarser set's anchor, where the coarser one takes over (a few % past it, the
 *    hysteresis; FAR at the furthest zoom itself). The device pixel ratio is part of the size: a DPR change re-lays the tiles once.
 *  - **Placement.** A world-anchored grid of whole tiles from the world origin; each cell shows one of the four tiles, chosen by a seeded stable
 *    permutation, `(ix + 2 iy) mod 4`, so no tile ever touches a copy of itself (all eight neighbours differ). The four tiles butt edge to edge
 *    along their common borders; no overlap, random offset, mosaic, mask, blend or crossfade.
 *  Pure: importable from node tests (the pictures' URLs are found by painted-grass-art.ts paintedUrl). */

export type TileBand = 'near' | 'mid' | 'far';
/** finest first: a band's index is its place here (0 NEAR, 1 MID, 2 FAR) */
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
/** each set's anchor (the CSS zoom at which it draws at its native pixels), the switch hysteresis (zooming out, a coarser set takes over this
 *  factor past its anchor), the preload factor (the next set's tiles are decoded once the zoom is this close to its switch), the camera's
 *  zoom range, and how each anchor was found */
export interface TileAnchors extends Record<TileBand, number> { hysteresis: number; preload: number; zoom: [number, number]; how: Record<TileBand, string> }
export interface TilesManifest {
  v: 1; revision: string; source: { file: string; sha256: string; date: string | null };
  display: { minVisibleTiles: number; maxVisibleTiles: number };
  anchors: TileAnchors;
  families: TiledFamily[];
}
export const TILES = MANIFEST as unknown as TilesManifest;
export const TILED_FAMILIES: readonly TiledFamily[] = TILES.families;
/** the tile sets' revision (every selection's hash): in the workers' composition keys and the chunks' cache keys */
export const TILES_REVISION = TILES.revision;
export const ANCHORS: TileAnchors = TILES.anchors;
const BY_ID = new Map(TILED_FAMILIES.map(f => [f.id, f]));
export const tiledFamily = (id: string): TiledFamily | undefined => BY_ID.get(id);

/* ---- the band: which set the camera's zoom lays ---- */
const N_BANDS = TILE_BANDS.length;
/** a band's anchor (CSS zoom) by index (0 NEAR, 1 MID, 2 FAR) */
export const anchorAt = (b: number): number => ANCHORS[TILE_BANDS[Math.max(0, Math.min(N_BANDS - 1, b))]!];
/** z is at or below zoom a (to rounding: a camera clamped to ZOOM_MIN sits exactly on FAR's anchor) */
const atOrBelow = (z: number, a: number) => z <= a * (1 + 1e-9);
/** the band a CSS zoom lays with no history (a fresh start): the coarsest set not magnified there (the last whose anchor is at or above z) */
export function bandAt(z: number): number {
  let b = 0;
  for (let i = 0; i < N_BANDS; i++) if (z > 0 && atOrBelow(z, anchorAt(i))) b = i;
  return b;
}
/** the band at zoom z after band prev (the hysteresis, never magnified): zooming in past prev's anchor switches to the finer set at once (prev
 *  would be magnified); zooming out, a coarser set takes over only once z is the manifest's hysteresis past its anchor (the finer set shrinks a
 *  little further meanwhile), or at the furthest zoom, so a camera resting at an anchor never flips between two sets */
export function nextBand(z: number, prev: number | null | undefined): number {
  const canon = bandAt(z);
  if (prev == null || !Number.isInteger(prev) || prev < 0 || prev >= N_BANDS || canon <= prev) return canon;
  let b = prev;
  for (let c = prev + 1; c <= canon; c++) if (atOrBelow(z, Math.max(anchorAt(c) / ANCHORS.hysteresis, ZOOM_MIN))) b = c;
  return b;
}
/** the other bands whose tiles to decode ahead at zoom z in band b: the coarser set once z is within the preload factor of its anchor, the
 *  finer one once z is within it of b's own anchor (where zooming in switches) */
export function bandsAhead(z: number, b: number): number[] {
  const out: number[] = [];
  if (b > 0 && z * ANCHORS.preload >= anchorAt(b)) out.push(b - 1);
  if (b < N_BANDS - 1 && z <= anchorAt(b + 1) * ANCHORS.preload) out.push(b + 1);
  return out;
}

/* ---- the tile spec: the band and the display density a bake lays the tile sets at, as one number ---- */
/** a device pixel ratio as the tile spec keeps it (hundredths, 0.5 to 4) */
const dprCode = (dpr: number) => Math.max(50, Math.min(400, Math.round((Number.isFinite(dpr) && dpr > 0 ? dpr : 1) * 100)));
/** the tile spec of band b on a screen of device pixel ratio dpr: the number the camera sends with each bake and every chunk that laid a tile
 *  set keeps (its cache key), so a band switch or a DPR change re-bakes those chunks and nothing else does */
export const tileSpec = (b: number, dpr: number): number => dprCode(dpr) * 4 + Math.max(0, Math.min(N_BANDS - 1, Math.round(b)));
/** a tile spec's band index (0 NEAR, 1 MID, 2 FAR) and its device pixel ratio (a spec of 0 or junk: NEAR at DPR 1) */
export const specBand = (ts: number): number => { const b = Number.isInteger(ts) && ts >= 200 ? ts % 4 : 0; return b < N_BANDS ? b : 0; };
export const specDpr = (ts: number): number => Number.isInteger(ts) && ts >= 200 ? Math.floor(ts / 4) / 100 : 1;
export const bandOf = (ts: number): TileBand => TILE_BANDS[specBand(ts)]!;
/** the cache key a chunk baked with tile sets carries: the revision and the spec (so a stale chunk never keeps an old set or size) */
export const tileKey = (ts: number) => `${TILES_REVISION}#${ts}`;
/** how big a set is drawn against its native pixels at CSS zoom z (1: native; never above 1 in its own band) */
export const drawnScale = (z: number, b: number): number => z / anchorAt(b);

/* ---- placement ---- */
/** one tile of a level at a tile spec, in world px (zoom 1): its native pixels at the band's anchor zoom on the spec's screen, native /
 *  (anchor x DPR), in both axes (its own native aspect) */
export function tileSize(level: Pick<TiledLevel, 'native'>, ts: number): [number, number] {
  const k = anchorAt(specBand(ts)) * specDpr(ts);
  return [level.native[0] / k, level.native[1] / k];
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
/** world px (zoom 1) to metres along the screen's horizontal: a 2 m tile's diagonal is 128 world px */
const M_PER_WORLD_X = 2 * Math.SQRT2 / 128;
/** the metres one tile of a level covers across in band b on a screen of device pixel ratio dpr (its world width) */
export const tileMetres = (level: Pick<TiledLevel, 'native'>, b: number, dpr = 1): number => tileSize(level, tileSpec(b, dpr))[0] * M_PER_WORLD_X;
/** a tile's width on screen in device px at CSS zoom z in band b (its native width at the anchor; the DPR cancels: the world size holds it) */
export const tileScreenPx = (level: Pick<TiledLevel, 'native'>, z: number, b: number): number => level.native[0] * drawnScale(z, b);
/** the world-px point of a tile-space point at height 0 */
export const worldOfTile = (x: number, y: number): [number, number] => [(x - y) * HW, (x + y) * HH];
