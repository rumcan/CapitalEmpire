// Year-end tournament evaluation, satisfaction, reputation shift, and tier progression (docs/GOLF-PLAN.md sections 5.4 and 8.1-8.2). Pure TS, no DOM.  
import type { RoundResult } from '../event/round';
import { BUSINESS } from '../business/catalogue';
import { PARTY } from '../event/config';
import { evaluateEventToolDay, type PlacedEventStructure } from './eventtool';
import type { Hole } from './holes';
import { daySatisfaction, reputationAfter, tierInfo, verdict, type CourseFacts, type DayFacts } from './tour';
import { STRUCTURE } from './tents';
import { gateQueue, gateRate } from './venue';
import { arrivalShare, exitShare, EXIT_END, GATES_OPEN } from './calendar';
import { ON_TIME_GRACE_MIN } from './tournamentday';
import { courseMonthlyUpkeep } from './costs';
import { townGrowthLine, townGrowthRate } from './towngrowth';
import { computeParkingIncome } from './parkingfee';

/** the share of a year's surface maintenance (costs.ts courseMonthlyUpkeep x 12) the player is charged at the tournament: 20% (T269: 25% before the grounds crew's wages, golf/staff.ts, were their own monthly line; a full crew's $7,200 a season on the old nine is about the 5% taken off, so the two together are the 36,000 dollars the campaign simulator assumes) (the full figure, about 145,000, would bankrupt a tier 1 club that earns almost nothing; BALANCE TODO with green fees) */
export const COURSE_UPKEEP_YEAR_SHARE = 0.2;

/** Green fee ($) per round from the placed Clubhouse business ($22/visitor, GOLF-PLAN 2.1). */
export const GREEN_FEE_PER_ROUND = BUSINESS.clubhouse.pricePerVisitor;

/** Representative off-season billing days per 12-month season (2 sample billing days/month, GOLF-PLAN 2.1). */
export const OFF_SEASON_PLAY_DAYS = 24;

/** Daily off-season golfers scaling with course quality from coursestats (0..100), reputation (0..100), and holes. */
export function dailyGolfers(qualityScore: number, reputation: number, holes = 9): number {
  if (holes <= 0) return 0;
  const q = Math.min(100, Math.max(0, qualityScore)) / 100;
  const r = Math.min(100, Math.max(0, reputation)) / 100;
  const holeFactor = holes >= 18 ? 1.25 : Math.max(0.5, holes / 9);
  return Math.round((12 + 56 * r) * (0.4 + 0.6 * q) * holeFactor);
}

/** Annual off-season green-fee revenue ($) booked through the Clubhouse business line. */
export function greenFeeIncome(qualityScore: number, reputation: number, holes = 9): number {
  return dailyGolfers(qualityScore, reputation, holes) * GREEN_FEE_PER_ROUND * OFF_SEASON_PLAY_DAYS;
}

/** Monthly club membership dues ($) scaling with course quality (0..100), reputation (0..100), and holes (GOLF-PLAN 2.1): the rule before P26
 *  (T214, golf/club.ts), when nobody sold memberships. Kept for two uses only (P26 4.7): seeding an old save's members (club.ts legacyClub) and
 *  the campaign simulator (campaign.ts, range:gate's booking) until P05's T-C puts the simulator on the game's path. */
export function legacyMonthlyMembership(qualityScore: number, reputation: number, holes = 9): number {
  if (holes <= 0) return 0;
  const q = Math.min(100, Math.max(0, qualityScore)) / 100;
  const r = Math.min(100, Math.max(0, reputation)) / 100;
  const holeFactor = holes >= 18 ? 1.22 : Math.max(0.5, holes / 9);
  return Math.round((200 + 1800 * r) * (0.4 + 0.6 * q) * holeFactor);
}

/** Annual club membership income ($ over 12 months) under the rule before P26 (legacyMonthlyMembership x 12): the campaign simulator's, and the old
 *  annual rate an old save's months before its load are booked at (club.ts seasonMemberships). */
