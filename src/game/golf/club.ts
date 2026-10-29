// T214 (#559; docs/plans/P26.md sections 4 and 8, phase 1): the club's members as a number the game keeps. The player sets the dues a month against
// a fair band (fairPrice: the course's quality, the reputation, the holes and the clubhouse's level); members join from the pool (memberPool: the
// town's golfers and the visitors who come back, T208's) and leave by churn, once per game month (monthStep): sales are a share of the pool not yet
// members (the base rate, plus the staff's, times the club's appeal and the price's effect), churn a share of the members (the base, more above the
// fair price and on a slow course, less with staff). The dues and the members' upkeep are booked each month (the engine, beside the crew's wages).
// The members are an expected count (a float in the save; the cards round it): no randomness, so the books are testable and the same after a reload.
// The staff's terms (the head pro's and the secretary's sales and renewals) read golf/staff.ts's club roles, hired from P26's phase 4; until then
// they are off. Pure TS, no DOM; dollars, game months (the engine's golfMonthIndex).
import { GREEN_FEE_PER_ROUND, OFF_SEASON_PLAY_DAYS, legacyMonthlyMembership } from './yearend';

// ---- the owner's balance questions (P26 6.4), each at the lead's recommendation (pre-approved): a later answer is a one-line change ----
/** Q1, how big memberships get: the residents' share of the pool. Recommended: as modelled, 4% (the smaller option halves it to 2%) */
export const POOL_TOWN = 0.04;
/** Q2, the early dip: accepted, as recommended. Nothing hands members out for free any more; what softens the first seasons is the founding drive
 *  (FOUNDING of the pool joins in the clubhouse's first month) and the base sales (J_BASE a month with no staff) */
export const FOUNDING = 0.4, J_BASE = 0.02;
// Q3, the wages, as recommended (head pro $900, teaching pro $300, secretary $450 a month): golf/staff.ts CLUB_WAGE, beside the crew's WAGE
/** Q4, the clubhouse's old visit cars: kept, as the bar and the shop's trade at $8 a visitor, +20% with a head pro (P26 4.8; booked from phase 5) */
export const BAR_SHOP_PRICE = 8, BAR_SHOP_PRO = 0.2;

// ---- P26's other numbers (sections 4.1-4.5) ----
/** the dues a month ($): the player's, in PRICE_STEP steps from PRICE_MIN to PRICE_MAX; a new club starts at PRICE_START (P26.D5: it does not follow
 *  the fair price); an old save's members keep LEGACY_DUES, what T208's stand-in priced a member at */
export const PRICE_START = 40, PRICE_MIN = 10, PRICE_MAX = 300, PRICE_STEP = 5, LEGACY_DUES = 50;
/** the fair price: (FAIR_BASE + FAIR_Q x quality + FAIR_REP x reputation) x FAIR_18 on 18 holes x (1 + FAIR_LEVEL x (the clubhouse's level - 1)) */
export const FAIR_BASE = 15, FAIR_Q = 30, FAIR_REP = 15, FAIR_18 = 1.4, FAIR_LEVEL = 0.08;
/** the fair band: this share of the fair price below and above it */
export const FAIR_BAND: readonly [number, number] = [0.85, 1.15];
/** the pool: POOL_TOWN of the residents plus POOL_VISIT x the visitors a day */
export const POOL_VISIT = 0.8;
/** the staff's sales a month (a share of the pool not yet members): the head pro's and the secretary's (phase 4) */
export const J_PRO = 0.025, J_SEC = 0.02;
/** churn a month (a share of the members): the base, C_PRICE x (price / fair - 1) above the fair price, C_PACE x slow, less the head pro's and the
 *  secretary's renewals; never below C_MIN */
export const C_BASE = 0.02, C_PRICE = 0.04, C_PACE = 0.01, C_PRO = 0.008, C_SEC = 0.004, C_MIN = 0.004;
/** the price's effect on sales: 1 + PRICE_SLOPE x (1 - price / fair), within PRICE_EFFECT */
export const PRICE_SLOPE = 2, PRICE_EFFECT: readonly [number, number] = [0.1, 2];
/** the appeal's terms: course quality AP_Q[0] + AP_Q[1] q, reputation AP_REP[0] + AP_REP[1] r, the clubhouse AP_LEVEL[0] + AP_LEVEL[1] (level - 1),
 *  the holes (HOLES_18 on 18, 1 on 9 to 17, holes / 9 fewer), the pace 1 - AP_PACE x slow */
