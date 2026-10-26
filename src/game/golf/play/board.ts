// The leaderboard of a round (docs/GOLF-PLAY.md decision 8): the rows the board shows at a minute (position, name, to par, holes thru; the owner's row
// when he is below the top), and the champion once everyone is done. Pure TS, no DOM.
import type { CourseView, Golfer, RoundPlan, Standing } from './types';

/** the holes of the played round (courseview.ts PLAYED): a golfer with this many done has finished */
const HOLES = 18;

/** one row of the leaderboard: the position ("1", or "T3" when another shares it), the name ("C. Roberts"), to par ("E", "+3", "−2"), the holes
 *  done ("F" once all 18 are), whether it is the owner's, and the golfer's id */
export interface BoardRow { pos: string; name: string; toPar: string; thru: string; owner: boolean; golfer: number }

/** to par as the board writes it: E for even, +3, and −2 (a real minus sign) */
export function toParText(n: number): string { return n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`; }

/** a name as the board writes it: the first initial and the surname ("Carol Roberts" → "C. Roberts"); a name with one word stays */
export function shortName(name: string): string { const p = name.split(' '); return p.length > 1 ? `${p[0]![0]}. ${p[p.length - 1]}` : name; }

/** the leaderboard's rows: the first `limit` standings, and the owner's row after them when he stands below them (none when he has not teed off).
 *  A position is shared ("T3") when another standing has the same position */
export function boardRows(standings: Standing[], golfers: Golfer[], limit: number, ownerId: number | null): BoardRow[] {
  const rows: BoardRow[] = [];
  const row = (s: Standing): BoardRow => {
    const g = golfers.find(q => q.id === s.golfer), tied = standings.some(o => o !== s && o.pos === s.pos);
    return { pos: tied ? `T${s.pos}` : `${s.pos}`, name: g ? shortName(g.name) : '', toPar: toParText(s.toPar), thru: s.thru >= HOLES ? 'F' : `${s.thru}`, owner: s.golfer === ownerId, golfer: s.golfer };
  };
  for (let i = 0; i < Math.min(limit, standings.length); i++) rows.push(row(standings[i]!));
  const o = standings.findIndex(s => s.golfer === ownerId);
  if (o >= limit) rows.push(row(standings[o]!));
  return rows;
}

/** the champion: the lowest total against the course's par, with every golfer tied at it. Null with no holes to play, or (with a minute) before
 *  every golfer is done by that minute; without one, the final result */
export function champion(plan: RoundPlan, view: CourseView, minute = Infinity): { golfers: number[]; toPar: number; strokes: number } | null {
  if (!view.holes.length || !plan.golfers.length || !plan.golfers.every(g => plan.done[g.id]! <= minute && Number.isFinite(plan.done[g.id]!))) return null;
  const par = view.holes.reduce((a, h) => a + h.par, 0);
  let best = Infinity, strokes = 0, ids: number[] = [];
  for (const g of plan.golfers) {
    const k = plan.strokes[g.id]!.reduce((a, b) => a + b, 0), tp = k - par;
    if (tp < best) { best = tp; strokes = k; ids = [g.id]; } else if (tp === best) ids.push(g.id);
  }
  return { golfers: ids, toPar: best, strokes };
}

/** the champion's line for the board and the toasts: "Carol Roberts wins at −2", ties "Carol Roberts and Ann Lee share the title at −2" (the names
 *  in full). Null when there is no champion yet (see champion) */
export function championLine(plan: RoundPlan, view: CourseView, minute = Infinity): string | null {
  const c = champion(plan, view, minute);
  if (!c) return null;
  const names = c.golfers.map(id => plan.golfers.find(g => g.id === id)?.name ?? '');
  const at = toParText(c.toPar);
  return names.length === 1 ? `${names[0]} wins at ${at}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} share the title at ${at}`;
}
