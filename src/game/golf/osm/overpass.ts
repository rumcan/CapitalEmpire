// The map data of "Find a real course" (T358, #1003): Overpass, from the player's browser. ONE query makes a course (the same one scripts/dev/osm-course.mjs
// asks: the course's boundary and, inside it, every golf=* feature, water, streams and woods, as geometry), tried on the main server and then on the two
// mirrors (a timeout or a busy answer moves on; nothing is retried on the same server; a server that hung is left alone for five minutes, one that was busy for a minute). A second, smaller query looks for golf features near a place when
// a name search found no golf course (an estate like Woodhill: a residential area with golf features inside): it lists the golf courses near and the areas
// that hold golf features, so the player can pick the area. Pure of DOM: the network and the clock come in as parts (polite.ts).
import type { OsmRef } from './query';
import { BUSY_STATUS, Cancelled, ServerBusy, ServerDown, retryAfterOf, type Net } from './polite';

/** the public Overpass servers, the main one first (on 2026-11-08 only the main one answered; the mirrors are tried in this order when it does not) */
export const OVERPASS_SERVERS: readonly string[] = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** how long each server is given before the next is tried, ms: the main server a long while (a big course can take a minute), a mirror less (a mirror that is
 *  down hangs: on 2026-11-08 one held a request for the whole 130 s and gave nothing) */
export const SERVER_TIMEOUT_MS: readonly number[] = [130000, 45000, 45000];
/** a server that timed out is left alone this long, ms; one that was busy or refused, a minute */
const HUNG_MS = 5 * 60_000, BUSY_MS = 60_000;

/** what this visit has learned of each server: one that hung or was busy is not asked again at once (the player's retry does not wait on it again) */
class Health {
  private readonly until = new Map<string, number>();
  constructor(private readonly net: Net) {}
  ready(url: string): boolean { return (this.until.get(url) ?? 0) <= this.net.now(); }
  mark(url: string, ms: number): void { if (ms > 0) this.until.set(url, this.net.now() + ms); else this.until.delete(url); }
  /** whole seconds until the first of these servers may be asked again */
  waitS(urls: readonly string[]): number { return Math.max(1, Math.ceil((Math.min(...urls.map(u => this.until.get(u) ?? 0)) - this.net.now()) / 1000)); }
}
const healths = new WeakMap<Net, Health>();
const healthOf = (net: Net): Health => { let h = healths.get(net); if (!h) { h = new Health(net); healths.set(net, h); } return h; };
const hostOf = (url: string): string => { try { return new URL(url).hostname; } catch { return url; } };

/** an element of an Overpass answer (out geom / out tags bb / out center), the fields read */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>;
  geometry?: ({ lat: number; lon: number } | null)[]; members?: { type: string; ref: number; role: string; geometry?: ({ lat: number; lon: number } | null)[] }[];
  center?: { lat: number; lon: number }; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}
export interface OverpassJson { elements: OverpassElement[]; remark?: string; osm3s?: { timestamp_osm_base?: string } }
/** an answer with where and when it came from */
export interface OverpassAnswer { json: OverpassJson; server: string; fetchedAt: string }

/** the one query that makes a course (the script's, word for word): the course (as an area) and what lies inside it, as geometry. A course mapped as a point
 *  only (a node) takes what lies within `radius` m of it */
export function courseQuery(src: OsmRef, radius = 1200): string {
  const near = src.type === 'node', sel = near ? `around.src:${radius}` : 'area.course';
  return [
    '[out:json][timeout:120];',
    `${src.type}(${src.id})->.src;`,
    ...(near ? [] : ['.src map_to_area->.course;']),
    '(',
    '  .src;',
    `  nwr(${sel})["golf"];`,
    `  nwr(${sel})["natural"="water"];`,
    `  way(${sel})["waterway"~"^(stream|river|canal|ditch|drain)$"];`,
    `  nwr(${sel})["natural"~"^(wood|scrub)$"];`,
    `  nwr(${sel})["landuse"="forest"];`,
    ');',
    'out geom;',
  ].join('\n');
}

