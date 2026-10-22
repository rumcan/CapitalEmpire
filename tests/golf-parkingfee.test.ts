// Tests for golf tournament parking fee demand multiplier and tournament close parking income (GOLF-PLAN sections 5.2, 7, and 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type DayIn } from '../src/game/budget';
import { PARTY } from '../src/game/event/config';
import type { RoundResult } from '../src/game/event/round';
import {
  DEFAULT_PARKING_FEE,
  PARKING_DEMAND_MAX,
  PARKING_DEMAND_MIN,
  PARKING_FEE_FREE,
  PARKING_FEE_HIGH,
  applyParkingFeeDemand,
  computeParkingIncome,
  countParkedCars,
  parkingDemandMultiplier,
} from '../src/game/golf/parkingfee';
import { dayShare, spectatorDemand, tierInfo, type CourseFacts, type Need } from '../src/game/golf/tour';
import { computeTournamentCloseBook, computeYearEnd } from '../src/game/golf/yearend';

function makeRoundResult(sent: number, arrived: number, tickets = 0, upkeep = 200, toll = 0): RoundResult {
  const rate = sent > 0 ? arrived / (sent * PARTY) : 0;
  return {
    level: 1,
    run: 1,
    sent,
    arrived,
    rate,
    upkeep,
    ...(toll ? { toll } : {}),
    ...(tickets ? { tickets } : {}),
    payout: 0,
    net: toll + tickets - upkeep,
    prevRate: null,
    stuck: [],
    perfect: rate >= 0.9995,
    byTown: [],
  };
}

function emptyDay(): DayIn {
  return {
    lots: [],
    segs: [],
    nodes: [],
    trade: { arrived: 0, punctual: 0 },
    pop: 1000,
  };
}

test('parkingDemandMultiplier falls linearly from 1.0 at $0 to 0.7 at $20 and clamps outside [0, 20]', () => {
  assert.equal(DEFAULT_PARKING_FEE, 5);
  assert.equal(PARKING_FEE_FREE, 0);
  assert.equal(PARKING_FEE_HIGH, 20);
  assert.equal(PARKING_DEMAND_MAX, 1.0);
  assert.equal(PARKING_DEMAND_MIN, 0.7);

  // Clamped below $0
  assert.equal(parkingDemandMultiplier(-10), 1.0);
  assert.equal(parkingDemandMultiplier(0), 1.0);

  // Linear interpolation across 0..20
  assert.equal(parkingDemandMultiplier(5), 0.925);
  assert.equal(parkingDemandMultiplier(10), 0.85);
  assert.equal(parkingDemandMultiplier(15), 0.775);
  assert.equal(parkingDemandMultiplier(20), 0.7);

  // Clamped above $20 (up to FEE_MAX = 50 and beyond)
  assert.equal(parkingDemandMultiplier(25), 0.7);
  assert.equal(parkingDemandMultiplier(50), 0.7);
});

test('applyParkingFeeDemand scales Day 1 tournament crowd in City.startTournament by fee multiplier', () => {
  const baseDay1 = Math.round(spectatorDemand(1, 30) * dayShare(0, tierInfo(1).days));
  const atFree = applyParkingFeeDemand(baseDay1, 0);
  const atDefault = applyParkingFeeDemand(baseDay1, DEFAULT_PARKING_FEE);
  const atTwenty = applyParkingFeeDemand(baseDay1, 20);
  const atFifty = applyParkingFeeDemand(baseDay1, 50);

  assert.equal(atFree, baseDay1);
  assert.equal(atDefault, Math.round(baseDay1 * 0.925));
  assert.equal(atTwenty, Math.round(baseDay1 * 0.7));
  assert.equal(atFifty, atTwenty);
  assert.ok(atFree > atDefault && atDefault > atTwenty);
  assert.equal(applyParkingFeeDemand(0, 10), 0);
});

test('countParkedCars and computeParkingIncome read parked cars from car parks, surge view, or town results', () => {
  assert.equal(
    countParkedCars(
      [{ parked: 45 }, { parked: 35 }],
      null,
      null,
    ),
    80,
  );
  assert.equal(
    countParkedCars(
      [],
      { parked: [50, 30] },
      [],
    ),
    80,
  );
  assert.equal(
    countParkedCars(
      null,
      null,
      [{ parked: 62 }, { parked: 18 }],
    ),
    80,
  );

  assert.equal(computeParkingIncome(80, DEFAULT_PARKING_FEE), 400);
  assert.equal(computeParkingIncome(80, 0), 0);
  assert.equal(computeParkingIncome(0, 15), 0);
});

test('computeYearEnd and computeTournamentCloseBook book parking income into bizIncome and keep shown Net equal to real treasury change', () => {
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']) };
  const carsParked = 90;
  const fee = 8;
  const round = makeRoundResult(100, 90 * PARTY, 1350, 250, 120);

  const ye = computeYearEnd(2, 55, round, facts, 0, [], [], 'clear', 85, [], carsParked, fee);
  assert.equal(ye.carsParked, 90);
  assert.equal(ye.parkingFee, 8);
  assert.equal(ye.parkingIncome, 720);

  const book = computeTournamentCloseBook(ye, round.tickets ?? 0, [], round.upkeep, round.toll ?? 0);
  assert.equal(book.parking, 720);
  assert.equal(
    book.bizIncome,
    (ye.tentRevenue ?? 0) + (ye.sponsorIncome ?? 0) + (ye.tvIncome ?? 0) + book.extraTickets + book.extraTents + book.greenFeeIncome + book.membershipIncome + book.parking,
  );

  // Verify shown Net equals exact real treasury change across live round + closeRound
  const budget = Budget.from(undefined, 100000);
  const startMoney = budget.money;
  budget.toll(round.toll ?? 0);
  budget.bizIncome(round.tickets ?? 0);
  budget.upkeepLive(round.upkeep);
  budget.spend('business', -book.bizIncome);
  budget.spend('upkeep', book.upkeepCost);

  const realTreasuryDelta = budget.money - startMoney;
  assert.equal(book.net, realTreasuryDelta, `shown Net (${book.net}) must equal real treasury change (${realTreasuryDelta})`);

  const ledger = budget.endDay(1, emptyDay());
  assert.equal(ledger.business, (round.tickets ?? 0) + book.bizIncome);
});
