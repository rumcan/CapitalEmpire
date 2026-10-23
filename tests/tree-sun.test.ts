// The trees: the sun comes from the right, so a tree is mirrored only when its art is lit from the left (TREE_MIRROR, tree-sun.ts), and the
// generated four-view trees (trees-library.ts) are in the library, every view a tree the pools can deal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { TREE_MIRROR } from '../src/game/tree-sun';
import { OWNER_SCALE } from '../src/game/lots/scales';

const byId = new Map(LIBRARY.map(it => [it.id, it]));

test('TREE_MIRROR names library trees only, and leaves most trees as they are', () => {
  for (const id of TREE_MIRROR) assert.equal(byId.get(id)?.kind, 'tree', `${id} is a library tree`);
  const trees = LIBRARY.filter(it => it.kind === 'tree');
  assert.ok(TREE_MIRROR.size < trees.length / 2, `${TREE_MIRROR.size} of ${trees.length} trees mirrored`);
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
  }
});
