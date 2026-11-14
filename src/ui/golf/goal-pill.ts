// #1297 (the owner, 2026-11-14: "goals cover menu ui. cant be closed either"): the Goal pill (ReportCard.tsx GoalChip: "Goal 0/9 holes $681,202/$250,000 21 mo left") lay over the
// top of the left panel, because it was a layer of its own at a fixed place under the top bar. It is part of the top bar now: a small chip in the bar (always there: the goal's
// holes and the months left), and the full pill in a row of the bar under it while the player has it open. A row of the bar pushes the rail and the panels down with it (--hud-top
// follows the bar's bottom), so nothing is covered. The chip folds it and unfolds it with a click, and the choice is remembered in this browser (localStorage, every access in
// try/catch, as the speed bar's: a private window falls back to folded). The jam build has no goal at all (FinLitHud). Pure TS, no DOM.
import type { GoalState } from '../../game/golf/reports';

/** the localStorage key: 'open' (the full pill under the bar), 'closed' (the chip alone); none: closed */
export const GOAL_PILL_KEY = 'capitalempire.goalPill';

/** the remembered state: true when the pill was left open (folded when there is none, or the storage cannot be read) */
export function loadGoalOpen(store?: Pick<Storage, 'getItem'> | null): boolean {
  try { const s = store === undefined ? globalThis.localStorage : store; return s?.getItem(GOAL_PILL_KEY) === 'open'; } catch { return false; }
}
/** remembers the state (nothing when the storage throws); returns the state given */
export function saveGoalOpen(open: boolean, store?: Pick<Storage, 'setItem'> | null): boolean {
  try { (store === undefined ? globalThis.localStorage : store)?.setItem(GOAL_PILL_KEY, open ? 'open' : 'closed'); } catch { /* storage may be unavailable */ }
  return open;
}

/** what the folded chip says: the holes built of the goal's, and the months left (the full words go in its tooltip and its name for a screen reader) */
export interface GoalChipView { short: string; months: string; label: string; tip: string }
/** the chip's words from the goal's state (reports.ts goalState): "0/9" and "21 mo"; the tooltip says the whole goal and what a click does */
export function goalChipView(g: Pick<GoalState, 'holes' | 'holesNeed' | 'monthsLeft' | 'overdraft'>, open: boolean): GoalChipView {
  const months = g.monthsLeft > 0 ? `${g.monthsLeft} mo` : 'time is up', words = g.monthsLeft > 0 ? `${g.monthsLeft} months left` : 'time is up';
  return {
    short: `${g.holes}/${g.holesNeed}`, months,
    label: `Goal: ${g.holes} of ${g.holesNeed} holes, ${words}${g.overdraft ? ', overdrawn' : ''}. ${open ? 'Fold the goal' : 'Show the goal'}`,
    tip: `The goal: by the end of season 2, nine holes and $250,000 net worth, out of overdraft (${g.holes} of ${g.holesNeed} holes, ${words}). Click to ${open ? 'fold it' : 'show it under the bar'}.`,
  };
}
