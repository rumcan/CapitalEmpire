// The jam build's cut (docs/JAM.md, J1): the rail keeps the money game's tools and drops the town and tournament ones; the flag is off under node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JAM, JAM_START_MONEY } from '../src/game/features';
import { RAIL, jamRail } from '../src/ui/rail-items';

test('JAM is off outside the jam build and starts at 75k', () => { assert.equal(JAM, false); assert.equal(JAM_START_MONEY, 75_000); });
test('jamRail keeps Select, Range, Course, paths, Facilities, Ground, car park, Bulldoze', () => {
  const j = jamRail(RAIL);
  assert.deepEqual(j.map(r => r.id), ['select', 'range', 'course', 'paths', 'facilities', 'ground', 'traffic', 'bulldoze']);
  assert.deepEqual(j.find(r => r.id === 'traffic')!.tools.map(t => t.id), ['park']);
  assert.deepEqual(j.find(r => r.id === 'paths')!.tools.map(t => t.id), ['path']);
  assert.deepEqual(j.find(r => r.id === 'course')!.extras!.map(x => x.id), ['land']);
});
