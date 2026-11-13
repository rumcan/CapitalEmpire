// J4 (#1207, docs/JAM.md): every money decision readable. The payback of an investment (its cost, its upkeep a month, the extra income a month the
// game's own demand models expect from it, and the months until that pays the cost back), and the price ladder (golfers and takings at the price
// now and a step either side). Golf mode's time: one game day is a season of 12 months (golf/calendar.ts, MONTH_LEN sim s each), so a season's
// figure is a month's times 12; the range runs on the town's clock (a town day of dayLen sim s, 600 by default), so its day is scaled by
// MONTH_LEN / dayLen. Every figure here is an estimate: the live range, the weather and the town move the real takings.
// Pure TS, no DOM.
import { MONTH_LEN } from './calendar';
import { RANGE_UPGRADES, needsOf, COFFEE, LESSON, PRACTICE_FEE, practiceUsers, rangeScale, saleValue, skippedVisits, withPrice, type DemandCtx, type RangeBizSave, type RangeUpgradeId, PRACTICE_APPEAL, type PracticeId, MONTHS_A_SEASON } from './rangesave';
import { GREEN_FEE_PER_ROUND, OFF_SEASON_PLAY_DAYS, dailyGolfers } from './yearend';
import { HALFWAY_SPEND, HALFWAY_STOP } from './halfway';
import { PRICE_STEP, clampPrice, monthStep, newClub, type ClubInputs, type ClubSave } from './club';

/** a finite number, else 0 */
const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
/** the longest payback the cards call paying back (months: ten seasons); longer reads as "does not pay back" */
export const PAYBACK_MAX_MONTHS = 120;
/** an extra income a month below this ($) counts as none: the item earns nothing the demand models can see */
export const NO_INCOME = 0.5;

/** a season's amount as a month's (golf mode: 12 months a season) */
export const perMonthFromSeason = (season: number): number => fin(season) / MONTHS_A_SEASON;
/** an amount booked over `simS` sim seconds as a month's (MONTH_LEN sim s); 0 for no span */
export const perMonthFromSim = (amount: number, simS: number): number => (fin(simS) > 0 ? fin(amount) * MONTH_LEN / simS : 0);

/** how an investment pays: free (it costs nothing), pays (back in `months`), slow (only after PAYBACK_MAX_MONTHS), never (the upkeep eats the
 *  extra income), none (no extra income the models can see: it saves work, or helps your golf) */
export type PaybackVerdict = 'free' | 'pays' | 'slow' | 'never' | 'none';
export interface Payback {
  /** the price ($), the upkeep a month ($), the extra income a month ($, an estimate), the net a month (extra less upkeep) */
  cost: number; upkeep: number; extra: number; net: number;
  /** the months until the net a month has paid the cost (rounded up; null unless verdict is 'pays' or 'free') */
  months: number | null;
  verdict: PaybackVerdict;
}
/** the payback of something costing `cost`, with `upkeep` a month and `extra` income a month (non-finite or negative inputs count as 0) */
export function payback(cost: number, upkeep: number, extra: number): Payback {
  const c = Math.max(0, fin(cost)), u = Math.max(0, fin(upkeep)), x = Math.max(0, fin(extra)), net = x - u;
  if (x < NO_INCOME) return { cost: c, upkeep: u, extra: x, net, months: c <= 0 && u <= 0 ? 0 : null, verdict: c <= 0 && u <= 0 ? 'free' : 'none' };
  if (net <= 0) return { cost: c, upkeep: u, extra: x, net, months: null, verdict: 'never' };
  if (c <= 0) return { cost: c, upkeep: u, extra: x, net, months: 0, verdict: 'free' };
  const m = Math.max(1, Math.ceil(c / net));
  return m > PAYBACK_MAX_MONTHS ? { cost: c, upkeep: u, extra: x, net, months: null, verdict: 'slow' } : { cost: c, upkeep: u, extra: x, net, months: m, verdict: 'pays' };
}
/** the payback in words: "Pays back in about 7 months", "Does not pay back: the upkeep is more than the extra income", ... */
export function paybackWords(p: Payback): string {
  switch (p.verdict) {
    case 'free': return 'Costs nothing up front';
    case 'pays': return p.months === 1 ? 'Pays back in about a month' : `Pays back in about ${p.months} months`;
    case 'slow': return `Takes over ${PAYBACK_MAX_MONTHS / MONTHS_A_SEASON} seasons to pay back`;
    case 'never': return 'Does not pay back: its upkeep is more than the extra income';
    case 'none': return 'Earns nothing extra by itself (yet)';
  }
}

// ---- the range ----

/** what the range expects to take in a month (an estimate, $): the golfers its demand sends over a town day that the bays can serve
 *  (golf/rangesave.ts skippedVisits over the whole town day of dayLen sim s), each paying the bucket and the shop's extra spend, plus the coffees,
 *  the lessons and the practice greens' fees, scaled from the town day to a month (MONTH_LEN sim s: a town day is not a season, the range's
 *  clock runs on the town's); and the golfers a month (customers: each golfer you see stands for rangeScale of them) */
