// Year-end tournament evaluation, satisfaction, reputation shift, and tier progression (docs/GOLF-PLAN.md sections 5.4 and 8.1-8.2). Pure TS, no DOM.  
import type { RoundResult } from '../event/round';
import { PARTY } from '../event/config';
import { evaluateEventToolDay, type PlacedEventStructure } from './eventtool';
import type { Hole } from './holes';
import { daySatisfaction, reputationAfter, tierInfo, verdict, type CourseFacts, type DayFacts } from './tour';
  
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
}
  
/**  
 * Compute year-end satisfaction, reputation update, and tier promotion/demotion.  
 *  
 * Arrival rate determines on-time arrivals; exit time, gate queue, and viewing use sensible defaults  
 * (35m exit P95, 5m average queue, 0.85 viewing satisfaction) until dedicated structures are placed.  
 */  
export function computeYearEnd(
prevTier: number,
prevRep: number,
roundResult: RoundResult,
courseFacts: CourseFacts,
prevPoorYears = 0,
structures: readonly PlacedEventStructure[] = [],
holes: readonly Hole[] = [],
): YearEndResult {
const onTime = roundResult.arrived;
const missed = Math.max(0, roundResult.sent * PARTY - roundResult.arrived); // sent counts cars, arrived counts spectators (PARTY a car)

let tentRevenue = 0;
let tentRentCost = 0;
let tentUpkeep = 0;
let avgQueueMin = DEFAULT_AVG_QUEUE_MIN;
let viewing = DEFAULT_VIEWING;

if (structures.length > 0) {
 const tentEval = evaluateEventToolDay({
 placed: structures,
 holes,
 gates: [],
 tier: prevTier,
 spectators: onTime,
 });
 tentRevenue = tentEval.totalRevenue;
 tentRentCost = tentEval.rentCost;
 tentUpkeep = tentEval.monthlyUpkeep;
 if (tentEval.avgQueueMin > 0) avgQueueMin = Math.round(tentEval.avgQueueMin);
}

const dayFacts: DayFacts = {
onTime,
late: 0,
missed,
exitP95Min: DEFAULT_EXIT_P95_MIN,
avgQueueMin,
viewing,
};
  
 const satisfaction = Math.round(daySatisfaction(dayFacts));  
 const rep = Math.round(reputationAfter(prevRep, satisfaction));  
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
 };
}  
