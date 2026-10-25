// Golf mode (G1; docs/GOLF-PLAN.md sections 2-3 and 11): what a golf game saves and what the HUD reads. A save with a `golf` field is a golf
// game; a save without one is a legacy (classic) game and loads as before. Pure TS, no DOM.
import type { Pt } from '../network';
import type { AimPoint, Pin, TeeMark } from './types';
import type { PlacedEventStructure } from './eventtool';
import type { CourseHeightSaveChunk } from '../ext/course-height';
import type { GolfProgress } from '../ext/progressive-ui';
import type { GridSave } from '../ext/course-grid';
import { normalizeRangeBiz, type RangeBizSave } from './rangesave';

/** a rectangle in tiles: top-left x, y and the size w, h */
export type Rect = [number, number, number, number];

/** a golf game's own state, saved as SaveV5.golf: the tournament tier (1..5) and the reputation (0..100), the town's centre (golf mode has one
 *  town), the course's rectangle (the painted course; its areas are ordinary Paint areas, saved with the paints) and the owned parcel (the course
 *  plus its clubhouse and car park), the side of the town the course lies on (0 north, 1 east, 2 south, 3 west), and the hole objects (tee
 *  markers, pins, aim points) and the clubhouse door, tiles */
export interface GolfSave {
 v: 1; tier: number; rep: number; poorYears?: number; town: Pt; course: Rect; parcel: Rect; dir: 0 | 1 | 2 | 3;
 tees: TeeMark[]; pins: Pin[]; aims: AimPoint[]; clubhouse: Pt;
 parcels?: Rect[];
 structures?: PlacedEventStructure[];
 cards?: string[];
 /** the course height field as sparse chunks (T027); missing = flat */
 height?: CourseHeightSaveChunk[];
 /** what the player did (T033; missing in older saves: see normalizeProgress) */
 progress?: GolfProgress;
 /** the course grid (plan P21 3.7, T078: ext/course-grid encodeGrid); missing in older saves, whose golf-surface paint areas then move into
  *  a new grid on load. The engine keeps the live grid; this field is only written by a save */
 grid?: GridSave;
 /** the hole plans, one save tuple per hole (plan P21 3.7: hole, tee, green, green shape and m², turn, bends, width handles, fairway start,
  *  seed; ext/hole-plan's HolePlanTuple once it lands); kept as they are, undo carries them */
 plans?: unknown[];
 /** how the game started (plan P22 2.6): 'range' for a new game begun with the county road and the driving range (golf/rangestart.ts);
  *  missing for the old start (a seeded town, the old nine and the clubhouse), whose saves keep today's rules */
 start?: 'range';
 /** the county road's map exits, border points in tiles (range starts: the town's off-map world) */
 exits?: Pt[];
 /** the town's growth factor from tournament success (range starts, T090; missing = 1) */
 townBoost?: number;
 /** when the tour invited the player (range starts, T088: the game clock, golf/tour.ts tournamentDue); missing = not yet */
 invited?: { at: number };
 /** the founding seasons passed: season ends with no tournament (range starts, T088); the calendar counts them with the tournaments (missing = 0) */
 founding?: number;
 /** the range business (range starts, plan P24, T129: golf/rangesave.ts): its upgrades, bucket price and counts; a range start's save without it
  *  loads as the starting range */
 range?: RangeBizSave;
}

/** a golf game's start money, $ (City.setBudget's golf treasury) */
export const GOLF_START_MONEY = 600000;

/** the golf HUD's view (Engine.golfView): the tier and its event name, the month label ("Mar 1985"), the months left to the tournament
 *  (0..12, fractional), the tournament's year, and whether the tournament day is under way (the round's surge or its results) */
export interface GolfView { tier: number; tierName: string; month: string; monthsLeft: number; year: number; live: boolean }

/** normalizes a loaded GolfSave so missing array or optional fields from older/partial saves default safely without mutating valid fields */
export function normalizeGolfSave(g: Partial<GolfSave> | null | undefined): GolfSave | null {
  if (!g || !g.town || !g.course || !g.clubhouse) return null;
  const parcel: Rect = g.parcel ?? g.parcels?.[0] ?? g.course;
  // the range start's fields (plan P22 2.6) are taken out and put back only when well formed, so an old start's save normalizes as before
  const { start, exits, townBoost, invited, founding, range, ...rest } = g;
  const out: GolfSave = {
    ...rest,
    v: 1,
    tier: g.tier ?? 1,
    rep: g.rep ?? 0,
    town: g.town,
    course: g.course,
    parcel,
    dir: g.dir ?? 0,
    tees: g.tees ?? [],
    pins: g.pins ?? [],
    aims: g.aims ?? [],
    clubhouse: g.clubhouse,
  };
  if (start === 'range') { out.start = 'range'; out.range = normalizeRangeBiz(range); }
  if (Array.isArray(exits)) out.exits = exits.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ x: p.x, y: p.y }));
  if (typeof townBoost === 'number' && Number.isFinite(townBoost)) out.townBoost = townBoost;
  if (invited && Number.isFinite(invited.at)) out.invited = { at: invited.at };
  if (typeof founding === 'number' && Number.isFinite(founding) && founding > 0) out.founding = Math.floor(founding);
  return out;
}
