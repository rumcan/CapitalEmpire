// The golf events' tents, gates and venue (GOLF-PLAN sections 5.3 and 6): the structure catalogue against the plan's table, the tent day's formulas
// (capacity, queue, price cards, zero capacity), the catchment edges, the gate queue, and the toilet and viewing scores. Pure: npm test (bundled
// by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PER_DAY, PRICE, STRUCTURE, STRUCTURES, catchmentWeight, spendPerSpectator, tentDay } from '../src/game/golf/tents';
import { EXPRESS_GATES, GATE_LANE_PER_HOUR, gateQueue, gateRate, toiletScore, toiletsNeeded, viewingScore } from '../src/game/golf/venue';

/** true when two numbers agree to 1e-9 */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** a food tent day with the defaults: tier 1, 300 an hour for 8 hours, 1000 spectators, normal price */
const tent = (o: Partial<Parameters<typeof tentDay>[0]> = {}) => tentDay({ kind: 'food', tier: 1, capacityPerHour: 300, hoursOpen: 8, spectators: 1000, price: PRICE.normal, ...o });

test('STRUCTURES: unique ids, positive footprints, and STRUCTURE indexes every row', () => {
  assert.equal(STRUCTURES.length, 28);
  assert.equal(new Set(STRUCTURES.map(s => s.id)).size, STRUCTURES.length);
  for (const s of STRUCTURES) {
    assert.ok(s.footprint.w > 0 && s.footprint.h > 0, `${s.id} has a positive footprint`);
    assert.equal(STRUCTURE[s.id], s);
  }
  assert.equal(STRUCTURE['shuttleHub'], undefined, 'the shuttle hub is the bus route, not a structure');
});

test('every GOLF-PLAN 6.1 row is present with its tier, rent, buy and capacity; the footprints match', () => {
  // [id, tier, rent, buy, capacity]; a buy or rent of 0 is "-" or "earns" in the plan
  const rows: [string, number, number, number, number][] = [
    ['foodTent', 1, 2000, 15000, 300], ['drinksTent', 2, 2000, 15000, 400], ['kiosk', 1, 500, 4000, 120], ['foodTruck', 2, 800, 0, 150],
    ['merchTent', 3, 4000, 40000, 200], ['merchPavilion', 5, 20000, 250000, 1200], ['chalet', 4, 6000, 50000, 60], ['village', 5, 40000, 0, 500],
    ['standS', 2, 3000, 0, 200], ['standM', 3, 12000, 0, 1000], ['standL', 4, 40000, 0, 4000], ['leaderboard', 3, 3000, 25000, 0],
    ['holeBoard', 3, 300, 2000, 0], ['screen', 5, 8000, 0, 0], ['tvTower', 4, 1500, 10000, 0], ['broadcast', 4, 10000, 0, 0],
    ['media', 4, 8000, 80000, 0], ['gate', 2, 2000, 20000, 4], ['toilets', 2, 400, 6000, 12], ['firstAid', 3, 500, 0, 0],
    ['info', 2, 300, 3000, 0], ['rideshare', 3, 2000, 10000, 0], ['coach', 4, 10000, 120000, 20], ['rangeStand', 3, 5000, 30000, 600],
    ['sponsorDisplay', 3, 0, 0, 0], ['helipad', 5, 0, 60000, 0],
  ];
  for (const [id, tier, rent, buy, capacity] of rows) {
    const s = STRUCTURE[id];
    assert.ok(s, `${id} exists`);
    assert.equal(s.tier, tier, `${id} tier`);
    assert.equal(s.rent, rent, `${id} rent`);
    assert.equal(s.buy, buy, `${id} buy`);
    assert.equal(s.capacity, capacity, `${id} capacity`);
  }
  assert.deepEqual(STRUCTURE['foodTent'].footprint, { w: 4, h: 4 });
  assert.deepEqual(STRUCTURE['merchPavilion'].footprint, { w: 15, h: 10 });
  assert.deepEqual(STRUCTURE['standL'].footprint, { w: 40, h: 10 });
});

