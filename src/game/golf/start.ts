// The golf game's start (docs/GOLF-PLAN.md sections 2 and 3): the one town of a new game, the old nine-hole course beside it, the clubhouse
// parcel (the venue), the car park and the gravel drive joining them to the town, as one plan the engine lays. Pure TS, no DOM.
import { classAt, type Terrain } from '../terrain';
import type { PaintArea } from '../paint';
import type { ClassId, Leg, Pt } from '../network';
import { townCentres, townGrid, TOWN_BLOCKS } from '../lots/seedtowns';
import { generateOldNine } from './coursegen';
import { courseAreas } from './paintcourse';
import { canonicalSite, golfTownClasses, orientLayout, placeCourse } from './place';
import { withCartPathLoop } from './dressing';
import type { CourseLayout } from './types';
import type { GolfSave, Rect } from './mode';

/** the reputation a new golf game starts with (0..100; see reputationAfter in tour.ts) */
export const GOLF_REP_START = 30;

/** a new golf game's plan (planGolfGame): the town's centre, its street legs and their classes, the drive to the venue, the venue (the clubhouse
 * parcel, rect), the car park (rect), the course's paints, and the golf state the save keeps */
export interface GolfStart { centre: Pt; town: { legs: Leg[]; cls: ClassId[] }; drive: Leg[]; venue: Rect; carpark: Rect; paints: Omit<PaintArea, 'id'>[]; save: GolfSave; layout: CourseLayout }

/** the bounding rect (top-left x, y and size w, h, tiles) of a few rects */
function boundsOf(rs: Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, w, h] of rs) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** the plan of a new golf game on a terrain, for a seed (the course's place and the old nine's shape): the first town centre's street grid
 *  (townGrid), the course placed beside it (placeCourse, with the grid's line ends as the drive's joins), the old nine laid on the course's
 *  canonical site and oriented to it (generateOldNine, orientLayout), and painted (courseAreas). Null when the terrain has no town or no
 *  course fits beside it. Deterministic. */
export function planGolfGame(terrain: Terrain, seed: number): GolfStart | null {
  const c = townCentres(terrain)[0];
  if (!c) return null;
  const g = townGrid(c, TOWN_BLOCKS, (x, y) => classAt(terrain, x, y));
  const plan = placeCourse(terrain.cls, c, g.legs.flatMap(l => [l.a, l.b]), seed);
  if (!plan) return null;
  const rawLay = orientLayout(generateOldNine(canonicalSite(plan), seed), plan);
  const lay = withCartPathLoop(rawLay);
  const parcel = boundsOf([plan.course, plan.venue, plan.carpark]);
  return {
  centre: c, town: { legs: g.legs, cls: golfTownClasses(g.legs, c, plan.dir) }, drive: plan.drive, venue: plan.venue, carpark: plan.carpark, paints: courseAreas(lay),
  save: { v: 1, tier: 1, rep: GOLF_REP_START, town: c, course: plan.course, parcel, dir: plan.dir, tees: lay.tees, pins: lay.pins, aims: lay.aims, clubhouse: lay.clubhouse },
  layout: lay,
  };
}
