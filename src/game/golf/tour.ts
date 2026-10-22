// The golf tour's tiers and rules (docs/GOLF-PLAN.md sections 5.1, 5.4 and 8.1–8.2): the five tiers and what each must have, the reputation
// that moves toward each year's score, the day's satisfaction, the tier offer and demotion, the peak crowd and the day shares of a tournament.
// Pure TS, no DOM.

/** a thing a tournament must have on its course or venue (GOLF-PLAN 5.1); each tier needs its own and the lower tiers' */
export type Need = 'carpark' | 'gate' | 'foodTent' | 'toilets' | 'grandstand18' | 'leaderboard' | 'merchTent' | 'parkRide' | 'range' | 'tvTowers' | 'broadcast' | 'hospitality' | 'media' | 'parkRide2' | 'hotelRooms' | 'grandstands' | 'merchPavilion' | 'hospitalityVillage' | 'interchange' | 'coachTerminal';

/** a tournament tier (GOLF-PLAN 5.1 and 8.2): its name, days, crowd, course, needs, money and the reputation to be offered it */
export interface Tier {
  tier: number; name: string; practiceDays: number; days: number;
  /** the spectators a day at the peak: [min, max] (see spectatorDemand) */
  spectators: [number, number];
  /** the fewest holes the course may have (tier 2 accepts the old 9) */
  holes: number;
  /** the shortest course, m */
  minLengthM: number;
  /** the needs of this tier and every lower tier (cumulative) */
  needs: Need[];
  /** the ticket price, $ (0 is free) */
  ticket: number;
  /** the tournament purse, $ */
  purse: number;
  /** the sponsorship a year, $ */
  sponsor: number;
  /** the TV money a year, $ */
  tv: number;
  /** the reputation needed to be offered the tier (see verdict) */
  reputation: number;
}

/** the needs each tier adds (GOLF-PLAN 5.1); TIERS takes them cumulatively (hotelRooms at tier 4 and interchange at tier 5 are not yet required until town hotel growth and highway interchanges are wired) */
const OWN_NEEDS: Need[][] = [
  ['carpark'],
  ['gate', 'foodTent', 'toilets'],
  ['grandstand18', 'leaderboard', 'merchTent', 'parkRide', 'range'],
  ['tvTowers', 'broadcast', 'hospitality', 'media', 'parkRide2'], // hotelRooms not yet required (no town hotel provider wired yet)
  ['grandstands', 'merchPavilion', 'hospitalityVillage', 'coachTerminal'], // interchange not yet required (6R.5 highway interchanges not wired yet)
];

/** the five tiers (GOLF-PLAN 5.1 and 8.2): TIERS[t - 1] is tier t. Names are fictional on purpose */
export const TIERS: readonly Tier[] = [
  { tier: 1, name: 'Maple Falls Club Championship', practiceDays: 0, days: 1, spectators: [300, 600], holes: 9, minLengthM: 0, needs: OWN_NEEDS[0], ticket: 0, purse: 2000, sponsor: 0, tv: 0, reputation: 0 },
  { tier: 2, name: 'County Amateur', practiceDays: 0, days: 2, spectators: [1500, 2500], holes: 9, minLengthM: 0, needs: OWN_NEEDS.slice(0, 2).flat(), ticket: 5, purse: 10000, sponsor: 10000, tv: 0, reputation: 55 },
  { tier: 3, name: 'State Open', practiceDays: 1, days: 3, spectators: [4000, 8000], holes: 18, minLengthM: 5800, needs: OWN_NEEDS.slice(0, 3).flat(), ticket: 10, purse: 60000, sponsor: 50000, tv: 0, reputation: 65 },
  { tier: 4, name: 'Maple Falls Classic', practiceDays: 2, days: 4, spectators: [12000, 25000], holes: 18, minLengthM: 6400, needs: OWN_NEEDS.slice(0, 4).flat(), ticket: 20, purse: 400000, sponsor: 250000, tv: 300000, reputation: 75 },
  { tier: 5, name: 'The Maple Falls Open', practiceDays: 3, days: 4, spectators: [30000, 50000], holes: 18, minLengthM: 6700, needs: OWN_NEEDS.slice(0, 5).flat(), ticket: 35, purse: 1000000, sponsor: 1000000, tv: 1500000, reputation: 85 },
];

/** the tier's row of TIERS (the tier clamped to 1..5) */
export function tierInfo(tier: number): Tier { return TIERS[Math.min(5, Math.max(1, tier)) - 1]; }

