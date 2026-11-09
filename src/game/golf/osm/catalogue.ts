// The course names catalogue (T378, #1034; the owner, 2026-11-08: "the course search should get a course names catalog. so first you find the name of the course in a
// filter list"): every named golf course of OpenStreetMap, country by country, that the course search filters before it asks a map server anything. The data is built
// by scripts/dev/osm-course-catalogue.mjs (scripts/dev/osm-catalogue-lib.mjs writes the format read here) into public/catalogue/: an index (the countries and their
// chunk files) and compact JSON chunks, a big country each and the small ones packed together. Nothing of it is in the game's code: the picker loads this module and
// the files when it opens (a dynamic import), the player's own country's chunk first and the others behind it, three at a time, and the list narrows locally as the
// player types, whatever has arrived. A pick goes to the import by its OpenStreetMap id (find.ts hintOfEntry), so no name has to be guessed at Nominatim ("Wingate"
// against "Wingatepark"). The credit is the map's: © OpenStreetMap contributors, ODbL. Pure of DOM: the network comes in as a part, tests make no request.
import { OSM_CREDIT, OSM_LICENCE } from './types';
import type { OsmRef } from './query';

/** where the files are, under the page's base (public/catalogue/) */
export const CATALOGUE_DIR = 'catalogue/';

/** a chunk file the index lists: the file's name (it carries a hash of its content, so a new build is never a stale cache hit), how many courses it holds, which
 *  country (`cc`: '' for a pack of small countries, whose entries each carry their own) and the courses per country in it, its size raw and gzipped, bytes, and the
 *  date of its map data */
export interface CatalogueChunkInfo { file: string; id: string; cc: string; n: number; ccs: Record<string, number>; bytes: number; gz: number; at: string }
export interface CatalogueCountry { cc: string; country: string; n: number }
/** public/catalogue/index.json */
export interface CatalogueIndex { v: 1; built: string; credit: string; licence: string; total: number; countries: CatalogueCountry[]; chunks: CatalogueChunkInfo[] }

/** a course of the catalogue, ready to list and to filter */
export interface CatalogueEntry {
  /** "way/4261725" */ id: string; ref: OsmRef;
  /** the name the map gives it, the town round it (the nearest named places, or the course's own address) and the country */ name: string; place: string; cc: string; country: string;
  /** its centre */ lat: number; lon: number;
  /** its rough size, m (0: mapped as a point) */ w: number; h: number;
  /** the numbered hole lines (1..18) the map has inside it; the game builds a Full course from 9 or 18 */ holes: number; full: boolean;
  /** the name and its other names, folded, a space before each word (what the filter matches) */ nm: string;
  /** the place and the country, the same way */ pl: string;
}

