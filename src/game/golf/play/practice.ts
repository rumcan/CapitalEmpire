// T349 (#992; the owner, 2026-11-08, on the hole card: "add a play hole button to this menu that asks if you want to play just this hole or all 18/9"): the pure rules of the hole card's Play.
// The player's own round (play/yours.ts) on one hole of the course, or on every hole of it once, as a practice round: free, not an event, not recorded (no handicap, reputation or money).
// - Which holes: just hole n (its first turn in the played course, from your tee: the white one, else the first it has), or all of the course's real holes from the first (a 9-hole course
//   is played out to 18 by courseview.ts makeCourseView; "All 9" plays each hole once).
// - Why a hole cannot be played: it lacks a tee, a pin or a green (the card's own checks say which).
// Pure TS, no DOM.
import type { CourseView } from './types';

/** the hole card's choice: just this hole, or every hole of the course */
export type PracticeScope = 'hole' | 'all';

/** how many holes the course really has (the played course repeats a short course's holes up to 18: each number counts once) */
export function realHoleCount(view: Pick<CourseView, 'holes'>): number { return new Set(view.holes.map(h => h.n)).size; }

/** the played holes' indices a practice choice plays: just hole `n` (its first turn in the played course; none when the course has no such hole), or the course's real holes once, from the first */
export function practicePick(view: Pick<CourseView, 'holes'>, n: number, scope: PracticeScope): number[] {
  if (scope === 'hole') { const i = view.holes.findIndex(h => h.n === n); return i >= 0 ? [i] : []; }
  const N = Math.min(realHoleCount(view), view.holes.length);
  return Array.from({ length: N }, (_, i) => i);
}

/** what a hole lacks to be played: "a tee", "a pin", "a green" (in that order; none when it has them all) */
export function missingParts(h: { tee: boolean; pin: boolean; green: boolean }): string[] {
  const out: string[] = [];
  if (!h.tee) out.push('a tee');
  if (!h.pin) out.push('a pin');
  if (!h.green) out.push('a green');
  return out;
}
/** the Play button's tooltip when parts are missing: "Cannot play hole 4 yet: it needs a tee and a pin"; null when nothing is missing */
export function missingWhy(n: number, parts: readonly string[]): string | null {
  return parts.length ? `Cannot play hole ${n} yet: it needs ${parts.join(' and ')}` : null;
}

/** the label of the "all" choice: "All 18", "All 9" */
export const allLabel = (count: number): string => `All ${count}`;
