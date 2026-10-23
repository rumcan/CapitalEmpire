// Tests for golf town growth after each tournament (GOLF-PLAN section 8.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTY, TOWN_GROWTH } from '../src/game/event/config';
import type { RoundResult } from '../src/game/event/round';
import {
  GROWTH_PER_TIER,
  GROWTH_RATE_HIGH,
  GROWTH_RATE_LOW,
  GROWTH_RATE_MID,
  GROWTH_SAT_HIGH,
  GROWTH_SAT_MID,
  GROWTH_SAT_MIN,
  roundSatisfactionForGrowth,
  roundTownGrowthRate,
  townGrowthLine,
  townGrowthPercent,
  townGrowthRate,
  townGrowthTargets,
} from '../src/game/golf/towngrowth';
import type { CourseFacts, Need } from '../src/game/golf/tour';
import { computeYearEnd } from '../src/game/golf/yearend';
import { TOWN_POP } from '../src/game/lots/seedtowns';

function makeRoundResult(sent: number, arrived: number): RoundResult {
  const rate = sent > 0 ? arrived / (sent * PARTY) : 0;
  return {
    level: 1,
    run: 1,
    sent,
    arrived,
    rate,
    upkeep: 200,
    payout: 0,
    net: -200,
    prevRate: null,
    stuck: [],
    perfect: rate >= 0.9995,
    byTown: [],
  };
}

test('townGrowthRate: satisfaction thresholds at Tier 1 give 6% at 80%+, 3% at 60..80%, 1% at 50..60%, and 0% under 50%', () => {
  assert.equal(GROWTH_SAT_HIGH, 80);
  assert.equal(GROWTH_SAT_MID, 60);
  assert.equal(GROWTH_SAT_MIN, 50);
  assert.equal(GROWTH_RATE_HIGH, 0.06);
  assert.equal(GROWTH_RATE_MID, 0.03);
  assert.equal(GROWTH_RATE_LOW, 0.01);

  assert.equal(townGrowthRate(80, 0.9, 1, 50), 0.06);
  assert.equal(townGrowthRate(95, 1.0, 1, 80), 0.06);
  assert.equal(townGrowthRate(60, 0.75, 1, 45), 0.03);
  assert.equal(townGrowthRate(79, 0.85, 1, 60), 0.03);
  assert.equal(townGrowthRate(50, 0.6, 1, 30), 0.01);
  assert.equal(townGrowthRate(59, 0.6, 1, 30), 0.01);
  assert.equal(townGrowthRate(49, 0.9, 1, 80), 0);
  assert.equal(townGrowthRate(0, 1.0, 1, 100), 0);
});

test('townGrowthRate: adds 2% per tier step above Tier 1 when satisfaction >= 50%, and 0% under 50% at any tier', () => {
  assert.equal(GROWTH_PER_TIER, 0.02);

  // 80%+ satisfaction across tiers 1..5: 6%, 8%, 10%, 12%, 14%
  assert.equal(townGrowthRate({ satisfaction: 85, attendanceShare: 0.9, tier: 1, reputation: 50 }), 0.06);
  assert.equal(townGrowthRate({ satisfaction: 85, attendanceShare: 0.9, tier: 2, reputation: 60 }), 0.08);
  assert.equal(townGrowthRate({ satisfaction: 85, attendanceShare: 0.9, tier: 3, reputation: 70 }), 0.10);
  assert.equal(townGrowthRate({ satisfaction: 85, attendanceShare: 0.9, tier: 4, reputation: 80 }), 0.12);
  assert.equal(townGrowthRate({ satisfaction: 85, attendanceShare: 0.9, tier: 5, reputation: 90 }), 0.14);

  // 60..80% satisfaction across tiers 1..3: 3%, 5%, 7%
  assert.equal(townGrowthRate({ satisfaction: 68, attendanceShare: 0.7, tier: 1, reputation: 40 }), 0.03);
  assert.equal(townGrowthRate({ satisfaction: 68, attendanceShare: 0.7, tier: 2, reputation: 55 }), 0.05);
  assert.equal(townGrowthRate({ satisfaction: 68, attendanceShare: 0.7, tier: 3, reputation: 65 }), 0.07);

  // Under 50% satisfaction stays 0 even at high tiers
  assert.equal(townGrowthRate({ satisfaction: 45, attendanceShare: 0.9, tier: 5, reputation: 95 }), 0);
});

