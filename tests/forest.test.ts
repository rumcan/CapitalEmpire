// Headless forest tests: npm test (bundled by esbuild, run by node --test; no DOM, no library import).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, generateTerrain, makeNoise } from '../src/game/terrain';
import { slopeField } from '../src/game/terrain-paint';
import { FOREST_CELL, forestCell } from '../src/game/forest';

const t = generateTerrain(1);
const slope = slopeField(t.height);
const clearing = makeNoise(t.seed ^ 0x5f0e);
/** the trees of cell (ci, cj) on the test terrain */
const plant = (ci: number, cj: number) => forestCell(t.seed, t.cls, t.height, slope, clearing, ci, cj);
const N = MAP / FOREST_CELL;

test('forest trees stand on hill tiles and a cell plants the same trees twice', () => {
  for (const [ci, cj] of [[5, 5], [16, 16], [28, 3]]) {
    const trees = plant(ci, cj);
    for (const tr of trees) assert.equal(t.cls[Math.floor(tr.y) * MAP + Math.floor(tr.x)], TC.HILL);
    assert.deepEqual(plant(ci, cj), trees);
  }
});

test('the forest covers 6% to 20% of the hill tiles', () => {
  let hills = 0, trees = 0;
  for (let i = 0; i < t.cls.length; i++) if (t.cls[i] === TC.HILL) hills++;
  for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) trees += plant(ci, cj).length;
  const ratio = trees / hills;
  console.log(`forest: ${trees} trees on ${hills} hill tiles, ratio ${(ratio * 100).toFixed(1)}%`);
  assert.ok(ratio >= 0.06 && ratio <= 0.2, `ratio ${ratio}`);
});

test('trees in neighbouring cells (0,0) and (1,0) are never closer than 0.3 tiles', () => {
  const a = plant(0, 0), b = plant(1, 0);
  for (const p of a) for (const q of b) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 0.3, `trees at ${p.x},${p.y} and ${q.x},${q.y}`);
});
