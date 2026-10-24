// The tournament crowd from outside the map (P03/T054): the highway share by tier, the split between the town and the highway entries,
// how many entries a tier opens, how many parties one simulated car stands for, the police cost, and the source labels. Pure TS, no DOM.
import type { Pt } from '../network';

/** the share of the tournament crowd that comes by the highway, by tier 1..5 (tier 1 is the town's own club championship) */
export const HIGHWAY_CROWD_SHARE: readonly number[] = [0, 0.55, 0.70, 0.80, 0.85];
/** the highway entries open at each tier 1..5 (a 2nd at tier 3, a 3rd at tier 4) */
export const ENTRY_COUNT: readonly number[] = [1, 1, 2, 3, 3];
/** how many fan parties one simulated surge car stands for, by tier 1..5 (keeps the tier-5 morning near 2,500–3,000 sim cars) */
export const CAR_SCALE: readonly number[] = [1, 1, 2, 4, 6];
/** a police officer's cost for a tournament day at tier 1 ($); it scales with the tier */
export const POLICE_DAY_COST_T1 = 500;

/** the tier clamped to 1..5, as an index 0..4 */
function ti(tier: number): number {
  if (typeof tier !== 'number' || Number.isNaN(tier)) return 0;
  const rounded = Math.round(tier);
  const clamped = Math.max(1, Math.min(5, rounded));
  return clamped - 1;
}

/** the highway share of the crowd at a tier */
export function highwayCrowdShare(tier: number): number {
  return HIGHWAY_CROWD_SHARE[ti(tier)]!;
}

/** the number of highway entries open at a tier */
export function entryCountForTier(tier: number): number {
  return ENTRY_COUNT[ti(tier)]!;
}

/** how many parties one simulated car stands for at a tier */
export function carScale(tier: number): number {
  return CAR_SCALE[ti(tier)]!;
}

/** one police officer's cost for a tournament day at a tier ($): POLICE_DAY_COST_T1 × tier */
export function policeDayCost(tier: number): number {
  return POLICE_DAY_COST_T1 * (ti(tier) + 1);
}

/** splits the tournament's cars into [town, entry 1, …, entry n]: round(total × share) go by the highway, shared as evenly as possible over the entries (the first entries take the remainder), the rest stay in the town; the parts always sum to total */
export function splitTournamentCrowd(
  totalCars: number,
  tier: number,
  entryCount = entryCountForTier(tier)
): number[] {
  const total = typeof totalCars === 'number' && Number.isFinite(totalCars) && totalCars > 0
    ? Math.round(totalCars)
    : 0;

  if (entryCount < 1) {
    return [total];
  }

  const share = highwayCrowdShare(tier);
  const hw = Math.round(total * share);
  const town = total - hw;

  const base = Math.floor(hw / entryCount);
  const rem = hw % entryCount;

  const out = new Array<number>(1 + entryCount);
  out[0] = town;
  for (let i = 0; i < entryCount; i++) {
    out[i + 1] = base + (i < rem ? 1 : 0);
  }

  return out;
}

/** the label of crowd source k: 'Town' for 0; in golf mode 'Highway' when there is one entry, else 'Highway 1', 'Highway 2', …; outside golf mode 'Town A', 'Town B', … (the stadium game's towns) */
export function entrySourceLabel(k: number, golf: boolean, entries = 1): string {
  const idx = Math.max(0, Math.floor(k));
  if (golf) {
    if (idx === 0) return 'Town';
    if (entries <= 1) return 'Highway';
    return `Highway ${idx}`;
  }
  return `Town ${String.fromCharCode(65 + idx)}`;
}

/** of a border road's directed pieces (each from one end to the other), the indices of those that drive INTO the map from the entry point: their from end is nearer the entry than their to end */
export function inboundIndices(entry: Pt, pieces: readonly { from: Pt; to: Pt }[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const dFrom = Math.hypot(p.from.x - entry.x, p.from.y - entry.y);
    const dTo = Math.hypot(p.to.x - entry.x, p.to.y - entry.y);
    if (dFrom < dTo) {
      out.push(i);
    }
  }
  return out;
}
