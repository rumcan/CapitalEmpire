// The business catalogue (Phase B step 2): every type is reachable from the stadium, the spin-offs and their unlocks agree, and the formulas (demand,
// satisfaction, levels, the unlock texts) read as the design says. Pure: npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS, BUSINESSES, START_SAT, dailyDemand, levelFromXp, satisfactionAfter, unlockText, unlockedBy, type Owned } from '../src/game/business/catalogue';

test('every type is reachable from the stadium: owning each open type at level 5 opens the rest, all 12 in the end', () => {
  const owned: Owned[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of unlockedBy(owned)) if (!owned.some(o => o.id === id)) { owned.push({ id, level: 5, goodDays: 99, revenue: 1e9 }); grew = true; }
  }
  assert.equal(BUSINESSES.length, 12);
  assert.equal(new Set(owned.map(o => o.id)).size, 12);
  for (const b of BUSINESSES) assert.ok(owned.some(o => o.id === b.id), `${b.id} is reached`);
});

test('spin-offs and parents agree: a type with a parent is in its parent\'s spinOffs, and each spin-off\'s parent is that type', () => {
  for (const b of BUSINESSES) {
    if (b.unlock.parent) assert.ok(BUSINESS[b.unlock.parent].spinOffs.includes(b.id), `${b.id} is a spin-off of ${b.unlock.parent}`);
    for (const s of b.spinOffs) assert.equal(BUSINESS[s].unlock.parent, b.id, `${s}'s parent is ${b.id}`);
  }
});

test('unlockedBy with nothing owned opens the stadium alone', () => {
  assert.deepEqual(unlockedBy([]), ['stadium']);
});

test('dailyDemand falls as the trip grows (by e over tau) and is 0 for a kind that is not a visit', () => {
  const bar = BUSINESS.sportsbar;
  const d0 = dailyDemand(bar, 1, [{ pop: 5000, tripMin: 0 }], 1), d1 = dailyDemand(bar, 1, [{ pop: 5000, tripMin: 5 }], 1), d2 = dailyDemand(bar, 1, [{ pop: 5000, tripMin: 20 }], 1);
  assert.ok(d0 > d1 && d1 > d2 && d2 > 0, 'demand falls with the trip time');
  assert.ok(Math.abs(dailyDemand(bar, 1, [{ pop: 5000, tripMin: bar.tau }], 1) / d0 - Math.exp(-1)) < 1e-9, 'one tau of trip time is a factor e');
  const near = [{ pop: 5000, tripMin: 0 }];
  assert.equal(dailyDemand(BUSINESS.stadium, 1, near, 1), 0, 'the stadium is an event, not a visit');
  assert.equal(dailyDemand(BUSINESS.buscompany, 1, near, 1), 0, 'a bus company is a fleet');
  assert.equal(dailyDemand(BUSINESS.estate, 1, near, 1), 0, 'an estate sells lots');
});

test('satisfactionAfter moves toward 1 over days of on-time visitors and toward 0 over missed ones; no visitors counts as nothing gone wrong', () => {
  let up = START_SAT, down = START_SAT;
  for (let d = 0; d < 30; d++) { up = satisfactionAfter(up, 10, 0, 0); down = satisfactionAfter(down, 0, 0, 10); }
  assert.ok(up > 0.99 && up <= 1, `on time: ${up}`);
  assert.ok(down < 0.01 && down >= 0, `missed: ${down}`);
  assert.ok(Math.abs(satisfactionAfter(0.8, 10, 0, 0) - 0.86) < 1e-9, 'a day moves 30% of the way');
  assert.ok(Math.abs(satisfactionAfter(0.8, 0, 0, 0) - 0.86) < 1e-9, 'no visitors: the score is 1');
  assert.ok(Math.abs(satisfactionAfter(0.8, 0, 10, 0) - (0.8 + 0.3 * (0.5 - 0.8))) < 1e-9, 'a late car counts half');
});

test('levelFromXp: level 1 below 400, 2 from 400, 5 from 7,000', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(399), 1);
  assert.equal(levelFromXp(400), 2);
  assert.equal(levelFromXp(7000), 5);
});

test('unlockText: a root type has none; with no parent owned it says to build the parent; a parent below the level or the good days says how far', () => {
  assert.equal(unlockText(BUSINESS.stadium, []), '');
  assert.equal(unlockText(BUSINESS.sportsbar, []), 'Build a Stadium first');
  assert.equal(unlockText(BUSINESS.sportsbar, [{ id: 'stadium', level: 1, goodDays: 0, revenue: 0 }]), 'Stadium: level 2 (now 1)');
  assert.equal(unlockText(BUSINESS.diner, [{ id: 'sportsbar', level: 1, goodDays: 1, revenue: 0 }]), 'Sports bar: 2 good days (now 1)');
});
