import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateCampaign } from '../src/game/golf/campaign';

test('careful strategy reaches tier 3 within 8 years and stays solvent', () => {
  const res = simulateCampaign({ strategy: 'careful', arrivalFraction: 0.60, years: 8 });
  assert.equal(res.reachedTier3, true, 'careful strategy must reach tier 3');
  assert.ok(res.yearsToTier3 !== null && res.yearsToTier3 <= 8, `reached tier 3 in ${res.yearsToTier3} <= 8 years`);
  assert.equal(res.stayedSolvent, true, `treasury must never drop below 0 (min was ${res.minTreasury})`);
  assert.ok(res.minTreasury >= 0, 'minimum treasury is non-negative');
  assert.ok(res.finalTier >= 3, 'final tier reached is at least 3');
});

test('careless strategy never passes tier 1 and is not rewarded', () => {
  const res = simulateCampaign({ strategy: 'careless', arrivalFraction: 0.35, years: 8 });
  assert.equal(res.reachedTier3, false, 'careless strategy must never reach tier 3');
  assert.equal(res.finalTier, 1, 'careless strategy must remain stuck at tier 1');
  for (const yr of res.history) {
    assert.equal(yr.tier, 1, `year ${yr.year} must remain tier 1`);
    assert.equal(yr.offered, null, `year ${yr.year} must never receive tier offer`);
  }
});

test('careful strategy year-by-year progression table has valid transitions', () => {
  const res = simulateCampaign({ strategy: 'careful', arrivalFraction: 0.60, years: 8 });
  assert.equal(res.history.length, 8);
  assert.equal(res.history[0]!.tier, 1);
  assert.ok(res.history[0]!.bought.includes('gate'));
  assert.equal(res.history[1]!.offered, 2);
  assert.equal(res.history[2]!.tier, 2);
  assert.equal(res.history[3]!.offered, 3);
  assert.equal(res.history[4]!.tier, 3);
});

test('capital investments are deducted when buying required tier structures', () => {
  const res = simulateCampaign({ strategy: 'careful', startTreasury: 600000 });
  const y1 = res.history[0]!;
  assert.ok(y1.treasury < 600000 - 41000, 'deducts initial structure purchases');
  assert.deepEqual(y1.bought, ['gate', 'foodTent', 'toilets']);
  const y3 = res.history[2]!;
  assert.ok(y3.bought.includes('18-hole-expansion'));
  assert.ok(y3.bought.includes('leaderboard'));
});

test('custom initial treasury and options behave deterministically', () => {
  const run1 = simulateCampaign({ years: 5, startTreasury: 500000 });
  const run2 = simulateCampaign({ years: 5, startTreasury: 500000 });
  assert.equal(run1.finalTreasury, run2.finalTreasury);
  assert.equal(run1.finalReputation, run2.finalReputation);
  assert.equal(run1.history.length, 5);
});
