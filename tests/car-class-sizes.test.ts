// T313 (#898, the owner: "car sizes differ drastically"): every car the game draws is drawn at its class's real-world length (ext/car-art
// CLASS_LENGTH: compact 4.2 m, sedan 4.8, SUV, pickup and van 5.2, bus 12), within 5%, on every picture of it (its headings, facings and views),
// parked and moving. The lengths are measured on the pictures (car-lengths.json, scripts/assets/car-lengths.ts). Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR_CLASS, CAR_SCALE, CLASS_LENGTH, carDrawnLength, carModel, carOwnerScale, carPictureFactor, carPictureLength } from '../src/game/ext/car-art';
import { LIBRARY } from '../src/game/library';
import { REMOVED_IDS } from '../src/game/lots/scales';
import { lookOf } from '../src/game/newart';
import { facings } from '../src/game/traffic';
import type { Drawable } from '../src/game/sprites';

const removed = new Set(REMOVED_IDS);
const CARS = LIBRARY.map((it, i) => ({ it, i })).filter(c => c.it.kind === 'car' && !removed.has(c.it.id));
const TOL = 0.05;
const classOf = (id: string) => CAR_CLASS[carModel(id)];

test('every car model has a class and every car picture a measured length', () => {
  assert.ok(CARS.length > 0);
  for (const { it } of CARS) {
    assert.ok(classOf(it.id), `${it.id}: its model ${carModel(it.id)} needs a class (ext/car-art/model.mjs CAR_CLASS)`);
    assert.ok((carPictureLength(it.id) ?? 0) > 0, `${it.id}: not measured (run scripts/assets/car-lengths.ts)`);
  }
});

test('every car picture is drawn within 5% of its class length', () => {
  const bad: string[] = [];
  for (const { it } of CARS) {
    const want = CLASS_LENGTH[classOf(it.id)!], got = carDrawnLength(it.id)!;
    if (Math.abs(got / want - 1) > TOL) bad.push(`${it.id} (${classOf(it.id)}): ${got.toFixed(2)} m, want ${want} m`);
  }
  assert.deepEqual(bad, []);
});

test('no car picture is drawn smaller than asked (its pixel cap), parked or moving', () => {
  for (const { it, i } of CARS) {
    const s = carOwnerScale(it.id);
    const parked: Drawable = { item: i, x: 0, y: 0, flip: false, scale: s, x0: -1, y0: -1, x1: 1, y1: 1 };
    const moving: Drawable = { ...parked, scale: CAR_SCALE * s, moving: true };
    for (const d of [parked, moving]) { const l = lookOf(d); assert.ok(l.item === i && Math.abs(l.scale - d.scale) < 1e-9, `${it.id}${d.moving ? ' moving' : ''}: drawn as ${LIBRARY[l.item]!.id} at ${l.scale}, asked ${d.scale}`); }
  }
});

test('the road cars are one size: every traffic car (sedans and the bus) at its class length whichever way it faces', () => {
  for (const set of facings()) for (const f of set) {
    const id = LIBRARY[f.item]!.id, want = CLASS_LENGTH[classOf(id)!], got = CAR_SCALE * f.size * carPictureLength(id)!;
    assert.ok(Math.abs(got / want - 1) <= TOL, `${id}: ${got.toFixed(2)} m on the road, want ${want} m`);
  }
});

test('an eight-way car\'s headings are one body: its picture factor is 1', () => {
  for (const { it } of CARS) if (it.id.startsWith('cars:')) assert.equal(carPictureFactor(it.id), 1, it.id);
});
