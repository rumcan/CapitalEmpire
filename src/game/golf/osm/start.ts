// A new golf game on a map-data course (T340 stage 2, #967): where the course, its clubhouse parcel, car park and entry road go on the map, and the
// golf state and course grid the engine lays. The real courses are 1 to 2 km across and the map is 2 km (MAP 1024), and any generated valley has its
// river through every 700-tile window (12 seeds checked), so the game sits on the flat plain (boot.ts flatTerrain): the land in the middle of the map,
// and the clubhouse parcel, car park and drive on the side of it nearest the first tee (a real clubhouse stands by the first tee: a cart ride of a kilometre
// to it is no way to start a round), the entry road from the map's edge on that side (the highway enters there: the terrain's `highway` is that point).
// The golf state has no `start`: the old start's rules (the tournament comes with the season). Pure TypeScript, no DOM.
import { MAP } from '../../iso';
import { landGridBox, makeGrid, type Grid } from '../../ext/course-grid';
import type { Leg, Pt } from '../../network';
import type { GolfSave, Rect } from '../mode';
import { GOLF_REP_START } from '../start';
import { paintSpec, type PaintOptions } from './raster';
import { OSM_MARGIN_M, type OsmCourseSpec, type OsmEntry, type OsmGolfInfo } from './types';

/** the clubhouse parcel, [across, along] tiles, and the car park (golf/place.ts VENUE and PARK): across is along the land's edge, along is away from it */
const VENUE: [number, number] = [40, 24], PARK: [number, number] = [20, 16];
/** the gap between the land and the clubhouse parcel, the drive's length and how far its door stands short of the venue, the car park's gap to the drive, tiles */
const GAP = 14, DRIVE = 24, DOOR = 3, PARK_OFF = 3;
/** the land keeps this far from the map's edges, tiles */
export const OSM_EDGE = 24;
/** the grid keeps this many tiles beyond the owned land (engine.ts COURSE_GRID_PAD) */
const GRID_PAD = 32;
/** the room the land's venue side needs for the clubhouse parcel, the drive and a stretch of road, tiles */
const ROOM = GAP + VENUE[1] + DRIVE + 16;

/** which side of the land the clubhouse parcel stands on (west, east, north, south) */
export type OsmSide = 'W' | 'E' | 'N' | 'S';
const SIDES: readonly OsmSide[] = ['W', 'E', 'N', 'S'];

/** a map-data game's plan: the land (the course rect), the clubhouse parcel (venue), car park, entry road and drive, the golf state (no markers yet:
 *  tees, pins and aim points are laid by the engine, which makes their pictures), the course grid with the spec painted in, and the map-edge point the
 *  entry road starts at (the terrain's highway entry) */
export interface OsmStart {
  land: Rect; venue: Rect; carpark: Rect; road: Leg[]; drive: Leg[]; save: GolfSave; grid: Grid; centre: Pt; side: OsmSide; entry: OsmEntry;
  /** the tile where the spec's frame (its north-west corner) lies on the map */ at: Pt;
}

/** one side's layout of land, clubhouse parcel, car park, road and drive, and how far its parcel is from the first tee, tiles */
interface Layout { side: OsmSide; lx: number; ly: number; venue: Rect; carpark: Rect; road: Leg[]; drive: Leg[]; entry: OsmEntry; dir: 0 | 1 | 2 | 3; dist: number }

/** the layout with the clubhouse parcel on `side` of the land of the spec, or null when it does not fit the map. The land is centred, shifted off centre
 *  only to leave ROOM on the venue's side; the parcel stands beside the first tee (its point along the edge, kept on the map), `tee` in the spec's frame */
function layoutFor(side: OsmSide, spec: OsmCourseSpec, tee: Pt | null, map: number): Layout | null {
  const w = spec.w, h = spec.h, cx = Math.round((map - w) / 2), cy = Math.round((map - h) / 2);
  const lx = side === 'W' ? Math.max(ROOM, cx) : side === 'E' ? Math.min(map - ROOM - w, cx) : cx, ly = side === 'N' ? Math.max(ROOM, cy) : side === 'S' ? Math.min(map - ROOM - h, cy) : cy;
  if (lx < OSM_EDGE || ly < OSM_EDGE || lx + w > map - OSM_EDGE || ly + h > map - OSM_EDGE) return null;
  const t = tee ? { x: lx + tee.x, y: ly + tee.y } : { x: lx + w / 2, y: ly + h / 2 }, [across, along] = VENUE, half = across / 2 + OSM_EDGE;
  const row = Math.max(half, Math.min(map - half, Math.round(t.y))), col = Math.max(half, Math.min(map - half, Math.round(t.x))), B = map - 1;
  let venue: Rect, carpark: Rect, road: Leg, drive: Leg, entry: OsmEntry, dir: 0 | 1 | 2 | 3;
  if (side === 'W') {
    venue = [lx - GAP - along, row - across / 2, along, across]; const ex = venue[0] - DRIVE;
    carpark = [venue[0] - PARK[1], row - PARK_OFF - PARK[0], PARK[1], PARK[0]]; road = { a: { x: 0, y: row }, b: { x: ex, y: row } }; drive = { a: { x: ex, y: row }, b: { x: venue[0] - DOOR, y: row } };
    entry = { x: 0, y: row, edge: 'W' }; dir = 1;
  } else if (side === 'E') {
    venue = [lx + w + GAP, row - across / 2, along, across]; const ex = venue[0] + along + DRIVE;
    carpark = [venue[0] + along, row - PARK_OFF - PARK[0], PARK[1], PARK[0]]; road = { a: { x: B, y: row }, b: { x: ex, y: row } }; drive = { a: { x: ex, y: row }, b: { x: venue[0] + along + DOOR, y: row } };
    entry = { x: B, y: row, edge: 'E' }; dir = 3;
  } else if (side === 'N') {
    venue = [col - across / 2, ly - GAP - along, across, along]; const ey = venue[1] - DRIVE;
    carpark = [col - PARK_OFF - PARK[0], venue[1] - PARK[1], PARK[0], PARK[1]]; road = { a: { x: col, y: 0 }, b: { x: col, y: ey } }; drive = { a: { x: col, y: ey }, b: { x: col, y: venue[1] - DOOR } };
    entry = { x: col, y: 0, edge: 'N' }; dir = 2;
  } else {
    venue = [col - across / 2, ly + h + GAP, across, along]; const ey = venue[1] + along + DRIVE;
    carpark = [col - PARK_OFF - PARK[0], venue[1] + along, PARK[0], PARK[1]]; road = { a: { x: col, y: B }, b: { x: col, y: ey } }; drive = { a: { x: col, y: ey }, b: { x: col, y: venue[1] + along + DOOR } };
    entry = { x: col, y: B, edge: 'S' }; dir = 0;
  }
  const dist = Math.hypot(venue[0] + venue[2] / 2 - t.x, venue[1] + venue[3] / 2 - t.y);
  return { side, lx, ly, venue, carpark, road: [road], drive: [drive], entry, dir, dist };
}

