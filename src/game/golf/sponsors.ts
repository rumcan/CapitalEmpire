// The golf tour's sponsorship, TV broadcast rights, and purse commercial calculations (docs/GOLF-PLAN.md sections 2.1, 5.1, and 7). Pure TS, no DOM.
import { tierInfo, type Need } from './tour';

/** whether the course provides the TV broadcast structures required for TV rights money (tier 4+) */
export function hasTvRequirements(haveNeeds: ReadonlySet<Need> | readonly Need[]): boolean {
  const has = (n: Need) => (Array.isArray(haveNeeds) ? (haveNeeds as readonly Need[]).includes(n) : (haveNeeds as ReadonlySet<Need>).has(n));
  return has('tvTowers') && has('broadcast');
}

/** sponsor money ($) for a tournament: 0 at tier 1; for tier 2+, scales linearly by reputation / 100 (full at 100) */
import { applySponsorDealIncome } from './golfcards';
export function computeSponsorIncome(tier: number, reputation: number, cards: readonly string[] = []): number {
  if (tier < 2) return 0;
  const tInfo = tierInfo(tier);
  const repFactor = Math.max(0, Math.min(100, reputation)) / 100;
  return applySponsorDealIncome(Math.round(tInfo.sponsor * repFactor), cards);
}

/** TV broadcast rights money ($): tier 4 and above, requiring tvTowers and broadcast structures from structuresNeeds */
export function computeTvIncome(tier: number, haveNeeds: ReadonlySet<Need> | readonly Need[]): number {
  if (tier < 4) return 0;
  if (!hasTvRequirements(haveNeeds)) return 0;
  const tInfo = tierInfo(tier);
  return tInfo.tv;
}

/** tournament purse cost ($) from tier row */
export function computePurseCost(tier: number): number {
  return tierInfo(tier).purse;
}

/** complete commercial breakdown for a tournament season */
export interface SponsorBreakdown {
  tier: number;
  reputation: number;
  sponsorIncome: number;
  tvIncome: number;
  hasTvRights: boolean;
  purse: number;
  netCommercial: number;
}

/** compute full sponsor, TV rights, and purse breakdown for a tournament */
export function computeSponsorBreakdown(tier: number, reputation: number, haveNeeds: ReadonlySet<Need> | readonly Need[], cards: readonly string[] = []): SponsorBreakdown {
  const sponsorIncome = computeSponsorIncome(tier, reputation, cards);
  const tvIncome = computeTvIncome(tier, haveNeeds);
  const purse = computePurseCost(tier);
  const hasTvRights = tier >= 4 && hasTvRequirements(haveNeeds);
  return {
    tier,
    reputation,
    sponsorIncome,
    tvIncome,
    hasTvRights,
    purse,
    netCommercial: sponsorIncome + tvIncome - purse,
  };
}
