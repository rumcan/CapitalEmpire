// What the engine boots with (T157): the plain game's boot (GAME_BOOT, what the engine always did) or a light one (the lot lab's,
// src/game/dev/lab-boot.ts labBoot). Pure: the engine reads it, the tests check it (tests/lab-boot.test.ts).
import { HH, HW, MAP, worldX, worldY } from './iso';
import type { BBox } from './network';
import { HS, TC, type Terrain } from './terrain/types';

/** what the engine boots with */
export interface BootOptions {
  /** 'game' the full game; 'lab' the lot lab's light boot */
  kind: 'game' | 'lab';
  /** ground workers (null: by the CPU cores, 1 to 3, as the game always had) */
  groundWorkers: number | null;
  /** the city worker (traffic, town growth, the books); without it the sim's messages are dropped */
  sim: boolean;
  /** the sprite atlas's budget in compressed MB (an RGBA8 fallback takes 4x); null: GAME-PLAN's by the screen (atlas-pages.ts atlasBudget) */
  atlasMB: number | null;
  /** decoded atlas page levels kept for the next loads (null: atlas-gl.ts KEEP_LEVELS, 6; each up to a whole page, 16 MB at mip 0) */
  atlasKeep: number | null;
  /** GPU pixels for the baked ground chunks (ground-cache.ts budgetPx) */
  groundPx: number;
  /** what each ground worker keeps decoded: tile-set tiles (textures.ts MAX_TILE_SOURCES) and painted pictures (MAX_PAINTED_SOURCES); null: the game's */
  tileSources: number | null; paintedSources: number | null;
  /** the photo textures each ground worker builds up front (null: grass-art.ts EAGER_PHOTO, all of them); the others are built on first use */
  eagerPhotos: readonly string[] | null;
  /** the ground workers draw their canvases on the CPU (willReadFrequently) instead of the GPU */
  softCanvases: boolean;
  /** the ground workers make their procedural textures (textures.ts PAINTED_NAMES) and their photos' mosaics on first use, not all up front
   *  (T157 the lab's; T166 the game's too) */
  lazyTextures: boolean;
  /** with lazyTextures, the grass's tints (textures.ts GRASS_TINTS) are made on first use too (the lab's). The game makes them up front: every
   *  chunk lays them, so making them later saves nothing, and up front they are the same pixels as ever (a tint made per level differs by a
   *  rounding) */
  lazyTints: boolean;
  /** the ground workers write their texture pack to the browser's cache (IndexedDB) */
  saveTextureCache: boolean;
  /** the ground workers read a cached pack (IndexedDB) instead of building one (T157: the light boot only reads it, the game's). T166: the game
   *  neither reads nor writes it: with its textures made on first use its pack builds in about 1.3 s, the first view is baked as soon as with
   *  a cached pack, and the write kept about the pack's size in the browser process (and delayed the first start's first view by 3 s) */
  readTextureCache: boolean;
  /** the map box (tiles) the boot lives in: the camera's centre stays over it; null: the whole map */
  box: BBox | null;
  /** the furthest zoom (null: the game's ZOOM_MIN) */
  zoomMin: number | null;
  /** forest and town trees planted round the view */
  trees: boolean;
  /** the money floats over spends and sales */
  moneyFloats: boolean;
  /** a save is read at the start and written as the game goes */
  save: boolean;
  /** the map a game starts on: 'valley' a generated one (or the save's), 'flat' flatTerrain (plain grass, no save) */
  map: 'valley' | 'flat';
}

/** the plain game's boot: what the engine always did */
export const GAME_BOOT: Readonly<BootOptions> = Object.freeze({
  kind: 'game', groundWorkers: 1, sim: true, atlasMB: null, atlasKeep: null, groundPx: 48e6, tileSources: null, paintedSources: null, eagerPhotos: null,
  saveTextureCache: false, readTextureCache: false, softCanvases: false, lazyTextures: true, lazyTints: false, box: null, zoomMin: null, trees: true, moneyFloats: true, save: true, map: 'valley',
});

