// The name search of "Find a real course" (T358, #1003): Nominatim, from the player's browser, on submit only (never as you type), at most one request a
// second, the answer kept. The hits are filtered to what the map tags as a golf course (leisure=golf_course); when there are none, the places the search
// did find are kept as anchors for the "golf features near this place" look (overpass.ts), which is how an estate like Woodhill (a residential area with
// golf features inside, no golf-course polygon) is found. Pure of DOM: the network and the clock come in as parts (polite.ts).
import type { OsmRef, OsmType } from './query';
import { BUSY_STATUS, Cooldown, Gate, MemoryAnswerCache, ServerBusy, ServerDown, retryAfterOf, type AnswerCache, type Net } from './polite';

export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** how many golf courses the card lists at most */
export const MAX_HITS = 10;
/** Nominatim is asked for this many results (the filter keeps the golf courses; Nominatim's limit is 40) */
const ASK = 20;
/** an answer is kept this long, ms (a week: courses do not move) */
export const ANSWER_TTL_MS = 7 * 24 * 3600 * 1000;
/** the game's name, sent as a header where the browser allows it (Nominatim's CORS answer allows X-Requested-With); the Referer says where the game is served */
export const APP_NAME = 'CapitalEmpire-golf';

/** a Nominatim result (format=jsonv2, addressdetails=1), the fields read */
export interface NomResult {
  osm_type: OsmType; osm_id: number; lat: string; lon: string; category?: string; class?: string; type: string; name?: string; display_name?: string;
  importance?: number; address?: Record<string, string>; boundingbox?: string[];
}

/** a golf course the search found: what the card lists */
export interface Hit { ref: OsmRef; id: string; name: string; town: string; country: string; lat: number; lon: number }
/** a place the search found that is not a golf course: where to look for golf features near when there are no hits (an estate, a club's building, a suburb) */
export interface Anchor { name: string; town: string; country: string; what: string; lat: number; lon: number; importance: number }
/** what a search gives back */
export interface Found { query: string; hits: Hit[]; anchors: Anchor[]; fromCache: boolean }

/** the town of an address, nearest first; with no address (an answer asked for without addressdetails) the display name's tail: [..., town, municipality or county,
 *  province or state, (postcode,) country], so the town is the third before the country */
export function townOf(a: Record<string, string> | undefined, display = ''): string {
  if (a) return a.city ?? a.town ?? a.village ?? a.suburb ?? a.hamlet ?? a.municipality ?? a.city_district ?? a.county ?? a.state_district ?? a.state ?? '';
  const parts = display.split(',').map(s => s.trim()).filter(s => s && !/^[\d\s-]+$/.test(s));
  return parts.length >= 5 ? parts[parts.length - 4]! : '';
}
/** the country of an address, else the display name's last part */
export function countryOf(a: Record<string, string> | undefined, display = ''): string {
  if (a?.country) return a.country;
  const parts = display.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 1]! : '';
}

/** the name of a result: its name, else the first part of its display name */
function nameOf(r: NomResult): string {
  return (r.name ?? '').trim() || (r.display_name ?? '').split(',')[0]!.trim() || `${r.osm_type}/${r.osm_id}`;
}
const kindOfResult = (r: NomResult): string => `${r.category ?? r.class ?? ''}=${r.type}`;
const isGolfCourse = (r: NomResult): boolean => (r.category ?? r.class) === 'leisure' && r.type === 'golf_course';

function hitOf(r: NomResult): Hit {
  return {
    ref: { type: r.osm_type, id: r.osm_id }, id: `${r.osm_type}/${r.osm_id}`, name: nameOf(r), town: townOf(r.address, r.display_name), country: countryOf(r.address, r.display_name),
    lat: Number(r.lat), lon: Number(r.lon),
  };
}

/** the golf courses among Nominatim's results: leisure=golf_course only, once each, areas (ways and relations) before points, at most MAX_HITS, in
 *  Nominatim's own order otherwise (its importance ranking) */
