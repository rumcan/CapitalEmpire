// Headless town-tree tests: npm test (bundled by esbuild, run by node --test; no DOM, no library import).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, makeNoise } from '../src/game/terrain';
import { FOREST_CELL } from '../src/game/forest';
import { TOWN_TREE_S, townTreeCell } from '../src/game/towntrees';
import { OWNER_SCALE } from '../src/game/lots/scales';

const SEED = 7;
const clump = makeNoise(SEED ^ 0x7c1a);
const groundAll = () => new Uint8Array(MAP * MAP);
const always = () => true;
const never = () => false;
/** the jittered grid points of cell (ci, cj): the count the cell can plant from */
function gridCount(ci: number, cj: number): number {
  let n = 0;
  for (let gx = Math.floor(ci * FOREST_CELL / TOWN_TREE_S) - 1; gx <= Math.ceil((ci + 1) * FOREST_CELL / TOWN_TREE_S) + 1; gx++)
    for (let gy = Math.floor(cj * FOREST_CELL / TOWN_TREE_S) - 1; gy <= Math.ceil((cj + 1) * FOREST_CELL / TOWN_TREE_S) + 1; gy++)
      if (Math.floor((gx + 0.5) * TOWN_TREE_S / FOREST_CELL) === ci && Math.floor((gy + 0.5) * TOWN_TREE_S / FOREST_CELL) === cj) n++;
  return n;
}

test('a town cell on open ground plants between 20% and 90% of its grid points, the same twice', () => {
  const cls = groundAll();
  const trees = townTreeCell(SEED, cls, clump, 5, 5, always, always);
  const n = gridCount(5, 5);
  assert.ok(trees.length >= 0.2 * n && trees.length <= 0.9 * n, `planted ${trees.length} of ${n}`);
  assert.deepEqual(townTreeCell(SEED, cls, clump, 5, 5, always, always), trees);
  for (const tr of trees) {
    const k = (OWNER_SCALE as Record<string, number>)[tr.id] ?? 1.5;
    assert.ok(tr.scale >= 0.9 * k - 1e-9 && tr.scale <= 1.1 * k + 1e-9, `${tr.id} scale ${tr.scale}: the lot trees' size ${k} +-10%`);
    assert.equal(typeof tr.flip, 'boolean');
  }
});

test('no town trees where the free test fails everywhere, or outside the town', () => {
  assert.equal(townTreeCell(SEED, groundAll(), clump, 5, 5, never, always).length, 0);
  assert.equal(townTreeCell(SEED, groundAll(), clump, 5, 5, always, never).length, 0);
});

test('no town tree stands on water, and none on a hill', () => {
  const cls = groundAll();
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) cls[y * MAP + x] = x < 340 ? TC.WATER : TC.HILL;
  assert.equal(townTreeCell(SEED, cls, clump, 5, 5, always, always).length, 0);
  const half = groundAll();
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) half[y * MAP + x] = x < 340 ? TC.WATER : TC.GROUND;
  const trees = townTreeCell(SEED, half, clump, 5, 5, always, always);
  assert.ok(trees.length > 0);
  for (const tr of trees) assert.equal(half[Math.floor(tr.y) * MAP + Math.floor(tr.x)], TC.GROUND);
});
