// The real ground height of a downloaded course (T357, #999): the elevation tiles over the course and its skirt, fetched in the player's browser, kept in the
// library, and sampled into the land grid the game lays (land.ts). A shipped course's grid is in its fixture; this is for the courses T358's search imports.
//
// The source is AWS Terrain Tiles (Tilezen "terrarium" PNGs), https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png: free, no key, public,
// and CORS-open to GET (checked 2026-11-08: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET`, and the tile's imagery source exposed as
// `x-amz-meta-x-imagery-sources`, which names what the tile is made from: "srtm/S26E028.tif", "ned13/imgn34w083_13.tif"). A plain GET with no custom header sends
// no preflight. Politely: a course needs a few tiles (about 4 to 16 of 90 kB, one request each, 250 ms apart, never in parallel), each is kept for good in the
// library (an elevation tile does not change; the library's `answers` store, under `dem:z/x/y`, so a tile a second course shares is not asked twice), a
// tile in the library is never fetched again, and a refusal or a busy answer stops the lot with the same words as the map servers' (polite.ts). Nothing is
// sent unless the player builds the course with its ground height ticked. Pure of DOM: the network, the clock and the cache are given.
import { landWindow, type OsmLand } from './land';
import { Cancelled, Gate, ServerBusy, BUSY_STATUS, retryAfterOf, type AnswerCache, type Net } from './polite';
import { DEM_ZOOM, decimateGrid, decodeTile, demSourceOf, packStepOf, sampleTiles, smoothGrid, cropGrid, tileText, tilesFor, demTileUrl, MissingTile, type DemTiles, type TileKey } from './terrarium';
import type { OsmCourseJson, OsmCourseSpec } from './types';

/** the parts a tile fetch runs on */
export interface DemDeps { net: Net; cache: AnswerCache }
/** a tile as the library keeps it: its PNG and its imagery sources (the server's header) */
export interface KeptTile { b: Uint8Array; s: string }

/** the pause between two tile requests, ms */
export const DEM_GAP_MS = 250;
/** the most tiles one course may ask for (a 2 km map is 3 or 4 a side at most: more means a course far bigger than the map was allowed) */
export const DEM_MAX_TILES = 25;

/** the ground height could not be had: the elevation server did not answer or has no data here (the course is built flat, and the card says so) */
export class DemUnavailable extends Error { constructor(detail: string) { super(detail); this.name = 'DemUnavailable'; } }

const cacheKey = (k: TileKey): string => `dem:${tileText(k)}`;

/** how many of the tiles are in the library already (so the card can say how many it will ask for) */
export async function tilesKept(keys: readonly TileKey[], cache: AnswerCache): Promise<number> {
  let n = 0; for (const k of keys) if (await cache.get(cacheKey(k)).catch(() => undefined)) n++;
  return n;
}

/** the tiles a course's land needs: its window (land and skirt) and a few pixels' margin for the smoothing */
export function tilesOfCourse(spec: Pick<OsmCourseSpec, 'originM' | 'scale' | 'w' | 'h'>, json: Pick<OsmCourseJson, 'meta'>, anyTurn = false): TileKey[] {
  const c = json.meta?.centre; if (!c) return [];
  const [x0, y0, x1, y1] = landWindow(spec, undefined, anyTurn), m = 3 * 25 + 20;
  return tilesFor(c, [x0 - m, y0 - m, x1 + m, y1 + m], DEM_ZOOM);
}