test('spend per spectator a day: linear from tier 1 to 5 for the selling kinds, 0 for the rest', () => {
  assert.equal(spendPerSpectator('food', 1), 4);
  assert.equal(spendPerSpectator('food', 3), 6.5);
  assert.equal(spendPerSpectator('food', 5), 9);
  assert.equal(spendPerSpectator('drink', 1), 3);
  assert.equal(spendPerSpectator('drink', 3), 5.5);
  assert.equal(spendPerSpectator('drink', 5), 8);
  assert.equal(spendPerSpectator('merch', 1), 1);
  assert.equal(spendPerSpectator('merch', 3), 13);
  assert.equal(spendPerSpectator('merch', 5), 25);
  assert.equal(spendPerSpectator('snack', 1), 1);
  assert.equal(spendPerSpectator('snack', 3), 2);
  assert.equal(spendPerSpectator('snack', 5), 3);
  for (const k of ['hospitality', 'grandstand', 'board', 'tv', 'media', 'gate', 'toilet', 'firstaid', 'info', 'transport', 'display', 'helipad'] as const) assert.equal(spendPerSpectator(k, 5), 0, `${k} earns no spend`);
  assert.equal(PER_DAY.food, 1);
  assert.equal(PER_DAY.drink, 1.5);
  assert.equal(PER_DAY.snack, 1);
  assert.equal(PER_DAY.merch, 0.25);
});

test('tentDay under capacity: no queue, nothing lost, revenue at the spend', () => {
  const d = tent({ spectators: 1000 }); // capacity 2400
  assert.equal(d.demand, 1000);
  assert.equal(d.served, 1000);
  assert.equal(d.lost, 0);
  assert.equal(d.avgQueueMin, 1);
  assert.equal(d.satisfaction, 1);
  assert.equal(d.revenue, 4000);
});

test('tentDay at capacity: served to the cap, the queue is 10 minutes, satisfaction 0.8', () => {
  const d = tent({ spectators: 2400 }); // demand = capacity
  assert.equal(d.served, 2400);
  assert.equal(d.lost, 0);
  assert.equal(d.avgQueueMin, 10);
  assert.ok(near(d.satisfaction, 0.8), `satisfaction ${d.satisfaction}`);
});

test('tentDay over capacity: sales are lost, the queue passes 10 minutes, satisfaction falls', () => {
  const at = tent({ spectators: 2400 });
  const over = tent({ spectators: 3000 }); // demand 3000 against 2400
  assert.equal(over.demand, 3000);
  assert.equal(over.served, 2400);
  assert.equal(over.lost, 600);
  assert.ok(over.avgQueueMin >= 10, `queue ${over.avgQueueMin}`);
  assert.ok(near(over.avgQueueMin, 22.5), `queue ${over.avgQueueMin}`);
  assert.ok(over.satisfaction < at.satisfaction, 'more queue, less satisfaction');
  assert.ok(near(over.satisfaction, 0.3), `satisfaction ${over.satisfaction}`);
});

test('tentDay price cards: premium earns more per sale from fewer sales, with lower satisfaction', () => {
  const big = { capacityPerHour: 1000, hoursOpen: 10 }; // capacity 10000: no queue at either card
  const cheap = tent({ ...big, price: PRICE.cheap });
  const premium = tent({ ...big, price: PRICE.premium });
  assert.equal(cheap.demand, 1150);
  assert.equal(premium.demand, 800);
  assert.ok(premium.demand < cheap.demand, 'premium sells fewer');
  assert.equal(cheap.revenue, 3680); // 1150 x $4 x 0.8
  assert.equal(premium.revenue, 4160); // 800 x $4 x 1.3
  assert.ok(premium.revenue > cheap.revenue, 'premium earns more');
  assert.equal(premium.avgQueueMin, 1);
  assert.ok(near(premium.satisfaction, 0.95), `premium satisfaction ${premium.satisfaction}`);
  assert.equal(cheap.satisfaction, 1);
});

