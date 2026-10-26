// A car's size (the owner's studio size, keyed by its model: the eight headings share one) multiplies its drawn size wherever it is drawn: the picture
// the engine draws (sprites.ts spriteRect, parked and moving), its footprint (preset-art footprintOf) and the owner scale a preset or a lot multiplies
// (ownerScaleOf). A decal's studio size is packed into its strip (prep-decals.mjs), so it is not tested here. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR_DIRECTIONS, CAR_SCALE, carModelSize, carOwnerScale, carSizeId } from '../src/game/ext/car-art';
import { facings } from '../src/game/traffic';
import { LIBRARY } from '../src/game/library';
import { STUDIO_SCALE } from '../src/game/lots/scales';
import { footprintOf, ownerScaleOf } from '../src/game/lots/preset-art';
import { spriteRect, type Drawable } from '../src/game/sprites';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const MODEL = 'cars:burgundy-wagon', CAR = `${MODEL}:S`, OTHER = 'cars:navy-wood-panel-wagon:S';
/** a size the car's picture can take: past about 1.15 (owner units: its pixels over CAR_SCALE) lookOf stops the picture growing (newart.ts maxDrawScale) */
const BIG = 1.05;
/** a parked car at the origin, as a prop of scale s (its owner size) */
const parked = (item: number, s: number): Drawable => ({ item, x: 0, y: 0, flip: false, scale: s, x0: -1, y0: -1, x1: 1, y1: 1 });
/** the same car moving: drawn already at CAR_SCALE times its size (sim/client.ts visible) */
const moving = (item: number, s: number): Drawable => ({ ...parked(item, CAR_SCALE * s), moving: true });
/** the picture's width in world px */
const width = (d: Drawable) => { const r = spriteRect(d); return r[2] - r[0]; };

test('a car takes its model\'s size: the eight headings share one key, a town car\'s facings and views share its model\'s (T143), a world car is its own', () => {
  for (const d of CAR_DIRECTIONS) assert.equal(carSizeId(`${MODEL}:${d}`), MODEL);
  assert.equal(carSizeId(OTHER), 'cars:navy-wood-panel-wagon');
  assert.equal(carSizeId('static:compact_e'), 'static:compact');
  assert.equal(carSizeId('variation:static-compact_n-v2-ea89d6fd:3'), 'static:compact');
  assert.equal(carSizeId('world:schoolbus'), 'world:schoolbus');
  assert.equal(carSizeId('variation:world-schoolbus-6df6411d:1'), 'world:schoolbus');
});

test('a car\'s owner size is its studio size for its model, 1 when unset; the table\'s car sizes are not used', () => {
  assert.equal(carOwnerScale(CAR), carModelSize(STUDIO_SCALE, MODEL) ?? 1);
  assert.equal(carOwnerScale('world:car_0'), carModelSize(STUDIO_SCALE, 'world:car_0') ?? 1, 'OWNER_SCALE holds 1.371 for world:car_0; a car never takes it');
  const sizes = { [MODEL]: 1.25 };
  for (const d of CAR_DIRECTIONS) assert.equal(carOwnerScale(`${MODEL}:${d}`, sizes), 1.25, `${d}: every heading of the model`);
  assert.equal(carOwnerScale(OTHER, sizes), 1, 'another model keeps its own size');
  assert.equal(carOwnerScale('static:compact_e', { 'static:compact': 1.19 }), 1.19, 'a town car is keyed by its model');
  assert.equal(carOwnerScale('variation:static-compact_w-3465d046:2', { 'static:compact': 1.19 }), 1.19, 'its views too');
  // a size kept under a facing's or a view's own key before T143 still counts, the largest of them, until the studio folds them into the model's key
  const old = { 'static:compact_e': 1.166, 'static:compact_w': 1.259, 'variation:static-compact_n-82988799:1': 1.08, 'static:compact': 1.1 };
  for (const id of ['static:compact_n', 'static:compact_e', 'static:compact_w', 'variation:static-compact_s-0c90743f:4']) assert.equal(carOwnerScale(id, old), 1.259, `${id}: the largest of the model's keys`);
});

test('traffic: every facing carries its model\'s owner size, so the cars on the road are drawn at it', () => {
  for (const set of facings()) for (const f of set) assert.equal(f.size, carOwnerScale(LIBRARY[f.item]!.id));
});

test('a car\'s owner size multiplies the picture drawn, parked and moving alike (a parked car is drawn at CAR_SCALE of its size, as a moving one)', () => {
  const item = INDEX.get(CAR)!, w1 = width(parked(item, 1));
  assert.ok(w1 > 0, 'the car has a picture');
  assert.ok(Math.abs(width(parked(item, BIG)) / w1 - BIG) < 1e-9, `parked: x${BIG}`);
  assert.ok(Math.abs(width(moving(item, BIG)) / width(moving(item, 1)) - BIG) < 1e-9, `moving: x${BIG}`);
  assert.ok(Math.abs(w1 - width(moving(item, 1))) < 1e-9, 'a parked car at size 1 is the road size, as a moving one at size 1');
});

test('a car\'s footprint is its drawn body: the eight-way body and another vehicle\'s boxes, at CAR_SCALE times the owner size', () => {
  for (const id of [CAR, 'static:compact_e']) {
    const f1 = footprintOf(id, 1, false), f2 = footprintOf(id, 1.25, false);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(f2[k]! / f1[k]! - 1.25) < 1e-9, `${id} coordinate ${k}`);
  }
});

test('a studio size set for a car is what the game draws: its owner scale, its picture and its footprint (set here, then restored)', () => {
  const studio = STUDIO_SCALE as Record<string, number>, had = MODEL in studio, was = studio[MODEL];
  try {
    studio[MODEL] = BIG;
    assert.equal(ownerScaleOf(CAR), BIG);
    assert.equal(ownerScaleOf(`${MODEL}:N`), BIG, 'every heading of the model');
    assert.equal(ownerScaleOf(OTHER), STUDIO_SCALE[OTHER] ?? 1, 'another model is not resized');
    const item = INDEX.get(CAR)!;
    assert.ok(Math.abs(width(parked(item, ownerScaleOf(CAR))) / width(parked(item, 1)) - BIG) < 1e-9, 'the picture');
    assert.ok(Math.abs(footprintOf(CAR, ownerScaleOf(CAR), false)[2] / footprintOf(CAR, 1, false)[2] - BIG) < 1e-9, 'the footprint');
  } finally { if (had) studio[MODEL] = was!; else delete studio[MODEL]; }
});
