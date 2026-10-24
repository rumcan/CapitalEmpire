import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundClass, splitByTerrain } from '../src/game/structures';
import { SK } from '../src/game/network';
import { TC } from '../src/game/terrain/types';

test('woodland reads as ground for roads; water still bridges', () => {
  assert.equal(groundClass(TC.HILL), TC.GROUND);
  assert.equal(groundClass(TC.WATER), TC.WATER);
  assert.equal(groundClass(TC.PATCH), TC.PATCH);
  const legs = [{ a: { x: 0, y: 0 }, b: { x: 60, y: 0 } }];
  const wood = splitByTerrain(legs, 2, () => groundClass(TC.HILL));
  assert.ok(wood.kinds.every(k => k === SK.GROUND), `kinds ${wood.kinds}`);
  const river = splitByTerrain(legs, 2, x => groundClass(x > 20 && x < 40 ? TC.WATER : TC.HILL));
  assert.ok(river.kinds.includes(SK.BRIDGE), 'the river is still bridged');
  assert.ok(!river.kinds.includes(SK.TUNNEL), 'no tunnel through the woods');
});
