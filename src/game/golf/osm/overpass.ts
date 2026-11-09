// The map data of "Find a real course" (T358, #1003): Overpass, from the player's browser. ONE query makes a course (the same one scripts/dev/osm-course.mjs
// asks: the course's boundary and, inside it, every golf=* feature, water, streams and woods, as geometry), tried on the main server and then on the mirrors (a
// timeout or a busy answer moves on; nothing is retried on the same server). T378 (#1034): the servers are asked in the order of their measured health, not the order
// they are listed in: the ones whose last answer was good first (the fastest first), then the ones not asked yet, then the ones that failed last; a server that hung is
// left alone for five minutes and one that was busy for one; what was learned is kept for half an hour (in the library's answers) so a reload does not wait on a dead
// server again; and the card is told which server is being asked, and when the servers are slow today. A second, smaller query looks for golf features near a place when
// a name search found no golf course (an estate like Woodhill: a residential area with golf features inside): it lists the golf courses near and the areas
// that hold golf features, so the player can pick the area. Pure of DOM: the network and the clock come in as parts (polite.ts).
import type { OsmRef } from './query';
import { BUSY_STATUS, Cancelled, ServerBusy, ServerDown, retryAfterOf, type AnswerCache, type Net } from './polite';

/** the public Overpass servers, the main one first, then the mirrors in the order they are tried when nothing is known of their health (T378: on the evening of
 *  2026-11-08 the main one gave 502, kumi and private.coffee hung, and maps.mail.ru answered in about 14 s from the browser, CORS allowed) */
export const OVERPASS_SERVERS: readonly string[] = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** how long each server is given before the next is tried, ms: the main server a long while (a big course can take a minute), a mirror less (a mirror that is
 *  down hangs: on 2026-11-08 one held a request for the whole 130 s and gave nothing). By the server's place in the list, whatever order it is asked in */
export const SERVER_TIMEOUT_MS: readonly number[] = [130000, 60000, 45000, 45000];
/** a server that timed out is left alone this long, ms; one that was busy or refused, a minute */
const HUNG_MS = 5 * 60_000, BUSY_MS = 60_000;
/** a good answer that took this long or longer is "slow" (the card says the servers are slow today), ms */
export const SLOW_MS = 20_000;
/** what was learned of the servers is kept this long in the library's answers, ms (a reload within it starts from it) */
export const HEALTH_MEMORY_MS = 30 * 60_000;
/** the key the health is kept under in the library's answers */
export const HEALTH_KEY = 'overpass:health';

const hostOf = (url: string): string => { try { return new URL(url).hostname; } catch { return url; } };

/** what one visit has learned of one server: how long its good answers took (a running average), when it last answered well and last failed, and until when it is
 *  left alone */
