// A range start's grown town paves its own jammed streets (T178, issue #443; plan P22 2.7): every growth step its planner reads the bottleneck
// report (sim/bottlenecks.ts: each junction's time lost and level of service) and takes its worst junctions' gravel arms one class up, to
// paved town streets, as the Upgrade tool does. The town pays (the player pays nothing), within a budget of paved tiles that grows with its
// built lots, so a golf player is never made to manage the town's roads to keep it alive. Classic games and old golf starts never pave.
// Pure TS (the City calls it; tests/town-pave.test.ts).
import type { Junction } from '../sim/bottlenecks';
import type { Leg, RoadNetwork, Seg } from '../network';

/** the rule's numbers: a junction is jammed at level of service E or F with at least LOSS vehicle-seconds lost a game hour (the report's
 *  rate); a planning step paves the arms of at most PER_STEP junctions; the town may pave PER_LOT tiles of street per built lot */
export const PAVE = { LOSS: 200, PER_STEP: 3, PER_LOT: 1.5 };

/** a gravel arm of the town's: its ends (tiles) and length (tiles) */
export interface PaveArm extends Leg { len: number }

/** the town's paving budget left, in tiles: PER_LOT a built lot, less the street it has paved already */
export function paveBudget(built: number, paved: number): number { return Math.max(0, PAVE.PER_LOT * built - paved); }

/** this step's arms to pave: the jammed junctions (E or F, loss >= LOSS), the worst first, each with its gravel arms (armsAt), as long as
 *  the budget lasts (a junction whose arms do not fit is skipped, a smaller one may), at most PER_STEP junctions; an arm shared by two
 *  junctions is paved once. Empty when nothing is jammed or the budget is spent */
export function pickPave(junctions: readonly Junction[], armsAt: (x: number, y: number) => PaveArm[], budget: number): PaveArm[] {
  const jammed = junctions.filter(j => (j.los === 'E' || j.los === 'F') && j.loss >= PAVE.LOSS).sort((p, q) => q.loss - p.loss);
  const out: PaveArm[] = [], seen = new Set<string>();
  let left = budget, n = 0;
  for (const j of jammed) {
    if (n >= PAVE.PER_STEP) break;
    const arms = armsAt(j.x, j.y).filter(a => !seen.has(armKey(a)));
    if (!arms.length) continue;
    const len = arms.reduce((s, a) => s + a.len, 0);
    if (len > left) continue;
    for (const a of arms) { seen.add(armKey(a)); out.push(a); }
    left -= len; n++;
  }
  return out;
}

/** an arm's key, the same either way round */
function armKey(a: Leg): string {
  const p = `${a.a.x},${a.a.y}`, q = `${a.b.x},${a.b.y}`;
  return p < q ? `${p}-${q}` : `${q}-${p}`;
}

/** the town's gravel seg with these ends in net (either way round), or null (gone, or no longer the town's gravel) */
export function townSegAt(net: RoadNetwork, l: Leg): Seg | null {
  const n = net.nodeAt(l.a); if (!n) return null;
  for (const sg of n.segs) {
    const o = sg.a === n ? sg.b : sg.a;
    if (Math.abs(o.x - l.b.x) < 1e-6 && Math.abs(o.y - l.b.y) < 1e-6) return sg.town && sg.cls.id === 'gravel' ? sg : null;
  }
  return null;
}
