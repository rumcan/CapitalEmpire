import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Budget, type DayIn } from '../src/game/budget';
import { BUSINESS, dailyDemand } from '../src/game/business/catalogue';
import { freshStats } from '../src/game/business/state';
import { Visits, type VisitBiz, type VisitHome } from '../src/game/business/visits';
import type { RoundResult } from '../src/game/event/round';
import type { CourseFacts, Need } from '../src/game/golf/tour';
import {
  COURSE_UPKEEP_YEAR_SHARE,
  GREEN_FEE_PER_ROUND,
  OFF_SEASON_PLAY_DAYS,
  dailyGolfers,
  greenFeeIncome,
  legacyMonthlyMembership,
  annualMembershipIncome,
  computeYearEnd,
  computeTournamentCloseBook,
} from '../src/game/golf/yearend';
import { simulateCampaign } from '../src/game/golf/campaign';

function makeRound(sent: number, arrived: number, tickets = 0): RoundResult {
  return {
    level: 1,
    run: 1,
    sent,
    arrived,
    rate: sent > 0 ? arrived / (sent * 3) : 0,
    upkeep: 400,
    tickets,
    payout: 0,
    net: tickets - 400,
    prevRate: null,
    stuck: [],
    perfect: false,
    byTown: [],
  };
}

function emptyDay(): DayIn {
  return {
    lots: [],
    segs: [],
    nodes: [],
    trade: { arrived: 0, punctual: 0 },
    pop: 1200,
  };
}

test('Clubhouse visit business plans golfer visits when its head-on road door is resolved', () => {
  const stats = freshStats(1);
  assert.equal(BUSINESS.clubhouse.kind, 'visit');
  assert.equal(BUSINESS.clubhouse.pricePerVisitor, GREEN_FEE_PER_ROUND);
  assert.ok(dailyDemand(BUSINESS.clubhouse, 1, [{ pop: 1200, tripMin: 6 }], 0.7) > 0);

  // Without a resolved door (the pre-fix head-on gravel drive bug), Visits.plan schedules 0 cars
  const visitsNoDoor = new Visits();
  const homes: VisitHome[][] = [[{ lot: null, town: 0, pop: 1200, drive: { lane: 0, s: 10 } }]];
  const vbNoDoor: VisitBiz[] = [{ id: 1, type: BUSINESS.clubhouse, level: stats.level, sat: stats.sat, door: null, tripMin: [6] }];
  visitsNoDoor.plan(0, 7 * 60, vbNoDoor, homes, [1200], () => 0.5, 1);
  assert.equal(visitsNoDoor.counts(1).planned, 0);

  // With the head-on road door resolved, Visits.plan schedules golfer cars during 07:00..19:00
  const visitsWithDoor = new Visits();
  const vbWithDoor: VisitBiz[] = [{ id: 1, type: BUSINESS.clubhouse, level: stats.level, sat: stats.sat, door: { dseg: 0, s: 20 }, tripMin: [6] }];
  visitsWithDoor.plan(0, 7 * 60, vbWithDoor, homes, [1200], () => 0.5, 1);
  assert.ok(visitsWithDoor.counts(1).planned > 0, 'resolved clubhouse door should schedule golfer cars');
});

test('dailyGolfers, greenFeeIncome, and legacyMonthlyMembership scale with course quality, reputation, and holes', () => {
  assert.equal(GREEN_FEE_PER_ROUND, BUSINESS.clubhouse.pricePerVisitor);
  assert.equal(OFF_SEASON_PLAY_DAYS, 24);

  const lowQ = dailyGolfers(25, 30, 9);
  const highQ = dailyGolfers(100, 30, 9);
  const highRep = dailyGolfers(100, 60, 9);
  const full18 = dailyGolfers(100, 60, 18);
  assert.ok(highQ > lowQ, `expected high quality (${highQ}) > low quality (${lowQ})`);
  assert.ok(highRep > highQ, `expected high rep (${highRep}) > start rep (${highQ})`);
  assert.ok(full18 > highRep, `expected 18 holes (${full18}) > 9 holes (${highRep})`);

  assert.equal(greenFeeIncome(100, 30, 9), highQ * BUSINESS.clubhouse.pricePerVisitor * OFF_SEASON_PLAY_DAYS);

  const memStart = legacyMonthlyMembership(100, 30, 9);
  const memGrow = legacyMonthlyMembership(100, 56, 9);
  assert.ok(memStart >= 700, `expected starting monthly membership >= $700, got ${memStart}`);
  assert.ok(memGrow > memStart, `expected growing rep membership (${memGrow}) > start (${memStart})`);
  assert.equal(annualMembershipIncome(100, 30, 9), memStart * 12);
});

test('computeYearEnd and computeTournamentCloseBook book Green fees and Memberships into Ledger.business', () => {
  const facts: CourseFacts = { holes: 9, lengthM: 3000, have: new Set<Need>(['carpark']) };
  const ye = computeYearEnd(1, 30, makeRound(150, 300), facts, 0, [], [], 'clear', 100);
  const book = computeTournamentCloseBook(ye, 0, []);

  const expectedGreenFees = greenFeeIncome(100, 30, 9);
  const expectedMemberships = annualMembershipIncome(100, 30, 9);
  assert.equal(ye.greenFeeIncome, expectedGreenFees);
  assert.equal(ye.membershipIncome, expectedMemberships);
  assert.equal(book.greenFeeIncome, expectedGreenFees);
  assert.equal(book.membershipIncome, expectedMemberships);
  assert.equal(book.bizIncome, expectedGreenFees + expectedMemberships);
  assert.equal(COURSE_UPKEEP_YEAR_SHARE, 0.2); // (T269: 0.25 before the grounds crew's wages were their own monthly line, golf/staff.ts)

  const b = new Budget();
  b.spend('business', -book.bizIncome);
  b.spend('upkeep', book.upkeepCost);
  const ledger = b.endDay(1, emptyDay());
  assert.equal(ledger.business, expectedGreenFees + expectedMemberships);
});

test('careful club loses modestly in year 1 and roughly breaks even by year 3 using shared green fee and membership functions', () => {
  const careful = simulateCampaign({ strategy: 'careful', arrivalFraction: 0.60, years: 8 });
  const y1 = careful.history[0]!;
  const y2 = careful.history[1]!;
  const y3 = careful.history[2]!;

  assert.ok(y1.greenFeeIncome > 0 && y1.membershipIncome > 0);
  assert.ok(y1.net < 0, `year 1 should still run a small deficit (${y1.net})`);
  assert.ok(y2.net > y1.net, `year 2 net (${y2.net}) should improve over year 1 (${y1.net})`);

  const t1Yr3Income = greenFeeIncome(100, y2.reputation, 9) + annualMembershipIncome(100, y2.reputation, 9);
  const t1Yr3Upkeep = 36000 + 2000;
  assert.ok(Math.abs(t1Yr3Income - t1Yr3Upkeep) <= 5000, `tier 1 club at year 3 rep should roughly break even: income=${t1Yr3Income} vs upkeep=${t1Yr3Upkeep}`);
  assert.ok(y3.net >= -5000, `year 3 campaign net (${y3.net}) should roughly break even or turn positive`);
  assert.equal(careful.stayedSolvent, true);
});
