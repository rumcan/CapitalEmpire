// The screen-axis sets in the game (T154; the owner, 2026-10-26: "focus on bringing the next art into the game. i want to see new buildings and
// plants etc too"): the art model's <slug>-screen-axis-4views-v1 sets (scripts/assets/sync-axis-views.mjs, prep-axis-views.mjs: axis-library.ts).
// Each set is four genuine quarter turns N, E, S, W (the front facing screen down, right, up, left): every picture is in the library, turns to the
// next of its set, is never mirrored, is drawn as itself (no stand-in), and is sized with its subject; the new subjects are placeable (the Props
// tool, the lot lab); the eight-way cars and the pickup join their car models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { AXIS_HEADING, AXIS_NEW, AXIS_SETS, AXIS_TURN } from '../src/game/axis-library';
import { EXTRA_VIEW_SETS as GARAGE_VIEW_SETS } from '../src/game/extra-views-library';
import { drawnAs } from '../src/game/mirror';
import { axisViews, baseView, footprintOf, sizeKey, sizeViews, turned } from '../src/game/lots/preset-art';
import { drawnAsStandIn, lookOf, standInLabel } from '../src/game/newart';
import { carModel } from '../src/game/ext/car-art';
import { DECOR } from '../src/game/golf/decor';
import { OWNER_SCALE } from '../src/game/lots/scales';
import { placeable, spriteGroup } from '../src/game/dev/lot-lab-palette';

const BY = new Map(LIBRARY.map((it, i) => [it.id, i] as const));

test('every set: four pictures in the library, N E S W, one quarter turn apart, never mirrored', () => {
  const sets = Object.entries(AXIS_SETS);
  assert.ok(sets.length >= 26, `${sets.length} subjects`);
  for (const [id, views] of sets) {
    assert.equal(views.length, 4, id);
    views.forEach((v, i) => {
      assert.ok(BY.has(v), `${v} is in the library`);
      assert.equal(AXIS_HEADING[v], 'NESW'[i], `${v}: its heading`);
      // the turn: one quarter takes it to the next of the set (lots/preset-art.ts), whatever the start
      for (let q = 0; q < 4; q++) assert.deepEqual(turned(v, q), { id: views[(i + q) % 4], flip: false }, `${v} turned ${q}`);
      assert.deepEqual(baseView(v), { id: views[0], view: i });
      assert.equal(axisViews(v)?.at, i);
      // a flip (the world axes swapped) draws E as W and W as E, N and S as they are: never mirrored
      const it = LIBRARY[BY.get(v)!]!, [d, f] = drawnAs(it, true);
      assert.equal(f, false, `${v} is never mirrored`);
      assert.equal(d, views[[0, 3, 2, 1][i]!], `${v} flipped is drawn as its partner`);
      assert.deepEqual(drawnAs(it, false), [v, false]);
      assert.equal(AXIS_TURN[AXIS_TURN[v]!], v);
    });
    // a new subject's N view is its own id; a subject the library had keeps its picture and gains view:<id>:n|e|s|w
    if (AXIS_NEW.has(id)) assert.equal(views[0], id); else assert.deepEqual([...views], ['n', 'e', 's', 'w'].map(d => `view:${id}:${d}`));
  }
});

test('the pictures are drawn as themselves (new art, no stand-in), on a footprint that does not change as they turn', () => {
  for (const views of Object.values(AXIS_SETS)) for (const v of views) {
    const i = BY.get(v)!, it = LIBRARY[i]!;
    assert.ok(!drawnAsStandIn(i), `${v} is no stand-in`);
    assert.equal(standInLabel(i), null, `${v} has no stand-in label`);
    const d = { item: i, x: 10, y: 10, flip: false, scale: 0.5 }, l = lookOf(d);
    assert.ok(!l.hidden && l.item === i, `${v} is drawn as itself`);
    assert.ok(it.w > 0 && it.h > 0 && it.ax > 0 && it.ax < it.w && it.ay > 0 && it.ay <= it.h, `${v}: its ground point inside its picture`);
    const b = it.boxes[0]!; assert.equal(b.hx, b.hy, `${v}: the world box round the turned rectangle is square`);
    const f0 = footprintOf(v, 1, false), f1 = footprintOf(turned(v, 1).id, 1, false);
    assert.deepEqual(f0, f1, `${v}: the footprint turns with it`);
  }
});

