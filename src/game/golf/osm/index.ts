// The map-data courses the game ships (T340 stage 2, #967): real courses from OpenStreetMap, fetched once with scripts/dev/osm-course.mjs, trimmed with
// scripts/dev/osm-trim-fixture.mjs and checked in under data/ with the ODbL credit in their header. Players' browsers never call Overpass or Nominatim:
// a course is a JSON chunk loaded when it is picked. Real brand names stay out of the game: a famous club is shown under a made-up name. Pure of DOM.
import { osmCourseToSpec } from './convert';
import { osmFits, osmScaleFor } from './start';
import { OSM_CREDIT, type OsmCourseJson, type OsmCourseSpec } from './types';

export { OSM_CREDIT, OSM_LICENCE } from './types';
export type { OsmCourseSpec, OsmCourseJson } from './types';
export { osmCourseToSpec } from './convert';

/** a shipped course: the id the URL (?osmcourse=) and the save use, the name the game shows (with the note that it comes from map data), the place and
 *  the holes and par for the new-game card: par as the game works it out from the holes' lengths, and as the map has it (checked against the converter
 *  by tests/golf-osm-course.test.ts) */
export interface OsmCourseInfo {
  id: string; name: string; place: string; holes: number; par: number; mappedPar: number;
  /** the course is scaled to fit the 2 km map (below 1; absent: true size) */ scale?: number;
  load: () => Promise<OsmCourseJson>;
}

/** the course card's line about where the course comes from */
export const OSM_NOTE = 'from map data';

export const OSM_COURSES: readonly OsmCourseInfo[] = [
  { id: 'rondebosch', name: 'Rondebosch Golf Course', place: 'Cape Town, South Africa', holes: 18, par: 72, mappedPar: 72, load: async () => (await import('./data/rondebosch.json')).default as unknown as OsmCourseJson },
  { id: 'magnolia-national', name: 'Magnolia National', place: 'Georgia, United States', holes: 18, par: 75, mappedPar: 72, load: async () => (await import('./data/magnolia-national.json')).default as unknown as OsmCourseJson },
  { id: 'woodhill', name: 'Woodhill Country Club', place: 'Pretoria, South Africa', holes: 18, par: 70, mappedPar: 73, scale: 0.84, load: async () => (await import('./data/woodhill.json')).default as unknown as OsmCourseJson },
];

/** the shipped course with this id, or undefined */
export const osmCourseInfo = (id: string | null | undefined): OsmCourseInfo | undefined => OSM_COURSES.find(c => c.id === id);

/** the name the game shows for a course: "Magnolia National (from map data)" */
export const osmDisplayName = (name: string): string => `${name} (${OSM_NOTE})`;

/** the spec of a course's JSON for the game's map: at true size when its land fits, else scaled by the largest whole percent at which it does (the
 *  2 km map, golf/osm/start.ts osmFits), which the spec records (scale) and warns of */
export function specOf(json: OsmCourseJson, opt: { id: string; name: string; place: string }): OsmCourseSpec {
  let spec = osmCourseToSpec(json, opt);
  if (osmFits(spec)) return spec;
  let k = osmScaleFor(spec.w, spec.h);
  for (let tries = 0; tries < 12 && k > 0.1; tries++, k = Math.round((k - 0.01) * 100) / 100) { spec = osmCourseToSpec(json, { ...opt, scale: k }); if (osmFits(spec)) break; }
  return spec;
}

const specs = new Map<string, Promise<OsmCourseSpec>>();
/** the spec of a shipped course (converted once, kept); null for an id the game does not ship */
export function loadOsmSpec(id: string): Promise<OsmCourseSpec | null> {
  const info = osmCourseInfo(id);
  if (!info) return Promise.resolve(null);
  let p = specs.get(id);
  if (!p) { p = info.load().then(j => specOf(j, { id: info.id, name: info.name, place: info.place })); specs.set(id, p); }
  return p;
}

/** the credit line for a course card or the credits: "© OpenStreetMap contributors" */
export const osmCredit = (): string => OSM_CREDIT;
