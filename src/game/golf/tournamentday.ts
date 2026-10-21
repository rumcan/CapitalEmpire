// Pure tournament-day scorer (docs/GOLF-PLAN.md sections 2.2, 2.3, 5.1-5.5, 7 and 8.1): from gate and car park arrival/exit counts to DayFacts, daySatisfaction, money lines, and reputationAfter. Pure TS, no DOM.
import { daySatisfaction, reputationAfter, tierInfo, type DayFacts } from './tour';
import { gateQueue, gateRate, viewingScore, type GateQueue } from './venue';

/** grace period after planned arrival before a spectator is counted as late (minutes, GOLF-PLAN 5.4) */
export const ON_TIME_GRACE_MIN = 45;

/** average spectators per parked car (GOLF-PLAN 5.6) */
export const SPECTATORS_PER_CAR = 2.5;

/** staff and volunteer cost per admitted spectator by tier 1..5 ($, GOLF-PLAN 7) */
export const STAFF_COST_PER_SPECTATOR = [1, 1.5, 2, 2.5, 3] as const;

/** one entrance gate's minute-by-minute arrival flow for the tournament day */
export interface GateFlowInput {
  /** number of open lanes at this gate */
  lanes: number;
  /** spectators reaching the back of this gate's queue each minute */
  arrivalsPerMinute: number[];
  /** average traffic delay before reaching the gate (minutes; default 0) */
  trafficDelayMin?: number;
  /** optional explicit on-time count override for this gate */
  onTime?: number;
  /** optional explicit late count override for this gate */
  late?: number;
}

/** one car park's daily counts and exit durations */
export interface CarparkFlowInput {
  /** cars admitted and parked during the day */
  carsParked: number;
  /** cars turned away because the car park was full (each car represents partySize spectators) */
  carsTurnedAway?: number;
  /** fee charged per parked car ($; uses day parkingFee when omitted) */
  feePerCar?: number;
  /** exit travel durations (minutes from leaving the gates to clearing the road network) */
  exitTimesMin?: number[];
}

/** complete inputs for scoring a tournament day */
export interface TournamentDayInput {
  tier: number;
  reputation: number;
  gates: readonly GateFlowInput[];
  carparks: readonly CarparkFlowInput[];
  expressGates?: boolean;
  /** spectators who gave up after >90 minutes in traffic on the road network */
  trafficMissed?: number;
  /** party size per car for turned-away cars (default SPECTATORS_PER_CAR = 2.5) */
  partySize?: number;
  /** optional additional exit times (minutes) for non-car modes (shuttles, walkers, coaches) */
  otherExitTimesMin?: readonly number[];
  /** optional fallback exit P95 (minutes) when no exit time samples are supplied (default 30) */
  defaultExitP95Min?: number;
  /** optional tent/toilet/shuttle queue average (minutes) blended with gate queue wait */
  otherQueueMin?: number;
  /** grandstand seats available at featured holes */
  grandstandSeats?: number;
  /** metres of rope line along featured holes */
  ropeMetres?: number;
  /** optional direct viewing score override (0..1) */
  viewingOverride?: number;
  /** ticket price override ($; defaults to tierInfo(tier).ticket) */
  ticketPrice?: number;
  /** default parking fee per car ($; default 0) */
  parkingFee?: number;
  /** net or gross tent & merchandise takings placeholder ($) */
  tents?: number;
  /** sponsor money credited on this day ($; default 0) */
  sponsors?: number;
  /** TV money credited on this day ($; default 0) */
  tv?: number;
  /** purse and sanctioning cost charged on this day ($; defaults to tierInfo(tier).purse) */
  purse?: number;
  /** rented structure cost charged on this day ($; default 0) */
  rent?: number;
  /** staff cost override ($; defaults to admitted * STAFF_COST_PER_SPECTATOR) */
  staff?: number;
  /** road/course upkeep charged on this day ($; default 0) */
  upkeep?: number;
}

/** money lines for the tournament day results screen (GOLF-PLAN 2.3 and 7) */
export interface TournamentDayMoney {
  tickets: number;
  parking: number;
  tents: number;
  sponsors: number;
  tv: number;
  refunds: number;
  purse: number;
  rent: number;
  staff: number;
  upkeep: number;
  net: number;
}

/** scored tournament day output */
export interface TournamentDayScore {
  facts: DayFacts;
  satisfaction: number;
  reputationAfter: number;
  admitted: number;
  gateQueues: GateQueue[];
  money: TournamentDayMoney;
}

/** 95th-percentile value of a numeric sample list (returns fallback when empty) */
export function percentile95(values: readonly number[], fallback = 30): number {
  if (!values.length) return fallback;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx]!;
}

