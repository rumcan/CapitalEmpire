import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRUCTURE_GROUPS, groupOf } from '../src/game/golf/structure-groups';
import { STRUCTURES, STRUCTURE } from '../src/game/golf/tents';

test('structure groups: every structure type is in exactly one group, and every group id is a structure type', () => {
  const count = new Map<string, number>();
  for (const g of STRUCTURE_GROUPS) for (const id of g.ids) count.set(id, (count.get(id) ?? 0) + 1);
  for (const s of STRUCTURES) assert.equal(count.get(s.id) ?? 0, 1, `${s.id} is in ${count.get(s.id) ?? 0} groups`);
  for (const [id, n] of count) { assert.ok(STRUCTURE[id], `${id} is not a structure type`); assert.equal(n, 1, `${id} listed twice`); }
  assert.equal(new Set(STRUCTURE_GROUPS.map(g => g.id)).size, STRUCTURE_GROUPS.length, 'group ids are unique');
  assert.ok(STRUCTURE_GROUPS.every(g => g.ids.length > 0 && g.name.length > 0));
});

test('structure groups: the panel order, and groupOf', () => {
  assert.deepEqual(STRUCTURE_GROUPS.map(g => g.name), ['Entry & tickets', 'Spectator needs', 'Food & drink', 'Seating & viewing', 'Scoring', 'TV & media', 'Shops & sponsors', 'Hospitality', 'Transport', 'Lights']);
  assert.equal(groupOf('gate')?.id, 'entry');
  assert.equal(groupOf('seatedPavilion60')?.id, 'seating');
  assert.equal(groupOf('interchange')?.id, 'transport');
  assert.equal(groupOf('no-such-type'), undefined);
});