interface Mark { ms?: number; okAt?: number; failAt?: number; until: number }
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** the health of the servers, per Net (one visit): who is left alone, who is fast, and the order they are asked in */
class Health {
  private readonly marks = new Map<string, Mark>();
  private restored = false;
  constructor(private readonly net: Net) {}
  private mark(url: string): Mark { let m = this.marks.get(url); if (!m) { m = { until: 0 }; this.marks.set(url, m); } return m; }
  ready(url: string): boolean { return (this.marks.get(url)?.until ?? 0) <= this.net.now(); }
  /** a good answer after `ms`: the server's speed becomes the average of the old and the new */
  good(url: string, ms: number): void { const m = this.mark(url); m.ms = m.ms === undefined ? ms : Math.round((m.ms + ms) / 2); m.okAt = this.net.now(); m.until = 0; }
  /** a failure: the server is left alone for `benchMs` (0: not at all, a network error may be the player's own) */
  bad(url: string, benchMs: number): void { const m = this.mark(url); m.failAt = this.net.now(); if (benchMs > 0) m.until = this.net.now() + benchMs; }
  /** whole seconds until the first of these servers may be asked again */
  waitS(urls: readonly string[]): number { return Math.max(1, Math.ceil((Math.min(...urls.map(u => this.marks.get(u)?.until ?? 0)) - this.net.now()) / 1000)); }
  /** the servers in the order they are asked: those whose last answer was good, the fastest first; then those not asked yet, as they are listed; then those whose last
   *  answer was a failure, the oldest failure first */
  order(urls: readonly string[]): string[] {
    const tier = (u: string): number => { const m = this.marks.get(u); return !m || (m.okAt === undefined && m.failAt === undefined) ? 1 : m.okAt !== undefined && (m.failAt === undefined || m.okAt > m.failAt) ? 0 : 2; };
    const key = (u: string): number => { const m = this.marks.get(u); return tier(u) === 0 ? (m?.ms ?? 0) : tier(u) === 2 ? (m?.failAt ?? 0) : 0; };
    return urls.map((u, i) => ({ u, i })).sort((a, b) => tier(a.u) - tier(b.u) || key(a.u) - key(b.u) || a.i - b.i).map(x => x.u);
  }
  /** the card's sentence when the servers are slow today (a server is being left alone, or the fastest good answer was slow); '' when they are not */
  note(urls: readonly string[]): string {
    const now = this.net.now(), bits: string[] = [];
    let best: { url: string; ms: number } | undefined;
    for (const u of urls) {
      const m = this.marks.get(u);
      if (!m) continue;
      if (m.until > now) bits.push(`${hostOf(u)} is being left alone for ${Math.max(1, Math.ceil((m.until - now) / 60_000))} min`);
      else if (m.ms !== undefined && (m.okAt ?? 0) > (m.failAt ?? 0) && (!best || m.ms < best.ms)) best = { url: u, ms: m.ms };
    }
    if (best && best.ms >= SLOW_MS) bits.push(`${hostOf(best.url)} took ${Math.round(best.ms / 1000)} s last time`);
    return bits.length ? `The map servers are slow today: ${bits.join('; ')}. This can take a minute or two.` : '';
  }
  /** takes up what an earlier visit kept (once; only what this visit does not know yet; nothing older than HEALTH_MEMORY_MS) */
  async restore(cache: AnswerCache | undefined): Promise<void> {
    if (!cache || this.restored) return;
    this.restored = true;
    const kept = await cache.get(HEALTH_KEY).catch(() => undefined), now = this.net.now();
    if (!kept || now - kept.at > HEALTH_MEMORY_MS || !kept.value || typeof kept.value !== 'object') return;
    for (const [url, v] of Object.entries(kept.value as Record<string, Record<string, unknown>>)) {
      if (this.marks.has(url) || !v || typeof v !== 'object') continue;
      const fresh = (t: number | undefined): number | undefined => (t !== undefined && now - t <= HEALTH_MEMORY_MS ? t : undefined);
      const m: Mark = { until: Math.max(0, num(v.until) ?? 0) }, okAt = fresh(num(v.okAt)), failAt = fresh(num(v.failAt)), ms = num(v.ms);
      if (okAt !== undefined && ms !== undefined) { m.okAt = okAt; m.ms = ms; }
      if (failAt !== undefined) m.failAt = failAt;
      if (m.okAt !== undefined || m.failAt !== undefined || m.until > now) this.marks.set(url, m);
    }
  }
  /** keeps what is known for the next visit */
  async save(cache: AnswerCache | undefined): Promise<void> { if (cache) await cache.put(HEALTH_KEY, Object.fromEntries(this.marks), this.net.now()).catch(() => undefined); }
}
const healths = new WeakMap<Net, Health>();
const healthOf = (net: Net): Health => { let h = healths.get(net); if (!h) { h = new Health(net); healths.set(net, h); } return h; };

/** what the card is told as each server is asked: which one (its host name, its place in this try's order, how many are being tried), whether the servers are slow
 *  today, and the sentence that says so ('' when they are not) */
export interface StepInfo { server: string; host: string; n: number; of: number; slow: boolean; note: string }
/** the card's progress callback: the line to show and, when a map server is being asked, what is known of it */
export type OnStep = (text: string, info?: StepInfo) => void;


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