/** the letters a name is matched by: lower case, accents and the letters NFD cannot take apart folded away (the build sorts with the same) */
export function fold(s: string): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o').replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').replace(/œ/gi, 'oe').replace(/ı/g, 'i').toLowerCase();
}
/** the words of a text, folded; an apostrophe joins ("St Andrew's" is st, andrews) */
export function wordsOf(s: string): string[] { return fold(s).replace(/['’‘`´]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
const spaced = (s: string): string => { const w = wordsOf(s); return w.length ? ` ${w.join(' ')}` : ''; };

/** the game builds a Full course from a map that numbers all the holes of 9 or of 18 */
export const fullOf = (holes: number): boolean => holes === 9 || holes === 18;

const TYPES: Record<string, OsmRef['type']> = { n: 'node', w: 'way', r: 'relation' };
/** an entry's reference as the files write it ("w4261725": a way; "r" a relation, "n" a node) */
export function refOfTag(s: unknown): OsmRef | null {
  const m = /^([nwr])(\d{1,13})$/.exec(String(s));
  return m ? { type: TYPES[m[1]!]!, id: Number(m[2]) } : null;
}

/** the index as read from its file (null when it is not one; chunk files with odd names are left out: the name goes into a URL) */
export function parseIndex(j: unknown): CatalogueIndex | null {
  const x = j as Partial<CatalogueIndex> | null;
  if (!x || typeof x !== 'object' || x.v !== 1 || !Array.isArray(x.chunks) || !Array.isArray(x.countries)) return null;
  const chunks = x.chunks.filter((c): c is CatalogueChunkInfo => !!c && typeof c.file === 'string' && /^[\w.-]+\.json$/.test(c.file) && Number.isFinite(c.n) && typeof c.cc === 'string')
    .map(c => ({ ...c, ccs: c.ccs && typeof c.ccs === 'object' ? c.ccs : c.cc ? { [c.cc]: c.n } : {} }));
  const countries = x.countries.filter((c): c is CatalogueCountry => !!c && typeof c.cc === 'string' && typeof c.country === 'string' && Number.isFinite(c.n));
  return { v: 1, built: String(x.built ?? ''), credit: String(x.credit ?? OSM_CREDIT), licence: String(x.licence ?? OSM_LICENCE), total: Number(x.total) || chunks.reduce((n, c) => n + c.n, 0), countries, chunks };
}

/** the courses of a chunk file; a row that does not read is left out (a chunk is read whole or not at all, never half-trusted: rows are checked one by one) */
export function parseChunk(j: unknown, countries: ReadonlyMap<string, string> = new Map()): CatalogueEntry[] {
  const f = j as { cc?: unknown; e?: unknown } | null, rows = f && typeof f === 'object' ? f.e : null;
  if (!Array.isArray(rows)) return [];
  const own = typeof f?.cc === 'string' ? f.cc : '', out: CatalogueEntry[] = [];
  for (const r of rows as unknown[]) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const ref = refOfTag(r[0]), name = typeof r[1] === 'string' ? r[1].replace(/\s+/g, ' ').trim() : '', lat = Number(r[3]), lon = Number(r[4]);
    if (!ref || !name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const cc = (typeof r[9] === 'string' && r[9]) || own, country = countries.get(cc) ?? cc, place = typeof r[2] === 'string' ? r[2].trim() : '', alt = typeof r[8] === 'string' ? r[8] : '';
    const holes = Math.max(0, Math.min(18, Math.round(Number(r[7]) || 0)));
    out.push({ id: `${ref.type}/${ref.id}`, ref, name, place, cc, country, lat, lon, w: (Number(r[5]) || 0) * 10, h: (Number(r[6]) || 0) * 10, holes, full: fullOf(holes), nm: spaced(`${name} ${alt}`), pl: spaced(`${place} ${country}`) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ the filter
/** how many rows the list shows at most (the best matches; the count says how many more there are) */
export const LIST_MAX = 60;
export interface FilterOptions {
  /** only this country's courses */ cc?: string;
  /** the player's own country: its courses come first among equal matches */ prefer?: string;
  /** at most this many rows (LIST_MAX) */ limit?: number;
}
export interface Filtered { rows: CatalogueEntry[]; /** how many courses matched in all */ matched: number; /** the words looked for */ words: string[] }

/** how well one word matches a course: a word of the name starting with it (the name's first word best), the word inside a word of the name, then the same in the
 *  place and the country; 0 for no match */
function wordScore(e: CatalogueEntry, t: string): number {
  if (e.nm.startsWith(` ${t}`)) return 120;
  if (e.nm.includes(` ${t}`)) return 100;
  if (e.nm.includes(t)) return 55;
  if (e.pl.includes(` ${t}`)) return 45;
  if (e.pl.includes(t)) return 25;
  return 0;
}
const alike = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** the courses that match what the player typed, the best first. Every word typed must match a word of the name, its other names, the town or the country (a word is
 *  the start of one, or inside one: "gate" finds Wingatepark); case and accents do not matter. Among matches: a name match over a town match, every word in the
 *  name, the player's own country, a Full course, a bigger course, then the name. With nothing typed: the courses of the chosen country by name, or none */
export function filterCatalogue(all: readonly CatalogueEntry[], query: string, opt: FilterOptions = {}): Filtered {
  const words = wordsOf(query).slice(0, 6), limit = opt.limit ?? LIST_MAX;
  const pool = opt.cc ? all.filter(e => e.cc === opt.cc) : all;
  if (!words.length) {
    if (!opt.cc) return { rows: [], matched: 0, words };
    const rows = pool.slice().sort((a, b) => alike(a.nm, b.nm) || alike(a.id, b.id));
    return { rows: rows.slice(0, limit), matched: rows.length, words };
  }
  const scored: { e: CatalogueEntry; s: number }[] = [];
  for (const e of pool) {
    let s = 0, inName = 0, ok = true;
    for (const t of words) {
      const w = wordScore(e, t);
      if (!w) { ok = false; break; }
      s += w; if (w >= 55) inName++;
    }
    if (!ok) continue;
    if (inName === words.length) s += 40;
    if (opt.prefer && e.cc === opt.prefer) s += 30;
    if (e.full) s += 12;
    s += Math.min(15, Math.log2(1 + (e.w * e.h) / 10000) * 2);
    scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || alike(a.e.nm, b.e.nm) || alike(a.e.id, b.e.id));
  return { rows: scored.slice(0, limit).map(x => x.e), matched: scored.length, words };
}

/** the countries of an index, the one with the most courses first (the list the country flyout shows) */
export const countriesByCount = (index: CatalogueIndex): CatalogueCountry[] => index.countries.slice().sort((a, b) => b.n - a.n || alike(a.country, b.country));

/** the region of a locale tag ("en-ZA" is "ZA"), '' when it names none (or is not one); the first of a list that names one */
export function regionOfLocale(tags: readonly string[] | string | null | undefined): string {
  for (const t of Array.isArray(tags) ? tags : [tags]) {
    try { const r = new Intl.Locale(String(t ?? '')).region; if (r) return r.toUpperCase(); } catch { /* not a locale tag */ }
  }
  return '';
}

// ------------------------------------------------------------------------------------------------------------------------ the loader
/** reads a file's JSON (the browser's fetch in the game; a fake in a test) */
export type CatalogueFetch = (url: string) => Promise<unknown>;
/** the base of the files: the page's, as the build was given it ('./' in a build, '/' under the dev server) */
export function catalogueBase(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? './'}${CATALOGUE_DIR}`;
}
/** the real network: fetch, the answer read as JSON */
export const realFetch: CatalogueFetch = async url => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

/** the chunks in the order they are loaded: the one with the most of the player's country's courses first, then the rest as the index lists them (the owner's order:
 *  South Africa, the US, the UK and Ireland, Australia, Canada, New Zealand, then by size) */
export function chunkOrder(index: CatalogueIndex, prefer = ''): CatalogueChunkInfo[] {
  const mine = prefer ? index.chunks.filter(c => (c.ccs[prefer] ?? 0) > 0) : [];
  return [...mine, ...index.chunks.filter(c => !mine.includes(c))];
}

export type CatalogueStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** the catalogue in memory: the index, and the courses of every chunk read so far. `subscribe` tells the card after each step (the list narrows over what has arrived);
 *  `version` changes with each */
export class Catalogue {
  entries: CatalogueEntry[] = [];
  index: CatalogueIndex | null = null;
  status: CatalogueStatus = 'idle';
  /** chunk files read, failed, and listed in all */ done = 0; failed = 0; of = 0;
  /** why it failed, for the card */ error = '';
  version = 0;
  private readonly subs = new Set<() => void>();
  private readonly seen = new Set<string>();
  private names: ReadonlyMap<string, string> = new Map();
  private lost: CatalogueChunkInfo[] = [];
  private run: Promise<void> | null = null;
  constructor(private readonly get: CatalogueFetch = realFetch, private readonly base: string = catalogueBase(), private readonly concurrency = 3) {}

  subscribe = (cb: () => void): (() => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  private tell(): void { this.version++; for (const cb of [...this.subs]) cb(); }

  /** opens the catalogue (once: a second call is the first's promise): the index, then every chunk, `prefer`'s country first */
  open(prefer = ''): Promise<void> {
    if (!this.run) this.run = this.load(prefer);
    return this.run;
  }
  /** asks again for the chunks that failed (or for the index, when that failed) */
  retry(prefer = ''): Promise<void> {
    if (this.status === 'loading') return this.run ?? Promise.resolve();
    if (!this.index) { this.run = null; this.status = 'idle'; return this.open(prefer); }
    const again = this.lost; this.lost = []; this.failed = 0;
    this.run = this.pull(again).then(() => this.finish());
    return this.run;
  }

  private async load(prefer: string): Promise<void> {
    this.status = 'loading'; this.error = ''; this.tell();
    let index: CatalogueIndex | null = null;
    try { index = parseIndex(await this.get(this.base + 'index.json')); } catch (e) { this.error = `The course names list could not be read: ${(e as Error).message}`; }
    if (!index) { this.status = 'failed'; this.error ||= 'The course names list is not in this build.'; this.tell(); return; }
    this.index = index; this.of = index.chunks.length; this.names = new Map(index.countries.map(c => [c.cc, c.country] as const));
    this.tell();
    await this.pull(chunkOrder(index, prefer));
    this.finish();
  }
  /** loads these chunks, `concurrency` at a time, in order; one that fails is kept for retry() and does not stop the rest */
  private async pull(order: CatalogueChunkInfo[]): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < order.length) {
        const c = order[next++]!;
        try {
          const rows = parseChunk(await this.get(this.base + c.file), this.names);
          for (const e of rows) if (!this.seen.has(e.id)) { this.seen.add(e.id); this.entries.push(e); }
          this.done++;
        } catch { this.failed++; this.lost.push(c); }
        this.tell();
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, order.length) }, worker));
  }
  private finish(): void {
    this.status = this.entries.length || !this.failed ? 'ready' : 'failed';
    this.error = this.failed ? (this.entries.length ? `${this.failed} of ${this.of} files of course names could not be read.` : 'The course names could not be read.') : '';
    this.tell();
  }
  /** the line under the filter: how many courses and countries, and how far the loading is */
  summary(): string {
    const total = this.index?.total ?? 0, nc = this.index?.countries.length ?? 0;
    if (this.status === 'failed') return this.error;
    if (!this.index) return 'Loading the course names...';
    const left = this.of - this.done - this.failed;
    return `${this.entries.length.toLocaleString('en-US')}${left > 0 ? ` of ${total.toLocaleString('en-US')}` : ''} golf courses in ${nc} countries${left > 0 ? ` (loading: ${this.done} of ${this.of} files)` : ''}${this.failed ? `. ${this.error}` : ''}`;
  }
}

let shared: Catalogue | null = null;
/** the game's catalogue: one for the page (what is loaded once stays loaded as the picker opens and closes) */
export function sharedCatalogue(): Catalogue { if (!shared) shared = new Catalogue(); return shared; }
