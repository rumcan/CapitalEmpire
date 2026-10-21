// The golf town's place (docs/GOLF-PLAN.md sections 3 and 5): where the old nine-hole course, its clubhouse parcel (the venue), its car park and the gravel
// drive from the town go beside the one town, the course's orientation onto that site, and the town's avenue classes. Pure TS, no DOM.
import { MAP, mulberry } from '../iso';
import { BLOCK } from '../lots/roads';
import { TOWN_BLOCKS } from '../lots/seedtowns';
import { SITE_MARGIN } from '../event/config';
import { TC } from '../terrain/types';
import type { ClassId, Leg, Pt } from '../network';
import type { Rect } from './mode';
import type { CourseLayout } from './types';

/** course sizes tried in order, [across, along] tiles (across: perpendicular to the town axis; along: away from the town) */
export const COURSE_SIZES: [number, number][] = [[300, 450], [270, 400], [240, 360]];
/** the clubhouse parcel, [across, along] tiles */
export const VENUE: [number, number] = [40, 24];
/** the car park, [across, along] tiles */
export const PARK: [number, number] = [20, 16];
/** the venue centre's distance from the town centre, tiles: at least CLUB_MIN and at most CLUB_MAX */
export const CLUB_MIN = 150, CLUB_MAX = 350;
/** the first drive length tried, tiles, and the step each retry adds */
const D0 = 20, DSTEP = 10;
/** the drive ends this many tiles before the venue */
const DOOR = 3;
/** the car park's near edge sits this many tiles off the drive's centre line */
const PARK_OFF = 3;
/** the drive corridor: every tile within this many tiles of its centre line must be buildable */
const DRIVE_HALF = 2;
/** the course's playable share of its rect: open land or hills (a course rolls over hills; the rest may be water, creek or bank) */
const COURSE_BUILD = 0.98;

/** a placed course: dir (the side of the town the course lies on: 0 north, 1 east, 2 south, 3 west), the course rect, the venue and the car park
 *  (rects: top-left x, y and size w, h, tiles), and the drive: one leg from the town's edge to the venue's door */
export interface CoursePlan { dir: 0 | 1 | 2 | 3; course: Rect; venue: Rect; carpark: Rect; drive: Leg[] }

/** the top-left tile (x0, y0) of the town grid around centre (tiles, n blocks each way) and its middle lines ax (vertical) and ay (horizontal), as townGrid lays them */
export function townAxis(centre: Pt, n = TOWN_BLOCKS): { x0: number; y0: number; ax: number; ay: number } {
  const x0 = Math.round((centre.x - n * BLOCK / 2) / BLOCK) * BLOCK, y0 = Math.round((centre.y - n * BLOCK / 2) / BLOCK) * BLOCK;
  return { x0, y0, ax: x0 + n / 2 * BLOCK, ay: y0 + n / 2 * BLOCK };
}

/** the grid edge point E on side dir of the town: the far end of its main avenue */
function edgeOf(dir: 0 | 1 | 2 | 3, A: ReturnType<typeof townAxis>): Pt {
  const span = TOWN_BLOCKS * BLOCK;
  return dir === 0 ? { x: A.ax, y: A.y0 } : dir === 2 ? { x: A.ax, y: A.y0 + span } : dir === 1 ? { x: A.x0 + span, y: A.ay } : { x: A.x0, y: A.ay };
}

/** the world point s tiles from E away from the town on side dir, and t tiles to its lateral side (+x across a north-south axis, +y across an east-west one) */
function at(dir: 0 | 1 | 2 | 3, E: Pt, s: number, t: number): Pt {
  return dir === 0 ? { x: E.x + t, y: E.y - s } : dir === 2 ? { x: E.x + t, y: E.y + s } : dir === 1 ? { x: E.x + s, y: E.y + t } : { x: E.x - s, y: E.y + t };
}