/* ---- T166 (#370): the game's ground workers' memory levers, and a dev build's way to measure them one at a time ---- */
/** the levers by name, each the boot options it sets when on (off: the game's values before T166) */
export const GROUND_LEVERS = {
  /** the procedural textures and the photos' mosaics made on first use (each worker builds only what its chunks lay) */
  lazy: { on: { lazyTextures: true }, off: { lazyTextures: false } },
  /** the workers' canvases on the CPU (willReadFrequently) instead of the GPU */
  soft: { on: { softCanvases: true }, off: { softCanvases: false } },
  /** one ground worker: one texture pack instead of one per worker (the CPU's cores allowed three here) */
  one: { on: { groundWorkers: 1 }, off: { groundWorkers: null } },
  /** the texture pack read from and written to the browser's cache (IndexedDB), as the game did before T166 */
  cache: { on: { saveTextureCache: true, readTextureCache: true }, off: { saveTextureCache: false, readTextureCache: false } },
  /** two ground workers (to compare; listed after one, it wins) */
  two: { on: { groundWorkers: 2 }, off: {} },
} as const satisfies Record<string, { on: Partial<BootOptions>; off: Partial<BootOptions> }>;
export type GroundLever = keyof typeof GROUND_LEVERS;
/** a game boot with exactly the named levers on (a dev build's ?ground=lazy,one; ?ground=old: the game before T166, only the cache on);
 *  unknown names are ignored. GAME_BOOT has the ones T166 kept: lazy and one (and the cache off) */
export function withGroundLevers(boot: BootOptions, spec: string): BootOptions {
  const on = new Set(spec.split(',').map(s => s.trim()));
  if (on.has('old')) on.add('cache'); // the game before T166: one worker per spare core, every texture up front, the cache read and written
  const out: BootOptions = { ...boot };
  for (const [name, l] of Object.entries(GROUND_LEVERS)) Object.assign(out, on.has(name) ? l.on : l.off);
  return out;
}

/** the world rect (px at zoom 1) the camera's centre keeps to over a tile box: the box's corners' bounding rect (the iso diamond's) */
export function boxView(b: BBox): { X0: number; Y0: number; X1: number; Y1: number } {
  const xs = [worldX(b[0], b[1]), worldX(b[2], b[1]), worldX(b[0], b[3]), worldX(b[2], b[3])], ys = [worldY(b[0], b[1]), worldY(b[2], b[1]), worldY(b[0], b[3]), worldY(b[2], b[3])];
  return { X0: Math.min(...xs), Y0: Math.min(...ys), X1: Math.max(...xs), Y1: Math.max(...ys) };
}

/** the camera's centre held to the boot's map: its box (light boot), else the whole map (what clampCam always did) */
export function clampCentre(X: number, Y: number, box: BBox | null): { X: number; Y: number } {
  if (!box) return { X: Math.min(MAP * HW, Math.max(-MAP * HW, X)), Y: Math.min(MAP * HH * 2, Math.max(0, Y)) };
  const v = boxView(box);
  return { X: Math.min(v.X1, Math.max(v.X0, X)), Y: Math.min(v.Y1, Math.max(v.Y0, Y)) };
}

/** a flat map: plain ground everywhere (no water, hills, creeks or banks, so only the base grass is painted), its start block (64 tiles) at the
 *  centre, no towns, the highway entry on the west edge */
export function flatTerrain(): Terrain {
  const c = MAP / 2, size = 64;
  return {
    seed: 0, attempt: 0, height: new Float32Array(HS * HS), cls: new Uint8Array(MAP * MAP).fill(TC.GROUND), waters: [], mountainEdges: [],
    highway: { x: 0, y: c, edge: 'W' }, start: { x: c - size / 2, y: c - size / 2, size }, towns: [], chokepoints: [],
  };
}

/** a light boot's filter for a cached pack (T157): the cache holds the game's pack (every one of grass-art.ts EAGER_PHOTO and every procedural
 *  texture); left out are the photo textures outside the boot's eager set (their sources and mosaics: the worker builds one on first use,
 *  ensure), with lazyMosaics the eager photos' mosaics too (made from the source on first use, Textures.mosaicFor), and the procedural
 *  textures `lazy` names (their mips: made on first use, Textures.image) */
export function lightPack(allPhotos: ReadonlySet<string>, eager: ReadonlySet<string>, lazy: ReadonlySet<string> = new Set(), lazyMosaics = false): (name: string) => boolean {
  return name => {
    const m = /^(photo|mosaic):([^:]+)/.exec(name); if (m) return !allPhotos.has(m[2]!) || eager.has(m[2]!) && !(lazyMosaics && m[1] === 'mosaic');
    const q = /^mip:([^@]+)@/.exec(name); return !q || !lazy.has(q[1]!);
  };
}