export const AP_Q: readonly [number, number] = [0.5, 0.5], AP_REP: readonly [number, number] = [0.7, 0.6], AP_LEVEL: readonly [number, number] = [0.9, 0.1], HOLES_18 = 1.15, AP_PACE = 0.3;
/** a member's upkeep ($ a month: lockers, handicap cards, the newsletter) */
export const MEMBER_UPKEEP = 4;
/** each member is MEMBER_VISITS visitors a day fewer (he was a regular), floored so the visitors never fall below VISITOR_FLOOR of dailyGolfers */
export const MEMBER_VISITS = 0.15, VISITOR_FLOOR = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** a 0..100 score as 0..1 */
const unit = (v: number) => clamp(v, 0, 100) / 100;

/** the fair dues a month ($) for the course's quality score and the reputation (both 0..100), its holes and the clubhouse's level (1..5) */
export function fairPrice(quality: number, rep: number, holes: number, level: number): number {
  return (FAIR_BASE + FAIR_Q * unit(quality) + FAIR_REP * unit(rep)) * (holes >= 18 ? FAIR_18 : 1) * (1 + FAIR_LEVEL * (Math.max(1, level) - 1));
}
/** the fair band ($ a month, low and high) round a fair price */
export const fairBand = (fair: number): [number, number] => [FAIR_BAND[0] * fair, FAIR_BAND[1] * fair];
/** the pool: the golfers who might join, from the town's residents and the visitors a day (dailyGolfers: the regulars of the town and the region) */
export const memberPool = (residents: number, visitorsADay: number): number => POOL_TOWN * Math.max(0, residents) + POOL_VISIT * Math.max(0, visitorsADay);
/** the paying visitors a day once the club has `members` members: each was a regular, MEMBER_VISITS a day; never below VISITOR_FLOOR of them */
export const visitorsADay = (visitors: number, members: number): number => Math.max(VISITOR_FLOOR * visitors, visitors - MEMBER_VISITS * Math.max(0, members));
/** the members T208's stand-in counted (an old save's: the legacy dues a month over LEGACY_DUES; a float, the card rounded it) */
export const legacyMembers = (quality: number, rep: number, holes: number): number => legacyMonthlyMembership(quality, rep, holes) / LEGACY_DUES;
/** a price as the stepper keeps it: a whole PRICE_STEP within PRICE_MIN..PRICE_MAX */
export const clampPrice = (p: number): number => clamp(Math.round((Number.isFinite(p) ? p : PRICE_START) / PRICE_STEP) * PRICE_STEP, PRICE_MIN, PRICE_MAX);

/** the staff's terms (phase 4): whether a head pro and a membership secretary are on the staff (golf/staff.ts clubTerms) */
export interface StaffTerms { head: boolean; sec: boolean }
/** what the club is this month: the residents, the course's quality score and the reputation (0..100), the holes, the visitors a day (dailyGolfers),
 *  the clubhouse's level (1..5), the season's average wait a round (minutes) and how slow that is (0..1: everyday.ts paceSlow), and the staff */
export interface ClubInputs { residents: number; quality: number; rep: number; holes: number; visitors: number; level: number; waitAvg: number; slow: number; staff?: StaffTerms }

/** the appeal's five terms (P26 4.4), each a factor */
export interface Appeal { quality: number; rep: number; clubhouse: number; holes: number; pace: number }
export function appealTerms(i: ClubInputs): Appeal {
  const h = i.holes >= 18 ? HOLES_18 : i.holes >= 9 ? 1 : Math.max(0, i.holes) / 9;
  return {
    quality: AP_Q[0] + AP_Q[1] * unit(i.quality), rep: AP_REP[0] + AP_REP[1] * unit(i.rep), clubhouse: AP_LEVEL[0] + AP_LEVEL[1] * (Math.max(1, i.level) - 1),
    holes: h, pace: 1 - AP_PACE * clamp(i.slow, 0, 1),
  };
}
/** the club's appeal: its terms multiplied */
export function appeal(i: ClubInputs): number { const a = appealTerms(i); return a.quality * a.rep * a.clubhouse * a.holes * a.pace; }
/** the price's effect on sales against the fair price */
export const priceEffect = (price: number, fair: number): number => clamp(1 + PRICE_SLOPE * (1 - price / Math.max(1e-9, fair)), PRICE_EFFECT[0], PRICE_EFFECT[1]);
/** the fair price of what the club is this month */
export const fairOf = (i: ClubInputs): number => fairPrice(i.quality, i.rep, i.holes, i.level);
/** the share of the pool not yet members who join a month */
export function joinRate(i: ClubInputs, price: number): number {
  const st = i.staff; return (J_BASE + (st?.head ? J_PRO : 0) + (st?.sec ? J_SEC : 0)) * appeal(i) * priceEffect(price, fairOf(i));
}
/** the share of the members who leave a month */
export function churnRate(i: ClubInputs, price: number): number {
  const st = i.staff, f = fairOf(i);
  return Math.max(C_MIN, C_BASE + C_PRICE * Math.max(0, price / f - 1) + C_PACE * clamp(i.slow, 0, 1) - (st?.head ? C_PRO : 0) - (st?.sec ? C_SEC : 0));
}

