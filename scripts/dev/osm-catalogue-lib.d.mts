// Types of scripts/dev/osm-catalogue-lib.mjs, for the tests that import it (T378).
export const UA: string;
export const CREDIT: string;
export const LICENCE: string;
export const SERVERS: readonly string[];
export const COUNTRIES: readonly (readonly [string, number])[];
export const US_STATES: readonly (readonly [string, string])[];
export const PLACE_KINDS: readonly string[];
export const MIN_OWN: number;
export const PACK_MAX: number;
export const ENTRY: readonly string[];
export function countryName(cc: string): string;

export interface Region { id: string; cc: string; state?: [string, string]; area: [string, string] }
export function regionsPlan(only?: readonly string[] | null): Region[];
export const usPlaces: Region;
export function coursesQuery(r: Region, timeoutS?: number): string;
export function placesQuery(r: Region, kinds?: readonly string[], timeoutS?: number): string;

export interface Place { lat: number; lon: number; name: string; kind: string }
export function parsePlacesCsv(text: string): Place[];
export class Places {
  constructor(list?: readonly Place[]);
  count: number;
  near(lat: number, lon: number): { local: string; town: string };
}

export interface OverpassEl {
  type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; center?: { lat: number; lon: number };
}
export function displayName(tags: Record<string, string>): string;
export function otherNames(tags: Record<string, string>, shown: string): string;
export function geometryOf(el: OverpassEl): [number, number, number, number] | null;
export function holesOf(courses: readonly { ref: string; b: number[] | null }[], holeEls: readonly OverpassEl[]): Map<string, Set<number>>;
/** [ref, name, place, lat, lon, w10, h10, holes, alt, cc] */
export type Entry = [string, string, string, number, number, number, number, number, string, string];
export function entriesOf(json: { elements?: OverpassEl[] } | null, opt?: { places?: Places | null; suffix?: string; cc?: string }): Entry[];
export function fold(s: string): string;
export function dedupe(entries: Entry[]): Entry[];
export function firstSeen(entries: Entry[], seen: Set<string>): Entry[];
export interface Chunk { id: string; cc: string; entries: Entry[]; at?: string }
export function packChunks(countries: readonly { cc: string; entries: Entry[]; at?: string; parts?: Entry[][] | null }[]): Chunk[];
export function splitByRegion(entries: Entry[], groupOf: ReadonlyMap<string, number>, nRegions: number, splitAt?: number, chunkAt?: number): Entry[][] | null;
export function chunkText(chunk: Chunk, built: string): string;
export function batchQuery(rs: readonly Region[], timeoutS?: number): string;
export function splitBatch(json: { elements?: OverpassEl[] } | null, rs: readonly Region[]): { region: Region; answer: { elements: OverpassEl[] } & Record<string, unknown> }[];
export function placesBatchQuery(rs: readonly Region[], kinds?: readonly string[], timeoutS?: number): string;
export function batchPlan(rs: readonly Region[], want?: (r: Region) => boolean, budget?: number, max?: number): Region[][];
