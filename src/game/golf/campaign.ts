// Multi-year golf campaign simulation (docs/GOLF-PLAN.md sections 2.1, 5.1, 7, and 8.1-8.2). Pure TS, no DOM.
import { PARTY } from '../event/config';
import type { RoundResult } from '../event/round';
import type { PlacedEventStructure } from './eventtool';
import { dayShare, spectatorDemand, tierInfo, verdict, type CourseFacts, type Need } from './tour';
import { computeYearEnd } from './yearend';

/** configuration options for running a multi-year campaign simulation */
export interface CampaignOptions {
  years?: number;
  startTreasury?: number;
  startTier?: number;
  startReputation?: number;
  arrivalFraction?: number;
  strategy?: 'careful' | 'careless';
  courseUpkeep9Year?: number;
  courseUpkeep18Year?: number;
}

/** annual report for one year of the campaign */
export interface YearReport {
  year: number;
  tier: number;
  reputation: number;
  satisfaction: number;
  treasury: number;
  offered: number | null;
  admitted: number;
  ticketIncome: number;
  tentRevenue: number;
  sponsorIncome: number;
  totalIncome: number;
  purseCost: number;
  tentCost: number;
  courseUpkeep: number;
  totalCost: number;
  net: number;
  bought: string[];
}

/** overall result of a multi-year campaign run */
export interface CampaignResult {
  strategy: 'careful' | 'careless';
  reachedTier3: boolean;
  yearsToTier3: number | null;
  stayedSolvent: boolean;
  minTreasury: number;
  finalTier: number;
  finalReputation: number;
  finalTreasury: number;
  history: YearReport[];
}

/**
 * Simulate a multi-year campaign under a CAREFUL or CARELESS strategy.
 *
 * CAREFUL strategy buys the required structures for the next tier and expands the course,
 * advancing from Tier 1 to Tier 3 while staying solvent.
 * CARELESS strategy builds nothing, remaining stuck at Tier 1 with 0 tier offers.
 */
