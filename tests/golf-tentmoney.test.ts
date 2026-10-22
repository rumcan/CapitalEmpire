// Tests for golf tournament tent takings, event structure revenue evaluation, and year-end scoring
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeYearEnd } from '../src/game/golf/yearend';
import type { PlacedEventStructure } from '../src/game/golf/eventtool';
import type { CourseFacts } from '../src/game/golf/tour';
import type { RoundResult } from '../src/game/event/round';

function makeMockResult(sent: number, arrived: number): RoundResult {
  return {
    level: 1,
    run: 1,
    sent,
    arrived,
    rate: arrived / (sent * 3),
    upkeep: 2000,
    payout: 50000,
    net: 48000,
    prevRate: null,
    stuck: [],
    perfect: arrived === sent * 3,
    byTown: [],
  };
}

test('computeYearEnd calculates tent takings using arrived spectators', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']),
  };

  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 20, y: 20, mode: 'rent' },
    { id: 2, typeId: 'drinksTent', x: 30, y: 20, mode: 'rent' },
  ];

  // 150 cars sent, 450 spectators arrived
  const res = computeYearEnd(1, 40, makeMockResult(150, 450), courseFacts, 0, structures);

  assert.ok(res.tentRevenue !== undefined && res.tentRevenue > 0, `tent revenue should be positive: ${res.tentRevenue}`);
  assert.equal(res.tentRentCost, 4000); // 2000 rent each for foodTent and drinksTent
});

test('computeYearEnd handles empty structures list and defaults tent revenue to zero', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']),
  };

  const res = computeYearEnd(1, 40, makeMockResult(100, 300), courseFacts, 0, []);

  assert.equal(res.tentRevenue, 0);
  assert.equal(res.tentRentCost, 0);
  assert.equal(res.tentUpkeep, 0);
});

test('tent takings scale with higher spectator attendance', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']),
  };

  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 20, y: 20, mode: 'rent' },
  ];

  const lowCrowd = computeYearEnd(1, 40, makeMockResult(50, 150), courseFacts, 0, structures);
  const highCrowd = computeYearEnd(1, 40, makeMockResult(200, 600), courseFacts, 0, structures);

  assert.ok(highCrowd.tentRevenue! > lowCrowd.tentRevenue!, 'higher attendance should yield higher tent takings');
});

test('tent takings reflect price card variations', () => {
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2500,
    have: new Set(['carpark']),
  };

  const normalStructures: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 20, y: 20, mode: 'rent', priceCard: 'normal' },
  ];

  const premiumStructures: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 20, y: 20, mode: 'rent', priceCard: 'premium' },
  ];

  const normalRes = computeYearEnd(2, 50, makeMockResult(100, 300), courseFacts, 0, normalStructures);
  const premiumRes = computeYearEnd(2, 50, makeMockResult(100, 300), courseFacts, 0, premiumStructures);

  assert.ok(normalRes.tentRevenue! > 0);
  assert.ok(premiumRes.tentRevenue! > 0);
  assert.notEqual(normalRes.tentRevenue, premiumRes.tentRevenue);
});
