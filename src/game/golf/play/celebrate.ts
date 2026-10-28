// T213 (#558): the celebrations. A golfer who holes out for a birdie or better (an eagle, an albatross, an ace on a par 3) celebrates once his ball
// drops: a short fist pump stand-in (the golfer clips have no fist pump or cap tip: the swing's high finish, turned to the camera, with a little hop; the
// art gap is GOLF-ART-LIST item 177), and the gallery near him plays its cheer clip. Pure TS, no DOM.
import type { CourseView, RoundPlan, Shot } from './types';

/** a celebration lasts this many real seconds, from the moment the ball drops */
export const CELEBRATE_S = 1.6;
/** the gallery cheers within this many tiles of a celebrating golfer */
export const CHEER_TILES = 40;

/** one celebration: the golfer, the hole (an index), the stroke that holed it, and his score against par on the hole (-1 a birdie, -2 an eagle, ...) */
export interface Celebration { golfer: number; hole: number; shot: Shot; toPar: number }

/** whether a hole-out of k strokes (penalties included) on a par-p hole is celebrated: a birdie or better */
export const celebrated = (k: number, par: number): boolean => k <= par - 1;

/** the round's celebrations in time order: every stroke that holed a golfer out at a birdie or better (deterministic: the plan decides it) */
export function celebrations(plan: RoundPlan, view: CourseView): Celebration[] {
  const out: Celebration[] = [];
  for (const s of plan.shots) {
    if (!s.holed) continue;
    const hole = view.holes[s.hole]; if (!hole) continue;
    const k = s.stroke + s.penalty;
    if (celebrated(k, hole.par)) out.push({ golfer: s.golfer, hole: s.hole, shot: s, toPar: k - hole.par });
  }
  return out;
}
