// The default (no URL flag): no building is drawn with its old picture (the owner, 2026-10-24). Runs in the default mode: no ?newart helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { NEW_ART_ONLY, NEW_BUILDINGS_ONLY, OLD_ART, lookOf, standInFamily, thumbItem } from '../src/game/newart';
import { isBuilding } from '../src/game/mirror';
import { BUILDING_IDS, VIEW_ART } from '../src/game/views-library';
import type { LibItem } from '../src/game/types';

const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:');
/** a building of the art inventory (the pictures that get four views): the only ones swapped; the props packed with the business art are drawn
 *  as themselves (tests/course-props.test.ts) */
const inventory = (it: LibItem) => BUILDING_IDS.has(it.id) || isNew(it.id);
const BY_ID = new Map(LIBRARY.map(it => [it.id, it] as const));
/** the family of a picture as drawn: a flipped stand-in is a turned view (view:<base>:se, sw or nw), a picture of its building, so of that family */
const pictureFamily = (it: LibItem) => standInFamily(BY_ID.get(it.id.replace(/^view:(.+):(se|sw|nw)$/, '$1')) ?? it);

test('the default: no URL flag, so buildings only are swapped (?oldart and ?newart are off)', () => {
  assert.equal(NEW_ART_ONLY, false);
  assert.equal(OLD_ART, false);
  assert.equal(NEW_BUILDINGS_ONLY, true);
});

test('by default every building is drawn as itself when it is new art, else as a new-art stand-in of its family on its footprint, never mirrored', () => {
  let swapped = 0, lacking = 0, buildings = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot' || !inventory(it)) return;
    buildings++; if (!isNew(it.id)) lacking++;
    for (const flip of [false, true]) {
      const d = { item: i, flip, scale: 1.5, x: 100 + i, y: 200 - i }, look = lookOf(d);
      // drawn as itself (at its pixel limit when 1.5 is past it: sizes.ts)
      if (isNew(it.id)) { assert.ok(look.item === i && look.flip === d.flip && look.scale <= d.scale, `${it.id} is new art, drawn as itself`); continue; }
      assert.ok(!look.hidden, `${it.id} has a new-art stand-in`);
      assert.ok(isNew(LIBRARY[look.item]!.id), `${it.id} is drawn as ${LIBRARY[look.item]!.id}`);
      assert.equal(pictureFamily(LIBRARY[look.item]!), standInFamily(it), `${it.id} is drawn as ${LIBRARY[look.item]!.id}, of another family`);
      assert.equal(look.flip, false, `${it.id} is turned, never mirrored`);
      swapped++;
    }
  });
  // the stand-ins thin out as the new art comes in (over 50 swaps before T154's art, 44 after the Rebuild of 2026-10-26), so no count of them is
  // pinned (T164): every building still without its new art was checked above, unflipped and flipped; the loop saw the whole art inventory
  assert.ok(buildings > 100, `${buildings} buildings of the art inventory (${lacking} drawn as stand-ins, ${swapped} swaps checked)`);
});

test('by default a tree that is not generated is drawn as itself (trees keep their art unless ?newart)', () => {
  let trees = 0;
  LIBRARY.forEach((it, i) => {
    if (it.kind !== 'tree' || it.id.startsWith('gen:tree-')) return;
    trees++;
    for (const flip of [false, true]) { const d = { item: i, flip, scale: 1.5, x: 100 + i, y: 200 - i }, l = lookOf(d); assert.ok(l.item === i && l.flip === flip && !l.hidden, `${it.id} is drawn as itself`); }
  });
  assert.ok(trees > 0, `${trees} trees kept their art`);
});

test('thumbItem: an old building is thumbnailed as its new-art stand-in, a new-art building as itself, a prop as itself', () => {
  let old = 0;
  LIBRARY.forEach(it => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    if (!inventory(it)) { assert.equal(thumbItem(it), it, `${it.id} is a prop: thumbnails as itself`); return; }
    if (isNew(it.id)) { assert.equal(thumbItem(it), it, `${it.id} thumbnails as itself`); return; }
    old++;
    assert.ok(isNew(thumbItem(it).id), `${it.id} thumbnails as ${thumbItem(it).id}`);
  });
  assert.ok(old > 20, `${old} old buildings thumbnailed as new art`); // shrinks as the four-view art lands (46 on 2026-10-25, the 20 business-art props no longer counted; 27 after T154's Rebuild applied the studio's removals)
});

test('an old dwelling is drawn as a house: its stand-in is never a tent, a garage or an industrial building, nor golf or industry art (the owner, 2026-10-24)', () => {
  let dwellings = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot' || isNew(it.id) || standInFamily(it) !== 'dwelling') return;
    dwellings++;
    for (const flip of [false, true]) {
      const look = lookOf({ item: i, flip, scale: 1, x: 100 + i, y: 200 - i }), s = LIBRARY[look.item]!;
      assert.ok(!look.hidden, `${it.id} has a stand-in`);
      assert.doesNotMatch(s.id, /tent|garage|shed|warehouse|workshop|factory|mill|plant/, `${it.id} is drawn as ${s.id}`);
      assert.ok(s.cat !== 'Golf tournament' && s.cat !== 'Industry', `${it.id} is drawn as ${s.id} (${s.cat})`);
    }
  });
  assert.ok(dwellings > 5, `${dwellings} old dwellings`); // shrinks as the four-view art lands (17 after the 2026-10-24 evening import, 9 after T154's Rebuild applied the studio's removals)
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
