/** The map's size, tiles per side (T444 follow-up, issue #1174): one per save, fixed for the life of a page.
 *
 *  `MAP` (iso.ts) is a constant read by dozens of modules, and the grids sized by it live in the sim worker, the ground worker, the network and the
 *  terrain. So it is not changed under a running game: it is read ONCE, synchronously, when iso.ts is first evaluated, from (in this order)
 *    - a worker's name ("map=1024": the page names the workers it starts, since a module worker can read its own name before its imports run),
 *    - the page's address (?map=1024: the dev server's and the bench's override; a size from here is never replaced by a save's),
 *    - the pointer in localStorage (the size of the game saved last: writeSave keeps it),
 *    - the environment (CE_MAP, for the node tests),
 *    - else DEFAULT_MAP, the size of a new game.
 *  A save of another size moves the pointer and reloads the page once (engine.ts); a map that grows does the same (grow.ts). No grid is ever resized live.
 *  Pure TypeScript with no import, so iso.ts can use it before anything else exists. */

/** a new game's map, tiles (4 km) */
export const DEFAULT_MAP = 2048;
/** the map grows in steps of this many tiles (1 km), up to MAP_MAX (8 km) */
export const MAP_STEP = 512;
export const MAP_MIN = 512;
export const MAP_MAX = 4096;
/** the localStorage key of the pointer: the size of the game saved last */
export const MAP_POINTER_KEY = 'capitalempire.mapSize';

/** a size the game can run at: a whole number of steps from MAP_MIN to MAP_MAX (the grids divide evenly: 8-tile height samples, 64-tile cells) */
export const validMapSize = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MAP_MIN && n <= MAP_MAX && n % MAP_STEP === 0;

/** where each source of the size said what, if it did: strings as the platform gives them (null or undefined: no such source) */
export interface MapSizeSources { workerName?: string | null; query?: string | null; stored?: string | null; env?: string | null }

const sizeOf = (s: string | null | undefined, key: RegExp): number | null => {
  const m = s ? key.exec(s) : null; if (!m) return null;
  const n = Number(m[1]); return validMapSize(n) ? n : null;
};
/** the size to run at and whether it was fixed by the page itself (a worker's name, the address, the environment: a save does not move those) */
export function pickMapSize(src: MapSizeSources): { size: number; fixed: boolean } {
  const w = sizeOf(src.workerName, /(?:^|[\s;&])map=(\d+)(?:$|[\s;&])/);
  if (w !== null) return { size: w, fixed: true };
  const q = sizeOf(src.query, /(?:^|[?&])map=(\d+)(?:$|&)/);
  if (q !== null) return { size: q, fixed: true };
  const e = sizeOf(src.env, /^(\d+)$/);
  if (e !== null) return { size: e, fixed: true };
  const p = sizeOf(src.stored, /^(\d+)$/);
  if (p !== null) return { size: p, fixed: false };
  return { size: DEFAULT_MAP, fixed: false };
}
/** the name a page gives a worker so it runs at the page's size */
export const workerNameFor = (map: number): string => `map=${map}`;

/** the sources of this realm (a window, a worker, or node): every read guarded, so a private window or a test never throws */
export function mapSizeSources(): MapSizeSources {
  const s: MapSizeSources = {};
  try {
    const g = globalThis as unknown as { name?: unknown; WorkerGlobalScope?: new () => unknown; location?: { search?: string }; localStorage?: Storage; process?: { env?: Record<string, string | undefined> } };
    if (typeof g.WorkerGlobalScope === 'function' && g instanceof g.WorkerGlobalScope) s.workerName = typeof g.name === 'string' ? g.name : '';
    else {
      if (g.location && typeof g.location.search === 'string') s.query = g.location.search;
      try { s.stored = g.localStorage?.getItem(MAP_POINTER_KEY) ?? null; } catch { /* storage unavailable: the default */ }
      s.env = g.process?.env?.CE_MAP ?? null;
    }
  } catch { /* the default */ }
  return s;
}

/** the smallest size (a whole step) larger than `current` that holds a course whose far corner is at `edge` tiles with `margin` to spare; null above MAP_MAX
 *  (or when it already fits: nothing to grow) */
export function growSizeFor(edge: number, margin: number, current: number): number | null {
  if (!Number.isFinite(edge)) return null;
  const need = edge + margin;
  if (need <= current) return null;
  const n = Math.ceil(need / MAP_STEP) * MAP_STEP;
  return n > MAP_MAX ? null : n;
}