export function simulateCampaign(opts: CampaignOptions = {}): CampaignResult {
  const years = opts.years ?? 8;
  const strategy = opts.strategy ?? 'careful';
  const arrivalFraction = opts.arrivalFraction ?? (strategy === 'careful' ? 0.6 : 0.35);
  const courseUpkeep9Year = opts.courseUpkeep9Year ?? 36000;
  const courseUpkeep18Year = opts.courseUpkeep18Year ?? 60000;

  let treasury = opts.startTreasury ?? 600000;
  let tier = opts.startTier ?? 1;
  let reputation = opts.startReputation ?? 30;
  let poorYears = 0;
  let minTreasury = treasury;
  let yearsToTier3: number | null = null;

  const placed: PlacedEventStructure[] = [];
  let courseHoles = 9;
  let courseLength = 3000;

  const history: YearReport[] = [];

  for (let yr = 1; yr <= years; yr++) {
    const boughtThisYear: string[] = [];

    // Capital expenditure phase
    if (strategy === 'careful') {
      if (tier === 1) {
        if (!placed.some(s => s.typeId === 'gate')) {
          treasury -= 20000; boughtThisYear.push('gate');
          treasury -= 15000; boughtThisYear.push('foodTent');
          treasury -= 6000; boughtThisYear.push('toilets');
          placed.push(
            { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
            { id: 2, typeId: 'foodTent', x: 10, y: 10, mode: 'buy' },
            { id: 3, typeId: 'toilets', x: 20, y: 20, mode: 'buy' },
          );
        }
      } else if (tier === 2) {
        if (courseHoles < 18) {
          courseHoles = 18;
          courseLength = 6000;
          treasury -= 60000;
          boughtThisYear.push('18-hole-expansion');
        }
        if (!placed.some(s => s.typeId === 'leaderboard')) {
          treasury -= 25000; boughtThisYear.push('leaderboard');
          treasury -= 40000; boughtThisYear.push('merchTent');
          treasury -= 30000; boughtThisYear.push('rangeStand');
          treasury -= 10000; boughtThisYear.push('rideshare');
          placed.push(
            { id: 4, typeId: 'leaderboard', x: 30, y: 30, mode: 'buy' },
            { id: 5, typeId: 'merchTent', x: 40, y: 40, mode: 'buy' },
            { id: 6, typeId: 'rangeStand', x: 50, y: 50, mode: 'buy' },
            { id: 7, typeId: 'rideshare', x: 60, y: 60, mode: 'buy' },
            { id: 8, typeId: 'standS', x: 70, y: 70, mode: 'rent' },
          );
        }
      }
    }

    if (tier >= 3 && yearsToTier3 === null) {
      yearsToTier3 = yr;
    }

    // Tournament simulation (Day 1 live crowd scaled by dayShare(0, tDays); subsequent days resolved in computeYearEnd.multiDay)
    const tDays = tierInfo(tier).days;
    const demand = Math.round(spectatorDemand(tier, reputation) * dayShare(0, tDays));
    const arrived = Math.round(demand * arrivalFraction);
    const sent = Math.ceil(demand / PARTY);

    const roundResult: RoundResult = {
      level: 1,
      run: yr,
      sent,
      arrived,
      rate: arrived / (sent * PARTY),
      upkeep: 0,
      payout: 0,
      net: 0,
      prevRate: null,
      stuck: [],
      perfect: false,
      byTown: [],
    };

    const have = new Set<Need>(['carpark']);
    for (const s of placed) {
      if (s.typeId === 'gate') have.add('gate');
      if (s.typeId === 'foodTent') have.add('foodTent');
      if (s.typeId === 'toilets') have.add('toilets');
      if (s.typeId === 'leaderboard') have.add('leaderboard');
      if (s.typeId === 'merchTent') have.add('merchTent');
      if (s.typeId === 'rangeStand') have.add('range');
      if (s.typeId === 'standS') have.add('grandstand18');
      if (s.typeId === 'rideshare') have.add('parkRide');
    }

    const facts: CourseFacts = { holes: courseHoles, lengthM: courseLength, have };
    const ye = computeYearEnd(tier, reputation, roundResult, facts, poorYears, placed, []);

    // Daily and multi-day financial flows (from multiDay resolution when available)
    const ticketIncome = ye.multiDay ? ye.multiDay.totalTickets : arrived * tierInfo(tier).ticket * tDays;
    const tentRevenue = ye.multiDay ? ye.multiDay.totalTents : (ye.tentRevenue ?? 0) * tDays;
    const sponsorIncome = ye.sponsorIncome ?? 0;
    const totalIncome = ticketIncome + tentRevenue + sponsorIncome;

    const purseCost = ye.purse ?? tierInfo(tier).purse;
    const tentRent = ye.tentRentCost ?? 0;
    const tentAnnualUpkeep = (ye.tentUpkeep ?? 0) * 12;
    const courseAnnualUpkeep = courseHoles >= 18 ? courseUpkeep18Year : courseUpkeep9Year;
    const totalCosts = purseCost + tentRent + tentAnnualUpkeep + courseAnnualUpkeep;

    treasury += (totalIncome - totalCosts);
    if (treasury < minTreasury) {
      minTreasury = treasury;
    }

    const v = verdict(tier, ye.rep, facts, poorYears);
    let nextTier = tier;
    if (v.offer !== null) {
      nextTier = v.offer;
      poorYears = 0;
    } else if (v.demote) {
      nextTier = Math.max(1, tier - 1);
      poorYears = 0;
    } else if (v.poor) {
      poorYears += 1;
    } else {
      poorYears = 0;
    }

    history.push({
      year: yr,
      tier,
      reputation: ye.rep,
      satisfaction: ye.satisfaction,
      treasury: Math.round(treasury),
      offered: v.offer,
      admitted: arrived,
      ticketIncome,
      tentRevenue,
      sponsorIncome,
      totalIncome,
      purseCost,
      tentCost: tentRent + tentAnnualUpkeep,
      courseUpkeep: courseAnnualUpkeep,
      totalCost: totalCosts,
      net: totalIncome - totalCosts,
      bought: boughtThisYear,
    });

    tier = nextTier;
    reputation = ye.rep;
  }

  if (tier >= 3 && yearsToTier3 === null) {
    yearsToTier3 = years;
  }

  return {
    strategy,
    reachedTier3: tier >= 3 || yearsToTier3 !== null,
    yearsToTier3,
    stayedSolvent: minTreasury >= 0,
    minTreasury: Math.round(minTreasury),
    finalTier: tier,
    finalReputation: reputation,
    finalTreasury: Math.round(treasury),
    history,
  };
}