export function annualMembershipIncome(qualityScore: number, reputation: number, holes = 9): number {
  return legacyMonthlyMembership(qualityScore, reputation, holes) * 12;
}
import { computeSponsorBreakdown } from './sponsors';
import {
  applyCourseConsultantQuality,
  applyEarlyBirdTicketPrice,
  applyMediaPartnerReputation,
  applyRainInsuranceToDayFacts,
  applyRainInsuranceToSatisfaction,
  applyVolunteerCorpsCost,
  earlyBirdArrivalShare,
  hasExpressGates,
  hasFirstAidCoverage,
} from './golfcards';
import { resolveMultiDayWithPractice, type MultiDaySummary } from './multiday';
import {
  WEATHER_INFO,
  applyWeatherToDayFacts,
  applyWeatherToSatisfaction,
  applyWeatherToTentRevenue,
  getTournamentWeather,
  hasFirstAidStructure,
  type WeatherCondition,
  type WeatherInfo,
} from './weather';
  
/** unmeasured default exit 95th percentile (minutes) used until physical parking exit flow is simulated */  
export const DEFAULT_EXIT_P95_MIN = 35;  
/** unmeasured default average entrance queue wait (minutes) used until gate structures are simulated */  
export const DEFAULT_AVG_QUEUE_MIN = 5;  
/** unmeasured default course viewing score (0..1) used until grandstand viewing areas are simulated */  
export const DEFAULT_VIEWING = 0.85;  
  
/** summary of year-end tournament scoring and tour tier progression */  
export interface YearEndResult {
satisfaction: number;
prevRep: number;
rep: number;
tier: number;
prevTier: number;
poorYears: number;
verdictText: string;
facts: DayFacts;
dailyGolfers?: number;
greenFeeIncome?: number;
/** T208 everyday golf: the green fees the season's golfers actually paid ($), booked as they checked in; when set, the close book shows these in place of
 *  the expectation (greenFeeIncome) and does not book them again */
greenFeesPlayed?: number;
/** T208: the pace term, the reputation points how the course played this season added (golf/everyday.ts seasonPaceRep; already in rep) */
paceRep?: number;
/** T269: the pin term, the reputation points the season's unmoved pins took (golf/staff.ts pinReputation; already in rep) */
pinRep?: number;
/** the dues a month: the old rule's (legacyMonthlyMembership); T214, the game's: this month's dues (golf/club.ts) */
monthlyMembership?: number;
/** the season's memberships: the old rule's (annualMembershipIncome); T214, the game's: the dues booked month by month plus an old save's months
 *  before its load at the old rate (golf/club.ts seasonMemberships) */
membershipIncome?: number;
/** T214: the dues already booked month by month (in the treasury: the close book shows them in membershipIncome and does not book them again) */
duesBooked?: number;
tentRevenue?: number;
tentRentCost?: number;
tentUpkeep?: number;
sponsorIncome?: number;
tvIncome?: number;
purse?: number;
multiDay?: MultiDaySummary;
weather?: WeatherInfo;
townGrowth?: number;
townGrowthText?: string;
carsParked?: number;
parkingFee?: number;
parkingIncome?: number;
/** which day facts the movers measured (LEAD.md M2.4): the gates (queue, on time, late) and the exit; false: the formula's estimate */
measured?: { gates: boolean; exit: boolean };
}
  
/**  
 * Compute year-end satisfaction, reputation update, and tier promotion/demotion.  
 *  
 * Arrival rate determines on-time arrivals; exit time, gate queue, and viewing use sensible defaults  
 * (35m exit P95, 5m average queue, 0.85 viewing satisfaction) until dedicated structures are placed.  
 */  
/** ticket price ($) per arrived spectator for a golf tournament at the given tier (0 at tier 1) */
export function golfTicketPrice(tier: number, cards: readonly string[] = []): number {
  return applyEarlyBirdTicketPrice(tierInfo(tier).ticket, cards);
}

