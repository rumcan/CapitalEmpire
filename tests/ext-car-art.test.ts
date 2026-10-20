import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR_DIRECTIONS, carHeading, carFootprint } from '../src/game/ext/car-art';
import { facings, parkedCar } from '../src/game/traffic';
import { LIBRARY } from '../src/game/library';

test('world lane vectors select the delivery nose direction, including diagonals and negative wrap', () => {
  const cases: [number, number, string][] = [[1, 0, 'SE'], [1, 1, 'S'], [0, 1, 'SW'], [-1, 1, 'W'], [-1, 0, 'NW'], [-1, -1, 'N'], [0, -1, 'NE'], [1, -1, 'E']];
  for (const [x, y, dir] of cases) {
    const angle = Math.atan2(y, x);
    assert.equal(CAR_DIRECTIONS[carHeading(angle)], dir);
    assert.equal(carHeading(angle + 2 * Math.PI), carHeading(angle));
    assert.equal(carHeading(angle - 2 * Math.PI), carHeading(angle));
  }
  assert.equal(carHeading(Math.PI / 8 - 0.001), 0);
  assert.equal(carHeading(Math.PI / 8 + 0.001), 1);
  assert.equal(carHeading(-Math.PI / 8 - 0.001), 7);
});

test('each vehicle keeps its body across eight true views; parked cars share its cardinal art', () => {
  const sets = facings();
  for (let type = 0; type < 5; type++) {
    const model = type % 2 ? 'navy-wood-panel-wagon' : 'burgundy-wagon';
    assert.equal(new Set(sets[type]!.map(f => f.item)).size, 8);
    for (let heading = 0; heading < 8; heading++) {
      const f = sets[type]![heading]!;
      assert.equal(LIBRARY[f.item]!.id, `cars:${model}:${CAR_DIRECTIONS[heading]}`);
      assert.equal(f.flip, false);
      const physical = carFootprint(heading);
      assert.ok(Math.abs(f.hx * 2 - physical.hx) < 1e-8);
      assert.ok(Math.abs(f.hy * 2 - physical.hy) < 1e-8);
      assert.equal(f.ox, 0); assert.equal(f.oy, 0);
    }
    for (let cardinal = 0; cardinal < 4; cardinal++) assert.equal(parkedCar(type, cardinal), sets[type]![cardinal * 2]);
  }
});
