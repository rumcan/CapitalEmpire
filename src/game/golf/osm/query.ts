// What a player types or pastes into "Find a real course" (T358, #1003): a course's name, an openstreetmap.org link, a `way/123` or `relation/123`
// (also `node/123`), or a place (a map link with #map=zoom/lat/lon, or "lat, lon"). Pure, no network.

export type OsmType = 'node' | 'way' | 'relation';
/** an object of the map: its type and number */
export interface OsmRef { type: OsmType; id: number }

export type CourseQuery =
  /** nothing typed */ | { kind: 'empty' }
  /** a name to search for (Nominatim) */ | { kind: 'name'; text: string }
  /** an object of the map: no search, the import goes straight to it */ | { kind: 'osm'; ref: OsmRef }
  /** a place: golf features near it are looked for (Overpass) */ | { kind: 'place'; lat: number; lon: number }
  /** an openstreetmap.org link that names neither an object nor a place */ | { kind: 'link'; text: string };

/** `way/123`, `way 123`, `relation:123`, `node#123` (the whole text) */
const PLAIN_REF = /^(node|way|relation)\s*[/ :#]?\s*(\d{1,13})$/i;
/** an object's page: .../way/123, .../browse/relation/123, .../api/0.6/node/123 */
const URL_REF = /\/(node|way|relation)\/(\d{1,13})(?=$|[/?#.])/i;
/** the map's position in a link: #map=17/-25.8250/28.2697 */
const MAP_HASH = /#map=\d{1,2}\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)/;
/** a marker in a link: ?mlat=-25.82&mlon=28.31 */
const MARKER = /[?&]mlat=(-?\d{1,3}(?:\.\d+)?)&(?:amp;)?mlon=(-?\d{1,3}(?:\.\d+)?)/;
/** "-25.82, 28.31" (a comma, semicolon or space between) */
const LAT_LON = /^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/;
/** a link to openstreetmap.org (www., a language prefix and osm.org too), with or without the scheme */
const OSM_HOST = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:openstreetmap\.org|osm\.org)(?:[/?#:]|$)/i;

const ref = (type: string, id: string): CourseQuery => (Number(id) >= 1 ? { kind: 'osm', ref: { type: type.toLowerCase() as OsmType, id: Number(id) } } : { kind: 'link', text: `${type}/${id}` });
const place = (lat: number, lon: number): CourseQuery | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { kind: 'place', lat, lon } : null;

/** reads what the player typed or pasted (see the file's header) */
export function parseCourseQuery(input: string): CourseQuery {
  const s = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'empty' };
  let m = PLAIN_REF.exec(s);
  if (m) return ref(m[1]!, m[2]!);
  if (OSM_HOST.test(s)) {
    const path = s.replace(/^(?:https?:\/\/)?[^/?#]+/i, '');
    m = URL_REF.exec(path);
    if (m) return ref(m[1]!, m[2]!);
    m = MAP_HASH.exec(s) ?? MARKER.exec(s);
    const p = m ? place(Number(m[1]), Number(m[2])) : null;
    return p ?? { kind: 'link', text: s };
  }
  if (/^https?:\/\//i.test(s)) return { kind: 'link', text: s };
  m = LAT_LON.exec(s);
  if (m) { const p = place(Number(m[1]), Number(m[2])); if (p) return p; }
  return { kind: 'name', text: s };
}

/** the text of an object: "way/123" */
export const refText = (r: OsmRef): string => `${r.type}/${r.id}`;
/** the object of a text "way/123" (null when it is not one) */
export function refOfText(s: string): OsmRef | null {
  const m = /^(node|way|relation)\/(\d{1,13})$/.exec(s);
  return m ? { type: m[1] as OsmType, id: Number(m[2]) } : null;
}