/** financial booking lines when closing a golf tournament round (income to business, costs to upkeep) */
export interface TournamentCloseBook {
  extraTickets: number;
  extraTents: number;
  greenFeeIncome: number;
  membershipIncome: number;
  bizIncome: number;
  purse: number;
  rent: number;
  annualTentUpkeep: number;
  annualCourseUpkeep: number;
  upkeepCost: number;
  liveTickets: number;
  tickets: number;
  parking: number;
  tents: number;
  sponsors: number;
  tv: number;
  toll: number;
  liveUpkeep: number;
  closeDelta: number;
  net: number;
}

/**
 * Compute the end-of-tournament budget entries to book on closeRound:
 * - bizIncome: Day 1 tent takings + resolved multi-day ticket and tent deltas (clamped >= 0) + sponsor + TV income
 * - upkeepCost: tournament purse + rented structure rent (charged once per tournament here, not at placement) +
 *   12 months of bought structure upkeep + 12 months of course surface maintenance (courseMonthlyUpkeep * 12)
 */
export function computeTournamentCloseBook(
  ye: YearEndResult,
  liveDayTicketsBooked = 0,
  courseAreas: Parameters<typeof courseMonthlyUpkeep>[0] = [],
  liveDayUpkeep = 0,
  liveDayToll = 0,
  parkingIncomeOverride?: number,
): TournamentCloseBook {
  const extraTickets = (ye.multiDay && (ye.multiDay.resolvedDays > 0 || (ye.multiDay.practiceDays ?? 0) > 0))
    ? Math.max(0, ye.multiDay.totalTickets - liveDayTicketsBooked)
    : 0;
  const extraTents = (ye.multiDay && (ye.multiDay.resolvedDays > 0 || (ye.multiDay.practiceDays ?? 0) > 0))
    ? Math.max(0, ye.multiDay.totalTents - (ye.tentRevenue ?? 0))
    : 0;
  // T208: the green fees the everyday golfers paid as they checked in are in the treasury already: the line shows them, the close books them no more
  const playedLive = ye.greenFeesPlayed !== undefined;
  const greenFees = Math.max(0, Math.round(playedLive ? ye.greenFeesPlayed! : ye.greenFeeIncome ?? 0));
  const memberships = Math.max(0, Math.round(ye.membershipIncome ?? 0));
  // T214: the dues the members paid month by month are in the treasury already: the line shows them, the close books only the rest (an old save's
  // months before its load, at the old rate)
  const duesLive = Math.min(memberships, Math.max(0, Math.round(ye.duesBooked ?? 0)));
  const parking = Math.max(0, Math.round(parkingIncomeOverride ?? ye.parkingIncome ?? 0));
  const bizIncome = Math.max(0, Math.round((ye.tentRevenue ?? 0) + (ye.sponsorIncome ?? 0) + (ye.tvIncome ?? 0) + extraTickets + extraTents + (playedLive ? 0 : greenFees) + memberships - duesLive + parking));
  const purse = Math.max(0, Math.round(ye.purse ?? 0));
  const rent = Math.max(0, Math.round(ye.tentRentCost ?? 0));
  const annualTentUpkeep = Math.max(0, Math.round((ye.tentUpkeep ?? 0) * 12));
  const annualCourseUpkeep = Math.max(0, Math.round(courseMonthlyUpkeep(courseAreas) * 12 * COURSE_UPKEEP_YEAR_SHARE));
  const upkeepCost = purse + rent + annualTentUpkeep + annualCourseUpkeep;
  const liveTickets = Math.max(0, Math.round(liveDayTicketsBooked));
  const tickets = liveTickets + extraTickets;
  const tents = Math.max(0, Math.round((ye.tentRevenue ?? 0) + extraTents));
  const sponsors = Math.max(0, Math.round(ye.sponsorIncome ?? 0));
  const tv = Math.max(0, Math.round(ye.tvIncome ?? 0));
  const toll = Math.max(0, Math.round(liveDayToll));
  const liveUpkeep = Math.max(0, Math.round(liveDayUpkeep));
  const closeDelta = bizIncome - upkeepCost;
  const net = toll + liveTickets + (playedLive ? greenFees : 0) + duesLive - liveUpkeep + closeDelta;
  return {
    extraTickets,
    extraTents,
    greenFeeIncome: greenFees,
    membershipIncome: memberships,
    bizIncome,
    purse,
    rent,
    annualTentUpkeep,
    annualCourseUpkeep,
    upkeepCost,
    liveTickets,
    tickets,
    parking,
    tents,
    sponsors,
    tv,
    toll,
    liveUpkeep,
    closeDelta,
    net,
  };
}

