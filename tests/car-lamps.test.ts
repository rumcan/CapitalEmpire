// Headless tests for the cars' lamps (T192, src/game/sim/car-lamps.ts; drawn in the sprite pass: sprites.ts frame, gl.ts FS_SPRITE). The owner
// (2026-10-27): "remove the carr lights in hte game., leave the brake lights but smaller and make sure the lights are behind game sprites, you
// can see the lights through buildings and the car itself".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRAKE_LIGHT, GLOW_LAYER, LAMP_FLOATS, REAR_SHOWS_BELOW, brakeLamps } from '../src/game/sim/car-lamps';
import { LIBRARY } from '../src/game/library';
import { SpriteTiles, spriteRect, type Drawable } from '../src/game/sprites';
import { SPRITE_STRIDE } from '../src/game/gl';
import { SPR_H, SPR_W, worldX, worldY } from '../src/game/iso';
import type { Prop } from '../src/game/types';

test('T192 lamps: brake lights only, half the old size and brightness, lit only while braking or standing', () => {
  assert.equal(BRAKE_LIGHT.radius, 0.55 * 64 / 2 / 2, 'half the old lamp point (0.55 x 64 world px across)');
  assert.equal(BRAKE_LIGHT.alpha, 0.5, 'half the old braking brightness (1)');
  const out: number[] = [];
  assert.equal(brakeLamps(10, 10, -Math.PI / 2, 1, 0.5, false, out), 0, 'not lit: none');
  // heading up the map (-y): its rear faces the viewer; two lamps, both behind the car's centre (toward its rear) and none ahead of it
  const n = brakeLamps(10, 10, -Math.PI / 2, 1, 0.5, true, out);
  assert.equal(n, 2 * LAMP_FLOATS, 'two brake lights, no headlights');
  for (let k = 0; k < n; k += LAMP_FLOATS) { assert.equal(out[k + 2], BRAKE_LIGHT.radius); assert.equal(out[k + 3], BRAKE_LIGHT.alpha); }
  // their middle at the car's rear, (10, 10.5) for a half length of 0.5 heading -y, lifted onto its body
  const mx = (out[0]! + out[LAMP_FLOATS]!) / 2, my = (out[1]! + out[LAMP_FLOATS + 1]!) / 2;
  assert.ok(Math.abs(mx - worldX(10, 10.5)) < 1e-6 && Math.abs(my - (worldY(10, 10.5) - BRAKE_LIGHT.lift)) < 1e-6, `at the rear: ${mx}, ${my}`);
  // side on (heading -x, its rear to the right of the screen and up): still shown at its rear corners
  assert.equal(brakeLamps(10, 10, Math.PI, 1, 0.5, true, []), 2 * LAMP_FLOATS, 'side on: shown');
  // heading toward the viewer (+x +y): its own body hides its rear: none
  assert.equal(brakeLamps(10, 10, Math.PI / 4, 1, 0.5, true, []), 0, 'seen from the front: none');
  // the limit: heading just past REAR_SHOWS_BELOW toward the viewer hides them
  const t = Math.asin(REAR_SHOWS_BELOW / Math.SQRT2) + Math.PI / 4 - 0.05, h = Math.cos(t) + Math.sin(t);
  assert.ok(h > REAR_SHOWS_BELOW); assert.equal(brakeLamps(10, 10, t, 1, 0.5, true, []), 0);
});

test('T192 lamps: drawn in the sprite pass right after their car, so a nearer sprite is drawn over them', () => {
  const car = LIBRARY.findIndex(i => i.kind === 'car'), house = LIBRARY.findIndex(i => i.kind === 'house');
  assert.ok(car >= 0 && house >= 0);
  const tiles = new SpriteTiles();
  // a house in front of the car (nearer the viewer: its footprint past the car's on both axes), its picture over the car's
  const p: Prop = { uid: 1, item: house, x: 103, y: 103, flip: false, scale: 1, x0: 102, y0: 102, x1: 104, y1: 104 };
  tiles.add(p);
  const lamps: number[] = []; brakeLamps(100.5, 100.5, -Math.PI / 2, 1, 0.5, true, lamps);
  const d: Drawable = { item: car, x: 100.5, y: 100.5, flip: false, scale: 1, x0: 100, y0: 100, x1: 101, y1: 101, moving: true, lamps };
  const X = worldX(100.5, 100.5), Y = worldY(100.5, 100.5), i = Math.floor(X / SPR_W), j = Math.floor(Y / SPR_H);
  const vis: { i: number; j: number }[] = []; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) vis.push({ i: i + a, j: j + b });
  const f = tiles.frame(vis, [d]), rc = spriteRect(d), rh = spriteRect(p), at = (o: number, r: ArrayLike<number>) => [0, 1, 2, 3].every(k => Math.abs(f.stream[o + k]! - r[k]!) < 1e-3);
  // in each tile the car is drawn in: its picture, then its two glows, then (later) the house over them
  let checked = 0;
  for (let o = 0; o < f.floats; o += SPRITE_STRIDE) {
    if (!at(o, rc)) continue;
    const g1 = o + SPRITE_STRIDE, g2 = g1 + SPRITE_STRIDE;
    assert.equal(f.stream[g1 + 8], GLOW_LAYER, 'a glow right after the car'); assert.equal(f.stream[g2 + 8], GLOW_LAYER, 'and the other');
    assert.equal(f.stream[g1 + 11], -1, 'a glow casts no shadow'); assert.equal(f.stream[g1 + 9], BRAKE_LIGHT.alpha);
    for (let q = g2 + SPRITE_STRIDE; q < f.floats; q += SPRITE_STRIDE) if (at(q, rh) && f.stream[q + 12] === f.stream[o + 12] && f.stream[q + 13] === f.stream[o + 13]) { checked++; break; }
  }
  assert.ok(checked >= 1, 'a tile draws the car, its glows, then the house over them');
});

test('T192 no overlay: no headlight, beam or turn-signal points after the sprites; the sprite shader draws the glows', () => {
  const engine = readFileSync(resolve('src/game/engine.ts'), 'utf8'), gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), client = readFileSync(resolve('src/game/sim/client.ts'), 'utf8');
  assert.doesNotMatch(engine, /tr\.lights\(|lightBuf/, 'the car light overlay is gone');
  assert.doesNotMatch(client, /\n {2}lights\(/, 'no lights() of headlights and beams');
  const sprite = gl.slice(gl.indexOf('const FS_SPRITE'), gl.indexOf('}`;', gl.indexOf('const FS_SPRITE')));
  assert.match(sprite, /if \(vUV\.z < -0\.5\)/, 'the sprite shader draws a glow instance');
  assert.ok(engine.includes('stream[o + 8]! < 0'), 'the atlas streaming skips the glows');
});
