import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEED_TYPES, prepDue, prepView, suggestSpot, type PrepFacts } from '../src/game/golf/prep';
import { tierInfo, type Need } from '../src/game/golf/tour';

const facts = (o: Partial<PrepFacts> = {}): PrepFacts => ({ tier: 1, have: new Set<Need>(), placed: [], save: { done: [], skipped: [] }, available: () => true, ...o });
const ids = (v: ReturnType<typeof prepView>) => v!.lines.map(l => l.step.id);

test('prep: the chapter is this tier while it has a todo step, else the next tier, else none', () => {
  const v1 = prepView(facts({ tier: 1 }))!;
  assert.equal(v1.chapter, 1);
  assert.equal(v1.name, tierInfo(1).name);
  // tier 1's two optional steps done: move to tier 2's chapter
  const v2 = prepView(facts({ tier: 1, placed: [{ typeId: 'compactBleacher60' }, { typeId: 'holeBoard' }] }))!;
  assert.equal(v2.chapter, 2);
  assert.equal(v2.name, tierInfo(2).name);
  // nothing left in this tier or the next: no checklist
  assert.equal(prepView(facts({ tier: 5, have: new Set(tierInfo(5).needs), available: () => false })), null);
});

test('prep: required steps come in the tier\'s need order, with the mapped types; optional ones follow', () => {
  const v = prepView(facts({ tier: 2 }))!;
  assert.deepEqual(ids(v), ['prep-gate', 'prep-foodTent', 'prep-toilets', 'prep-first-stand', 'prep-hole-board', 'prep-first-aid', 'prep-info']);
  assert.deepEqual(v.lines.slice(0, 3).map(l => l.step.typeId), ['gate', 'foodTent', 'toilets']);
  assert.equal(v.lines[0]!.step.need, 'gate');
  assert.equal(v.lines[3]!.step.optional, true);
  assert.equal(v.lines[0]!.step.optional, undefined);
  assert.equal(v.lines[0]!.current, true);
  assert.ok(v.lines.every(l => l.step.title.length > 0 && l.step.body.length > 0));
  // carpark, parkRide, parkRide2 and hotelRooms are not steps
  assert.equal(ids(prepView(facts({ tier: 5, have: new Set(tierInfo(5).needs) })))!.includes('prep-carpark'), false);
  assert.deepEqual(NEED_TYPES.grandstands, ['standM']);
});

test('prep: the grandstand by the 18th green is the first available type; none available means no step and no first-stand', () => {
  const v = prepView(facts({ tier: 3, available: id => id !== 'compactBleacher60' }))!;
  const step = v.lines.find(l => l.step.need === 'grandstand18')!;
  assert.equal(step.step.typeId, 'standS');
  assert.equal(v.lines.some(l => l.step.id === 'prep-first-stand'), false, 'a chapter with the 18th-green step has no first-stand step');
  const none = prepView(facts({ tier: 3, available: id => !['compactBleacher60', 'standS', 'standM'].includes(id) }))!;
  assert.equal(none.lines.some(l => l.step.need === 'grandstand18'), false);
});

test('prep: optional steps appear only when their type is available, and from their chapter on', () => {
  const v = prepView(facts({ tier: 1, available: id => id !== 'holeBoard' }))!;
  assert.deepEqual(ids(v), ['prep-first-stand']);
  // the tier 3 optional camera step is not offered in tier 2's chapter
  assert.equal(prepView(facts({ tier: 2 }))!.lines.some(l => l.step.id === 'prep-first-camera'), false);
  assert.equal(prepView(facts({ tier: 3 }))!.lines.some(l => l.step.id === 'prep-first-camera'), true);
});

test('prep: done (have or placed), skipped and newlyDone', () => {
  const v = prepView(facts({ tier: 2, have: new Set<Need>(['gate', 'foodTent']), save: { done: ['prep-gate'], skipped: ['prep-toilets'] } }))!;
  const state = (id: string) => v.lines.find(l => l.step.id === id)!.state;
  assert.equal(state('prep-gate'), 'done');
  assert.equal(state('prep-foodTent'), 'done');
  assert.equal(state('prep-toilets'), 'skipped');
  assert.equal(state('prep-first-stand'), 'todo');
  assert.equal(v.lines.find(l => l.current)!.step.id, 'prep-first-stand');
  assert.deepEqual(v.newlyDone.map(s => s.id), ['prep-foodTent'], 'only a condition not yet in done is newly done');
  // a done step stays done when its condition goes away
  const kept = prepView(facts({ tier: 2, save: { done: ['prep-gate'], skipped: [] } }))!;
  assert.equal(kept.lines.find(l => l.step.id === 'prep-gate')!.state, 'done');
  // an optional step is done by the placed type, and newly done once
  const opt = prepView(facts({ tier: 1, placed: [{ typeId: 'compactBleacher60' }] }))!;
  assert.deepEqual(opt.newlyDone.map(s => s.id), ['prep-first-stand']);
  assert.equal(prepView(facts({ tier: 1, placed: [{ typeId: 'compactBleacher60' }], save: { done: ['prep-first-stand'], skipped: [] } }))!.newlyDone.length, 0);
});

test('prep: a hidden chapter shows nothing; another chapter is not hidden', () => {
  assert.equal(prepView(facts({ tier: 2, save: { done: [], skipped: [], hidden: 2 } })), null);
  assert.equal(prepView(facts({ tier: 2, save: { done: [], skipped: [], hidden: 3 } }))!.chapter, 2);
});