test('townGrowthRate: attendance share and reputation scale down low-turnout or low-reputation events and match across overloads', () => {
  assert.equal(townGrowthRate(90, 0, 2, 60), 0);
  assert.equal(townGrowthRate(90, 0.9, 2, 0), 0);

  // Half of MIN_ATTENDANCE_SHARE (0.175 vs 0.35) halves the 6% growth to 3%
  assert.equal(townGrowthRate(85, 0.175, 1, 50), 0.03);
  // Half of MIN_REPUTATION_FOR_FULL (10 vs 20) halves the 6% growth to 3%
  assert.equal(townGrowthRate(85, 0.8, 1, 10), 0.03);

  // Positional and object overloads return identical values
  assert.equal(
    townGrowthRate(82, 0.85, 3, 72),
    townGrowthRate({ satisfaction: 82, attendanceShare: 0.85, tier: 3, reputation: 72 }),
  );
});

test('townGrowthLine and townGrowthTargets format the results screen line and compute target populations', () => {
  assert.equal(townGrowthPercent(0.06), 6);
  assert.equal(townGrowthLine(0.06), 'The town grows 6%');
  assert.equal(townGrowthLine(0.03), 'The town grows 3%');
  assert.equal(townGrowthLine(0.08), 'The town grows 8%');
  assert.equal(townGrowthLine(0), '');

  assert.deepEqual(townGrowthTargets([TOWN_POP], 0.06), [TOWN_POP * 1.06]);
  assert.deepEqual(townGrowthTargets([1200], 0), [1200]);
  // Classic TOWN_GROWTH remains 25% (0.25)
  assert.equal(TOWN_GROWTH, 0.25);
});

test('computeYearEnd and roundTownGrowthRate wire golf town growth into YearEndResult and round evaluation', () => {
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']) };

  // High satisfaction Tier 1 tournament (100% arrival) -> 6% growth ("The town grows 6%")
  const highRound = makeRoundResult(100, 300);
  const yeHigh = computeYearEnd(1, 30, highRound, facts, 0, [], [], 'clear', 85);
  assert.ok(yeHigh.satisfaction >= 80, `expected satisfaction >= 80, got ${yeHigh.satisfaction}`);
  assert.equal(yeHigh.townGrowth, 0.06);
  assert.equal(yeHigh.townGrowthText, 'The town grows 6%');
  assert.equal(roundTownGrowthRate(highRound, 1, 30), 0.06);

  // Moderate satisfaction Tier 2 tournament -> 3% + 2% tier bonus = 5% growth
  const midRound = makeRoundResult(100, 135); // 45% arrival
  const midSat = roundSatisfactionForGrowth(midRound);
  assert.ok(midSat >= 60 && midSat < 80, `expected 60..79 satisfaction, got ${midSat}`);
  assert.equal(roundTownGrowthRate(midRound, 2, 55), 0.05);

  // Poor tournament (<50% satisfaction / 0 arrivals) -> 0% growth
  const zeroRound = makeRoundResult(100, 0);
  assert.equal(roundSatisfactionForGrowth(zeroRound), 0);
  assert.equal(roundTownGrowthRate(zeroRound, 1, 30), 0);
});

test('multi-year town growth progression from TOWN_POP scales single golf town without affecting classic TOWN_GROWTH', () => {
  let pop = [TOWN_POP];
  // Year 1: Tier 1, 84% satisfaction -> +6% (1000 -> 1060)
  const r1 = townGrowthRate({ satisfaction: 84, attendanceShare: 0.85, tier: 1, reputation: 45 });
  assert.equal(r1, 0.06);
  pop = townGrowthTargets(pop, r1).map(p => Math.round(p));
  assert.deepEqual(pop, [1060]);

  // Year 2: Tier 2, 72% satisfaction -> +5% (3% base + 2% tier 2) (1060 -> 1113)
  const r2 = townGrowthRate({ satisfaction: 72, attendanceShare: 0.75, tier: 2, reputation: 58 });
  assert.equal(r2, 0.05);
  pop = townGrowthTargets(pop, r2).map(p => Math.round(p));
  assert.deepEqual(pop, [1113]);

  // Year 3: Rain washout with 42% satisfaction -> 0% growth (stays 1113)
  const r3 = townGrowthRate({ satisfaction: 42, attendanceShare: 0.4, tier: 2, reputation: 50 });
  assert.equal(r3, 0);
  pop = townGrowthTargets(pop, r3).map(p => Math.round(p));
  assert.deepEqual(pop, [1113]);
});
