// Headless tests for the plant brushes' helpers (src/game/plant.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOWER_IDS, PLANT_DEFAULTS, PLANT_R, PLANT_SPACING, clampPlant, plantPoints, plantPool } from '../src/game/plant';

test('plantPoints: seeded spots inside the circle, about 1.5 x area / spacing² of them', () => {
  const a = plantPoints(100, 200, 6, 2, 7), b = plantPoints(100, 200, 6, 2, 7);
  assert.deepEqual(a, b, 'same seed, same spots');
  assert.equal(a.length, Math.ceil(1.5 * Math.PI * 36 / 4));
  for (const p of a) assert.ok(Math.hypot(p.x - 100, p.y - 200) <= 6 + 1e-9);
  assert.notDeepEqual(plantPoints(100, 200, 6, 2, 8), a, 'another seed, other spots');
  assert.equal(plantPoints(0, 0, 0.5, 12, 1).length, 1, 'always at least one');
});

test('clampPlant: defaults, ranges, a swapped size range, and the sprite list', () => {
  assert.deepEqual(clampPlant(undefined, 'bushes'), PLANT_DEFAULTS.bushes);
  const s = clampPlant({ r: 99, spacing: 0, lo: 2, hi: 0.5, ids: ['a', 3 as unknown as string] }, 'trees');
  assert.deepEqual([s.r, s.spacing, s.lo, s.hi, s.ids], [PLANT_R[1], PLANT_SPACING[0], 0.5, 2, ['a']]);
  assert.deepEqual(clampPlant({ ids: [] }, 'trees').ids, [], 'an empty pick stays empty');
});

test('plantPool: trees by kind, bushes without the flowers, flowers are the three ground plants', () => {
  const items = [{ id: 't1', name: 'T', kind: 'tree' }, { id: 'b1', name: 'B', kind: 'bush' }, ...FLOWER_IDS.map(id => ({ id, name: id, kind: 'bush' })), { id: 'h', name: 'H', kind: 'house' }];
  assert.deepEqual(plantPool(items, 'trees').map(x => x.id), ['t1']);
  assert.deepEqual(plantPool(items, 'bushes').map(x => x.id), ['b1']);
  assert.deepEqual(plantPool(items, 'flowers').map(x => x.id), FLOWER_IDS);
});
