// The library of downloaded courses (T358, #1003): the raw Overpass answer of every course the player fetched, with its fetch date, server and credit, kept in
// the browser's IndexedDB so a course is fetched once and "Refresh" is the only refetch. The same store keeps the Nominatim answers (so a search is not asked
// twice). The store is an interface: IndexedDB in the game (idbStore), a Map in a test (MemoryStore); the CourseLibrary on top does what the card needs
// (list, save, load as course JSON, delete). Where IndexedDB is not available (a private window in some browsers) the library works for the session only.
import { OSM_CREDIT, OSM_LICENCE, type OsmCourseJson } from './types';
import { courseJsonOf } from './fromosm';
import type { OverpassJson } from './overpass';
import { refOfText } from './query';
import type { AnswerCache } from './polite';
import type { Grade } from './grade';

/** what is known of a kept course without opening its raw answer: the listing's row */
export interface CourseRecord {
  /** the object's text: "way/4261725" */ id: string;
  /** the name the map gives it, and the place line ("Pretoria, South Africa") */ name: string; place: string;
  /** the credit and licence that go with the data */ credit: string; licence: string;
  /** when (ISO) and from which server the answer was fetched */ fetchedAt: string; server: string;
  /** the answer's size, bytes */ bytes: number;
  /** where to project about for a course mapped as a point (the search hit's position) */ at?: { lat: number; lon: number };
  /** what the preview found, kept for the list (set after the first conversion) */ grade?: Grade; holes?: number; par?: number;
}

/** where records and answers are kept */
export interface CourseStore {
  list(): Promise<CourseRecord[]>;
  get(id: string): Promise<CourseRecord | undefined>;
  raw(id: string): Promise<string | undefined>;
  put(rec: CourseRecord, raw: string): Promise<void>;
  /** changes a record's fields (not its answer); a missing record is left missing */
  patch(id: string, fields: Partial<CourseRecord>): Promise<void>;
  remove(id: string): Promise<void>;
  answer(key: string): Promise<{ at: number; value: unknown } | undefined>;
  putAnswer(key: string, value: unknown, at: number): Promise<void>;
}

/** a store in memory (tests, and the session-only library where IndexedDB is not available) */
export class MemoryStore implements CourseStore {
  private readonly recs = new Map<string, CourseRecord>();
  private readonly raws = new Map<string, string>();
  private readonly answers = new Map<string, { at: number; value: unknown }>();
  async list() { return [...this.recs.values()].map(r => ({ ...r })); }
  async get(id: string) { const r = this.recs.get(id); return r ? { ...r } : undefined; }
  async raw(id: string) { return this.raws.get(id); }
  async put(rec: CourseRecord, raw: string) { this.recs.set(rec.id, { ...rec }); this.raws.set(rec.id, raw); }
  async patch(id: string, fields: Partial<CourseRecord>) { const r = this.recs.get(id); if (r) this.recs.set(id, { ...r, ...fields }); }
  async remove(id: string) { this.recs.delete(id); this.raws.delete(id); }
  async answer(key: string) { return this.answers.get(key); }
  async putAnswer(key: string, value: unknown, at: number) { this.answers.set(key, { at, value }); }
}

// ------------------------------------------------------------------------------------------------------------------------ IndexedDB
const DB_NAME = 'capital-empire-osm', DB_VERSION = 1;
const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const finished = (tx: IDBTransaction): Promise<void> => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('aborted')); });