test('the new subjects: the car parks, the shrubs and the beds, in their categories; the rest gain extra headings', () => {
  for (const n of [2, 3, 4, 5, 6]) { const id = `ce:parking-garage-${n}storey`; assert.ok(AXIS_NEW.has(id), id); assert.equal(LIBRARY[BY.get(id)!]!.cat, 'Parking'); assert.equal(LIBRARY[BY.get(id)!]!.kind, 'building'); }
  for (const id of ['landscape:bush-deep-green', 'landscape:bush-golden-russet', 'landscape:bush-sage-round', 'landscape:flowerbed-daisies', 'landscape:flowerbed-lavender', 'landscape:flowerbed-marigolds', 'landscape:hydrangea-pale']) {
    assert.ok(AXIS_NEW.has(id), id); assert.equal(LIBRARY[BY.get(id)!]!.cat, 'Landscaping', id);
  }
  for (const id of ['town:bakery', 'town:grocery', 'town:pharmacy', 'world:house_0', 'world:house_1', 'world:house_3', 'world:bench', 'world:streetlamp', 'world:trashcan', 'ce:parking-entry', 'static:pickup_n',
    'variation:industrial-auto-body-shop-63875699:1', 'variation:industrial-brick-machine-shop-34206b23:1', 'variation:industrial-corrugated-warehouse-69aeee07:1']) {
    assert.ok(AXIS_SETS[id] && !AXIS_NEW.has(id), `${id}: extra headings`); assert.ok(BY.has(id), `${id} keeps its picture`);
  }
  // the eight-way cars take their cardinal headings in prep-cars.mjs: no set of their own here
  assert.ok(!AXIS_SETS['cars:burgundy-wagon'] && !AXIS_SETS['cars:navy-wood-panel-wagon']);
});

test('the lot lab\x27s palette offers each set once, by its N view, in its group', () => {
  const ok = (id: string) => placeable(LIBRARY[BY.get(id)!]!, BY.get(id)!);
  for (const id of ['ce:parking-garage-6storey', 'landscape:flowerbed-daisies', 'view:town:bakery:n', 'view:world:bench:n', 'view:static:pickup_n:n']) assert.ok(ok(id), `${id} is offered`);
  for (const id of ['view:ce:parking-garage-6storey:e', 'view:town:bakery:s', 'view:world:bench:w']) assert.ok(!ok(id), `${id} is a turn of its set, not offered`);
  assert.equal(spriteGroup(LIBRARY[BY.get('landscape:bush-sage-round')!]!), 'plants');
  assert.equal(spriteGroup(LIBRARY[BY.get('ce:parking-garage-2storey')!]!), 'buildings');
});

test('sizes: a set is sized with its subject (one studio size, its card), a car with its model', () => {
  assert.equal(sizeKey('view:town:bakery:e'), 'town:bakery');
  assert.equal(sizeKey('view:town:bakery:sw'), 'town:bakery');
  assert.equal(sizeKey('view:ce:parking-garage-6storey:s'), 'ce:parking-garage-6storey');
  assert.deepEqual(sizeViews('ce:parking-garage-6storey'), [...AXIS_SETS['ce:parking-garage-6storey']!, ...(GARAGE_VIEW_SETS['ce:parking-garage-6storey'] ?? [])]);
  const bakery = sizeViews('town:bakery'); assert.equal(bakery.length, 8, 'the bakery: its four diagonal views and its four screen-axis views');
  for (const v of AXIS_SETS['world:bench']!) assert.equal(OWNER_SCALE[v], OWNER_SCALE['world:bench'], `${v} takes the bench's size`);
  for (const v of AXIS_SETS['static:pickup_n']!) { assert.equal(carModel(v), 'static:pickup'); assert.equal(LIBRARY[BY.get(v)!]!.kind, 'car'); }
});

test('the Props tool sells the new shrubs, beds, bench, bin and lamp post, each turning through its four views', () => {
  const ids = new Set(DECOR.map(d => d.id));
  for (const id of ['landscape:flowerbed-daisies', 'landscape:flowerbed-lavender', 'landscape:flowerbed-marigolds', 'landscape:bush-deep-green', 'landscape:bush-golden-russet', 'landscape:bush-sage-round', 'landscape:hydrangea-pale',
    'view:world:bench:n', 'view:world:trashcan:n', 'view:world:streetlamp:n']) {
    assert.ok(ids.has(id), id);
    assert.equal(new Set([0, 1, 2, 3].map(q => turned(id, q).id)).size, 4, `${id} turns through four pictures`);
  }
  assert.ok(!DECOR.find(d => d.key === 'flower-bed')!.standIn, 'the flower bed is real art now');
});