test('tentDay with zero capacity: nothing served, all lost, queue 60, no revenue', () => {
  for (const o of [{ capacityPerHour: 0 }, { hoursOpen: 0 }]) {
    const d = tent(o);
    assert.equal(d.demand, 1000);
    assert.equal(d.served, 0);
    assert.equal(d.lost, 1000);
    assert.equal(d.revenue, 0);
    assert.equal(d.avgQueueMin, 60);
    assert.equal(d.satisfaction, 0);
  }
});

test('catchment: 1 up to 100 m, linear to 0 at 400 m', () => {
  assert.equal(catchmentWeight(0), 1);
  assert.equal(catchmentWeight(100), 1);
  assert.ok(near(catchmentWeight(250), 0.5));
  assert.equal(catchmentWeight(400), 0);
  assert.equal(catchmentWeight(500), 0);
});

test('gateQueue: a spike queues and then drains; express gates shorten the wait', () => {
  const arrivals = [0, 0, 50, 0, 0, 0, 0];
  const normal = gateQueue(arrivals, 1, false); // one lane: 10 a minute
  assert.equal(gateRate(1, false), GATE_LANE_PER_HOUR / 60);
  assert.deepEqual(normal.queue, [0, 0, 40, 30, 20, 10, 0]);
  assert.equal(Math.max(...normal.queue), 40);
  assert.equal(normal.maxWaitMin, 5);
  assert.equal(normal.avgWaitMin, 5);
  const express = gateQueue(arrivals, 1, true); // 15 a minute
  assert.ok(near(gateRate(1, true), 10 * EXPRESS_GATES));
  assert.deepEqual(express.queue, [0, 0, 35, 20, 5, 0, 0]);
  assert.ok(near(express.maxWaitMin, 50 / 15), `express wait ${express.maxWaitMin}`);
  assert.ok(express.maxWaitMin < normal.maxWaitMin, 'express shortens the longest wait');
  assert.ok(express.avgWaitMin < normal.avgWaitMin, 'express shortens the average wait');
});

test('gateQueue: the average wait weights each minute by its arrivals; an empty day waits 0', () => {
  const q = gateQueue([10, 30], 1, false); // minute 0: queue 10, wait 1; minute 1: queue 30, wait 3; the queue leaves at 10 a minute
  assert.deepEqual(q.queue, [0, 20]);
  assert.equal(q.maxWaitMin, 3);
  assert.ok(near(q.avgWaitMin, 2.5), `avg ${q.avgWaitMin}`); // (10 x 1 + 30 x 3) / 40
  const none = gateQueue([], 2, false);
  assert.deepEqual(none, { queue: [], maxWaitMin: 0, avgWaitMin: 0 });
});

test('toilets: one cubicle per 120 spectators; the score is the share of the need met, 1 with no crowd', () => {
  assert.equal(toiletsNeeded(0), 0);
  assert.equal(toiletsNeeded(120), 1);
  assert.equal(toiletsNeeded(121), 2);
  assert.equal(toiletsNeeded(1000), 9);
  assert.equal(toiletScore(12, 1000), 1);
  assert.ok(near(toiletScore(4, 1000), 4 / 9));
  assert.equal(toiletScore(0, 500), 0);
  assert.equal(toiletScore(0, 0), 1);
});

test('viewing: seats plus two spectators a metre of rope against 0.6 of the crowd, capped at 1', () => {
  assert.equal(viewingScore({ seats: 200, ropeM: 0, spectators: 100 }), 1);
  assert.ok(near(viewingScore({ seats: 0, ropeM: 50, spectators: 1000 }), 100 / 600));
  assert.ok(near(viewingScore({ seats: 100, ropeM: 100, spectators: 1000 }), 0.5));
  assert.equal(viewingScore({ seats: 0, ropeM: 0, spectators: 0 }), 1);
});