/** the club as the save keeps it (GolfSave.club): the members (an expected count, a float), the dues a month ($), whether the founding drive is done,
 *  the game month it was stepped to (its dues booked), the last month's joined and left (the card's "this month"), the season's dues and members'
 *  upkeep booked ($) and its joined and left; and an old save's legacyMonths (P26 section 8: the months of the load's season before the load, booked
 *  at that season's tournament close at the old annual rate, then dropped) */
export interface ClubSave {
  members: number; price: number; founded: boolean; month: number;
  last: { joined: number; left: number };
  season: { dues: number; upkeep: number; joined: number; left: number };
  legacyMonths?: number;
}
const emptySeason = (): ClubSave['season'] => ({ dues: 0, upkeep: 0, joined: 0, left: 0 });
/** a new club (a new game): no members, the start price, the founding drive to come, stepped to `month` */
export function newClub(month: number): ClubSave {
  return { members: 0, price: PRICE_START, founded: false, month: Math.floor(month), last: { joined: 0, left: 0 }, season: emptySeason() };
}
/** an old save's club (P26 section 8): the members its Clubhouse card showed (legacyMembers of the club then: golf.everyday.inp, else the course
 *  now), LEGACY_DUES, the founding drive done when it had a clubhouse (an old club gets no windfall; one with none yet gets its drive when it builds
 *  one), stepped to `month`; legacyMonths: the months of this season before the load (with a clubhouse only) */
export function legacyClub(inp: { quality: number; rep: number; holes: number }, month: number, legacyMonths: number, clubhouse: boolean): ClubSave {
  const c = newClub(month);
  c.price = LEGACY_DUES; c.founded = clubhouse;
  if (clubhouse) { c.members = legacyMembers(inp.quality, inp.rep, inp.holes); c.legacyMonths = clamp(Math.floor(legacyMonths), 0, 12); }
  return c;
}

/** a finite number, else d */
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** a saved club, well formed, or null (none saved: an old save, seeded by the engine with legacyClub, or a new game) */
export function normalizeClubSave(v: unknown): ClubSave | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<ClubSave>;
  if (typeof o.month !== 'number' || !Number.isFinite(o.month)) return null;
  const l = (o.last ?? {}) as Partial<ClubSave['last']>, s = (o.season ?? {}) as Partial<ClubSave['season']>;
  const out: ClubSave = {
    members: Math.max(0, num(o.members)), price: clampPrice(num(o.price, PRICE_START)), founded: !!o.founded, month: Math.floor(o.month),
    last: { joined: Math.max(0, num(l.joined)), left: Math.max(0, num(l.left)) },
    season: { dues: Math.max(0, num(s.dues)), upkeep: Math.max(0, num(s.upkeep)), joined: Math.max(0, num(s.joined)), left: Math.max(0, num(s.left)) },
  };
  if (typeof o.legacyMonths === 'number' && Number.isFinite(o.legacyMonths) && o.legacyMonths > 0) out.legacyMonths = clamp(Math.floor(o.legacyMonths), 0, 12);
  return out;
}

/** the founding drive (the clubhouse's first month): FOUNDING of the pool joins at once. Returns the club (s is not changed) and who joined */
export function foundingDrive(s: ClubSave, i: ClubInputs): { s: ClubSave; joined: number } {
  if (s.founded) return { s, joined: 0 };
  const joined = Math.max(0, FOUNDING * memberPool(i.residents, i.visitors) - s.members);
  return { s: { ...s, founded: true, members: s.members + joined, last: { joined, left: 0 }, season: { ...s.season, joined: s.season.joined + joined } }, joined };
}

/** what a month booked: the dues and the members' upkeep ($), who joined and who left */
export interface ClubBooked { dues: number; upkeep: number; joined: number; left: number; months: number }
/** one game month (its start): the sales (joinRate of the pool not yet members) and the churn (churnRate of the members), then the month's dues
 *  (members x price) and upkeep (members x MEMBER_UPKEEP). Returns the club one month on (s is not changed) and what it booked */