/** total open entrance gate lanes from placed structures, defaulting to 1 lane at tier 1 when none placed */
export function gateLanesFor(structures: readonly PlacedEventStructure[], tier: number): number {
  let lanes = 0;
  for (const s of structures) {
    const def = STRUCTURE[s.typeId];
    if (def?.kind === 'gate') lanes += def.capacity;
  }
  return lanes === 0 && tier === 1 ? 1 : lanes;
}

/** calculate measured entrance arrival queue, late spectators, and exit P95 minutes from gate structures and spectator count */
export function measureGateFlows(
  spectators: number,
  lanes: number,
  cardsOrExpress: boolean | readonly string[] = false,
): { avgQueueMin: number; onTime: number; late: number; exitP95Min: number } {
  if (spectators <= 0) return { avgQueueMin: 0, onTime: 0, late: 0, exitP95Min: 0 };
  if (lanes <= 0) return { avgQueueMin: 120, onTime: 0, late: spectators, exitP95Min: 120 };

  const cardsList = Array.isArray(cardsOrExpress) ? cardsOrExpress : [];
  const express = typeof cardsOrExpress === 'boolean' ? cardsOrExpress : hasExpressGates(cardsList);
  const rate = gateRate(lanes, express);

  // 1. Arrival flow: GATES_OPEN (420) to 780
  const arrivalsPerMinute: number[] = [];
  for (let t = GATES_OPEN; t < 780; t++) {
    const shareNext = cardsList.length > 0 ? earlyBirdArrivalShare(t + 1, cardsList) : arrivalShare(t + 1);
    const shareCur = cardsList.length > 0 ? earlyBirdArrivalShare(t, cardsList) : arrivalShare(t);
    arrivalsPerMinute.push(spectators * (shareNext - shareCur));
  }
  const gq = gateQueue(arrivalsPerMinute, lanes, express);
  let runningQ = 0, onTime = 0, late = 0;
  for (const a of arrivalsPerMinute) {
    if (a > 0) {
      runningQ += a;
      const wait = rate > 0 ? runningQ / rate : Infinity;
      if (wait <= ON_TIME_GRACE_MIN) onTime += a;
      else late += a;
    }
    runningQ = Math.max(0, runningQ - rate);
  }
  const onTimeCount = Math.round(onTime);
  const lateCount = Math.max(0, spectators - onTimeCount);

  // 2. Exit flow: 600 to EXIT_END (1170)
  let runningExitQ = 0;
  const exitWaits: { wait: number; count: number }[] = [];
  for (let t = 600; t < EXIT_END; t++) {
    const a = spectators * (exitShare(t + 1) - exitShare(t));
    if (a > 0) {
      runningExitQ += a;
      const wait = rate > 0 ? runningExitQ / rate : Infinity;
      exitWaits.push({ wait, count: a });
    }
    runningExitQ = Math.max(0, runningExitQ - rate);
  }
  exitWaits.sort((a, b) => a.wait - b.wait);
  let cum = 0;
  const target = 0.95 * spectators;
  let exitP95Min = 0;
  for (const item of exitWaits) {
    cum += item.count;
    if (cum >= target) {
      exitP95Min = item.wait;
      break;
    }
  }

  return {
    avgQueueMin: gq.avgWaitMin,
    onTime: onTimeCount,
    late: lateCount,
    exitP95Min,
  };
}

