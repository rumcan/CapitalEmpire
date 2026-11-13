// The jam build's cut (docs/JAM.md, J1; T459 the MVP): the rail keeps the core loop's tools and drops the rest; the flag is off under node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JAM, JAM_START_MONEY } from '../src/game/features';
import { RAIL, jamRail } from '../src/ui/rail-items';

test('JAM is off outside the jam build and starts at 75k', () => { assert.equal(JAM, false); assert.equal(JAM_START_MONEY, 75_000); });
test('the MVP rail (T459): Select, Range, Course (holes and buildings, no Tournament or Land for sale), Cart paths, Bulldoze', () => {
  const j = jamRail(RAIL);
  assert.deepEqual(j.map(r => r.id), ['select', 'range', 'course', 'paths', 'bulldoze']);
  assert.deepEqual(j.find(r => r.id === 'paths')!.tools.map(t => t.id), ['path']);
  assert.deepEqual(j.find(r => r.id === 'course')!.extras, []);
  assert.deepEqual(j.find(r => r.id === 'course')!.tools.map(t => t.id), ['course', 'buildings']);
});