/** score a single gate's FIFO queue, on-time count, and late count (grace period ON_TIME_GRACE_MIN = 45 min) */
export function scoreGateFlow(g: GateFlowInput, express = false): { queue: GateQueue; onTime: number; late: number; total: number } {
  const q = gateQueue(g.arrivalsPerMinute, g.lanes, express);
  const rate = gateRate(g.lanes, express);
  const delay = Math.max(0, g.trafficDelayMin ?? 0);
  let runningQ = 0, onTime = 0, late = 0, total = 0;
  for (const a of g.arrivalsPerMinute) {
    if (a > 0) {
      runningQ += a;
      const wait = rate > 0 ? runningQ / rate : Infinity;
      if (delay + wait <= ON_TIME_GRACE_MIN) onTime += a;
      else late += a;
      total += a;
    }
    runningQ = Math.max(0, runningQ - rate);
  }
  if (g.onTime !== undefined || g.late !== undefined) {
    onTime = g.onTime ?? Math.max(0, total - (g.late ?? 0));
    late = g.late ?? Math.max(0, total - onTime);
    total = onTime + late;
  }
  return { queue: q, onTime: Math.round(onTime), late: Math.round(late), total: Math.round(total) };
}

/** score a full tournament day from gate flows, car park flows, viewing capacity, and financial inputs */
export function scoreTournamentDay(input: TournamentDayInput): TournamentDayScore {
  const tInfo = tierInfo(input.tier);
  const express = Boolean(input.expressGates);
  const gateQueues: GateQueue[] = [];
  let onTime = 0, late = 0, admitted = 0, weightedWait = 0;
  for (const g of input.gates) {
    const res = scoreGateFlow(g, express);
    gateQueues.push(res.queue);
    onTime += res.onTime;
    late += res.late;
    admitted += res.total;
    weightedWait += res.total * res.queue.avgWaitMin;
  }
  const gateAvgWait = admitted > 0 ? weightedWait / admitted : 0;
  const avgQueueMin = input.otherQueueMin !== undefined ? 0.5 * (gateAvgWait + Math.max(0, input.otherQueueMin)) : gateAvgWait;

  const party = input.partySize ?? SPECTATORS_PER_CAR;
  let turnedAwayCars = 0, parking = 0;
  const exitSamples: number[] = [];
  for (const cp of input.carparks) {
    turnedAwayCars += Math.max(0, cp.carsTurnedAway ?? 0);
    const fee = cp.feePerCar ?? input.parkingFee ?? 0;
    parking += Math.round(Math.max(0, cp.carsParked) * fee);
    if (cp.exitTimesMin) exitSamples.push(...cp.exitTimesMin);
  }
  if (input.otherExitTimesMin) exitSamples.push(...input.otherExitTimesMin);

  const missed = Math.round(Math.max(0, input.trafficMissed ?? 0) + turnedAwayCars * party);
  const exitP95Min = percentile95(exitSamples, input.defaultExitP95Min ?? 30);
  const viewing = input.viewingOverride !== undefined
    ? Math.min(1, Math.max(0, input.viewingOverride))
    : viewingScore({ seats: input.grandstandSeats ?? 0, ropeM: input.ropeMetres ?? 0, spectators: admitted });

  const facts: DayFacts = { onTime, late, missed, exitP95Min, avgQueueMin, viewing };
  const satisfaction = daySatisfaction(facts);
  const nextRep = reputationAfter(input.reputation, satisfaction);

  const ticketUnit = input.ticketPrice ?? tInfo.ticket;
  const tickets = Math.round(admitted * ticketUnit);
  const refunds = Math.round(missed * ticketUnit);
  const tents = Math.round(input.tents ?? 0);
  const sponsors = Math.round(input.sponsors ?? 0);
  const tv = Math.round(input.tv ?? 0);
  const purse = Math.round(input.purse ?? tInfo.purse);
  const rent = Math.round(input.rent ?? 0);
  const staffRate = STAFF_COST_PER_SPECTATOR[tInfo.tier - 1] ?? 1;
  const staff = Math.round(input.staff ?? admitted * staffRate);
  const upkeep = Math.round(input.upkeep ?? 0);
  const net = tickets + parking + tents + sponsors + tv - refunds - purse - rent - staff - upkeep;

  return {
    facts,
    satisfaction,
    reputationAfter: nextRep,
    admitted,
    gateQueues,
    money: { tickets, parking, tents, sponsors, tv, refunds, purse, rent, staff, upkeep, net },
  };
}
