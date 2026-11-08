// Types of the map-data course (T340, #967): the stage-1 JSON the converter reads (scripts/dev/osm-course.mjs: metres, x east and y north of the
// course centre) and the course spec it makes (tiles of 2 m, x east and y SOUTH of the land's north-west corner: the game's frame). Pure types.
import type { TeeKind } from '../types';

/** the credit every map-data course carries (the data is OpenStreetMap's, ODbL 1.0) */
export const OSM_CREDIT = '© OpenStreetMap contributors';
/** the margin the land keeps round the holes' features, m (the converter's default; the planner counts on it) */
export const OSM_MARGIN_M = 40;
/** the licence line that goes with it (fixtures keep it in their header) */
export const OSM_LICENCE = 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';

/** a point [x, y] of the JSON, metres */
export type JPt = [number, number];
/** a polygon of the JSON */
export interface JPoly { outer: JPt[]; inner: JPt[][] }
/** a feature of the JSON: its OSM id and tags, and its geometry (areas as polys, hole lines and waterways as line, pins as pos) */
export interface JFeature {
  id?: string; tags?: Record<string, string>; polys?: JPoly[]; line?: JPt[]; pos?: JPt;
  /** a hole line's number and par, as the script read them */ ref?: number; par?: number; length?: number;
}
/** the stage-1 JSON, the parts the converter reads (a fixture is the same shape with less in it) */
export interface OsmCourseJson {
  meta?: { attribution?: string; credit?: string; licence?: string; id?: string; place?: string; course?: { osm?: string; name?: string } };
  boundary?: JFeature;
  features: Partial<Record<'tee' | 'fairway' | 'green' | 'bunker' | 'water_hazard' | 'lateral_water_hazard' | 'rough' | 'hole' | 'pin' | 'water' | 'waterway' | 'cartpath' | 'path', JFeature[]>>;
}

/** a point in tiles of the land's frame */
export interface TPt { x: number; y: number }

/** the surfaces a spec paints, in the order it paints them (a later one over an earlier one; water leaves greens and tees alone) */
export type SpecSurface = 'rough' | 'fairway' | 'bunker' | 'water' | 'tee' | 'green';
/** one painted area: its surface, the hole it belongs to (0: none), and its rings (the outer ring and the holes in it, filled together by the
 *  even-odd rule) as flat x, y lists in tiles. made: the converter laid it where the map had none; clip: only inside the course's boundary */
export interface SpecArea { surf: SpecSurface; hole: number; rings: number[][]; made?: boolean; clip?: boolean }

/** a tee marker of a hole */
export interface SpecTee { kind: TeeKind; x: number; y: number }
/** a hole: its number in the game (1..18, in the order of `ref`), the map's own `ref`, par as tagged (null: none) and as the game works it out
 *  (golf/holes.ts parFromLength, from the back tee's length), its tee markers, pin and aim points (tiles), the playing length in metres (tee to
 *  pin along the aim points), and what the converter made up for it */
export interface SpecHole {
  n: number; ref: number | null; par: 3 | 4 | 5; tagPar: number | null; gamePar: 3 | 4 | 5; lengthM: number; handicap: number | null;
  tees: SpecTee[]; pin: TPt; aims: TPt[];
  /** the hole line as drawn (flat x, y, tiles), tee to green */ line: number[];
  /** what was missing and was made: 'green', 'tee', 'fairway', 'pin', 'par' */ made: string[];
}

/** a warning or note about the build: a code, the hole it is about (0: the course) and a sentence */
export interface SpecNote { code: string; hole: number; text: string }

/** a course ready for the game: its size and holes, its areas in paint order, and the notes */
export interface OsmCourseSpec {
  id: string; name: string; credit: string; licence: string; source: string; place: string;
  /** the real coordinates were scaled by this (1: true size; below 1: the course is too big for the 2 km map) */ scale: number;
  /** the land (the holes, their surfaces and a margin) in tiles: width and height; the frame's origin is its north-west corner */
  w: number; h: number;
  holes: SpecHole[]; areas: SpecArea[];
  /** warnings (the build is not refused for them) and fill-ins (what the map lacked and the converter made) */
  warnings: SpecNote[]; fills: SpecNote[];
  /** the other courses on the same boundary (golf:course:name / course:name), not built */
  otherCourses: { name: string; holes: number }[];
  /** the course built: its name tag (null: the boundary had one course) */ course: string | null;
  /** totals over the holes: par as tagged where it was, par as the game works it out, and the playing length, m */
  parTotal: number; gameParTotal: number; lengthM: number;
  /** how many polygons of each map kind the spec uses (for the tests and the card) */
  counts: Record<string, number>;
}

/** what a map-data game saves of its course: the shipped id (the engine lays the flat map for it), the name the game shows, the place, the credit the
 *  course card and the credits show, the OSM id it came from, its holes, and its par as the game works it out (par) and as the map has it (mappedPar) */
export interface OsmGolfInfo { id: string; name: string; place: string; credit: string; licence: string; source: string; holes: number; par: number; mappedPar: number; scale?: number;
  /** where the entry road meets the map's edge (the flat map's highway enters there: the clubhouse parcel is on that side of the land); absent: the middle of the west edge */ entry?: OsmEntry }
/** a point on the map's edge: tiles, and the edge it lies on */
export interface OsmEntry { x: number; y: number; edge: 'N' | 'E' | 'S' | 'W' }