export function monthStep(s: ClubSave, i: ClubInputs): { s: ClubSave; booked: ClubBooked } {
  const pool = memberPool(i.residents, i.visitors);
  const joined = joinRate(i, s.price) * Math.max(0, pool - s.members), left = churnRate(i, s.price) * s.members;
  const members = Math.max(0, s.members + joined - left), dues = members * s.price, upkeep = members * MEMBER_UPKEEP;
  return {
    s: { ...s, members, month: s.month + 1, last: { joined, left }, season: { dues: s.season.dues + dues, upkeep: s.season.upkeep + upkeep, joined: s.season.joined + joined, left: s.season.left + left } },
    booked: { dues, upkeep, joined, left, months: 1 },
  };
}
/** steps the club to game month `month`: each month after s.month (a skip runs every month it crossed, from the club as it is now: inputs). A month
 *  before s.month by less than a season holds (the clock read a unit early at a season's turn: nothing is booked twice); a whole season or more
 *  back is a new clock, which starts from it */
export function stepTo(s: ClubSave, month: number, inputs: () => ClubInputs): { s: ClubSave; booked: ClubBooked } {
  const m = Math.floor(month), booked: ClubBooked = { dues: 0, upkeep: 0, joined: 0, left: 0, months: 0 };
  if (m <= s.month) return { s: m <= s.month - 12 ? { ...s, month: m } : s, booked };
  const i = inputs();
  let c = s;
  while (c.month < m) {
    const r = monthStep(c, i); c = r.s;
    booked.dues += r.booked.dues; booked.upkeep += r.booked.upkeep; booked.joined += r.booked.joined; booked.left += r.booked.left; booked.months++;
  }
  return { s: c, booked };
}
/** the club holds at month `month` (no clubhouse: no members join, no dues are booked; the month moves on so nothing is booked later for it) */
export const holdTo = (s: ClubSave, month: number): ClubSave => (Math.floor(month) > s.month ? { ...s, month: Math.floor(month) } : s);
/** the season closes (the tournament, or a founding season's end): its counts start again and an old save's legacy months are dropped */
export function closeSeason(s: ClubSave): ClubSave { const { legacyMonths: _, ...rest } = s; return { ...rest, season: emptySeason() }; }
/** the season's memberships at its tournament close: the dues booked month by month, and an old save's months before its load at the old annual
 *  rate (legacyAnnual: yearend.ts annualMembershipIncome x legacyMonths / 12); total is the results' Memberships line */
export function seasonMemberships(s: ClubSave, legacyAnnual: number): { booked: number; legacy: number; total: number } {
  const booked = Math.round(s.season.dues), legacy = Math.round(Math.max(0, legacyAnnual) * (s.legacyMonths ?? 0) / 12);
  return { booked, legacy, total: booked + legacy };
}

/** the Members block of the Clubhouse card (ui/golf/ClubhouseCard.tsx; P26 5.1): the members (rounded), this month's joined and left, the pool; the
 *  price, the fair price and its band, the stepper's limits and step, and where the price stands (cheap below the band, dear above it); the money a
 *  month (dues, the members' upkeep, the green fees lost: the visitor rounds the members no longer pay for); the appeal's terms, the price's
 *  effect and the town's numbers for "What sells memberships"; the season's dues, joined and left; whether the founding drive is done */
export interface MembersView {
  members: number; joined: number; left: number; pool: number;
  price: number; fair: number; band: [number, number]; min: number; max: number; step: number; stand: 'cheap' | 'fair' | 'dear';
  dues: number; upkeep: number; lost: number;
  appeal: Appeal; priceEffect: number; residents: number; visitors: number; quality: number; rep: number; holes: number; level: number; waitAvg: number;
  season: { dues: number; joined: number; left: number };
  founded: boolean;
}
/** the card's view of the club this month */
export function membersView(s: ClubSave, i: ClubInputs): MembersView {
  const fair = fairOf(i), band = fairBand(fair), M = Math.round(s.members), visitors = Math.max(0, i.visitors);
  return {
    members: M, joined: Math.round(s.last.joined), left: Math.round(s.last.left), pool: Math.round(memberPool(i.residents, visitors)),
    price: s.price, fair, band, min: PRICE_MIN, max: PRICE_MAX, step: PRICE_STEP, stand: s.price < band[0] - 1e-9 ? 'cheap' : s.price > band[1] + 1e-9 ? 'dear' : 'fair',
    dues: M * s.price, upkeep: M * MEMBER_UPKEEP, lost: (visitors - visitorsADay(visitors, M)) * GREEN_FEE_PER_ROUND * OFF_SEASON_PLAY_DAYS / 12,
    appeal: appealTerms(i), priceEffect: priceEffect(s.price, fair), residents: i.residents, visitors, quality: i.quality, rep: i.rep, holes: i.holes, level: i.level, waitAvg: i.waitAvg,
    season: { dues: s.season.dues, joined: Math.round(s.season.joined), left: Math.round(s.season.left) },
    founded: s.founded,
  };
}
