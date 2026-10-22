import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSponsorIncome,
  computeTvIncome,
  computePurseCost,
  hasTvRequirements,
  computeSponsorBreakdown,
} from '../src/game/golf/sponsors';
import type { Need } from '../src/game/golf/tour';

test('tier 1 yields 0 sponsor and 0 tv income, charges purse', () => {
  const needs: Need[] = ['carpark'];
  assert.equal(computeSponsorIncome(1, 100), 0);
  assert.equal(computeTvIncome(1, needs), 0);
  assert.equal(computePurseCost(1), 2000);

  const b = computeSponsorBreakdown(1, 50, needs);
  assert.equal(b.sponsorIncome, 0);
  assert.equal(b.tvIncome, 0);
  assert.equal(b.hasTvRights, false);
  assert.equal(b.purse, 2000);
  assert.equal(b.netCommercial, -2000);
});

test('tier 2 sponsor income scales linearly by reputation / 100', () => {
  const needs: Need[] = ['carpark', 'gate', 'foodTent', 'toilets'];
  assert.equal(computeSponsorIncome(2, 0), 0);
  assert.equal(computeSponsorIncome(2, 50), 5000);
  assert.equal(computeSponsorIncome(2, 60), 6000);
  assert.equal(computeSponsorIncome(2, 100), 10000);

  const b = computeSponsorBreakdown(2, 60, needs);
  assert.equal(b.sponsorIncome, 6000);
  assert.equal(b.tvIncome, 0);
  assert.equal(b.purse, 10000);
  assert.equal(b.netCommercial, -4000);
});

test('tier 3 sponsor income scales and provides correct commercial net', () => {
  const needs = new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets', 'leaderboard', 'range']);
  assert.equal(computeSponsorIncome(3, 70), 35000);
  assert.equal(computeSponsorIncome(3, 100), 50000);
  assert.equal(computeTvIncome(3, needs), 0);

  const b = computeSponsorBreakdown(3, 70, needs);
  assert.equal(b.sponsorIncome, 35000);
  assert.equal(b.tvIncome, 0);
  assert.equal(b.purse, 60000);
  assert.equal(b.netCommercial, -25000);
});

test('tier 4 requires both tvTowers and broadcast structures for TV rights', () => {
  const withoutTv = new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']);
  assert.equal(hasTvRequirements(withoutTv), false);
  assert.equal(computeTvIncome(4, withoutTv), 0);

  const withTowersOnly = new Set<Need>(['carpark', 'tvTowers']);
  assert.equal(hasTvRequirements(withTowersOnly), false);
  assert.equal(computeTvIncome(4, withTowersOnly), 0);

  const withBroadcastOnly = new Set<Need>(['carpark', 'broadcast']);
  assert.equal(hasTvRequirements(withBroadcastOnly), false);
  assert.equal(computeTvIncome(4, withBroadcastOnly), 0);

  const withBoth = new Set<Need>(['carpark', 'tvTowers', 'broadcast', 'hospitality']);
  assert.equal(hasTvRequirements(withBoth), true);
  assert.equal(computeTvIncome(4, withBoth), 300000);

  const b = computeSponsorBreakdown(4, 80, withBoth);
  assert.equal(b.sponsorIncome, 200000);
  assert.equal(b.tvIncome, 300000);
  assert.equal(b.hasTvRights, true);
  assert.equal(b.purse, 400000);
  assert.equal(b.netCommercial, 100000);
});

test('tier 5 full breakdown with high reputation and TV coverage produces positive net', () => {
  const allNeeds = new Set<Need>(['tvTowers', 'broadcast', 'grandstands', 'hospitalityVillage']);
  const b = computeSponsorBreakdown(5, 95, allNeeds);
  assert.equal(b.sponsorIncome, 950000);
  assert.equal(b.tvIncome, 1500000);
  assert.equal(b.hasTvRights, true);
  assert.equal(b.purse, 1000000);
  assert.equal(b.netCommercial, 1450000);
});
