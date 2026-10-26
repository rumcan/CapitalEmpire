// Headless forest tests: npm test (bundled by esbuild, run by node --test; no DOM, no library import).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, mulberry } from '../src/game/iso';
import { TC, generateTerrain, makeNoise } from '../src/game/terrain';
import { slopeField } from '../src/game/terrain-paint';
import { CONIFER_IDS, FOREST_BROAD_DEAL, FOREST_CELL, FOREST_CONIFER_DEAL, FOREST_SIZE, TREE_POOL_IDS, conifer, dealTree, forestCell, ownerSize, treeDeal, type ForestTree } from '../src/game/forest';

const t = generateTerrain(1);
const slope = slopeField(t.height);
const clearing = makeNoise(t.seed ^ 0x5f0e);
/** the trees of cell (ci, cj) on the test terrain */
const plant = (ci: number, cj: number) => forestCell(t.seed, t.cls, t.height, slope, clearing, ci, cj);
const N = MAP / FOREST_CELL;
/** every tree of the test map, planted once for the tests that look at the whole forest */
let everyTree: ForestTree[] | null = null;
const wholeForest = () => { if (!everyTree) { everyTree = []; for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) everyTree.push(...plant(ci, cj)); } return everyTree; };

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

test('conifer stays within [0.08, 0.9] at 2,000 seeded points spread over the map', () => {
  const r = mulberry(0x123456);
  for (let i = 0; i < 2000; i++) {
    const x = r() * MAP, y = r() * MAP;
    const c = conifer(clearing, x, y);
    assert.ok(c >= 0.08 - 1e-6 && c <= 0.9 + 1e-6, `conifer at ${x},${y} is ${c}`);
  }
});

test('conifer share across the forest is between 0.15 and 0.6', () => {
  let conifers = 0, total = 0;
  for (const tr of wholeForest()) { total++; if (CONIFER_IDS.has(tr.id)) conifers++; }
  const share = conifers / total;
  console.log(`conifers: ${conifers} of ${total} trees (${(share * 100).toFixed(1)}%)`);
  assert.ok(share >= 0.15 && share <= 0.6, `conifer share ${share}`);
});

test('the forest plants every tree of the pools somewhere on the map, each at its share of its owner size', () => {
  // the owner, 2026-10-24: "the trees on the mountain need to have all the trees. it's not using all the trees in the generating"
  const seen = new Map<string, number>();
  for (const tr of wholeForest()) {
    seen.set(tr.id, (seen.get(tr.id) ?? 0) + 1);
    const k = ownerSize(tr.id) * FOREST_SIZE;
    assert.ok(tr.scale >= 0.82 * k - 1e-9 && tr.scale <= 1.18 * k + 1e-9, `${tr.id} scale ${tr.scale}: ${k} +-18%`);
  }
  for (const id of TREE_POOL_IDS) assert.ok((seen.get(id) ?? 0) > 0, `${id} is planted`);
  assert.equal(seen.size, TREE_POOL_IDS.length, 'nothing outside the pools');
  console.log(`forest: ${seen.size} tree sprites, the rarest planted ${Math.min(...seen.values())} times`);
});

test('the conifer stands are mostly conifers and use every conifer; the broadleaf woods mostly broadleaf', () => {
  let inStand = 0, standConifers = 0, inWoods = 0, woodsConifers = 0;
  const standIds = new Set<string>();
  for (const tr of wholeForest()) {
    const c = conifer(clearing, tr.x, tr.y);
    if (c > 0.8) { inStand++; if (CONIFER_IDS.has(tr.id)) { standConifers++; standIds.add(tr.id); } }
    else if (c < 0.1) { inWoods++; if (CONIFER_IDS.has(tr.id)) woodsConifers++; }
  }
  assert.ok(inStand > 1000 && standConifers / inStand > 0.75, `stands: ${standConifers} conifers of ${inStand}`);
  assert.deepEqual([...standIds].sort(), [...CONIFER_IDS].sort(), 'every conifer grows in the stands');
  assert.ok(inWoods > 1000 && woodsConifers / inWoods < 0.5, `broadleaf woods: ${woodsConifers} conifers of ${inWoods}`);
});

test('the tree deals: deterministic, every id reachable, the shares follow the species weights', () => {
  for (const d of [FOREST_CONIFER_DEAL, FOREST_BROAD_DEAL]) {
    assert.equal(d.cum.length, d.ids.length);
    assert.ok(Math.abs(d.cum[d.cum.length - 1]! - 1) < 1e-12);
    assert.equal(dealTree(d, 0), d.ids[0]);
    assert.equal(dealTree(d, 1 - 1e-12), d.ids[d.ids.length - 1]);
    // every id answers the u in the middle of its own band
    for (let k = 0; k < d.ids.length; k++) assert.equal(dealTree(d, ((k ? d.cum[k - 1]! : 0) + d.cum[k]!) / 2), d.ids[k]);
  }
  const d = treeDeal([{ name: 'a', ids: ['a1', 'a2'], w: 1 }, { name: 'b', ids: ['b1'], w: 1 }, { name: 'z', ids: ['z1'], w: 2, dead: true }]);
  assert.deepEqual(d.cum, [0.125, 0.25, 0.5, 1]);
  assert.deepEqual(treeDeal([{ name: 'a', ids: ['a1'], w: 1 }, { name: 'z', ids: ['z1'], w: 2, dead: true }], true).ids, ['a1'], 'live: no dead snags');
});
