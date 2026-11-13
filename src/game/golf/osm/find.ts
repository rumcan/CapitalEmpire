// "Find a real course" (T358, #1003): the steps behind the new-game card's search, in order, over the parts they are given (the network, the clock, the
// library: tests pass fakes and make no live request). A search is a name (Nominatim; golf courses only), a pasted link or `way/123` (straight to the
// object), or a place (golf features near it, Overpass). When a name finds no golf course the first place it did find is looked at for golf features near it,
// which offers the enclosing area (Woodhill's estate). Picking a course fetches it with ONE Overpass query, keeps the answer in the library, builds the
// course's JSON and spec with the converter, and grades it (grade.ts) for the preview; "Build this course" starts a game on that spec. Pure of DOM.
import type { CatalogueEntry } from './catalogue';
import { reportOf, type CourseReport } from './grade';
import { specOf } from './index';
import { CourseLibrary, sharedLibrary, type CourseRecord } from './library';
import { ANSWER_TTL_MS, NominatimClient, anchorLine, hitLine, type Anchor, type Hit } from './nominatim';
import { candidatesOf, courseQuery, nearQuery, runOverpass, type Candidate, type OnStep, type OverpassJson } from './overpass';
import { realNet, type Net } from './polite';
import { parseCourseQuery, refText, type OsmRef } from './query';
import type { OsmCourseJson, OsmCourseSpec } from './types';
import { MAP_KM } from '../../iso';

/** the parts a search and an import run on */
export interface FindDeps { net: Net; lib: CourseLibrary; nominatim: NominatimClient }

/** the real parts: the browser's network, the shared (IndexedDB) library, Nominatim with its answers kept in the library */
export async function realDeps(): Promise<FindDeps> {
  const lib = await sharedLibrary();
  return { net: realNet, lib, nominatim: new NominatimClient(realNet, lib.answers()) };
}

/** where a "golf near here" look was made from (the place line is the anchor's town and country, for the course picked from the look) */
export interface Near { name: string; lat: number; lon: number; place?: string }

/** the outcome of a search */
export type SearchOutcome =
  /** golf courses the name search found (what the card lists) */ | { kind: 'hits'; query: string; hits: Hit[]; fromCache: boolean }
  /** no golf course by that name: the golf courses and areas with golf features near the first place it did find (or the place typed) */
  | { kind: 'near'; query: string; near: Near; candidates: Candidate[] }
  /** an object's link or id: go straight to its preview */ | { kind: 'ref'; ref: OsmRef }
  /** nothing found, or nothing the search can use: the sentence for the card */ | { kind: 'none'; message: string };

/** the look for golf near a place: one Overpass query, its answer (the candidates) kept for a week like Nominatim's, so the same search is not asked twice */
export async function lookNear(near: Near, d: FindDeps, signal?: AbortSignal, onStep?: OnStep): Promise<Candidate[]> {
  const key = `near:${near.lat.toFixed(4)},${near.lon.toFixed(4)}`, cache = d.lib.answers(), kept = await cache.get(key).catch(() => undefined);
  if (kept && d.net.now() - kept.at < ANSWER_TTL_MS && Array.isArray(kept.value)) return kept.value as Candidate[];
  const a = await runOverpass(nearQuery(near.lat, near.lon), d.net, { timeoutsMs: [70000, 30000, 30000], signal, onStep, cache }), found = candidatesOf(a.json);
  await cache.put(key, found, d.net.now()).catch(() => undefined);
  return found;
}

/** runs the search for what the player typed (see the file's header). Throws ServerBusy, ServerDown or Cancelled */
export async function search(text: string, d: FindDeps, signal?: AbortSignal, onStep?: OnStep): Promise<SearchOutcome> {
  const q = parseCourseQuery(text);
  if (q.kind === 'empty') return { kind: 'none', message: 'Type a golf course\'s name, or paste its openstreetmap.org link or way/123.' };
  if (q.kind === 'link') return { kind: 'none', message: 'That link does not name a golf course or a place. Paste a link like openstreetmap.org/way/123, or type the name.' };
  if (q.kind === 'osm') return { kind: 'ref', ref: q.ref };
  if (q.kind === 'place') {
    const near: Near = { name: `${q.lat.toFixed(4)}, ${q.lon.toFixed(4)}`, lat: q.lat, lon: q.lon };
    onStep?.(`Looking for golf features near ${near.name}...`);
    const candidates = await lookNear(near, d, signal, onStep);
    return candidates.length ? { kind: 'near', query: text, near, candidates } : { kind: 'none', message: 'No golf courses or golf features were found near that place.' };
  }
  const f = await d.nominatim.search(q.text, signal);
  if (f.hits.length) return { kind: 'hits', query: f.query, hits: f.hits, fromCache: f.fromCache };
  const anchor: Anchor | undefined = f.anchors[0];
  if (!anchor) return { kind: 'none', message: `Nothing on the map is called "${q.text}". Try another spelling, a town, or paste the openstreetmap.org link.` };
  const near: Near = { name: anchorLine(anchor), lat: anchor.lat, lon: anchor.lon, place: [anchor.town, anchor.country].filter(Boolean).join(', ') };
  onStep?.(`No golf course by that name: looking for golf features near ${near.name}...`);
  const candidates = await lookNear(near, d, signal, onStep);
  return candidates.length ? { kind: 'near', query: f.query, near, candidates }
    : { kind: 'none', message: `No golf course is called "${q.text}", and no golf features were found near ${near.name}.` };
}