export function rangeMonth(s: RangeBizSave, c: DemandCtx, dayLen: number): { golfers: number; takings: number } {
  const L = Math.max(24, fin(dayLen)), k = rangeScale(L);
  const v = skippedVisits(s, c, 0, L, L, null), served = fin(v.served);
  const pr = practiceUsers(s, served);
  const day = served * saleValue(s, L) + (fin(v.coffees) * COFFEE + fin(v.lessons) * LESSON + (pr.putting + pr.chipping) * PRACTICE_FEE) * k;
  return { golfers: perMonthFromSim(served * k, L), takings: perMonthFromSim(fin(day), L) };
}
/** the upgrades `id` needs first, all the way down (its prerequisites and theirs), not yet owned */
export function missingNeeds(owned: readonly RangeUpgradeId[], id: RangeUpgradeId): RangeUpgradeId[] {
  const out: RangeUpgradeId[] = [], seen = new Set<RangeUpgradeId>(owned);
  const walk = (x: RangeUpgradeId) => { const u = RANGE_UPGRADES.find(q => q.id === x); for (const n of u ? needsOf(u) : []) if (!seen.has(n)) { seen.add(n); walk(n); out.push(n); } };
  walk(id);
  return out;
}
/** the extra income a month (estimate, $) the range's upgrade `id` brings: the month with it less the month without, both on top of the
 *  upgrades it needs first (12 bays is worth what it adds to 8, not to the 4 you start with) */
export function rangeUpgradeExtra(s: RangeBizSave, c: DemandCtx, dayLen: number, id: RangeUpgradeId): number {
  if (s.owned.includes(id)) return 0;
  const base = { ...s, owned: [...s.owned, ...missingNeeds(s.owned, id)] };
  return Math.max(0, rangeMonth({ ...base, owned: [...base.owned, id] }, c, dayLen).takings - rangeMonth(base, c, dayLen).takings);
}
/** the extra income a month (estimate, $) an open practice facility brings: its appeal on the range's demand and its fees */
export function practiceExtra(s: RangeBizSave, c: DemandCtx, dayLen: number, id: PracticeId): number {
  if (s.practice?.[id]?.open) return 0;
  const open = { ...s, practice: { ...s.practice, [id]: { ...s.practice[id], open: true } } };
  const appeal = ((1 + fin(c.practiceAppeal ?? 0)) * (1 + PRACTICE_APPEAL[id])) - 1;
  return Math.max(0, rangeMonth(open, { ...c, practiceAppeal: appeal }, dayLen).takings - rangeMonth(s, c, dayLen).takings);
}

/** one rung of a price ladder: the price, the golfers (or members) a month and the takings a month at it */
export interface PriceRung { price: number; golfers: number; takings: number; now: boolean }
/** the bucket price ladder: the price now and a dollar either side (within the band), golfers and takings a month at each (estimates) */
export function rangePriceLadder(s: RangeBizSave, c: DemandCtx, dayLen: number): PriceRung[] {
  const out: PriceRung[] = [];
  for (const d of [-1, 0, 1]) {
    const t = withPrice(s, s.price + d);
    if (d !== 0 && t.price === s.price) continue;
    const r = rangeMonth(t, c, dayLen);
    out.push({ price: t.price, golfers: r.golfers, takings: r.takings, now: d === 0 });
  }
  return out;
}

// ---- the course: green fees, the clubhouse, the halfway house, a new hole ----

/** what the course is (the club's inputs: quality and reputation 0..100, the playable holes) */
export interface CourseNow { quality: number; rep: number; holes: number }
/** the course's green fees a month (estimate, $): the off-season's visitors (yearend.ts dailyGolfers x OFF_SEASON_PLAY_DAYS a season) at the
 *  green fee, over 12 months */
export function greenFeesMonth(c: CourseNow): number {
  return perMonthFromSeason(dailyGolfers(fin(c.quality), fin(c.rep), Math.max(0, Math.floor(fin(c.holes)))) * GREEN_FEE_PER_ROUND * OFF_SEASON_PLAY_DAYS);
}
/** the visiting golfers a month (estimate) */
export function visitorsMonth(c: CourseNow): number {
  return perMonthFromSeason(dailyGolfers(fin(c.quality), fin(c.rep), Math.max(0, Math.floor(fin(c.holes)))) * OFF_SEASON_PLAY_DAYS);
}
/** the extra green fees a month (estimate, $) one more playable hole brings (no clubhouse: none are taken yet) */
export function holeExtra(c: CourseNow, clubhouse: boolean): number {
  return clubhouse ? Math.max(0, greenFeesMonth({ ...c, holes: fin(c.holes) + 1 }) - greenFeesMonth(c)) : 0;
}
/** the halfway house's takings a month (estimate, $): the visitors who stop for a drink and a sandwich */
export function halfwayMonth(c: CourseNow): number { return visitorsMonth(c) * HALFWAY_STOP * HALFWAY_SPEND; }

/** the membership dues ladder: the dues now and a step of the stepper either side (within its band), the members and the dues expected next month
 *  at each (club.ts monthStep: who joins and who leaves at that price; estimates) */
export function memberPriceLadder(members: number, price: number, i: ClubInputs): PriceRung[] {
  const out: PriceRung[] = [], now = clampPrice(price), s: ClubSave = { ...newClub(0), founded: true, members: Math.max(0, fin(members)), price: now };
  for (const d of [-PRICE_STEP, 0, PRICE_STEP]) {
    const p = clampPrice(now + d);
    if (d !== 0 && p === now) continue;
    const r = monthStep({ ...s, price: p }, i);
    out.push({ price: p, golfers: fin(r.s.members), takings: fin(r.booked.dues - r.booked.upkeep), now: d === 0 });
  }
  return out;
}
