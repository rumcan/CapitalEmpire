// Golf mode (G1; docs/GOLF-PLAN.md sections 2-3 and 11): what a golf game saves and what the HUD reads. A save with a `golf` field is a golf
// game; a save without one is a legacy (classic) game and loads as before. Pure TS, no DOM.
import type { Pt } from '../network';
import type { AimPoint, Pin, TeeMark } from './types';
import type { PlacedEventStructure } from './eventtool';

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
}

/** the golf HUD's view (Engine.golfView): the tier and its event name, the month label ("Mar 1985"), the months left to the tournament
 *  (0..12, fractional), the tournament's year, and whether the tournament day is under way (the round's surge or its results) */
export interface GolfView { tier: number; tierName: string; month: string; monthsLeft: number; year: number; live: boolean }

/** normalizes a loaded GolfSave so missing array or optional fields from older/partial saves default safely without mutating valid fields */
export function normalizeGolfSave(g: Partial<GolfSave> | null | undefined): GolfSave | null {
  if (!g || !g.town || !g.course || !g.clubhouse) return null;
  const parcel: Rect = g.parcel ?? g.parcels?.[0] ?? g.course;
  return {
    ...g,
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
}
