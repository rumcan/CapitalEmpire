// Tests that computeTournamentCloseBook itemizes all closeRound revenues and costs and that EvalScreen Net equals the real season treasury change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget } from '../src/game/budget';
import { BUSINESS } from '../src/game/business/catalogue';
import { PARTY } from '../src/game/event/config';
import type { RoundResult } from '../src/game/event/round';
import { courseMonthlyUpkeep } from '../src/game/golf/costs';
import { BOUGHT_MONTHLY_UPKEEP_RATE, type PlacedEventStructure } from '../src/game/golf/eventtool';
import { STRUCTURE } from '../src/game/golf/tents';
import { tierInfo, type CourseFacts, type Need } from '../src/game/golf/tour';
import {
  COURSE_UPKEEP_YEAR_SHARE,
  OFF_SEASON_PLAY_DAYS,
  annualMembershipIncome,
  computeTournamentCloseBook,
  computeYearEnd,
  greenFeeIncome,
} from '../src/game/golf/yearend';

test('computeTournamentCloseBook itemizes purse, tent rent, tent upkeep, and course upkeep with net matching booked closeDelta', () => {
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'kiosk', x: 10, y: 0, mode: 'rent' },
    { id: 3, typeId: 'toilets', x: 20, y: 0, mode: 'buy' },
  ];
  const courseAreas = [
    { pts: [0, 0, 200, 0, 200, 200, 0, 200], surface: 'rough' as const },
    { pts: [0, 0, 40, 0, 40, 40, 0, 40], surface: 'green' as const },
  ];
  const roundResult: RoundResult = {
    level: 1,
    run: 1,
    sent: 100,
    arrived: 100 * PARTY,
    rate: 1,
    upkeep: 0,
    tickets: 0,
    payout: 0,
    net: 0,
    prevRate: null,
    stuck: [],
    perfect: true,
    byTown: [],
  };
  const facts: CourseFacts = {
    holes: 9,
    lengthM: 2800,
    have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']),
  };

  const ye = computeYearEnd(1, 30, roundResult, facts, 0, structures, [], 'clear', 85);
  const book = computeTournamentCloseBook(ye, roundResult.tickets ?? 0, courseAreas, roundResult.upkeep, roundResult.toll ?? 0);

  const expectedGreenFees = greenFeeIncome(85, 30, 9);
  const expectedMemberships = annualMembershipIncome(85, 30, 9);
  const expectedPurse = tierInfo(1).purse;
  const expectedRent = STRUCTURE.kiosk!.rent;
  const expectedTentUpkeep = (Math.round(STRUCTURE.gate!.buy * BOUGHT_MONTHLY_UPKEEP_RATE) + Math.round(STRUCTURE.toilets!.buy * BOUGHT_MONTHLY_UPKEEP_RATE)) * 12;
  const expectedCourseUpkeep = Math.round(courseMonthlyUpkeep(courseAreas) * 12 * COURSE_UPKEEP_YEAR_SHARE);

  assert.equal(book.greenFeeIncome, expectedGreenFees);
  assert.equal(book.membershipIncome, expectedMemberships);
  assert.equal(book.purse, expectedPurse);
  assert.equal(book.rent, expectedRent);
  assert.equal(book.annualTentUpkeep, expectedTentUpkeep);
  assert.equal(book.annualCourseUpkeep, expectedCourseUpkeep);
  assert.equal(book.upkeepCost, expectedPurse + expectedRent + expectedTentUpkeep + expectedCourseUpkeep);
  assert.equal(book.closeDelta, book.bizIncome - book.upkeepCost);
  assert.equal(book.net, book.closeDelta, 'with 0 live-day items, shown Net must equal closeRound booked delta');
});

test('shown season Net equals real Budget treasury change across kickOff live items and closeRound bookings', () => {
  const budget = Budget.from(undefined, 600000);
  const startMoney = budget.money;

  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'drinksTent', x: 10, y: 0, mode: 'rent' },
    { id: 3, typeId: 'merchTent', x: 20, y: 0, mode: 'buy' },
  ];
  const courseAreas = [
    { pts: [0, 0, 300, 0, 300, 200, 0, 200], surface: 'rough' as const },
  ];

  // Simulate Tier 2 tournament with live Day 1 tickets, tolls, and road upkeep
  const liveArrived = 300;
  const liveTickets = liveArrived * tierInfo(2).ticket;
  const liveToll = 450;
  const liveUpkeep = 1200;

  // Book live-day items just as City.step and City.kickOff do
  budget.toll(liveToll);
  budget.bizIncome(liveTickets);
  budget.spend('upkeep', liveUpkeep);

  const roundResult: RoundResult = {
    level: 1,
    run: 3,
    sent: 100,
    arrived: liveArrived,
    rate: 1,
    upkeep: liveUpkeep,
    toll: liveToll,
    tickets: liveTickets,
    payout: 0,
    net: liveToll + liveTickets - liveUpkeep,
    prevRate: null,
    stuck: [],
    perfect: true,
    byTown: [],
  };
  const facts: CourseFacts = {
    holes: 18,
    lengthM: 5800,
    have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets', 'leaderboard', 'merchTent', 'parkRide', 'range']),
  };

  const ye = computeYearEnd(2, 60, roundResult, facts, 0, structures, [], 'clear', 90);
  const book = computeTournamentCloseBook(ye, roundResult.tickets ?? 0, courseAreas, roundResult.upkeep, roundResult.toll ?? 0);

  // Book closeRound entries exactly as Game.closeRound does
  if (book.bizIncome > 0) budget.spend('business', -book.bizIncome);
  if (book.upkeepCost > 0) budget.spend('upkeep', book.upkeepCost);

  const realTreasuryChange = budget.money - startMoney;
  const itemizedSum =
    book.toll +
    book.greenFeeIncome +
    book.membershipIncome +
    book.tickets +
    book.tents +
    book.sponsors +
    book.tv -
    book.purse -
    book.rent -
    book.annualTentUpkeep -
    book.annualCourseUpkeep -
    book.liveUpkeep;

  assert.equal(book.net, itemizedSum, 'book.net must equal the sum of all itemized income and cost lines');
  assert.equal(book.net, realTreasuryChange, 'shown EvalScreen Net must equal the real treasury change of the season');
  assert.equal(
    book.greenFeeIncome % (BUSINESS.clubhouse.pricePerVisitor * OFF_SEASON_PLAY_DAYS),
    0,
    'green fees must be an exact multiple of clubhouse visitor price x off-season play days',
  );
});
