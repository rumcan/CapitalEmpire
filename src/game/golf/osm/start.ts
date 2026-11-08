// A new golf game on a map-data course (T340 stage 2, #967): where the course, its clubhouse parcel, car park and entry road go on the map, and the
// golf state and course grid the engine lays. The real courses are 1 to 1.4 km across and the map is 2 km (MAP 1024), and any generated valley has its
// river through every 700-tile window (12 seeds checked), so the game sits on the flat plain (boot.ts flatTerrain): the land in the middle of the
// map, the entry road from the west edge (where flatTerrain's highway enters), and the clubhouse and car park on the land's west side, as the old start
// has them beside its course. The golf state has no `start`: the old start's rules (the tournament comes with the season). Pure TypeScript, no DOM.
import { MAP } from '../../iso';
import { landGridBox, makeGrid, type Grid } from '../../ext/course-grid';
import type { Leg, Pt } from '../../network';
import type { GolfSave, Rect } from '../mode';
import { GOLF_REP_START } from '../start';
import { paintSpec } from './raster';
import type { OsmCourseSpec, OsmGolfInfo } from './types';

/** the clubhouse parcel, [across, along] tiles, and the car park (golf/place.ts VENUE and PARK) */
const VENUE: [number, number] = [40, 24], PARK: [number, number] = [20, 16];
/** the gap between the land and the clubhouse parcel, the drive's length and how far its door stands short of the venue, the car park's gap to the drive, tiles */
const GAP = 14, DRIVE = 24, DOOR = 3, PARK_OFF = 3;
/** the land keeps this far from the map's edges, tiles */
export const OSM_EDGE = 24;
/** the grid keeps this many tiles beyond the owned land (engine.ts COURSE_GRID_PAD) */
const GRID_PAD = 32;

/** a map-data game's plan: the land (the course rect), the clubhouse parcel (venue), car park, entry road and drive, the golf state (no markers yet:
 *  tees, pins and aim points are laid by the engine, which makes their pictures), and the course grid with the spec painted in */
export interface OsmStart {
  land: Rect; venue: Rect; carpark: Rect; road: Leg[]; drive: Leg[]; save: GolfSave; grid: Grid; centre: Pt;
  /** the tile where the spec's frame (its north-west corner) lies on the map */ at: Pt;
}

/** whether the map holds the land of the spec: a margin of OSM_EDGE tiles round the land, and room on its west side for the clubhouse parcel and the road */
export function osmFits(spec: OsmCourseSpec, map = MAP): boolean {
  const lx = Math.round((map - spec.w) / 2), ly = Math.round((map - spec.h) / 2);
  return lx - GAP - VENUE[1] - DRIVE >= 16 && ly >= OSM_EDGE && lx + spec.w <= map - OSM_EDGE && ly + spec.h <= map - OSM_EDGE;
}

/** the plan of a new game on the course of this spec, or null when the land does not fit the map. The land is centred; the entry road runs from the west
 *  edge along the middle row to E, the drive from E to the clubhouse parcel's door, the car park beside the drive. Deterministic */
export function planOsmGame(spec: OsmCourseSpec, map = MAP): OsmStart | null {
  if (!osmFits(spec, map)) return null;
  const lx = Math.round((map - spec.w) / 2), ly = Math.round((map - spec.h) / 2), ey = Math.round(map / 2);
  const land: Rect = [lx, ly, spec.w, spec.h], ex = lx - GAP - VENUE[1] - DRIVE;
  const venue: Rect = [ex + DRIVE, ey - VENUE[0] / 2, VENUE[1], VENUE[0]];
  const carpark: Rect = [ex + DRIVE - PARK[1], ey - PARK_OFF - PARK[0], PARK[1], PARK[0]];
  const road: Leg[] = [{ a: { x: 0, y: ey }, b: { x: ex, y: ey } }], drive: Leg[] = [{ a: { x: ex, y: ey }, b: { x: ex + DRIVE - DOOR, y: ey } }];
  const rs = [land, venue, carpark], x0 = Math.min(...rs.map(r => r[0])), y0 = Math.min(...rs.map(r => r[1])), x1 = Math.max(...rs.map(r => r[0] + r[2])), y1 = Math.max(...rs.map(r => r[1] + r[3]));
  const parcel: Rect = [x0, y0, x1 - x0, y1 - y0], centre: Pt = { x: venue[0] + venue[2] / 2, y: venue[1] + venue[3] / 2 };
  const info: OsmGolfInfo = { id: spec.id, name: spec.name, place: spec.place, credit: spec.credit, licence: spec.licence, source: spec.source, holes: spec.holes.length, par: spec.parTotal };
  const save: GolfSave = { v: 1, tier: 1, rep: GOLF_REP_START, town: centre, course: land, parcel, dir: 1, tees: [], pins: [], aims: [], clubhouse: centre, osm: info };
  const box = landGridBox([land, parcel], GRID_PAD, map)!, grid = makeGrid(box[0], box[1], box[2], box[3]);
  paintSpec(grid, spec, lx, ly);
  return { land, venue, carpark, road, drive, save, grid, centre, at: { x: lx, y: ly } };
}
