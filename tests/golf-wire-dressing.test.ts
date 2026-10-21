// Tests for wiring course dressing and cart path loop into new golf games
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain } from '../src/game/terrain';
import { planGolfGame } from '../src/game/golf/start';
import { dressCourse, DRESSING_SPRITE_IDS, PIN_RED_ID, PIN_YELLOW_ID, BENCH_ID } from '../src/game/golf/dressing';
import { surfaceOfTex } from '../src/game/golf/costs';

test('planGolfGame integrates cart path loop into paints and returns layout', () => {
  const terrain = generateTerrain(7);
  const plan = planGolfGame(terrain, 7);
  assert.ok(plan !== null, 'planGolfGame should find valid course for seed 7');
  assert.ok(plan.layout !== undefined, 'plan should include course layout');

  const pathAreas = plan.layout.areas.filter(a => a.surface === 'path');
  assert.ok(pathAreas.length > 0, 'layout should have path areas from withCartPathLoop');

  const pathPaints = plan.paints.filter(p => surfaceOfTex(p.tex) === 'path');
  assert.ok(pathPaints.length > 0, 'plan.paints should include painted cart path areas');
});

test('dressCourse produces valid dressed props from plan layout deterministically', () => {
  const terrain = generateTerrain(7);
  const plan = planGolfGame(terrain, 7)!;
  const props1 = dressCourse(plan.layout, 7);
  const props2 = dressCourse(plan.layout, 7);

  assert.deepEqual(props1, props2, 'dressCourse should be deterministic');
  assert.ok(props1.length > 30, 'should generate flags, tees, benches, and trees');

  for (const p of props1) {
    assert.ok(DRESSING_SPRITE_IDS.has(p.id), `unexpected sprite id ${p.id}`);
    assert.equal(typeof p.x, 'number');
    assert.equal(typeof p.y, 'number');
    assert.equal(typeof p.flip, 'boolean');
    assert.equal(typeof p.scale, 'number');
  }

  const redFlags = props1.filter(p => p.id === PIN_RED_ID);
  const yellowFlags = props1.filter(p => p.id === PIN_YELLOW_ID);
  assert.equal(redFlags.length, 8);
  assert.equal(yellowFlags.length, 1 + plan.layout.tees.filter(t => t.kind === 'forward').length, 'one pin flag plus the forward tee markers, which reuse the yellow flag sprite');

  const benches = props1.filter(p => p.id === BENCH_ID);
  assert.equal(benches.length, 9);
});