/** the share of a year's reputation kept from last year: reputation moves this far toward each year's score (GOLF-PLAN 8.1) */
export const REP_STEP = 0.3;
/** the reputation after a year: prev moves REP_STEP of the way toward score, kept in 0..100 */
export function reputationAfter(prev: number, score: number): number { return Math.min(100, Math.max(0, prev + REP_STEP * (score - prev))); }

/** one day's facts for its satisfaction: the spectators by arrival (onTime, late, missed), the exit's 95th percentile (min), the average queue (min) and the viewing (0..1) */
export interface DayFacts { onTime: number; late: number; missed: number; exitP95Min: number; avgQueueMin: number; viewing: number }

/** the day's satisfaction, 0..100 (GOLF-PLAN 5.4): arrival 40% ((on time + half the late) over all, 1 with nobody), exit 20% (1 at 30 min or
 *  less, 0 at 120 or more), queues 20% (1 at 5 min or less, 0 at 30 or more), viewing 20% */
export function daySatisfaction(d: DayFacts): number {
  const all = d.onTime + d.late + d.missed;
  const arrival = all > 0 ? (d.onTime + 0.5 * d.late) / all : 1;
  const exit = Math.min(1, Math.max(0, (120 - d.exitP95Min) / 90));
  const queue = Math.min(1, Math.max(0, (30 - d.avgQueueMin) / 25));
  const viewing = Math.min(1, Math.max(0, d.viewing));
  return 100 * (0.4 * arrival + 0.2 * exit + 0.2 * queue + 0.2 * viewing);
}

/** what a course has: its holes, its length (m) and the needs it has (the venue's needs too) */
export interface CourseFacts { holes: number; lengthM: number; have: ReadonlySet<Need> }

/** what a tier is missing on a course: its needs not in `have`, plus 'holes' or 'length' when the course is short of them */
export function missingFor(tier: number, facts: CourseFacts): (Need | 'holes' | 'length')[] {
  const t = tierInfo(tier), out: (Need | 'holes' | 'length')[] = [];
  if (facts.holes < t.holes) out.push('holes');
  if (facts.lengthM < t.minLengthM) out.push('length');
  for (const n of t.needs) if (!facts.have.has(n)) out.push(n);
  return out;
}

/** the results screen's verdict on the tier: `offer` is the next tier (or null) when the course has all of its needs and the reputation
 *  reaches its threshold; `poor` when the reputation is under the tier's threshold less 15; `demote` when poor for the second year running
 *  (poorYears is the poor years before this one, in a row) and the tier is above 1 */
export interface Verdict { offer: number | null; demote: boolean; poor: boolean }
/** the verdict of a year (see Verdict) */
export function verdict(tier: number, reputation: number, facts: CourseFacts, poorYears: number): Verdict {
  const next = tier < 5 ? tier + 1 : null;
  const offer = next !== null && reputation >= tierInfo(next).reputation && missingFor(next, facts).length === 0 ? next : null;
  const poor = reputation < tierInfo(tier).reputation - 15;
  return { offer, demote: poor && poorYears >= 1 && tier > 1, poor };
}

/** the peak day's spectators of a tier at a reputation: its min plus (max - min) times the reputation's share of 100, rounded */
export function spectatorDemand(tier: number, reputation: number): number {
  const [lo, hi] = tierInfo(tier).spectators;
  return Math.round(lo + (hi - lo) * Math.min(100, Math.max(0, reputation)) / 100);
}

/** the share of the tournament's build-up each practice day counts for (a practice day is dayIndex < 0) */
export const PRACTICE_SHARE = 0.3;
/** the tournament days' shares of the build-up, to the last day (a tier with fewer days uses the last of these) */
const DAY_BUILD = [0.6, 0.7, 0.85, 1];
/** a tournament day's share of the build-up: dayIndex is 0-based over the tournament's days (the first is 0), a practice day is dayIndex < 0 (PRACTICE_SHARE);
 *  the days build to the last (for 4 days 0.6, 0.7, 0.85, 1; for fewer, the last of those) */
export function dayShare(dayIndex: number, days: number): number {
  if (dayIndex < 0) return PRACTICE_SHARE;
  const n = Math.min(4, Math.max(1, days)), i = Math.min(n - 1, dayIndex);
  return DAY_BUILD[4 - n + i];
}
