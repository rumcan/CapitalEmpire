// Headless tests for the night (src/game/night-light.ts; the drawing needs a canvas and is checked in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { NIGHT_DEFAULT, clampNight, lightType, nightAt } from '../src/game/night-light';

test('night: dark from dusk to dawn by the clock, day between, smooth at the edges', () => {
  const s = clampNight(null);
  assert.equal(nightAt(s, 12), 0); assert.equal(nightAt(s, 23), 1); assert.equal(nightAt(s, 2), 1);
  const dusk = nightAt(s, 19), dawn = nightAt(s, 6);
  assert.ok(dusk > 0 && dusk < 1 && dawn > 0 && dawn < 1);
  assert.ok(nightAt(s, 18.5) < nightAt(s, 19.5)); assert.ok(nightAt(s, 5.5) > nightAt(s, 6.5));
  assert.equal(nightAt({ ...s, mode: 'on' }, 12), 1); assert.equal(nightAt({ ...s, mode: 'off' }, 23), 0);
});

test('night: settings are held to their ranges, missing ones are the builder\'s', () => {
  assert.deepEqual(clampNight(null), NIGHT_DEFAULT);
  const n = clampNight({ mode: 'x' as never, strength: 5, tint: 'red', types: { lamp: { r: -3, i: 2 } } as never });
  assert.equal(n.mode, 'clock'); assert.equal(n.strength, 1); assert.equal(n.tint, NIGHT_DEFAULT.tint);
  assert.deepEqual(n.types.lamp, { r: 0, i: 1 }); assert.deepEqual(n.types.porch, NIGHT_DEFAULT.types.porch);
});

test('night: the street lamp is a lamp, houses have porches, venues windows, and the baked lots carry their own lights', () => {
  assert.equal(lightType(LIBRARY.find(i => i.id === 'world:streetlamp')!), 'lamp');
  assert.equal(lightType(LIBRARY.find(i => i.kind === 'house')!), 'porch');
  assert.equal(lightType(LIBRARY.find(i => i.kind === 'venue')!), 'window');
  for (const lot of LIBRARY.filter(i => i.kind === 'lot')) for (const l of lot.lights ?? []) assert.ok(l.type in NIGHT_DEFAULT.types, `${lot.id} ${l.type}`);
});
