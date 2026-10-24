// The trees: the sun comes from the right, so a tree is mirrored only when its art is lit from the left (TREE_MIRROR, tree-sun.ts), and the
// generated four-view trees (trees-library.ts) are in the library, every view a tree the pools can deal. Every library tree has its light side
// recorded (TREE_LIGHT, scripts/assets/tree-sun.mjs) and is in the forest's tree pools (forest.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { TREE_LIGHT, TREE_MIRROR } from '../src/game/tree-sun';
import { OWNER_SCALE } from '../src/game/lots/scales';
import { CONIFER_IDS, FOREST_BROADLEAF, FOREST_CONIFERS, TREE_POOL_IDS } from '../src/game/forest';
import { TOWN_BROAD_DEAL, TOWN_CONIFER_DEAL } from '../src/game/towntrees';

const byId = new Map(LIBRARY.map(it => [it.id, it]));
const treeIds = LIBRARY.filter(it => it.kind === 'tree').map(it => it.id);

test('TREE_MIRROR names library trees only, and leaves most trees as they are', () => {
  for (const id of TREE_MIRROR) assert.equal(byId.get(id)?.kind, 'tree', `${id} is a library tree`);
  const trees = LIBRARY.filter(it => it.kind === 'tree');
  assert.ok(TREE_MIRROR.size < trees.length / 2, `${TREE_MIRROR.size} of ${trees.length} trees mirrored`);
});

test('every library tree has its light side recorded (run scripts/assets/tree-sun.mjs after adding tree art), and none is drawn lit from the left', () => {
  assert.ok(treeIds.length >= 60, `${treeIds.length} library trees`);
  for (const id of treeIds) assert.ok(TREE_LIGHT[id] === 'left' || TREE_LIGHT[id] === 'right', `${id} has no light side in tree-sun.ts`);
  for (const id of Object.keys(TREE_LIGHT)) assert.equal(byId.get(id)?.kind, 'tree', `${id} in TREE_LIGHT is a library tree`);
  for (const id of treeIds) {
    // the side the light is on as drawn: the art's side, swapped by the mirror
    const drawn = TREE_MIRROR.has(id) ? (TREE_LIGHT[id] === 'left' ? 'right' : 'left') : TREE_LIGHT[id];
    assert.equal(drawn, 'right', `${id} is drawn lit from the right`);
  }
  assert.deepEqual([...TREE_MIRROR].sort(), treeIds.filter(id => TREE_LIGHT[id] === 'left').sort());
  // the readings that settle it: the old pines are lit from the left; the blue spruce's warm light and lit trunk are on the right (by hand)
  for (const id of ['world:tree_pine_0', 'world:tree_pine_1', 'world:tree_pine_2']) assert.ok(TREE_MIRROR.has(id), `${id} is mirrored`);
  assert.equal(TREE_LIGHT['ref:tree-spruce-blue'], 'right');
});

test('the tree pools hold every library tree once: conifers are the pines, spruces and firs, the dead snags are woods-only', () => {
  assert.deepEqual([...TREE_POOL_IDS].sort(), [...treeIds].sort(), 'every library tree in the forest pools, and nothing else');
  assert.equal(new Set(TREE_POOL_IDS).size, TREE_POOL_IDS.length, 'no tree in two species');
  for (const id of treeIds) assert.equal(CONIFER_IDS.has(id), /pine|spruce|fir/.test(id), `${id} is ${CONIFER_IDS.has(id) ? '' : 'not '}a conifer`);
  for (const s of [...FOREST_CONIFERS, ...FOREST_BROADLEAF]) assert.ok(s.w > 0 && s.ids.length > 0, s.name);
  for (const s of FOREST_BROADLEAF) assert.equal(!!s.dead, s.ids.every(id => /dead/.test(id)), `${s.name}: dead snags only`);
  // the town trees deal every live tree, never a dead one
  const town = [...TOWN_CONIFER_DEAL.ids, ...TOWN_BROAD_DEAL.ids].sort();
  assert.deepEqual(town, treeIds.filter(id => !/dead/.test(id)).sort());
});

test('the generated trees: seven species in four views each, sized, footed and in the tree pools', () => {
  const gen = LIBRARY.filter(it => it.id.startsWith('gen:tree-'));
  assert.equal(gen.length, 28, `${gen.length} generated tree views`);
  const species = new Set(gen.map(it => it.id.replace(/:(ne|se|sw|nw)$/, '')));
  assert.equal(species.size, 7);
  for (const s of species) for (const d of ['ne', 'se', 'sw', 'nw']) assert.ok(byId.has(`${s}:${d}`), `${s}:${d}`);
  for (const it of gen) {
    assert.equal(it.kind, 'tree', it.id);
    assert.ok(it.w > 100 && it.h > 150, `${it.id} is ${it.w} x ${it.h}`);
    assert.ok(it.ax > 0 && it.ax < it.w && it.ay > it.h * 0.9 && it.ay <= it.h, `${it.id}: its ground point is the foot of the trunk`);
    assert.equal(OWNER_SCALE[it.id], 1, `${it.id} has its size in w and h`);
    assert.ok(!TREE_MIRROR.has(it.id), `${it.id} is lit from the right as drawn`);
    assert.ok(TREE_POOL_IDS.includes(it.id), `${it.id} is in the forest pools`);
  }
});