/** the first tee of the spec (the white set, else any), in its frame, or null with no holes */
function firstTee(spec: OsmCourseSpec): Pt | null {
  const h = spec.holes[0], t = h ? h.tees.find(q => q.kind === 'middle') ?? h.tees[0] : undefined;
  return t ? { x: t.x, y: t.y } : null;
}

/** whether the map holds the land of the spec with its clubhouse parcel on some side: a margin of OSM_EDGE tiles round the land, and ROOM on the venue's side */
export function osmFits(spec: OsmCourseSpec, map = MAP): boolean { return SIDES.some(s => layoutFor(s, spec, null, map) !== null); }

/** the uniform scale (at most 1, whole percents) at which a land of w x h tiles at true size fits the map: its holes' features scale, its margin does not.
 *  1 when it fits as it is. The venue goes on the side with room, so the land may be as wide as the map less its two edges in one direction and as the map
 *  less an edge and ROOM in the other */
export function osmScaleFor(w: number, h: number, map = MAP): number {
  const mt = OSM_MARGIN_M; // (the margin on both sides, in tiles: 2 x OSM_MARGIN_M / 2 m)
  const full = map - 2 * OSM_EDGE - mt, room = map - OSM_EDGE - ROOM - mt, kw = Math.max(1, w - mt), kh = Math.max(1, h - mt);
  const k = Math.max(Math.min(room / kw, full / kh), Math.min(full / kw, room / kh));
  return Math.max(0.1, Math.min(1, Math.floor(k * 100) / 100));
}

/** the plan of a new game on the course of this spec, or null when the land does not fit the map. The land is centred; the clubhouse parcel, the car
 *  park, the drive and the entry road go on the side of the land nearest the first tee (the first of west, east, north, south on a tie), the road from
 *  the map's edge on that side to the drive's end, the drive to the clubhouse parcel's door. Deterministic. `paint` (T362): how the course is laid on the grid, the game's
 *  theme among it (a desert game's course keeps the land's own desert ground where the course is natural, raster.ts PaintOptions) */
export function planOsmGame(spec: OsmCourseSpec, map = MAP, paint: PaintOptions = {}): OsmStart | null {
  const tee = firstTee(spec);
  let best: Layout | null = null;
  for (const s of SIDES) { const l = layoutFor(s, spec, tee, map); if (l && (!best || l.dist < best.dist - 1e-6)) best = l; }
  if (!best) return null;
  const { lx, ly, venue, carpark, road, drive, entry, dir, side } = best;
  const land: Rect = [lx, ly, spec.w, spec.h];
  const rs = [land, venue, carpark], x0 = Math.min(...rs.map(r => r[0])), y0 = Math.min(...rs.map(r => r[1])), x1 = Math.max(...rs.map(r => r[0] + r[2])), y1 = Math.max(...rs.map(r => r[1] + r[3]));
  const parcel: Rect = [x0, y0, x1 - x0, y1 - y0], centre: Pt = { x: venue[0] + venue[2] / 2, y: venue[1] + venue[3] / 2 };
  const info: OsmGolfInfo = { id: spec.id, name: spec.name, place: spec.place, credit: spec.credit, licence: spec.licence, source: spec.source, holes: spec.holes.length, par: spec.gameParTotal, mappedPar: spec.parTotal, entry, ...(spec.scale < 1 ? { scale: spec.scale } : {}), ...(spec.derived ? { derived: true } : {}) };
  const save: GolfSave = { v: 1, tier: 1, rep: GOLF_REP_START, town: centre, course: land, parcel, dir, tees: [], pins: [], aims: [], clubhouse: centre, osm: info };
  const box = landGridBox([land, parcel], GRID_PAD, map)!, grid = makeGrid(box[0], box[1], box[2], box[3]);
  paintSpec(grid, spec, lx, ly, paint);
  return { land, venue, carpark, road, drive, save, grid, centre, side, entry, at: { x: lx, y: ly } };
}