/** how far from a place the golf features are looked for, m */
export const NEAR_RADIUS = 3000;
/** the look for golf near a place: the golf courses within `radius` m, the golf features within it (their kind and position), and the landuse and leisure areas
 *  that hold the place itself (an estate's boundary, a club's grounds) with their bounding boxes */
export function nearQuery(lat: number, lon: number, radius = NEAR_RADIUS): string {
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return [
    '[out:json][timeout:60];',
    `nwr["leisure"="golf_course"](around:${radius},${at})->.c;`,
    `nwr["golf"](around:${radius},${at})->.f;`,
    `is_in(${at})->.a;`,
    '(way(pivot.a)["landuse"]; rel(pivot.a)["landuse"]; way(pivot.a)["leisure"]; rel(pivot.a)["leisure"];)->.e;',
    '(.c; .e;)->.k;',
    '.k out tags bb;',
    '.f out tags center 1500;',
  ].join('\n');
}

/** whether the answer says the server gave up: Overpass answers HTTP 200 with a "remark" for a runtime error, a timeout or no memory */
const gaveUp = (remark: string | undefined): boolean => !!remark && /runtime error|timed out|out of memory|too busy/i.test(remark);

/** runs a query on the servers in turn (the first that answers wins) and returns the answer, its server and its time. A server that times out (the main one is
 *  given long, a mirror less: SERVER_TIMEOUT_MS), is busy or answers nonsense is left for the next one, and one that hung or was busy is not asked again for a
 *  while; when none answered it throws ServerBusy (any was busy, or all are being left alone) or ServerDown; a cancelled signal throws Cancelled. `onStep` is told
 *  which server is being asked (and why the last was given up on), for the card's progress line */
export async function runOverpass(query: string, net: Net, opt: { servers?: readonly string[]; timeoutsMs?: readonly number[]; signal?: AbortSignal; onStep?: (text: string) => void } = {}): Promise<OverpassAnswer> {
  const servers = opt.servers ?? OVERPASS_SERVERS, timeouts = opt.timeoutsMs ?? SERVER_TIMEOUT_MS, health = healthOf(net);
  const usable = servers.filter(u => health.ready(u));
  if (!usable.length) throw new ServerBusy('every map server was busy or silent a moment ago', health.waitS(servers));
  let busy = false, retry = 60, why = '';
  const notes: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const url = usable[i]!, ms = timeouts[Math.min(servers.indexOf(url), timeouts.length - 1)] ?? 60000;
    if (opt.signal?.aborted) throw new Cancelled();
    opt.onStep?.(i === 0 ? `Asking ${hostOf(url)} for the map data...` : `${hostOf(usable[i - 1]!)} ${why}: asking ${hostOf(url)}...`);
    const dl = net.deadline(ms, opt.signal);
    try {
      const res = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: dl.signal });
      if (BUSY_STATUS.has(res.status)) { busy = true; retry = retryAfterOf(res); health.mark(url, BUSY_MS); why = `was busy (HTTP ${res.status})`; notes.push(`${url}: HTTP ${res.status}`); continue; }
      if (!res.ok) { why = `answered HTTP ${res.status}`; notes.push(`${url}: HTTP ${res.status}`); continue; }
      const text = await res.text();
      let json: OverpassJson;
      try { json = JSON.parse(text) as OverpassJson; } catch { health.mark(url, BUSY_MS); why = 'answered nonsense'; notes.push(`${url}: not JSON`); continue; }
      if (gaveUp(json.remark)) { busy = true; health.mark(url, BUSY_MS); why = 'gave up on the query'; notes.push(`${url}: ${json.remark}`); continue; }
      if (!json || !Array.isArray(json.elements)) { why = 'answered nonsense'; notes.push(`${url}: no elements in the answer`); continue; }
      health.mark(url, 0);
      return { json, server: url, fetchedAt: new Date(net.now()).toISOString() };
    } catch (e) {
      if (opt.signal?.aborted) throw new Cancelled();
      const hung = (e as Error).name === 'AbortError';
      if (hung) health.mark(url, HUNG_MS); // (a network error is not marked: the player may only have been offline for a moment)
      why = hung ? `did not answer in ${Math.round(ms / 1000)} s` : 'could not be reached';
      notes.push(`${url}: ${hung ? `no answer in ${Math.round(ms / 1000)} s` : (e as Error).message}`);
    } finally { dl.clear(); }
  }
  if (busy) throw new ServerBusy(notes.join('; '), retry);
  throw new ServerDown(notes.join('; '));
}