/** the gate and exit facts from what the movers did (LEAD.md M2.4), each falling back to the formula (`est`, measureGateFlows) when the
 *  round did not measure it: the gates (no gates placed, an old save: not measured) give the queue (the mean wait at a gate; sim s are game
 *  minutes), the late (admitted after the grace, or still queuing at kick-off) and the on time (the rest of the arrived); the exit is the
 *  95th percentile of the cars' waits to leave their car park, once 95% of the parked cars are out */
export function measuredFlows(r: RoundResult, est: { avgQueueMin: number; onTime: number; late: number; exitP95Min: number }): { avgQueueMin: number; onTime: number; late: number; exitP95Min: number; queuing: number; measured: { gates: boolean; exit: boolean } } {
  const g = r.gates, lv = r.leave;
  const exit = !!lv && lv.cars > 0 && lv.gone >= 0.95 * lv.cars && lv.p95 !== undefined;
  const exitP95Min = exit ? lv!.p95! : est.exitP95Min;
  if (!g) return { avgQueueMin: est.avgQueueMin, onTime: est.onTime, late: est.late, exitP95Min, queuing: 0, measured: { gates: false, exit } };
  const lateIn = Math.min(r.arrived, g.late ?? 0);
  return { avgQueueMin: g.avgWait, onTime: r.arrived - lateIn, late: lateIn + g.queuing, exitP95Min, queuing: g.queuing, measured: { gates: true, exit } };
}