test('prep: tvTowers counts two towers and shows its progress', () => {
  const base = { tier: 4, available: () => true };
  const none = prepView(facts({ ...base }))!.lines.find(l => l.step.id === 'prep-tvTowers')!;
  assert.equal(none.progress, '0 of 2');
  assert.equal(none.first, true);
  assert.equal(none.step.count, 2);
  assert.equal(none.step.typeId, 'tvTower');
  const one = prepView(facts({ ...base, placed: [{ typeId: 'tvTower' }] }))!.lines.find(l => l.step.id === 'prep-tvTowers')!;
  assert.equal(one.progress, '1 of 2');
  assert.equal(one.first, false);
  const two = prepView(facts({ ...base, have: new Set<Need>(['tvTowers']), placed: [{ typeId: 'tvTower' }, { typeId: 'tvTower' }] }))!.lines.find(l => l.step.id === 'prep-tvTowers')!;
  assert.equal(two.state, 'done');
  assert.equal(two.progress, '2 of 2');
});

test('prep: rewards are a quarter of rent (5% of buy when rent is 0), to the nearest 50, at least 250', () => {
  const rewards = (tier: number) => Object.fromEntries(prepView(facts({ tier }))!.lines.map(l => [l.step.id, l.step.reward]));
  const t2 = rewards(2);
  assert.equal(t2['prep-gate'], 500, 'rent 2000');
  assert.equal(t2['prep-toilets'], 250, 'rent 400 is 100, lifted to 250');
  assert.equal(t2['prep-first-stand'], 250, 'bleacher rent 900 is 225, to 250');
  const t4 = prepView(facts({ tier: 4 }))!.lines.find(l => l.step.id === 'prep-tvTowers')!;
  assert.equal(t4.step.reward, 400, 'rent 1500 is 375, to 400');
  const t5 = prepView(facts({ tier: 5 }))!.lines.find(l => l.step.id === 'prep-interchange')!;
  assert.equal(t5.step.reward, 12500, 'rent 0: 5% of buy 250000');
  assert.equal(t5.step.target, 'clubhouse');
});

test('prep: targets follow the step (gate, entrance, greens, clubhouse)', () => {
  const v = prepView(facts({ tier: 4, have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']) }))!;
  const target = (id: string) => v.lines.find(l => l.step.id === id)!.step.target;
  assert.equal(target('prep-grandstand18'), 'green18');
  assert.equal(target('prep-leaderboard'), 'green18');
  assert.equal(target('prep-merchTent'), 'clubhouse');
  assert.equal(target('prep-range'), 'clubhouse');
  assert.equal(target('prep-tvTowers'), 'green');
  assert.equal(target('prep-hole-board'), 'green');
  assert.equal(target('prep-info'), 'entry');
});

test('suggestSpot: the nearest valid tile, rings from the top-left, null when none', () => {
  assert.deepEqual(suggestSpot({ x: 5.4, y: 4.6 }, (x, y) => x === 5 && y === 5), { x: 5, y: 5 });
  assert.deepEqual(suggestSpot({ x: 10, y: 10 }, (x, y) => x >= 12 && y >= 10), { x: 12, y: 10 });
  // both (9,8) and (11,12) are on ring 2; the top edge comes first
  assert.deepEqual(suggestSpot({ x: 10, y: 10 }, (x, y) => (x === 9 && y === 8) || (x === 11 && y === 12)), { x: 9, y: 8 });
  assert.equal(suggestSpot({ x: 0, y: 0 }, () => false, 3), null);
  assert.deepEqual(suggestSpot({ x: 0, y: 0 }, (x, y) => x === 3 && y === -3, 3), { x: 3, y: -3 });
});

test('prep: due steps are owed whether the chapter shows or not; a done step is not owed again; a shared step counts once', () => {
  // a hidden chapter still owes its built step's reward
  const hidden = facts({ tier: 2, have: new Set<Need>(['gate']), save: { done: [], skipped: [], hidden: 2 } });
  assert.equal(prepView(hidden), null);
  assert.deepEqual(prepDue(hidden).map(s => s.id), ['prep-gate']);
  // done steps are not owed again; a skipped step that is built is still owed (its build pays once)
  const paid = facts({ tier: 2, have: new Set<Need>(['gate', 'foodTent']), save: { done: ['prep-gate', 'prep-foodTent'], skipped: [] } });
  assert.deepEqual(prepDue(paid).map(s => s.id), []);
  const skippedBuilt = facts({ tier: 2, have: new Set<Need>(['gate', 'foodTent']), save: { done: ['prep-gate'], skipped: ['prep-foodTent'] } });
  assert.deepEqual(prepDue(skippedBuilt).map(s => s.id), ['prep-foodTent']);
  // the first bleacher is in both chapters at tier 1 (the tier 1 and tier 2 chapters); owed once
  const shared = facts({ tier: 1, placed: [{ typeId: 'compactBleacher60' }] });
  assert.equal(prepDue(shared).filter(s => s.id === 'prep-first-stand').length, 1);
  assert.deepEqual(prepDue(shared).map(s => s.id), ['prep-first-stand']);
  assert.deepEqual(prepDue(facts({ tier: 2 })), [], 'nothing built: nothing owed');
});