/** runs a query on the servers in turn (the first that answers wins) and returns the answer, its server and its time. The servers are asked in the order of their
 *  measured health (see the file's header; `cache` keeps what is learned for half an hour, across reloads). A server that times out (the main one is given long, a
 *  mirror less: SERVER_TIMEOUT_MS), is busy or answers nonsense is left for the next one, and one that hung or was busy is not asked again for a while; when none
 *  answered it throws ServerBusy (any was busy, or all are being left alone) or ServerDown; a cancelled signal throws Cancelled. `onStep` is told which server is being
 *  asked (and why the last was given up on, and whether the servers are slow today), for the card's progress line */
export async function runOverpass(query: string, net: Net, opt: { servers?: readonly string[]; timeoutsMs?: readonly number[]; signal?: AbortSignal; onStep?: OnStep; cache?: AnswerCache } = {}): Promise<OverpassAnswer> {
  const servers = opt.servers ?? OVERPASS_SERVERS, timeouts = opt.timeoutsMs ?? SERVER_TIMEOUT_MS, health = healthOf(net);
  await health.restore(opt.cache);
  const usable = health.order(servers.filter(u => health.ready(u)));
  if (!usable.length) throw new ServerBusy('every map server was busy or silent a moment ago', health.waitS(servers));
  let busy = false, retry = 60, why = '';
  const notes: string[] = [];
  try {
    for (let i = 0; i < usable.length; i++) {
      const url = usable[i]!, ms = timeouts[Math.min(servers.indexOf(url), timeouts.length - 1)] ?? 60000;
      if (opt.signal?.aborted) throw new Cancelled();
      const note = health.note(servers) || (why ? `The map servers are slow today: ${hostOf(usable[i - 1]!)} ${why}. This can take a minute or two.` : '');
      opt.onStep?.(i === 0 ? `Asking ${hostOf(url)} for the map data...` : `${hostOf(usable[i - 1]!)} ${why}: asking ${hostOf(url)}...`, { server: url, host: hostOf(url), n: i + 1, of: usable.length, slow: !!note, note });
      const dl = net.deadline(ms, opt.signal), t0 = net.now();
      try {
        const res = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: dl.signal });
        if (BUSY_STATUS.has(res.status)) { busy = true; retry = retryAfterOf(res); health.bad(url, BUSY_MS); why = `was busy (HTTP ${res.status})`; notes.push(`${url}: HTTP ${res.status}`); continue; }
        if (!res.ok) { health.bad(url, 0); why = `answered HTTP ${res.status}`; notes.push(`${url}: HTTP ${res.status}`); continue; }
        const text = await res.text();
        let json: OverpassJson;
        try { json = JSON.parse(text) as OverpassJson; } catch { health.bad(url, BUSY_MS); why = 'answered nonsense'; notes.push(`${url}: not JSON`); continue; }
        if (gaveUp(json.remark)) { busy = true; health.bad(url, BUSY_MS); why = 'gave up on the query'; notes.push(`${url}: ${json.remark}`); continue; }
        if (!json || !Array.isArray(json.elements)) { health.bad(url, 0); why = 'answered nonsense'; notes.push(`${url}: no elements in the answer`); continue; }
        health.good(url, Math.max(0, net.now() - t0));
        return { json, server: url, fetchedAt: new Date(net.now()).toISOString() };
      } catch (e) {
        if (opt.signal?.aborted) throw new Cancelled();
        const hung = (e as Error).name === 'AbortError';
        health.bad(url, hung ? HUNG_MS : 0); // (a network error is not left alone: the player may only have been offline for a moment)
        why = hung ? `did not answer in ${Math.round(ms / 1000)} s` : 'could not be reached';
        notes.push(`${url}: ${hung ? `no answer in ${Math.round(ms / 1000)} s` : (e as Error).message}`);
      } finally { dl.clear(); }
    }
  } finally { void health.save(opt.cache); }
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