// ------------------------------------------------------------------------------------------------------------------------ the look for golf near a place
/** a place the player can pick after a look near a place: a golf course the name search missed, or an area that holds golf features (an estate) */
export interface Candidate {
  ref: OsmRef; id: string; name: string; kind: 'course' | 'area'; what: string;
  /** golf features (tees, greens, fairways, bunkers, hole lines, pins...) inside its bounding box */ features: number;
  /** its bounding box's width and height, m */ sizeM: [number, number];
}
const EARTH_R = 6371008.8;
const AREA_MAX_M = 6000;
/** an area (not a mapped golf course) must hold at least this many golf features to be offered */
const AREA_MIN_FEATURES = 6;
/** the most candidates offered */
const MAX_CANDIDATES = 6;

/** the candidates of a look-near answer: the golf courses (every one) and the areas holding at least AREA_MIN_FEATURES golf features and no bigger than
 *  AREA_MAX_M on a side, courses first, each group by golf features held (an area: then the smaller first) */
export function candidatesOf(json: OverpassJson): Candidate[] {
  const pts: [number, number][] = [], seen = new Set<string>(), all: OverpassElement[] = [];
  for (const el of json.elements ?? []) {
    const key = `${el.type}/${el.id}`, t = el.tags ?? {};
    if (t.golf && t.leisure !== 'golf_course') {
      const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
      if (typeof lat === 'number' && typeof lon === 'number' && !seen.has('f' + key)) { seen.add('f' + key); pts.push([lat, lon]); }
      continue;
    }
    if (el.bounds || (typeof el.lat === 'number' && typeof el.lon === 'number')) { if (!seen.has(key)) { seen.add(key); all.push(el); } }
  }
  const out: Candidate[] = [];
  for (const el of all) {
    const t = el.tags ?? {}, b = el.bounds ?? { minlat: el.lat!, maxlat: el.lat!, minlon: el.lon!, maxlon: el.lon! };
    const course = t.leisure === 'golf_course', cl = Math.cos(((b.minlat + b.maxlat) / 2) * Math.PI / 180);
    const w = Math.round((b.maxlon - b.minlon) * cl * Math.PI / 180 * EARTH_R), h = Math.round((b.maxlat - b.minlat) * Math.PI / 180 * EARTH_R);
    const pad = 0.0002;
    const n = pts.filter(([la, lo]) => la >= b.minlat - pad && la <= b.maxlat + pad && lo >= b.minlon - pad && lo <= b.maxlon + pad).length;
    if (!course && (n < AREA_MIN_FEATURES || w > AREA_MAX_M || h > AREA_MAX_M)) continue;
    const what = course ? 'golf course' : `${t.landuse ?? t.leisure ?? 'area'} area`;
    out.push({ ref: { type: el.type, id: el.id }, id: `${el.type}/${el.id}`, name: (t.name ?? '').trim() || (course ? 'Unnamed golf course' : `Unnamed ${what}`), kind: course ? 'course' : 'area', what, features: n, sizeM: [w, h] });
  }
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'course' ? -1 : 1) || b.features - a.features || a.sizeM[0] * a.sizeM[1] - b.sizeM[0] * b.sizeM[1]);
  return out.slice(0, MAX_CANDIDATES);
}
