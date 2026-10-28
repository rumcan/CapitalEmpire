// The leaderboard of a round (docs/GOLF-PLAY.md decision 8): the rows the board shows at a minute (position, name, to par, holes thru; the owner's row
// when he is below the top), and the champion once everyone is done; T211: a golfer's wait on the group ahead and the marshal's wave-through toast.
// Pure TS, no DOM.
import type { CourseView, Golfer, RoundPlan, Standing, Wait, WaveThrough } from './types';

/** the holes of the played round (courseview.ts PLAYED): a golfer with this many done has finished */
const HOLES = 18;

/** one row of the leaderboard: the position ("1", or "T3" when another shares it), the name ("C. Roberts"), to par ("E", "+3", "−2"), the holes
 *  done ("F" once all 18 are), whether it is the owner's, the golfer's id, and his group's wait (T211, waitText; the engine fills it) */
export interface BoardRow { pos: string; name: string; toPar: string; thru: string; owner: boolean; golfer: number; wait?: string | null }

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

/** a number as an ordinal: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st */
export function ordinal(n: number): string {
  const t = n % 100, u = n % 10, k = t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th';
  return `${n}${k}`;
}

/** T211: the wait a golfer's group is in at a minute (plan.pace: the waits struck and those still open), or null: the hole index and where */
export function waitOf(plan: RoundPlan, golfer: number, minute: number): Wait | null {
  const pace = plan.pace; if (!pace) return null;
  const g = plan.groups.findIndex(gr => gr.players.includes(golfer)); if (g < 0) return null;
  for (const list of [pace.open, pace.waits]) for (const w of list) if (w.group === g && w.from <= minute && minute < w.to) return w;
  return null;
}

/** T211: the board's line for a golfer's wait at a minute: "waiting on the 7th tee" (the group ahead is in the landing area), "waiting for the 7th green"
 *  (it is on the green); null when his group is not waiting. The hole is its number on the course (a 9 played twice repeats them) */
export function waitText(plan: RoundPlan, view: CourseView, golfer: number, minute: number): string | null {
  const w = waitOf(plan, golfer, minute); if (!w) return null;
  const n = view.holes[w.hole]?.n ?? w.hole + 1;
  return w.at === 'tee' ? `waiting on the ${ordinal(n)} tee` : `waiting for the ${ordinal(n)} green`;
}

/** T211: a group as the toasts name it: "your group" (the owner's), else "the C. Roberts group" (its first golfer) */
function groupName(plan: RoundPlan, g: number): string {
  const gr = plan.groups[g], ids = gr?.players ?? [];
  if (ids.some(id => plan.golfers.find(q => q.id === id)?.owner)) return 'your group';
  const first = plan.golfers.find(q => q.id === ids[0]);
  return first ? `the ${shortName(first.name)} group` : 'a group';
}

/** T211: the toast for a wave-through: "Marshal: the D. Hale group is waved through on the 7th; the C. Roberts group stands aside", the owner's group
 *  named "your group" */
export function waveLine(plan: RoundPlan, view: CourseView, w: WaveThrough): string {
  const n = view.holes[w.hole]?.n ?? w.hole + 1, through = groupName(plan, w.through), slow = groupName(plan, w.slow);
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return `Marshal: ${cap(through)} is waved through on the ${ordinal(n)}; ${slow} stands aside`;
}