export function filterGolfHits(results: readonly NomResult[]): Hit[] {
  const seen = new Set<string>(), out: Hit[] = [];
  for (const r of results ?? []) {
    if (!r || !isGolfCourse(r) || !['node', 'way', 'relation'].includes(r.osm_type) || !Number.isFinite(Number(r.osm_id))) continue;
    const h = hitOf(r);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon) || seen.has(h.id)) continue;
    seen.add(h.id); out.push(h);
  }
  return out.map((h, i) => ({ h, i })).sort((a, b) => (a.h.ref.type === 'node' ? 1 : 0) - (b.h.ref.type === 'node' ? 1 : 0) || a.i - b.i).map(x => x.h).slice(0, MAX_HITS);
}

/** the places of Nominatim's results that can anchor a look for golf features: not golf courses, not roads, buildings or car parks, by importance, at most 3 */
export function anchorsOf(results: readonly NomResult[]): Anchor[] {
  const skip = new Set(['highway', 'building', 'railway', 'waterway', 'man_made', 'tourism']);
  const rows = (results ?? []).filter(r => r && !isGolfCourse(r) && !skip.has(r.category ?? r.class ?? '') && !(r.type === 'parking') && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)));
  rows.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  return rows.slice(0, 3).map(r => ({ name: nameOf(r), town: townOf(r.address, r.display_name), country: countryOf(r.address, r.display_name), what: kindOfResult(r), lat: Number(r.lat), lon: Number(r.lon), importance: r.importance ?? 0 }));
}

/** the key an answer is kept under: the text lower-cased, its spaces squeezed */
export const searchKey = (text: string): string => `nominatim:${text.toLowerCase().replace(/\s+/g, ' ').trim()}`;

/** the one-request-a-second client for Nominatim: the gate, the cooldown after a refusal and the cache, over the parts it is given */
export class NominatimClient {
  private readonly gate: Gate;
  private readonly cool: Cooldown;
  constructor(private readonly net: Net, private readonly cache: AnswerCache = new MemoryAnswerCache(), private readonly timeoutMs = 20000) {
    this.gate = new Gate(1100, net); this.cool = new Cooldown(net);
  }

  /** the golf courses (and the anchors) for what the player typed. One request, unless the answer is kept; throws ServerBusy or ServerDown */
  async search(text: string, signal?: AbortSignal): Promise<Found> {
    const q = text.replace(/\s+/g, ' ').trim(), key = searchKey(q), now = this.net.now();
    const kept = await this.cache.get(key).catch(() => undefined);
    if (kept && now - kept.at < ANSWER_TTL_MS && Array.isArray(kept.value)) {
      const rs = kept.value as NomResult[];
      return { query: q, hits: filterGolfHits(rs), anchors: anchorsOf(rs), fromCache: true };
    }
    this.cool.check();
    await this.gate.slot();
    const url = `${NOMINATIM}?${new URLSearchParams({ q, format: 'jsonv2', limit: String(ASK), addressdetails: '1', dedupe: '1' })}`;
    const dl = this.net.deadline(this.timeoutMs, signal);
    let res: Response;
    try { res = await this.net.fetch(url, { headers: { 'X-Requested-With': APP_NAME }, signal: dl.signal }); }
    catch (e) { if (signal?.aborted) throw e; throw new ServerDown(`Nominatim: ${(e as Error).message}`); }
    finally { dl.clear(); }
    if (BUSY_STATUS.has(res.status)) { const s = retryAfterOf(res); this.cool.trip(s); throw new ServerBusy(`Nominatim: HTTP ${res.status}`, s); }
    if (!res.ok) throw new ServerDown(`Nominatim: HTTP ${res.status}`);
    let rs: NomResult[];
    try { const j = await res.json(); if (!Array.isArray(j)) throw new Error('not a list'); rs = j as NomResult[]; } catch (e) { throw new ServerDown(`Nominatim: ${(e as Error).message}`); }
    await this.cache.put(key, rs, this.net.now()).catch(() => undefined);
    return { query: q, hits: filterGolfHits(rs), anchors: anchorsOf(rs), fromCache: false };
  }
}

/** a hit's line for the card: "Wingatepark Country Club · Pretoria, South Africa" */
export const hitLine = (h: Pick<Hit, 'town' | 'country'>): string => [h.town, h.country].filter(Boolean).join(', ');
/** the text of an anchor's place for the card: "Woodhill Country Club, Pretoria" */
export const anchorLine = (a: Pick<Anchor, 'name' | 'town'>): string => [a.name, a.town].filter(Boolean).join(', ');
