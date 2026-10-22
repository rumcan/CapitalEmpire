// Tests for golf tournament year-end satisfaction, reputation update, and tier progression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeYearEnd, DEFAULT_AVG_QUEUE_MIN, DEFAULT_EXIT_P95_MIN, DEFAULT_VIEWING } from '../src/game/golf/yearend';
import type { CourseFacts } from '../src/game/golf/tour';
import type { RoundResult } from '../src/game/event/round';
import { PARTY } from '../src/game/event/config';

/** a result of a day that expected `sent` spectators (cars are sent at PARTY a car), of whom `arrived` got in */
function makeMockResult(sent: number, arrived: number): RoundResult {
  return {
    level: 1,
    run: 1,
    sent: Math.ceil(sent / PARTY),
    arrived,
    rate: arrived / sent,
    upkeep: 2000,
    payout: 50000,
    net: 48000,
    prevRate: null,
    stuck: [],
    perfect: arrived === sent,
    byTown: [],
  };
}

test('computeYearEnd with high arrival rate promotes to Tier 2 when course needs are satisfied', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark', 'gate', 'foodTent', 'toilets']),
  };

  const res = computeYearEnd(1, 55, makeMockResult(500, 500), courseFacts, 0);

  assert.ok(res.satisfaction >= 85, `satisfaction should be high: ${res.satisfaction}`);
  assert.ok(res.rep >= 55, `reputation should meet tier 2 threshold: ${res.rep}`);
  assert.equal(res.tier, 2, 'should promote to Tier 2');
  assert.equal(res.prevTier, 1);
  assert.equal(res.poorYears, 0);
  assert.equal(res.verdictText, 'Offered County Amateur next year');
});

test('computeYearEnd stays at current tier when course lacks next tier requirements', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']), // Missing gate, foodTent, toilets
  };

  const res = computeYearEnd(1, 55, makeMockResult(500, 500), courseFacts, 0);

  assert.equal(res.tier, 1, 'should remain at Tier 1 due to missing requirements');
  assert.equal(res.verdictText, 'Stay at Maple Falls Club Championship');
});

test('computeYearEnd demotes on second consecutive poor year when above Tier 1', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark', 'gate', 'foodTent', 'toilets']),
  };

  // Tier 2 reputation threshold is 55. Poor threshold is 55 - 15 = 40.
  // With 0 arrivals out of 500, satisfaction is ~40%, reputation drops below 40.
  const poorResult = makeMockResult(500, 0);

  // Year 1: poor year 1, no demotion yet
  const year1 = computeYearEnd(2, 5, poorResult, courseFacts, 0);
  assert.equal(year1.tier, 2, 'should stay at Tier 2 after 1 poor year');
  assert.equal(year1.poorYears, 1);
  assert.equal(year1.verdictText, 'Stay at County Amateur');

  // Year 2: second consecutive poor year -> demotion
  const year2 = computeYearEnd(2, year1.rep, poorResult, courseFacts, year1.poorYears);
  assert.equal(year2.tier, 1, 'should demote to Tier 1 after 2 consecutive poor years');
  assert.equal(year2.poorYears, 0);
  assert.equal(year2.verdictText, 'Demoted to Maple Falls Club Championship next year');
});

test('computeYearEnd uses sensible defaults for unmeasured exit, queue, and viewing metrics', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']),
  };

  const res = computeYearEnd(1, 30, makeMockResult(600, 450), courseFacts, 0);

  assert.equal(res.facts.onTime, 450);
  assert.equal(res.facts.late, 0);
  assert.equal(res.facts.missed, 150);
  assert.ok(res.facts.exitP95Min >= 0 && res.facts.exitP95Min !== DEFAULT_EXIT_P95_MIN, 'the exit time is measured from the gates, no longer the default');
  assert.ok(res.facts.avgQueueMin >= 0 && res.facts.avgQueueMin !== DEFAULT_AVG_QUEUE_MIN, 'the queue is measured, no longer the default');
  assert.equal(res.facts.viewing, DEFAULT_VIEWING);
});
