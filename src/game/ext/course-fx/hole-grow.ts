// Each hole's grow-in, for the Holes panel's badges and status line (plan P23 4.3 and 4.6: "◔ growing · ready Mar 1985").
// Pure TypeScript, no DOM, deterministic. Units: months on the course grid's scale (a seeded cell holds game month + MONTH_BASE).
import { SURF, type Grid } from '../course-grid';
import { MONTH_BASE } from '../course-grid/areas';
import { MONTH_LEN, seasonLabel } from '../../golf/calendar';
import { SURF_GROW_MONTHS } from './index';

/** each hole's ready month on the grid's scale: the month value at which its last seeded cell is fully grown (its planting month + its
 *  surface's grow-in), by hole number; holes with no seeded cell still growing at some point (sod, established ground) are left out */
export function holeReadyMonths(g: Grid): Map<number, number> {
  const out = new Map<number, number>(), n = g.w * g.h;
  for (let i = 0; i < n; i++) {
    const m = g.month[i]!, h = g.hole[i]!;
    if (!m || !h) continue;
    const s = g.surf[i]!, grow = s === SURF.none ? 0 : SURF_GROW_MONTHS[s] ?? 0;
    if (grow <= 0) continue;
    const r = m + grow;
    if (r > (out.get(h) ?? 0)) out.set(h, r);
  }
  return out;
}

/** a hole's grow-in now: growing (with the game month index it is ready in) or grown */
export interface HoleGrowth { growing: boolean; readyMonth: number }

/** a hole's grow-in from its ready month on the grid's scale (holeReadyMonths; undefined: nothing seeded), the effective game month (grow
 *  cards included: Engine.growMonth) and the real one (Engine.golfMonthIndex): the ready month is shifted back by the cards' head start */
export function holeGrowth(ready: number | undefined, effNow: number, now: number): HoleGrowth {
  if (ready === undefined) return { growing: false, readyMonth: now };
  const readyEff = ready - MONTH_BASE;
  return { growing: readyEff > effNow, readyMonth: readyEff - (effNow - now) };
}

/** a game month index (seasons x 12 + months since September) as the top bar names it: "Mar 1985" */
export function monthIndexLabel(k: number): string {
  const s = Math.floor(k / 12), m = k - s * 12;
  return seasonLabel(m * MONTH_LEN, s);
}