/** the world rect (top-left x, y and size w, h, tiles) of s in [s0, s1] by t in [t0, t1] in side dir's frame around E */
function frame(dir: 0 | 1 | 2 | 3, E: Pt, s0: number, s1: number, t0: number, t1: number): Rect {
  const a = at(dir, E, s0, t0), b = at(dir, E, s1, t1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
}

/** the course's place beside the one town. Sizes (COURSE_SIZES) outermost, then the sides in a seeded shuffle of 0..3, then the drive length from
 *  D0 in steps of DSTEP while the venue centre stays within CLUB_MAX (and at least CLUB_MIN). The first candidate whose E is one of ends (the
 *  town legs' endpoints), whose course is COURSE_BUILD playable (open land or hills), whose venue, car park and drive corridor are fully buildable (GROUND or PATCH),
 *  and whose course, venue and car park keep SITE_MARGIN from the map's edges, wins. cls: the terrain classes (MAP x MAP). Null when none fits. Deterministic. */
export function placeCourse(cls: Uint8Array, centre: Pt, ends: Pt[], seed: number): CoursePlan | null {
  // two integral images: S counts the buildable tiles (GROUND, PATCH), H the playable ones (those and HILL)
  const N = MAP + 1, S = new Int32Array(N * N), H = new Int32Array(N * N);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const c = cls[y * MAP + x], b = c === TC.GROUND || c === TC.PATCH ? 1 : 0, h = b || c === TC.HILL ? 1 : 0, i = (y + 1) * N + x + 1;
    S[i] = S[y * N + x + 1] + S[(y + 1) * N + x] - S[y * N + x] + b;
    H[i] = H[y * N + x + 1] + H[(y + 1) * N + x] - H[y * N + x] + h;
  }
  /** the tiles of r (r inside the map) counted by the integral image I (S: buildable, the default; H: playable) */
  const count = (r: Rect, I = S) => I[(r[1] + r[3]) * N + r[0] + r[2]] - I[r[1] * N + r[0] + r[2]] - I[(r[1] + r[3]) * N + r[0]] + I[r[1] * N + r[0]];
  /** whether r lies inside the map, m tiles in from each edge */
  const inside = (r: Rect, m: number) => r[0] >= m && r[1] >= m && r[0] + r[2] <= MAP - m && r[1] + r[3] <= MAP - m;
  /** whether r lies inside the map and every tile of it is buildable */
  const full = (r: Rect) => inside(r, 0) && count(r) === r[2] * r[3];
  const A = townAxis(centre), rng = mulberry(seed), order: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const [across, along] of COURSE_SIZES) for (const dir of order) {
    const E = edgeOf(dir, A);
    if (!ends.some(p => p.x === E.x && p.y === E.y)) continue;
    for (let D = D0; ; D += DSTEP) {
      const venue = frame(dir, E, D, D + VENUE[1], -VENUE[0] / 2, VENUE[0] / 2);
      const dist = Math.hypot(venue[0] + venue[2] / 2 - centre.x, venue[1] + venue[3] / 2 - centre.y);
      if (dist > CLUB_MAX) break;
      if (dist < CLUB_MIN) continue;
      const course = frame(dir, E, D + VENUE[1], D + VENUE[1] + along, -across / 2, across / 2);
      const carpark = frame(dir, E, D - PARK[1], D, -(PARK_OFF + PARK[0]), -PARK_OFF);
      const corridor = frame(dir, E, 0, D - DOOR, -DRIVE_HALF, DRIVE_HALF);
      if (!inside(course, SITE_MARGIN) || !inside(venue, SITE_MARGIN) || !inside(carpark, SITE_MARGIN)) continue;
      if (count(course, H) < COURSE_BUILD * course[2] * course[3] || !full(venue) || !full(carpark) || !full(corridor)) continue;
      return { dir, course, venue, carpark, drive: [{ a: at(dir, E, 0, 0), b: at(dir, E, D - DOOR, 0) }] };
    }
  }
  return null;
}

/** the canonical site of a placed course, {0, 0, across, along} in tiles: generateOldNine lays the course on it with the clubhouse at the bottom (+y), facing the town */
export function canonicalSite(p: CoursePlan): { x0: number; y0: number; x1: number; y1: number } {
  const [, , w, h] = p.course, across = p.dir % 2 === 0 ? w : h, along = p.dir % 2 === 0 ? h : w;
  return { x0: 0, y0: 0, x1: across, y1: along };
}

/** the course laid on canonicalSite(p), rotated (never mirrored) into the course rect so that its clubhouse faces the town; a new layout, the input unchanged */
export function orientLayout(l: CourseLayout, p: CoursePlan): CourseLayout {
  const [cx, cy, w, h] = p.course, d = p.dir, across = d % 2 === 0 ? w : h, along = d % 2 === 0 ? h : w;
  const to = (u: number, v: number): Pt => d === 0 ? { x: cx + u, y: cy + v } : d === 2 ? { x: cx + across - u, y: cy + along - v } : d === 1 ? { x: cx + along - v, y: cy + u } : { x: cx + v, y: cy + across - u };
  const flat = (pts: number[]): number[] => { const out: number[] = []; for (let i = 0; i < pts.length; i += 2) { const q = to(pts[i], pts[i + 1]); out.push(q.x, q.y); } return out; };
  return {
    areas: l.areas.map(a => ({ ...a, pts: flat(a.pts) })),
    tees: l.tees.map(t => ({ ...t, ...to(t.x, t.y) })),
    pins: l.pins.map(q => ({ ...q, ...to(q.x, q.y) })),
    aims: l.aims.map(q => ({ ...q, ...to(q.x, q.y) })),
    clubhouse: to(l.clubhouse.x, l.clubhouse.y),
  };
}

/** the town's street classes for golf (one asphalt main avenue with gravel branches): a leg is 'avenue' when both its ends lie on the main axis of side dir (x = ax for dirs 0 and 2, y = ay for 1 and 3), else 'gravel' */
export function golfTownClasses(legs: Leg[], centre: Pt, dir: 0 | 1 | 2 | 3): ClassId[] {
  const A = townAxis(centre), vert = dir % 2 === 0, L = vert ? A.ax : A.ay;
  return legs.map(l => (vert ? l.a.x === L && l.b.x === L : l.a.y === L && l.b.y === L) ? 'avenue' : 'gravel');
}
