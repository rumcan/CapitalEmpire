// Year-end tournament evaluation, satisfaction, reputation shift, and tier progression (docs/GOLF-PLAN.md sections 5.4 and 8.1-8.2). Pure TS, no DOM.  
import type { RoundResult } from '../event/round';
import { PARTY } from '../event/config';
import { evaluateEventToolDay, type PlacedEventStructure } from './eventtool';
import type { Hole } from './holes';
import { daySatisfaction, reputationAfter, tierInfo, verdict, type CourseFacts, type DayFacts } from './tour';
import { STRUCTURE } from './tents';
import { gateQueue, gateRate } from './venue';
import { arrivalShare, exitShare, EXIT_END, GATES_OPEN } from './calendar';
import { ON_TIME_GRACE_MIN } from './tournamentday';
import { courseMonthlyUpkeep } from './costs';

/** the share of a year's surface maintenance (costs.ts courseMonthlyUpkeep x 12) the player is charged at the tournament: 25%, about 36,000 dollars for the old nine, which is what the campaign simulator assumes (the full figure, about 145,000, would bankrupt a tier 1 club that earns almost nothing; BALANCE TODO with green fees) */
export const COURSE_UPKEEP_YEAR_SHARE = 0.25;
import { computeSponsorBreakdown } from './sponsors';
import { resolveMultiDayTournament, type MultiDaySummary } from './multiday';
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
tentRevenue?: number;
tentRentCost?: number;
tentUpkeep?: number;
sponsorIncome?: number;
tvIncome?: number;
purse?: number;
multiDay?: MultiDaySummary;
weather?: WeatherInfo;
}
  
/**  
 * Compute year-end satisfaction, reputation update, and tier promotion/demotion.  
 *  
 * Arrival rate determines on-time arrivals; exit time, gate queue, and viewing use sensible defaults  
 * (35m exit P95, 5m average queue, 0.85 viewing satisfaction) until dedicated structures are placed.  
 */  
/** ticket price ($) per arrived spectator for a golf tournament at the given tier (0 at tier 1) */
export function golfTicketPrice(tier: number): number {
  return tierInfo(tier).ticket;
}

/** financial booking lines when closing a golf tournament round (income to business, costs to upkeep) */
export interface TournamentCloseBook {
  extraTickets: number;
  extraTents: number;
  bizIncome: number;
  purse: number;
  rent: number;
  annualTentUpkeep: number;
  annualCourseUpkeep: number;
  upkeepCost: number;
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
): TournamentCloseBook {
  const extraTickets = (ye.multiDay && ye.multiDay.resolvedDays > 0)
    ? Math.max(0, ye.multiDay.totalTickets - liveDayTicketsBooked)
    : 0;
  const extraTents = (ye.multiDay && ye.multiDay.resolvedDays > 0)
    ? Math.max(0, ye.multiDay.totalTents - (ye.tentRevenue ?? 0))
    : 0;
  const bizIncome = Math.max(0, Math.round((ye.tentRevenue ?? 0) + (ye.sponsorIncome ?? 0) + (ye.tvIncome ?? 0) + extraTickets + extraTents));
  const purse = Math.max(0, Math.round(ye.purse ?? 0));
  const rent = Math.max(0, Math.round(ye.tentRentCost ?? 0));
  const annualTentUpkeep = Math.max(0, Math.round((ye.tentUpkeep ?? 0) * 12));
  const annualCourseUpkeep = Math.max(0, Math.round(courseMonthlyUpkeep(courseAreas) * 12 * COURSE_UPKEEP_YEAR_SHARE));
  const upkeepCost = purse + rent + annualTentUpkeep + annualCourseUpkeep;
  return {
    extraTickets,
    extraTents,
    bizIncome,
    purse,
    rent,
    annualTentUpkeep,
    annualCourseUpkeep,
    upkeepCost,
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
): { avgQueueMin: number; onTime: number; late: number; exitP95Min: number } {
  if (spectators <= 0) return { avgQueueMin: 0, onTime: 0, late: 0, exitP95Min: 0 };
  if (lanes <= 0) return { avgQueueMin: 120, onTime: 0, late: spectators, exitP95Min: 120 };

  const rate = gateRate(lanes, false);

  // 1. Arrival flow: GATES_OPEN (420) to 780
  const arrivalsPerMinute: number[] = [];
  for (let t = GATES_OPEN; t < 780; t++) {
    arrivalsPerMinute.push(spectators * (arrivalShare(t + 1) - arrivalShare(t)));
  }
  const gq = gateQueue(arrivalsPerMinute, lanes, false);
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

export function computeYearEnd(
prevTier: number,
prevRep: number,
roundResult: RoundResult,
courseFacts: CourseFacts,
prevPoorYears = 0,
structures: readonly PlacedEventStructure[] = [],
holes: readonly Hole[] = [],
seedOrWeather?: number | WeatherCondition,
): YearEndResult {
const weather: WeatherInfo = typeof seedOrWeather === 'string'
  ? WEATHER_INFO[seedOrWeather]
  : seedOrWeather !== undefined
    ? getTournamentWeather(seedOrWeather, roundResult.run || 1, 0)
    : WEATHER_INFO.clear;
const totalArrived = roundResult.arrived;
const missed = Math.max(0, roundResult.sent * PARTY - totalArrived); // sent counts cars, arrived counts spectators (PARTY a car)

const lanes = gateLanesFor(structures, prevTier);
const gateFlow = measureGateFlows(totalArrived, lanes);
const dayFacts: DayFacts = applyWeatherToDayFacts({
  onTime: gateFlow.onTime,
  late: gateFlow.late,
  missed,
  exitP95Min: gateFlow.exitP95Min,
  avgQueueMin: gateFlow.avgQueueMin,
  viewing: DEFAULT_VIEWING,
}, weather.condition);
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
 tentRentCost = tentEval.rentCost;
 tentUpkeep = tentEval.monthlyUpkeep;
}
  
 const satisfaction = applyWeatherToSatisfaction(
   Math.round(daySatisfaction(dayFacts)),
   weather.condition,
   hasFirstAidStructure(structures),
 );  
 const rep = Math.round(reputationAfter(prevRep, satisfaction));  
 const commercial = computeSponsorBreakdown(prevTier, rep, courseFacts.have);
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
  
 const multiDay = resolveMultiDayTournament({
   tier: prevTier,
   liveArrived: effectiveArrived,
   liveTents: tentRevenue,
   ticketPrice: tierInfo(prevTier).ticket,
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
 tentRevenue,
 tentRentCost,
 tentUpkeep,
 sponsorIncome: commercial.sponsorIncome,
 tvIncome: commercial.tvIncome,
 purse: commercial.purse,
 multiDay,
 weather,
 };
}  
