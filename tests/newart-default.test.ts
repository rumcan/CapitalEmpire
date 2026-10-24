// The default (no URL flag): no building is drawn with its old picture (the owner, 2026-10-24). Runs in the default mode: no ?newart helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { NEW_ART_ONLY, NEW_BUILDINGS_ONLY, OLD_ART, lookOf, thumbItem } from '../src/game/newart';
import { isBuilding } from '../src/game/mirror';
import { VIEW_ART } from '../src/game/views-library';

const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:');

test('the default: no URL flag, so buildings only are swapped (?oldart and ?newart are off)', () => {
  assert.equal(NEW_ART_ONLY, false);
  assert.equal(OLD_ART, false);
  assert.equal(NEW_BUILDINGS_ONLY, true);
});

test('by default every building is drawn as itself when it is new art, else as a new-art stand-in on its footprint, never mirrored', () => {
  let swapped = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    for (const flip of [false, true]) {
      const d = { item: i, flip, scale: 1.5, x: 100 + i, y: 200 - i }, look = lookOf(d);
      if (isNew(it.id)) { assert.equal(look, d, `${it.id} is new art, drawn as itself`); continue; }
      assert.ok(!look.hidden, `${it.id} has a new-art stand-in`);
      assert.ok(isNew(LIBRARY[look.item]!.id), `${it.id} is drawn as ${LIBRARY[look.item]!.id}`);
      assert.equal(look.flip, false, `${it.id} is turned, never mirrored`);
      swapped++;
    }
  });
  assert.ok(swapped > 50, `${swapped} pictures swapped`);
});

test('by default a tree that is not generated is drawn as itself (trees keep their art unless ?newart)', () => {
  let trees = 0;
  LIBRARY.forEach((it, i) => {
    if (it.kind !== 'tree' || it.id.startsWith('gen:tree-')) return;
    trees++;
    for (const flip of [false, true]) { const d = { item: i, flip, scale: 1.5, x: 100 + i, y: 200 - i }; assert.equal(lookOf(d), d, `${it.id} is drawn as itself`); }
  });
  assert.ok(trees > 0, `${trees} trees kept their art`);
});

test('thumbItem: an old building is thumbnailed as its new-art stand-in, a new-art building as itself', () => {
  let old = 0;
  LIBRARY.forEach(it => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    if (isNew(it.id)) { assert.equal(thumbItem(it), it, `${it.id} thumbnails as itself`); return; }
    old++;
    assert.ok(isNew(thumbItem(it).id), `${it.id} thumbnails as ${thumbItem(it).id}`);
  });
  assert.ok(old > 50, `${old} old buildings thumbnailed as new art`);
});

test("a baked lot (the studio's Lots presets) is drawn as itself, never as one building stretched over the lot", () => {
  let lots = 0;
  LIBRARY.forEach((it, i) => {
    if (it.kind !== 'lot') return;
    lots++;
    const d = { item: i, flip: false, scale: 1, x: 10, y: 20 };
    assert.equal(lookOf(d), d, `${it.id} is drawn as itself`);
    assert.equal(thumbItem(it), it, `${it.id} thumbnails as itself`);
  });
  assert.ok(lots > 0, `${lots} baked lots`);
});