export function computeYearEnd(
prevTier: number,
prevRep: number,
roundResult: RoundResult,
courseFacts: CourseFacts,
prevPoorYears = 0,
structures: readonly PlacedEventStructure[] = [],
holes: readonly Hole[] = [],
seedOrWeather?: number | WeatherCondition,
qualityScore?: number,
cards: readonly string[] = [],
carsParked = 0,
parkingFee = 0,
): YearEndResult {
const weather: WeatherInfo = typeof seedOrWeather === 'string'
  ? WEATHER_INFO[seedOrWeather]
  : seedOrWeather !== undefined
    ? getTournamentWeather(seedOrWeather, roundResult.run || 1, 0)
    : WEATHER_INFO.clear;
const totalArrived = roundResult.arrived;
const lanes = gateLanesFor(structures, prevTier);
const gateFlow = measuredFlows(roundResult, measureGateFlows(totalArrived, lanes, cards));
// sent counts cars, arrived counts spectators (PARTY a car); the fans still queuing at a gate at kick-off get in late, not missed
const missed = Math.max(0, roundResult.sent * PARTY - totalArrived - gateFlow.queuing);
const rawFacts: DayFacts = { onTime: gateFlow.onTime, late: gateFlow.late, missed, exitP95Min: gateFlow.exitP95Min, avgQueueMin: gateFlow.avgQueueMin, viewing: DEFAULT_VIEWING };
const dayFacts: DayFacts = applyWeatherToDayFacts({
  onTime: gateFlow.onTime,
  late: gateFlow.late,
  missed,
  exitP95Min: gateFlow.exitP95Min,
  avgQueueMin: gateFlow.avgQueueMin,
  viewing: DEFAULT_VIEWING,
}, weather.condition);
const insuredFacts = applyRainInsuranceToDayFacts(rawFacts, dayFacts, weather.condition, cards);
Object.assign(dayFacts, insuredFacts);
const effectiveArrived = dayFacts.onTime + dayFacts.late;

let tentRevenue = 0;
let tentRentCost = 0;
let tentUpkeep = 0;

if (structures.length > 0) {
 const tentEval = evaluateEventToolDay({
 placed: structures,
 holes,
 gates: [],
 tier: prevTier,
 spectators: effectiveArrived,
 });
 tentRevenue = applyWeatherToTentRevenue(tentEval.totalRevenue, weather.condition, tentEval.byStructure);
 tentRentCost = applyVolunteerCorpsCost(tentEval.rentCost, cards);
 tentUpkeep = applyVolunteerCorpsCost(tentEval.monthlyUpkeep, cards);
}
  
 let satisfaction = applyWeatherToSatisfaction(
   Math.round(daySatisfaction(dayFacts)),
   weather.condition,
   hasFirstAidStructure(structures) || hasFirstAidCoverage(structures, cards),
 );  
 satisfaction = applyRainInsuranceToSatisfaction(Math.round(daySatisfaction(dayFacts)), satisfaction, cards);
 const rep = applyMediaPartnerReputation(Math.round(reputationAfter(prevRep, satisfaction)), cards);  
 const commercial = computeSponsorBreakdown(prevTier, rep, courseFacts.have, cards);
 const hasOffSeasonCourse = qualityScore !== undefined || holes.length > 0;
 const effQuality = applyCourseConsultantQuality(qualityScore ?? (holes.length > 0 ? 85 : 0), cards);
 const offSeasonHoles = hasOffSeasonCourse ? courseFacts.holes : 0;
 const golfersPerDay = dailyGolfers(effQuality, prevRep, offSeasonHoles);
 const greenFees = greenFeeIncome(effQuality, prevRep, offSeasonHoles);
 const monthlyMembers = legacyMonthlyMembership(effQuality, prevRep, offSeasonHoles);
 const memberships = annualMembershipIncome(effQuality, prevRep, offSeasonHoles);
 const v = verdict(prevTier, rep, courseFacts, prevPoorYears);  
  
 let tier = prevTier;  
 let poorYears = prevPoorYears;  
  
 if (v.offer !== null) {  
 // Automatically accept tier offer when course requirements are satisfied  
 tier = v.offer;  
 poorYears = 0;  
 } else if (v.demote) {  
 tier = Math.max(1, prevTier - 1);  
 poorYears = 0;  
 } else if (v.poor) {  
 poorYears = prevPoorYears + 1;  
 } else {  
 poorYears = 0;  
 }  
  
 let verdictText = `Stay at ${tierInfo(tier).name}`;  
 if (tier > prevTier) {  
 verdictText = `Offered ${tierInfo(tier).name} next year`;  
 } else if (tier < prevTier) {  
 verdictText = `Demoted to ${tierInfo(tier).name} next year`;  
 }  
  
 const multiDay = resolveMultiDayWithPractice({
   seed: typeof seedOrWeather === 'number' ? seedOrWeather : undefined,
   run: roundResult.run || 1,
   practiceWeather: typeof seedOrWeather === 'string' ? [seedOrWeather, seedOrWeather, seedOrWeather] : undefined,
   tier: prevTier,
   liveArrived: effectiveArrived,
   liveTents: tentRevenue,
   ticketPrice: golfTicketPrice(prevTier, cards),
   sponsorIncome: commercial.sponsorIncome,
   tvIncome: commercial.tvIncome,
   purse: commercial.purse,
   structures,
   holes,
 });

 return {
 satisfaction,
 prevRep,
 rep,
 tier,
 prevTier,
 poorYears,
 verdictText,
 facts: dayFacts,
 dailyGolfers: golfersPerDay,
 greenFeeIncome: greenFees,
 monthlyMembership: monthlyMembers,
 membershipIncome: memberships,
 tentRevenue,
 tentRentCost,
 tentUpkeep,
 sponsorIncome: commercial.sponsorIncome,
 tvIncome: commercial.tvIncome,
 purse: commercial.purse,
 multiDay,
 weather,
 townGrowth: townGrowthRate({ satisfaction, attendanceShare: roundResult.rate, tier: prevTier, reputation: rep }),
 townGrowthText: townGrowthLine(townGrowthRate({ satisfaction, attendanceShare: roundResult.rate, tier: prevTier, reputation: rep })),
 carsParked: Math.max(0, Math.round(carsParked)),
 parkingFee: Math.max(0, Math.round(parkingFee)),
 parkingIncome: computeParkingIncome(carsParked, parkingFee),
 measured: gateFlow.measured,
 };
}  
