// The Season card's words and checklist (T188, plan P23-UX P2-2): where the year is, the founding checklist (the tour's invitation: nine holes, a
// car park, a clubhouse; each with its mark and the Fix that arms its tool and the anchor the guide pulses), and after founding the season's
// tournament plan. Pure: the facts in, the words and items out (SeasonCard.tsx draws them; the engine's armFix runs a Fix).
import type { InviteCheck } from '../../game/golf/tour';

/** a checklist item's Fix: the tool it arms and the control it pulses (a data-guide anchor) */
export type FixId = 'holes' | 'carpark' | 'clubhouse';
/** what each Fix arms: Course › Holes with New hole, Traffic › Car park, Course › Buildings with the clubhouse armed; and the anchor it pulses */
export const FIX: Readonly<Record<FixId, { tool: 'course' | 'park' | 'buildings'; anchor: string; label: string }>> = {
  holes: { tool: 'course', anchor: 'new-hole', label: 'New hole' },
  carpark: { tool: 'park', anchor: 'tool-park', label: 'Car park' },
  clubhouse: { tool: 'buildings', anchor: 'clubhouse-card', label: 'Clubhouse' },
};
/** one checklist item: its id, words, whether it is met, and the progress line (holes: 3 of 9) */
export interface CheckItem { id: FixId; label: string; ok: boolean; detail: string }
/** the founding checklist from the tour's check: nine holes with a par, a car park, a clubhouse */
export function foundingChecklist(c: InviteCheck): CheckItem[] {
  const n = Math.min(c.holes, c.holesNeeded);
  return [
    { id: 'holes', label: `${c.holesNeeded} holes`, ok: c.holes >= c.holesNeeded, detail: `${n} of ${c.holesNeeded} built` },
    { id: 'carpark', label: 'A car park', ok: c.carpark, detail: c.carpark ? 'Built' : 'None yet' },
    { id: 'clubhouse', label: 'A clubhouse', ok: c.clubhouse, detail: c.clubhouse ? 'Built' : 'None yet' },
  ];
}
/** what the season holds: founding (no invitation yet), invited (the tournament closes this or next season), or a tournament season (the old start
 *  and every season after the first tournament) */
export type SeasonPhase = 'founding' | 'invited' | 'tour';
/** the season's phase from the founding view (null: not a range start, or no founding view) and the tournaments run */
export function seasonPhase(f: { invited: boolean } | null, runs: number): SeasonPhase {
  if (!f || runs > 0) return 'tour';
  return f.invited ? 'invited' : 'founding';
}
/** the season's sentence (the founding one reads right: no tournament until the tour invites you) */
export function seasonSentence(phase: SeasonPhase, o: { due?: boolean; check?: InviteCheck; month?: string; monthsLeft?: number; live?: boolean }): string {
  if (o.live) return 'Tournament day: the spectators are driving to the course.';
  if (phase === 'founding') {
    const c = o.check, left = c ? foundingChecklist(c).filter(i => !i.ok).map(i => i.label.toLowerCase()) : [];
    return `A founding season: no tournament this year. The tour invites you to the Club Championship once you have ${c ? `${c.holesNeeded} holes, a car park and a clubhouse` : 'nine holes, a car park and a clubhouse'}${left.length ? ` (still to do: ${left.join(', ')})` : ''}.`;
  }
  if (phase === 'invited') return `Invited: the Club Championship closes ${o.due ? 'this' : 'next'} season. Get the course and the roads ready for the crowd.`;
  const m = o.monthsLeft !== undefined ? Math.ceil(o.monthsLeft) : null;
  return `The tournament closes the season${m !== null ? `, in ${m} ${m === 1 ? 'month' : 'months'}` : ''}: get the course and the roads ready for the crowd.`;
}
/** the season chip's words: founding "◔ 3/9 holes", invited "Invited", else "Season" */
export function seasonChip(phase: SeasonPhase, c?: InviteCheck): string {
  if (phase === 'founding' && c) return `◔ ${Math.min(c.holes, c.holesNeeded)}/${c.holesNeeded} holes`;
  return phase === 'invited' ? '✓ Invited' : 'Season';
}