/** one tile: from the library, else asked for once and kept. Throws ServerBusy (a refusal or a busy answer), DemUnavailable (no answer, or no data here) or Cancelled */
async function tileFor(k: TileKey, d: DemDeps, gate: Gate, signal?: AbortSignal): Promise<{ tile: KeptTile; fromCache: boolean }> {
  const kept = await d.cache.get(cacheKey(k)).catch(() => undefined), v = kept?.value as Partial<KeptTile> | undefined;
  if (v && v.b instanceof Uint8Array && v.b.length > 8) return { tile: { b: v.b, s: String(v.s ?? '') }, fromCache: true };
  if (signal?.aborted) throw new Cancelled();
  await gate.slot();
  if (signal?.aborted) throw new Cancelled();
  let res: Response;
  try { res = await d.net.fetch(demTileUrl(k.z, k.x, k.y), { signal }); }
  catch (e) { if (signal?.aborted || (e as Error)?.name === 'AbortError') throw new Cancelled(); throw new DemUnavailable('could not reach the elevation server'); }
  if (!res.ok) {
    if (BUSY_STATUS.has(res.status)) throw new ServerBusy(`elevation tile ${tileText(k)}: HTTP ${res.status}`, retryAfterOf(res));
    throw new DemUnavailable(`no elevation data here (HTTP ${res.status})`);
  }
  const b = new Uint8Array(await res.arrayBuffer()), s = res.headers.get('x-amz-meta-x-imagery-sources') ?? '';
  if (b.length < 100) throw new DemUnavailable('the elevation server sent nothing usable');
  const rec: KeptTile = { b, s };
  await d.cache.put(cacheKey(k), rec, d.net.now()).catch(() => undefined);
  return { tile: rec, fromCache: false };
}

/** the course's real ground: the tiles (kept ones first, the rest one at a time), sampled at 4 m over the window, smoothed by the source's sigma, cropped and kept at the
 *  step the source needs (the same steps as a fixture's: scripts/dev/osm-height.mjs and osm-trim-fixture.mjs). `onStep` gets the progress words; anyTurn: the window
 *  that holds the land however the placing mode turns it (landWindow). Throws what tileFor
 *  does (a missing tile is DemUnavailable: the course is built flat) */
export async function fetchLand(spec: OsmCourseSpec, json: OsmCourseJson, d: DemDeps, o: { signal?: AbortSignal; onStep?: (text: string) => void; anyTurn?: boolean } = {}): Promise<OsmLand> {
  const c = json.meta?.centre;
  if (!c) throw new DemUnavailable('this course has no position to read the ground at');
  const keys = tilesOfCourse(spec, json, o.anyTurn);
  if (!keys.length || keys.length > DEM_MAX_TILES) throw new DemUnavailable(keys.length ? 'the course needs too many elevation tiles' : 'no elevation tiles for this course');
  const gate = new Gate(DEM_GAP_MS, d.net), tiles: DemTiles = new Map(), sources: string[] = [];
  let fresh = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    o.onStep?.(`Reading the ground height: elevation tile ${i + 1} of ${keys.length}${fresh ? ' (one request each, kept in this browser)' : ''}...`);
    const { tile, fromCache } = await tileFor(k, d, gate, o.signal);
    if (!fromCache) fresh++;
    tiles.set(tileText(k), await decodeTile(tile.b).catch(() => { throw new DemUnavailable('an elevation tile did not decode'); }));
    if (tile.s) sources.push(tile.s);
  }
  o.onStep?.('Working out the ground...');
  await new Promise<void>(r => setTimeout(r, 0)); // (the card paints its line before the sampling holds the page for a moment)
  const src = demSourceOf(sources.join(',')), sigma = src.sigma, win = landWindow(spec, undefined, o.anyTurn);
  let raw;
  try { raw = sampleTiles(tiles, c, [win[0] - 3 * sigma, win[1] - 3 * sigma, win[2] + 3 * sigma, win[3] + 3 * sigma], 4, DEM_ZOOM); }
  catch (e) { if (e instanceof MissingTile) throw new DemUnavailable('an elevation tile is missing'); throw e; }
  const grid = decimateGrid(cropGrid(smoothGrid(raw, sigma), win), Math.max(1, Math.round(packStepOf(sigma) / 4)));
  return { grid, src: src.id, label: src.label, credit: src.credit, fetched: new Date(d.net.now()).toISOString().slice(0, 10) };
}

