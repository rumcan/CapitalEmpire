// Golf town growth after each tournament (GOLF-PLAN section 8.4): pure calculation of resident growth rate and target populations from satisfaction, attendance share, tier, and reputation. Pure TS, no DOM.
import { PARTY } from '../event/config';
import type { RoundResult } from '../event/round';
import { daySatisfaction } from './tour';

/** satisfaction threshold (0..100) for high town growth (6% base) */
export const GROWTH_SAT_HIGH = 80;
/** satisfaction threshold (0..100) for moderate town growth (3% base) */
export const GROWTH_SAT_MID = 60;
/** minimum satisfaction threshold (0..100) for any town growth; under 50% grows 0% */
export const GROWTH_SAT_MIN = 50;

/** base town growth share at satisfaction >= 80% (6%) */
export const GROWTH_RATE_HIGH = 0.06;
/** base town growth share at satisfaction 60..79% (3%) */
export const GROWTH_RATE_MID = 0.03;
/** base town growth share at satisfaction 50..59% (1%) */
export const GROWTH_RATE_LOW = 0.01;
/** extra town growth share per tournament tier step above tier 1 (+2% per tier) */
export const GROWTH_PER_TIER = 0.02;

/** attendance share (0..1) at or above which full satisfaction + tier growth applies */
export const MIN_ATTENDANCE_SHARE = 0.35;
/** reputation (0..100) at or above which full satisfaction + tier growth applies */
export const MIN_REPUTATION_FOR_FULL = 20;

/** inputs to the pure golf town growth function */
export interface TownGrowthInput {
  satisfaction: number;
  attendanceShare?: number;
  tier?: number;
  reputation?: number;
}

/**
 * Pure function of the tournament's satisfaction (0..100), attendance share (0..1),
 * tier (1..5), and reputation (0..100):
 * - Under 50% satisfaction (or 0 attendance / 0 reputation): 0 (nothing)
 * - 80%+ satisfaction: 6% base
 * - 60% to <80% satisfaction: 3% base
 * - 50% to <60% satisfaction: 1% base
 * - Plus 2% per tier step above tier 1 ((tier - 1) * 2%)
 * - Scaled down proportionally if attendanceShare < MIN_ATTENDANCE_SHARE or reputation < MIN_REPUTATION_FOR_FULL
 */
export function townGrowthRate(input: TownGrowthInput): number;
export function townGrowthRate(
  satisfaction: number,
  attendanceShare?: number,
  tier?: number,
  reputation?: number,
): number;
export function townGrowthRate(
  satOrInput: number | TownGrowthInput,
  attendanceShare = 1,
  tier = 1,
  reputation = 50,
): number {
  const satisfaction = typeof satOrInput === 'object' ? satOrInput.satisfaction : satOrInput;
  const att = typeof satOrInput === 'object' ? (satOrInput.attendanceShare ?? 1) : attendanceShare;
  const t = typeof satOrInput === 'object' ? (satOrInput.tier ?? 1) : tier;
  const rep = typeof satOrInput === 'object' ? (satOrInput.reputation ?? 50) : reputation;

  if (satisfaction < GROWTH_SAT_MIN || att <= 0 || rep <= 0) return 0;

  const base = satisfaction >= GROWTH_SAT_HIGH
    ? GROWTH_RATE_HIGH
    : satisfaction >= GROWTH_SAT_MID
      ? GROWTH_RATE_MID
      : GROWTH_RATE_LOW;

  const clampedTier = Math.min(5, Math.max(1, Math.floor(t)));
  const tierBonus = (clampedTier - 1) * GROWTH_PER_TIER;

  const normAtt = att > 1 ? Math.min(1, att / 100) : Math.max(0, att);
  const attFactor = normAtt >= MIN_ATTENDANCE_SHARE
    ? 1
    : normAtt / MIN_ATTENDANCE_SHARE;

  const clampedRep = Math.min(100, Math.max(0, rep));
  const repFactor = clampedRep >= MIN_REPUTATION_FOR_FULL
    ? 1
    : clampedRep / MIN_REPUTATION_FOR_FULL;

  return Math.round((base + tierBonus) * attFactor * repFactor * 10000) / 10000;
}

/** whole-number percentage for display (e.g. 0.06 -> 6) */
export function townGrowthPercent(rate: number): number {
  return Math.max(0, Math.round(rate * 100));
}

/** one-line results screen summary ("The town grows 6%"), or empty string when there is no growth */
export function townGrowthLine(rate: number): string {
  const pct = townGrowthPercent(rate);
  return pct > 0 ? `The town grows ${pct}%` : '';
}

/** target residents per town for City.stamp after a tournament (popK * (1 + rate)) */
export function townGrowthTargets(popK: readonly number[], rate: number): number[] {
  if (rate <= 0) return popK.slice();
  return popK.map(p => p * (1 + rate));
}

/** estimate tournament satisfaction (0..100) from RoundResult when City.closeRound runs standalone */
export function roundSatisfactionForGrowth(last: RoundResult): number {
  if (last.sent <= 0 || last.arrived <= 0 || last.rate <= 0) return 0;
  const missed = Math.max(0, last.sent * PARTY - last.arrived);
  const raw = daySatisfaction({
    onTime: last.arrived,
    late: 0,
    missed,
    exitP95Min: 35,
    avgQueueMin: 5,
    viewing: 0.85,
  });
  const scale = last.rate >= 0.5 ? 1 : Math.max(0, last.rate / 0.5);
  return Math.round(raw * scale);
}

/** compute golf town growth rate from a finished RoundResult, tier, and reputation */
export function roundTownGrowthRate(
  last: RoundResult,
  tier: number,
  reputation: number,
  satisfaction = roundSatisfactionForGrowth(last),
): number {
  return townGrowthRate({
    satisfaction,
    attendanceShare: last.rate,
    tier,
    reputation,
  });
}