/** the IndexedDB store: `courses` (the records), `raw` (the answers as text, by id), `answers` (the search answers) */
export class IdbStore implements CourseStore {
  constructor(private readonly db: IDBDatabase) {}
  /** opens (and makes) the database; rejects where IndexedDB is not available or blocked */
  static open(factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): Promise<IdbStore> {
    return new Promise((res, rej) => {
      if (!factory) { rej(new Error('IndexedDB is not available')); return; }
      let r: IDBOpenDBRequest;
      try { r = factory.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('raw')) db.createObjectStore('raw');
        if (!db.objectStoreNames.contains('answers')) db.createObjectStore('answers');
      };
      r.onsuccess = () => res(new IdbStore(r.result));
      r.onerror = () => rej(r.error ?? new Error('IndexedDB could not be opened'));
      r.onblocked = () => rej(new Error('IndexedDB is blocked'));
    });
  }
  private tx(stores: string[], mode: IDBTransactionMode): IDBTransaction { return this.db.transaction(stores, mode); }
  async list() { return (await req(this.tx(['courses'], 'readonly').objectStore('courses').getAll())) as CourseRecord[]; }
  async get(id: string) { return (await req(this.tx(['courses'], 'readonly').objectStore('courses').get(id))) as CourseRecord | undefined; }
  async raw(id: string) { return (await req(this.tx(['raw'], 'readonly').objectStore('raw').get(id))) as string | undefined; }
  async put(rec: CourseRecord, raw: string) {
    const t = this.tx(['courses', 'raw'], 'readwrite'); t.objectStore('courses').put(rec); t.objectStore('raw').put(raw, rec.id); await finished(t);
  }
  async patch(id: string, fields: Partial<CourseRecord>) {
    const t = this.tx(['courses'], 'readwrite'), st = t.objectStore('courses'), cur = (await req(st.get(id))) as CourseRecord | undefined;
    if (cur) st.put({ ...cur, ...fields, id }); await finished(t);
  }
  async remove(id: string) { const t = this.tx(['courses', 'raw'], 'readwrite'); t.objectStore('courses').delete(id); t.objectStore('raw').delete(id); await finished(t); }
  async answer(key: string) { return (await req(this.tx(['answers'], 'readonly').objectStore('answers').get(key))) as { at: number; value: unknown } | undefined; }
  async putAnswer(key: string, value: unknown, at: number) { const t = this.tx(['answers'], 'readwrite'); t.objectStore('answers').put({ at, value }, key); await finished(t); }
}

// ------------------------------------------------------------------------------------------------------------------------ the library
/** what is passed in when a fetched answer is kept */
export interface SaveInfo { name: string; place: string; server: string; fetchedAt: string; at?: { lat: number; lon: number } }

export class CourseLibrary {
  /** false: the store is memory only (this browser cannot keep courses between visits) */
  constructor(readonly store: CourseStore, readonly persistent = true) {}

  /** the kept courses, newest fetch first */
  async list(): Promise<CourseRecord[]> { return (await this.store.list()).sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : a.fetchedAt > b.fetchedAt ? -1 : a.name.localeCompare(b.name))); }
  get(id: string): Promise<CourseRecord | undefined> { return this.store.get(id); }

  /** keeps an answer (a new fetch, or a Refresh, replaces the one kept) and returns its record */
  async save(id: string, raw: OverpassJson | string, info: SaveInfo): Promise<CourseRecord> {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const old = await this.store.get(id).catch(() => undefined);
    const rec: CourseRecord = {
      id, name: info.name, place: info.place, credit: OSM_CREDIT, licence: OSM_LICENCE, fetchedAt: info.fetchedAt, server: info.server, bytes: text.length,
      ...(info.at ? { at: info.at } : old?.at ? { at: old.at } : {}),
    };
    await this.store.put(rec, text);
    return rec;
  }
  /** what the preview found, for the list */
  setFound(id: string, found: { grade: Grade; holes: number; par: number }): Promise<void> { return this.store.patch(id, found); }

  /** a kept course as the JSON the converter reads (its answer parsed and built); undefined when it is not kept */
  async load(id: string): Promise<{ json: OsmCourseJson; record: CourseRecord } | undefined> {
    const rec = await this.store.get(id), text = rec ? await this.store.raw(id) : undefined, ref = refOfText(id);
    if (!rec || text === undefined || !ref) return undefined;
    const json = courseJsonOf(JSON.parse(text) as OverpassJson, ref, { id, name: rec.name, place: rec.place, at: rec.at, fetchedAt: rec.fetchedAt, server: rec.server });
    return { json, record: rec };
  }
  remove(id: string): Promise<void> { return this.store.remove(id); }

  /** the store as a cache of answers (Nominatim's), for polite.ts */
  answers(): AnswerCache { return { get: k => this.store.answer(k), put: (k, v, at) => this.store.putAnswer(k, v, at) }; }
}

let shared: Promise<CourseLibrary> | null = null;
/** the game's library: IndexedDB, else memory for the session (once opened, kept) */
export function sharedLibrary(): Promise<CourseLibrary> {
  if (!shared) shared = IdbStore.open().then(s => new CourseLibrary(s, true), () => new CourseLibrary(new MemoryStore(), false));
  return shared;
}
