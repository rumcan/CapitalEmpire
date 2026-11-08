// T336 (#962; the owner, 2026-11-04: "you get cards when you win tournaments"): how a card pull is earned. A tournament win (the Club Championship and the Mayor's Cup, T246; the tour's tournament when you
// play in it) and a money-match win (T244) pay a pull; good finishes pay smaller ones. The grade of a pull (collection.ts) is what it is worth at the vending machine (vending.ts): gold has no commons and no duds.
// This is the table (EARN_TABLE: the words the cards show), and the pure functions the engine asks when a result is in. Pure TS, no DOM.
import { ordinal } from '../play/board';
import type { Grade } from './collection';

/** the grade of a pull and why it was paid (the toast and the result cards say it) */
export interface Earn { grade: Grade; why: string }
/** a money match won for at least this stake ($) pays a silver pull; a smaller one pays bronze */
export const MATCH_BIG_STAKE = 250;
/** the top share of a field that earns a bronze pull when it is not on the podium */
export const TOP_SHARE = 0.25;
/** the table, as the cards print it */
export const EARN_TABLE: readonly { what: string; grade: Grade }[] = [
  { what: 'Win a title: the Club Championship, the Mayor’s Cup', grade: 'gold' },
  { what: 'Win the tour’s tournament (you played it)', grade: 'gold' },
  { what: 'Finish 2nd or 3rd in an event or the tournament', grade: 'silver' },
  { what: 'Finish in the top quarter of the field', grade: 'bronze' },
  { what: `Win a money match for $${MATCH_BIG_STAKE} or more`, grade: 'silver' },
  { what: 'Win a money match', grade: 'bronze' },
];

/** the pull a finishing place earns in a field (`of` golfers, `what` the competition: "the Club Championship"): first (shared too) is gold, the podium of the top half silver, the top quarter bronze; null for nothing (not
 *  played or not finished: pos null) */
export function earnFromPlace(pos: number | null, of: number, what: string): Earn | null {
  if (pos === null || !Number.isFinite(pos) || pos < 1 || !(of >= 1)) return null;
  if (pos === 1) return { grade: 'gold', why: `Won ${what}` };
  if (pos <= 3 && pos <= of / 2) return { grade: 'silver', why: `Finished ${ordinal(pos)} in ${what}` };
  if (pos <= Math.ceil(of * TOP_SHARE)) return { grade: 'bronze', why: `Finished ${ordinal(pos)} of ${of} in ${what}` };
  return null;
}
/** the pull a money match pays: a win only (a loss or a halved match pays nothing); a bigger stake pays a better pull */
export function earnFromMatch(result: 'w' | 'l' | 'h', stake: number): Earn | null {
  if (result !== 'w') return null;
  return { grade: stake >= MATCH_BIG_STAKE ? 'silver' : 'bronze', why: `Won a $${Math.round(stake).toLocaleString('en-US')} money match` };
}
