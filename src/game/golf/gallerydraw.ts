// The gallery draw and the fans' moves (P02 / T051a, T051b): how many fans each gallery spot draws at a game minute (the featured holes and the
// last green in the afternoon draw more; stands and tents keep a steady share), and which fans move between spots every 30 game minutes. The
// featured holes are the real groups' (docs/GOLF-PLAY.md decision 6, sent by the engine from the golf play: the holes the last three groups are
// on, and the top three of the standings); without them the day's featuredHole (daytimeline.ts) stands in. Pure TS, no DOM, no random: the City
// (sim worker) draws and moves the fans. Times are game minutes of the day; draws and fills are fans.
import type { GallerySpot } from './galleries';
import { featuredHole } from './daytimeline';
import { FIRST_TEE, PLAY_END } from './calendar';

/** the featured group at a tee's or green's hole multiplies its draw by 1 + FEATURED_BUMP (a multiplier, unitless) */
export const FEATURED_BUMP = 2;
/** from LAST_GREEN_FROM (14:30, minutes of the day) until PLAY_END the last hole's green draws more (the start of the afternoon rule, game minutes) */
export const LAST_GREEN_FROM = 870;
/** the last hole's green draws LAST_GREEN_PM times as much in the afternoon (a multiplier, unitless: the 18th fills in the afternoon) */
export const LAST_GREEN_PM = 2;
/** the fans move between spots every RELOCATE_EVERY game minutes (30 min) */
export const RELOCATE_EVERY = 30;
/** each spot over its fair share sends this share (0..1, unitless) of its fans at a move */
export const RELOCATE_SHARE = 0.25;

/** a move of n fans (integer, at least 1) from the spot at index `from` to the spot at index `to` (indices into the spots) */
export interface Move { from: number; to: number; n: number }

/** the draw of a spot at game minute m on a course of `holes` holes (fans): its weight (fans; a negative or non-finite weight counts as 0),
 *  times the featured bump (a tee or green on a featured hole) and the last-green multiplier (the last hole's green, from LAST_GREEN_FROM);
 *  a stand or tent draws its weight at every minute. featured: the holes the golf play has featured (the City's set, when it is not empty);
 *  without it, the featured hole is the day's featuredHole at m */
export function spotDraw(s: GallerySpot, m: number, holes: number, featured?: ReadonlySet<number>): number {
  const base = Number.isFinite(s.weight) && s.weight > 0 ? s.weight : 0;
  if (s.kind === 'stand' || s.kind === 'tent') return base;
  let d = base;
  const on = featured ? featured.has(s.hole) : s.hole > 0 && s.hole === featuredHole(m, holes);
  if (on) d *= 1 + FEATURED_BUMP;
  if (s.kind === 'green' && s.hole === holes && m >= LAST_GREEN_FROM && m < PLAY_END) d *= LAST_GREEN_PM;
  return d;
}

/** each spot's fair share (fans) of `total` fans at game minute m: total times its draw over the sum of all the draws (see spotDraw, featured
 *  as there); all zeros with no draw at all, [] with no spots */
export function fairShares(spots: readonly GallerySpot[], m: number, holes: number, total: number, featured?: ReadonlySet<number>): number[] {
  const draws = spots.map(s => spotDraw(s, m, holes, featured));
  const sum = draws.reduce((a, b) => a + b, 0);
  if (sum <= 0) return draws.map(() => 0);
  return draws.map(d => total * d / sum);
}

/** the fans' moves at game minute m (fans), given fill (the fans at each spot, same length as spots; the draw's featured holes as in spotDraw):
 *  none unless m is a whole multiple of RELOCATE_EVERY in [FIRST_TEE, PLAY_END); in index order each spot over its fair share sends
 *  floor(fill * RELOCATE_SHARE) fans (none when that is 0) to the other spot with the most room (min(cap, fair share) less the fans it holds now;
 *  the lowest index on a tie; no move when the best room is 0 or less). The moves keep the total and never leave a fill negative */
export function relocate(spots: readonly GallerySpot[], fill: readonly number[], m: number, holes: number, featured?: ReadonlySet<number>): Move[] {
  if (m % RELOCATE_EVERY !== 0 || m < FIRST_TEE || m >= PLAY_END) return [];
  const n = spots.length;
  let total = 0;
  for (let k = 0; k < n; k++) total += fill[k] ?? 0;
  const want = fairShares(spots, m, holes, total, featured);
  const cur: number[] = spots.map((_, k) => fill[k] ?? 0);
  const out: Move[] = [];
  for (let k = 0; k < n; k++) {
    const f = fill[k] ?? 0;
    if (f <= want[k]) continue;
    const share = Math.floor(f * RELOCATE_SHARE);
    if (share <= 0) continue;
    let to = -1, best = 0;
    for (let j = 0; j < n; j++) {
      if (j === k) continue;
      const room = Math.min(spots[j].cap, want[j]) - cur[j];
      if (to < 0 || room > best) { to = j; best = room; }
    }
    if (to < 0 || best <= 0) continue;
    cur[k] -= share;
    cur[to] += share;
    out.push({ from: k, to, n: share });
  }
  return out;
}
