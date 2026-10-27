// The end of the tournament day's round (T210, #555): the "last group on the 18th" moment and the results. The day's result is worked out at the 15:00
// kick-off (event/round.ts: the eval), but golf goes on after it; the results screen waits for the last group to hole out. First comes the moment the
// last group on the course walks onto the final hole (a toast, and the board offers to watch it), then, once every golfer is done, the results. A
// tracker (DayFinish) latches both, so each fires once, in that order, whatever the frame step (20x jumps straight over the 18th: the moment still
// comes first, in the same step). resultsDue says when the eval's screen may open. Pure TS, no DOM.
import { stateAt } from './round';
import type { CourseView, RoundPlan } from './types';

/** the last group on the course: its index in plan.groups, its golfers still out (not done) and the final hole's index (the 18th of the round) */
export interface LastGroup { group: number; golfers: number[]; hole: number }

/** the round is over by minute: every golfer done (holed out and walked off the last green) at a known minute no later than it. True with no holes or
 *  no golfers (nothing to wait for); false while the owner's live group still plays (its done is not known yet) */
export function roundOver(plan: RoundPlan, view: CourseView, minute: number): boolean {
  if (!view.holes.length || !plan.golfers.length) return true;
  return plan.golfers.every(g => { const d = plan.done[g.id]!; return Number.isFinite(d) && d <= minute; });
}

/** the group still out with the latest tee time (null when everyone is done): the last group on the course */
function lastOut(plan: RoundPlan, minute: number): { group: number; golfers: number[] } | null {
  let best = -1;
  plan.groups.forEach((gr, i) => { if (gr.players.some(id => !(plan.done[id]! <= minute)) && (best < 0 || gr.tee >= plan.groups[best]!.tee)) best = i; });
  return best < 0 ? null : { group: best, golfers: plan.groups[best]!.players.filter(id => !(plan.done[id]! <= minute)) };
}

/** the last group on the final hole at minute: the group still out with the latest tee time has teed off, and every one of its golfers still out is
 *  on the round's last hole (walking to its tee, playing it or holing out). Null otherwise, and when everyone is done */
export function lastGroupOnLast(plan: RoundPlan, view: CourseView, minute: number): LastGroup | null {
  const N = view.holes.length; if (!N) return null;
  const lg = lastOut(plan, minute); if (!lg || minute < plan.groups[lg.group]!.tee) return null;
  const st = stateAt(plan, view, minute), at = new Map(st.map(s => [s.golfer, s.hole] as const));
  return lg.golfers.every(id => at.get(id) === N - 1) ? { ...lg, hole: N - 1 } : null;
}

/** the group that finished last (the latest done among its golfers; ties: the later tee): the last group when a step jumps past its 18th */
function finishedLast(plan: RoundPlan, view: CourseView): LastGroup | null {
  let best = -1, bestDone = -Infinity;
  plan.groups.forEach((gr, i) => {
    if (!gr.players.length) return;
    const d = Math.max(...gr.players.map(id => plan.done[id]!));
    if (best < 0 || d > bestDone || (d === bestDone && gr.tee >= plan.groups[best]!.tee)) { best = i; bestDone = d; }
  });
  return best < 0 ? null : { group: best, golfers: plan.groups[best]!.players.slice(), hole: Math.max(0, view.holes.length - 1) };
}

/** what one step of DayFinish brings: the last group's moment (once), and the round over (once) */
export interface FinishStep { last: LastGroup | null; over: boolean }

/** the end of the day's round, latched: the last group's moment and the round over, each once and in that order. Step it with the game minute every
 *  frame (or as often as the playback updates); after a reload a new tracker on the rebuilt plan comes to the same end */
export class DayFinish {
  /** the last group's moment came (with that group), and when (game minute); null before */
  last: LastGroup | null = null; lastAt = -1;
  /** the round is over (every golfer done): the results may open; and the minute it was first seen over */
  over = false; overAt = -1;

  /** one step at minute: the moment when it first comes (the last group on the final hole, or the round over before it was seen: the group that
   *  finished last), and over when the round is first over. Nothing once over */
  step(plan: RoundPlan, view: CourseView, minute: number): FinishStep {
    const out: FinishStep = { last: null, over: false };
    if (this.over) return out;
    const done = roundOver(plan, view, minute);
    if (!this.last) {
      const lg = done ? finishedLast(plan, view) : lastGroupOnLast(plan, view, minute);
      if (lg) { this.last = lg; this.lastAt = minute; out.last = lg; }
    }
    if (done) { this.over = true; this.overAt = minute; out.over = true; }
    return out;
  }
}

/** the eval's results screen may open (T210): only in the eval; at once outside golf, when the player asked for the results early (today's early
 *  leave: the screen as it opened at kick-off, "Back to the valley" ends the day), or when the day has no play (no holes: built as null); while the
 *  play is not built yet (undefined: the first frame after a load) it waits; with a play, once its round is over */
export function resultsDue(stage: string, golf: boolean, play: { over: boolean } | null | undefined, early: boolean): boolean {
  if (stage !== 'eval') return false;
  if (!golf || early || play === null) return true;
  return !!play?.over;
}
