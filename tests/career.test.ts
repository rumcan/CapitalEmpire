// The career (src/game/career.ts): the milestones by residents, what each unlocks, the grants and the win. Pure, no DOM: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Career, MILESTONES, WIN_POP, classUnlocked, junctionUnlocked, reachedFor, tunnelsUnlocked, unlockOf } from '../src/game/career';

test('reachedFor: the index of the last milestone the population reaches; the milestones are in order and WIN_POP is the City', () => {
  assert.deepEqual(MILESTONES.map(m => m.pop), [0, 250, 1000, 2500, 4000, 6000]);
  assert.equal(WIN_POP, 6000);
  assert.equal(reachedFor(0), 0);
  assert.equal(reachedFor(249), 0);
  assert.equal(reachedFor(250), 1);
  assert.equal(reachedFor(5999), 4);
  assert.equal(reachedFor(6000), 5);
  assert.equal(reachedFor(100000), 5);
});

test('unlocks: road classes, junction types and tunnels open at their milestones, and stay open above them', () => {
  assert.equal(classUnlocked('gravel', 0), true);
  assert.equal(classUnlocked('road', 0), false);
  assert.equal(classUnlocked('road', 1), true);
  assert.equal(classUnlocked('avenue', 2), false);
  assert.equal(classUnlocked('boulevard', 4), true);
  assert.equal(classUnlocked('gravel', 5), true);
  assert.equal(junctionUnlocked('plain', 0), true);
  assert.equal(junctionUnlocked('roundabout', 1), false);
  assert.equal(junctionUnlocked('roundabout', 2), true);
  assert.equal(junctionUnlocked('slip', 2), false);
  assert.equal(junctionUnlocked('slip', 3), true);
  assert.equal(tunnelsUnlocked(2), false);
  assert.equal(tunnelsUnlocked(3), true);
  assert.equal(tunnelsUnlocked(5), true);
});

test('unlockOf: the milestone that unlocks a class, a junction type or tunnels; null for none', () => {
  assert.equal(unlockOf('class', 'boulevard')?.pop, 4000);
  assert.equal(unlockOf('class', 'gravel')?.name, 'Hamlet');
  assert.equal(unlockOf('junction', 'roundabout')?.pop, 1000);
  assert.equal(unlockOf('tunnel')?.pop, 2500);
  assert.equal(unlockOf('class', 'nope'), null);
  assert.equal(unlockOf('class'), null);
});

test('Career.update: from 0 to 1200 returns Village and Small town in order, no win; later updates return nothing new', () => {
  const c = new Career();
  const r = c.update(1200);
  assert.deepEqual(r.newly.map(m => m.name), ['Village', 'Small town']);
  assert.equal(r.won, false);
  assert.equal(c.reached, 2);
  assert.equal(c.won, false);
  assert.deepEqual(c.update(1200), { newly: [], won: false });
  assert.deepEqual(c.update(300), { newly: [], won: false });
  assert.equal(c.reached, 2);
});

test('Career.update: a jump to 7000 returns Town, Large town and City; the win comes once, on the update that reaches WIN_POP', () => {
  assert.equal(new Career().update(5999).won, false);
  const c = new Career();
  c.update(1200);
  const r = c.update(7000);
  assert.deepEqual(r.newly.map(m => m.name), ['Town', 'Large town', 'City']);
  assert.equal(r.won, true);
  assert.equal(c.won, true);
  assert.equal(c.reached, 5);
  const again = c.update(7000);
  assert.deepEqual(again, { newly: [], won: false });
});

test('toJSON and from round-trip; from() with no save is a fresh career at the hamlet', () => {
  const c = new Career();
  c.update(7000);
  const s = JSON.parse(JSON.stringify(c.toJSON()));
  const r = Career.from(s);
  assert.deepEqual(r.toJSON(), c.toJSON());
  assert.equal(r.reached, 5);
  assert.equal(r.won, true);
  assert.deepEqual(r.update(7000), { newly: [], won: false });
  const f = Career.from();
  assert.equal(f.reached, 0);
  assert.equal(f.won, false);
});
