// A car's model (ext/car-art/model.mjs): every car picture in the library (its facings, its views, the eight headings of the eight-way cars) and every
// removed car maps to its model, the key its studio size is kept by, so one Library card sizes the whole car (T143). A size set on the model reaches
// every picture of it; the sizes a studio kept per picture before T143 fold into the model's key, the largest of them, and a building's views are
// left alone. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CAR_DIRECTIONS, carModel, carModelName, carModelSize, carOwnerScale, foldCarSizes } from '../src/game/ext/car-art';
import { LIBRARY } from '../src/game/library';

const REMOVED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/assets/removed.json'), 'utf8')) as Record<string, { kind?: string }>;
/** every car id the game has or had: the library's cars and the removed ones */
const CAR_IDS = [...LIBRARY.filter(it => it.kind === 'car').map(it => it.id), ...Object.keys(REMOVED).filter(id => REMOVED[id]!.kind === 'car')];
/** the models the cars make: the two eight-way cars, the town cars (Compact, Pickup, Van), the world cars and the bus */
const MODELS = ['cars:burgundy-wagon', 'cars:navy-wood-panel-wagon', 'static:compact', 'static:pickup', 'static:van', 'world:car_0', 'world:car_1', 'world:car_2', 'world:car_3', 'world:schoolbus'];

test('every car id in the library, and every removed car, maps to one of the known models; every model has a picture', () => {
  assert.ok(CAR_IDS.length > 60, `${CAR_IDS.length} car ids`);
  const seen = new Set<string>();
  for (const id of CAR_IDS) { const m = carModel(id); assert.ok(MODELS.includes(m), `${id} -> ${m}`); seen.add(m); }
  assert.deepEqual([...seen].sort(), MODELS, 'every model is some car\'s');
});

test('the rule: a variation view takes its base\'s model, an eight-way heading its model, a town car\'s facing (and -v2) its name, a world car is its own', () => {
  assert.equal(carModel('variation:static-compact_n-v2-ea89d6fd:4'), 'static:compact');
  assert.equal(carModel('variation:static-compact_s-0c90743f:1'), 'static:compact');
  assert.equal(carModel('variation:world-car_2-3ef8eade:2'), 'world:car_2');
  assert.equal(carModel('variation:world-schoolbus-6df6411d:3'), 'world:schoolbus');
  assert.equal(carModel('variation:static-pickup_n-v2-1b5bf1b2:1'), 'static:pickup');
  for (const d of CAR_DIRECTIONS) assert.equal(carModel(`cars:navy-wood-panel-wagon:${d}`), 'cars:navy-wood-panel-wagon');
  for (const id of ['static:compact_n', 'static:compact_e', 'static:compact_s', 'static:compact_w', 'static:compact_n-v2']) assert.equal(carModel(id), 'static:compact');
  assert.equal(carModel('static:van_e-v2'), 'static:van');
  for (const id of ['world:car_0', 'world:car_3', 'world:schoolbus']) assert.equal(carModel(id), id);
  assert.equal(carModel('static:compact'), 'static:compact', 'a model is its own model');
  // the rule is for car ids: a building's or a decor's ids are not cars (the callers check the kind), but they are never mistaken for a car's model
  for (const id of ['variation:expansion-scrap-pickup-rear-7e2d1193:1', 'business:golf-cart-se', 'static:house_a']) assert.ok(!MODELS.includes(carModel(id)), id);
});

test('a model\'s card name: the table\'s for the town cars and the bus, else its id\'s name', () => {
  assert.equal(carModelName('static:compact'), 'Compact');
  assert.equal(carModelName('static:pickup'), 'Pickup');
  assert.equal(carModelName('world:schoolbus'), 'School bus');
  assert.equal(carModelName('world:car_0'), 'Car 0');
  assert.equal(carModelName('cars:burgundy-wagon'), 'Burgundy wagon');
});

test('a model\'s size is its own key, else the largest kept under its pictures\' ids (never lose a size the owner set); unset: undefined', () => {
  const sizes = { 'world:car_0': 1.259, 'variation:world-car_0-cf8f927b:1': 1.36, 'variation:world-car_0-cf8f927b:2': 1.166, 'world:car_1': 1.2, 'static:compact': 1.08, 'variation:expansion-scrap-pickup-rear-7e2d1193:1': 0.923 };
  assert.equal(carModelSize(sizes, 'world:car_0'), 1.36, 'the largest over Car 0\'s keys');
  assert.equal(carModelSize(sizes, 'world:car_1'), 1.2);
  assert.equal(carModelSize(sizes, 'static:compact'), 1.08);
  assert.equal(carModelSize(sizes, 'world:schoolbus'), undefined);
  // a size set on the model reaches every picture of it, in the game's reading of the sizes (carOwnerScale)
  const set = { 'static:compact': 1.3, 'world:car_0': 1.1 };
  for (const id of CAR_IDS) if (carModel(id) === 'static:compact') assert.equal(carOwnerScale(id, set), 1.3, id);
  for (const id of CAR_IDS) if (carModel(id) === 'world:car_0') assert.equal(carOwnerScale(id, set), 1.1, id);
  for (const id of CAR_IDS) if (carModel(id) === 'world:car_1') assert.equal(carOwnerScale(id, set), 1, `${id}: unset`);
});

test('folding the sizes: one key per car model (the largest), the other keys as they were, and the file\'s order is the studio\'s to keep', () => {
  const sizes = { 'world:car_0': 1.259, 'variation:world-car_0-cf8f927b:1': 1.36, 'static:compact_e': 1.166, 'static:compact_w': 1.259, 'static:compact_n': 1.08, 'world:schoolbus': 1.714, 'variation:expansion-scrap-pickup-rear-7e2d1193:1': 0.923, 'business:golf-cart-se': 0.317, 'cars:burgundy-wagon': 1.05 };
  const out = foldCarSizes(sizes, CAR_IDS);
  assert.deepEqual(out, { 'world:car_0': 1.36, 'static:compact': 1.259, 'world:schoolbus': 1.714, 'variation:expansion-scrap-pickup-rear-7e2d1193:1': 0.923, 'business:golf-cart-se': 0.317, 'cars:burgundy-wagon': 1.05 });
  assert.deepEqual(sizes['static:compact_e'], 1.166, 'the input is not changed');
  for (const id of CAR_IDS) assert.equal(carOwnerScale(id, out), carOwnerScale(id, sizes), `${id}: the same size before and after the fold`);
  assert.deepEqual(foldCarSizes(out, CAR_IDS), out, 'folded once is folded');
});