/** what the preview shows: the kept record, the course JSON, the spec the game would build (scaled to fit the map when it must be), the quality report */
export interface Preview { record: CourseRecord; json: OsmCourseJson; spec: OsmCourseSpec; report: CourseReport }

/** what the card knows of a course before it is fetched: the hit's name, place and position */
export interface Hint { name?: string; place?: string; at?: { lat: number; lon: number } }
export const hintOfHit = (h: Hit): Hint => ({ name: h.name, place: hitLine(h), at: { lat: h.lat, lon: h.lon } });
/** T378: what the card knows of a course picked from the catalogue: its name, its town and country, and its centre (a course mapped as a point is projected about it); the import goes by its OSM id, so nothing is guessed at Nominatim */
export const hintOfEntry = (e: Pick<CatalogueEntry, 'name' | 'place' | 'country' | 'lat' | 'lon'>): Hint => ({ name: e.name, place: [e.place, e.country].filter(Boolean).join(', '), at: { lat: e.lat, lon: e.lon } });
export const hintOfCandidate = (c: Candidate, near?: Near): Hint => ({ name: c.name.startsWith('Unnamed') ? undefined : c.name, ...(near?.place ? { place: near.place } : {}) });

/** lets the page paint before a long step (the card's progress line shows first) */
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/** the preview of a kept course (no request) */
export async function previewOfKept(id: string, d: FindDeps): Promise<Preview | undefined> {
  const kept = await d.lib.load(id);
  if (!kept) return undefined;
  await tick();
  const spec = specOf(kept.json, { id, name: kept.record.name, place: kept.record.place }), report = reportOf(kept.json, spec);
  if (kept.record.grade !== report.grade || kept.record.holes !== report.holes) await d.lib.setFound(id, { grade: report.grade, holes: report.holes, par: report.par }).catch(() => undefined);
  return { record: { ...kept.record, grade: report.grade, holes: report.holes, par: report.par }, json: kept.json, spec, report };
}

/** fetches a course (ONE Overpass query), keeps its answer, and returns its preview; a course already kept is not fetched again unless `refresh` */
export async function fetchPreview(ref: OsmRef, hint: Hint, d: FindDeps, opt: { refresh?: boolean; signal?: AbortSignal; onStep?: OnStep } = {}): Promise<Preview> {
  const id = refText(ref);
  if (!opt.refresh) { const kept = await previewOfKept(id, d); if (kept) return kept; }
  const a = await runOverpass(courseQuery(ref), d.net, { signal: opt.signal, onStep: opt.onStep, cache: d.lib.answers() });
  const old = opt.refresh ? await d.lib.get(id).catch(() => undefined) : undefined;
  const src = a.json.elements.find(e => e.type === ref.type && e.id === ref.id), tags = src?.tags ?? {};
  const name = old?.name ?? (tags.name?.trim() || hint.name?.trim() || id);
  const place = old?.place ?? (hint.place || [tags['addr:city'], tags['addr:country']].filter(Boolean).join(', '));
  await d.lib.save(id, a.json as OverpassJson, { name, place, server: a.server, fetchedAt: a.fetchedAt, ...(hint.at ? { at: hint.at } : {}) });
  const p = await previewOfKept(id, d);
  if (!p) throw new Error('The course was fetched but could not be read back');
  return p;
}

/** the spec of a kept course for "Build" on a Downloaded row (null: not kept) */
export async function specOfKept(id: string, d: FindDeps): Promise<Preview | undefined> { return previewOfKept(id, d); }

/** the sentence about the size and fit of a previewed course ("fits the map at true size", "scaled to 90% to fit the 4 km map", "too big for the map") */
export function sizeLine(r: CourseReport): string {
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
  const size = `${km(r.landM[0])} x ${km(r.landM[1])}`;
  if (r.holes === 0) return `Size ${size}`;
  if (!r.fits) return `Size ${size}: too big for the ${MAP_KM} km map (it would have to shrink to ${r.scalePct}%)`;
  return r.scalePct >= 100 ? `Size ${size}: fits the ${MAP_KM} km map at true size` : `Size ${size}: scaled to ${r.scalePct}% to fit the ${MAP_KM} km map (the holes get that much shorter)`;
}
