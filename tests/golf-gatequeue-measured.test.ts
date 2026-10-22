import test from 'node:test';
import assert from 'node:assert/strict';
import { gateLanesFor, measureGateFlows, computeYearEnd } from '../src/game/golf/yearend';
import type { RoundResult } from '../src/game/event/round';
import type { CourseFacts } from '../src/game/golf/tour';
import type { PlacedEventStructure } from '../src/game/golf/eventtool';

test('tier 1 with no gate placed uses default 1 lane and has low wait', () => {
  const emptyStructures: PlacedEventStructure[] = [];
  const lanes = gateLanesFor(emptyStructures, 1);
  assert.equal(lanes, 1);

  const flow = measureGateFlows(450, lanes);
  assert.equal(flow.onTime, 450);
  assert.equal(flow.late, 0);
  assert.ok(flow.avgQueueMin < 1.0, `avg wait ${flow.avgQueueMin} < 1m`);
  assert.ok(flow.exitP95Min < 2.0, `exit p95 ${flow.exitP95Min} < 2m`);
});

test('tier 2 with placed gate gets 4 lanes and handles 2000 spectators smoothly', () => {
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 10, y: 10, mode: 'rent' },
  ];
  const lanes = gateLanesFor(structures, 2);
  assert.equal(lanes, 4);

  const flow = measureGateFlows(2000, lanes);
  assert.equal(flow.onTime, 2000);
  assert.equal(flow.late, 0);
  assert.ok(flow.avgQueueMin < 1.0, `avg wait ${flow.avgQueueMin} < 1m`);
  assert.ok(flow.exitP95Min < 2.0, `exit p95 ${flow.exitP95Min} < 2m`);
});

test('undersized gate lanes create late arrivals and long exit P95 wait', () => {
  // 1 lane handling 2000 spectators at tier 2
  const flow = measureGateFlows(2000, 1);
  assert.ok(flow.avgQueueMin > 5.0, `avg wait ${flow.avgQueueMin} > 5m`);
  assert.ok(flow.exitP95Min > 50.0, `exit p95 ${flow.exitP95Min} > 50m`);

  // 8 lanes handling 20000 spectators at tier 4
  const flow20k = measureGateFlows(20000, 8);
  assert.ok(flow20k.late > 1000, `significant late spectators: ${flow20k.late}`);
  assert.ok(flow20k.exitP95Min > 90.0, `high exit wait: ${flow20k.exitP95Min}m`);
});

test('tier 2 with 0 gates placed has 0 lanes and marks all arrivals late', () => {
  const lanes = gateLanesFor([], 2);
  assert.equal(lanes, 0);

  const flow = measureGateFlows(1500, lanes);
  assert.equal(flow.onTime, 0);
  assert.equal(flow.late, 1500);
  assert.ok(flow.avgQueueMin >= 120, 'queue wait maxed out');
  assert.ok(flow.exitP95Min >= 120, 'exit p95 maxed out');
});

test('computeYearEnd integrates measured gate flows into DayFacts and satisfaction', () => {
  const roundResult: RoundResult = {
    level: 1,
    run: 1,
    sent: 160,
    arrived: 400,
    rate: 400 / (160 * 3),
    upkeep: 50,
    payout: 100,
    net: 50,
    prevRate: null,
    stuck: [],
    perfect: false,
    byTown: [],
  };
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 3000,
    have: new Set(['carpark']),
  };

  const res = computeYearEnd(1, 50, roundResult, courseFacts, 0, [], []);
  assert.equal(res.facts.onTime, 400);
  assert.equal(res.facts.late, 0);
  assert.equal(res.facts.missed, 80); // 160*3 - 400 = 80
  assert.ok(res.facts.avgQueueMin < 1.0);
  assert.ok(res.facts.exitP95Min < 2.0);
  assert.ok(res.satisfaction >= 70, `satisfaction ${res.satisfaction} >= 70`);
});
