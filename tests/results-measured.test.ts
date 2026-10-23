// Results from the movers (LEAD.md M2.4): the gates count the fans admitted late, the leaving measures the cars' exit waits, and the year-end
// takes those over the formula (golf/yearend.ts measuredFlows), each falling back to the formula when the round did not measure it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crowd } from '../src/game/event/crowd';
import { p95 } from '../src/game/city';
import { computeYearEnd, measuredFlows } from '../src/game/golf/yearend';
import type { RoundResult } from '../src/game/event/round';
import type { CourseFacts } from '../src/game/golf/tour';

const round = (o: Partial<RoundResult> = {}): RoundResult => ({ level: 1, run: 1, sent: 160, arrived: 400, rate: 400 / 480, upkeep: 50, payout: 0, net: 0, prevRate: null, stuck: [], perfect: false, byTown: [], ...o });
const facts: CourseFacts = { holes: 9, lengthM: 3000, have: new Set(['carpark']) };
const EST = { avgQueueMin: 1, onTime: 400, late: 0, exitP95Min: 35 };

test('results: a gate counts the fans it admits after they waited over the grace as late', () => {
  const C = new Crowd(1, 0); C.setGates(1); C.grace = 45;
  C.now = 0; C.add({ x: 0, y: 0, tx: 0, ty: 0, n: 3, town: 0, stage: 2, route: 0 }); C.step(1);
  C.now = 10; C.add({ x: 0, y: 0, tx: 0, ty: 0, n: 3, town: 0, stage: 2, route: 0 }); C.step(1);
  C.now = 50; C.admit(0, 6);
  assert.deepEqual([C.gate.admitted, C.gate.late], [6, 3], 'the first party waited 50, the second 40');
});

test('results: p95 of the exit waits', () => {
  assert.equal(p95([]), 0);
  assert.equal(p95([5]), 5);
  assert.equal(p95(Array.from({ length: 100 }, (_, i) => i + 1)), 95);
  assert.equal(p95([3, 1, 2]), 3);
});

test('results: measuredFlows takes the gates and the exit when measured, the formula otherwise', () => {
  const none = measuredFlows(round(), EST);
  assert.deepEqual(none.measured, { gates: false, exit: false });
  assert.equal(none.exitP95Min, 35); assert.equal(none.onTime, 400);
  const g = measuredFlows(round({ gates: { admitted: 400, avgWait: 12, maxWait: 60, queuing: 30, late: 50 } }), EST);
  assert.deepEqual([g.avgQueueMin, g.onTime, g.late, g.queuing], [12, 350, 80, 30]);
  assert.deepEqual(g.measured, { gates: true, exit: false });
  // the exit counts once 95% of the cars are out
  const early = measuredFlows(round({ leave: { cars: 100, gone: 90, start: 0, last: 0, p95: 8 } }), EST);
  assert.equal(early.exitP95Min, 35); assert.equal(early.measured.exit, false);
  const done = measuredFlows(round({ leave: { cars: 100, gone: 96, start: 0, last: 0, p95: 8 } }), EST);
  assert.equal(done.exitP95Min, 8); assert.equal(done.measured.exit, true);
});

test('results: computeYearEnd uses the measures: the fans queuing at kick-off are late, not missed; a long queue costs satisfaction', () => {
  const good = computeYearEnd(1, 50, round({ gates: { admitted: 400, avgWait: 2, maxWait: 5, queuing: 0, late: 0 }, leave: { cars: 130, gone: 130, start: 0, last: 0, p95: 10 } }), facts, 0, [], [], 'clear');
  assert.deepEqual(good.measured, { gates: true, exit: true });
  assert.deepEqual([good.facts.onTime, good.facts.late, good.facts.missed, good.facts.avgQueueMin, good.facts.exitP95Min], [400, 0, 80, 2, 10]);
  const bad = computeYearEnd(1, 50, round({ gates: { admitted: 400, avgWait: 40, maxWait: 90, queuing: 60, late: 200 }, leave: { cars: 130, gone: 130, start: 0, last: 0, p95: 100 } }), facts, 0, [], [], 'clear');
  assert.deepEqual([bad.facts.onTime, bad.facts.late, bad.facts.missed], [200, 260, 20]);
  assert.ok(bad.satisfaction < good.satisfaction - 20, `${bad.satisfaction} vs ${good.satisfaction}`);
  // an old round (no measures) keeps the formula
  assert.deepEqual(computeYearEnd(1, 50, round(), facts, 0, [], [], 'clear').measured, { gates: false, exit: false });
});
