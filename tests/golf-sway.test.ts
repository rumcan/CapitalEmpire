// T334 (#960): the wind's sway of the trees and the pin flags. The GPU side (gl.ts VS_SPRITE and FS_SPRITE) shears a tree's top and ripples a flag's cloth by a code the sprite carries in its
// cullable slot (sprites.ts swayOf: bit 0 stays the cull flag, the rest the code); headless, the packed numbers: a tree 1, a shrub 2, the pin 3, everything else 0, the cull flag
// unchanged for every kind (VS_SPRITE and VS_CAST read it as the slot modulo 2), and the shaders' source is read for the one uniform they share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIBRARY } from '../src/game/library';
import { SPRITE_STRIDE } from '../src/game/gl';
import { packSprite, swayOf, type Drawable } from '../src/game/sprites';

const placed = (i: number, x = 200.5, y = 300.5): Drawable => ({ item: i, x, y, flip: false, scale: 1, x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 });
const slot = (i: number): number => { const out = new Float32Array(SPRITE_STRIDE); packSprite(placed(i), out, 0, 0, 0); return out[10]!; };
const first = (f: (it: (typeof LIBRARY)[number]) => boolean): number => LIBRARY.findIndex(f);

test('sway: a tree is 1, a shrub or a bush 2, the pin’s flag 3, anything else 0', () => {
  const tree = first(it => it.kind === 'tree'), shrub = first(it => it.kind === 'shrub' || it.kind === 'bush'), pin = first(it => it.id === 'business:golf-pin-red'), pin2 = first(it => it.id === 'business:golf-pin-yellow');
  const house = first(it => it.kind === 'house' || it.kind === 'building'), car = first(it => it.kind === 'car'), equip = first(it => it.id === 'business:golf-pin-red-equipment');
  for (const [name, i] of Object.entries({ tree, shrub, pin, pin2, house, car })) assert.ok(i >= 0, `the library has a ${name}`);
  assert.equal(swayOf(tree), 1); assert.equal(swayOf(shrub), 2); assert.equal(swayOf(pin), 3); assert.equal(swayOf(pin2), 3);
  assert.equal(swayOf(house), 0); assert.equal(swayOf(car), 0);
  if (equip >= 0) assert.equal(swayOf(equip), 0, 'the pin-red equipment is a storage picture, not a flag');
  assert.ok(LIBRARY.filter(it => it.kind === 'tree' || it.kind === 'palm').every(it => swayOf(LIBRARY.indexOf(it)) === 1), 'every tree and palm sways');
});

test('sway: the packed slot is the cull flag plus twice the code, so the cull reads the same (the slot modulo 2) for every picture', () => {
  for (let i = 0; i < LIBRARY.length; i += 7) {
    const it = LIBRARY[i]!, z = slot(i);
    assert.equal(z % 2, it.big ? 0 : 1, `${it.id}: the cull flag is the slot's bit 0`);
    assert.equal(Math.floor(z / 2), swayOf(i), `${it.id}: the sway code is above it`);
  }
  const tree = first(it => it.kind === 'tree' && !it.big), pin = first(it => it.id === 'business:golf-pin-red');
  assert.equal(slot(tree), 3, 'a small tree: cullable (1) and code 1 (2)'); assert.equal(slot(pin), 6, 'the pin (big: never culled, 0) and code 3 (6)');
});

test('sway: the sprite shader reads the wind and the cull from the slot, the cast shadows the cull only, and the uniform is set once a frame', () => {
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), eng = readFileSync(resolve('src/game/engine.ts'), 'utf8');
  assert.ok(/uniform vec4 uWind/.test(gl) && /float sw = floor\(aMisc\.z \* 0\.5\)/.test(gl), 'VS_SPRITE reads the code');
  assert.ok((gl.match(/mod\(aMisc\.z, 2\.0\) > 0\.5/g) ?? []).length === 2, 'VS_SPRITE and VS_CAST read the cull flag as the slot modulo 2');
  assert.ok(!/aMisc\.z > 0\.5/.test(gl), 'no shader still reads the slot as the whole flag');
  assert.ok(/'uMinPx', 'uWind'/.test(gl) && /setWind\(t: number/.test(gl), 'the program has the uniform and the renderer sets it');
  assert.ok(/gl\.setWind\(w\.t, w\.sx, w\.sy, w\.k\)/.test(eng), 'the engine sets the wind once a frame, before the sprites');
  assert.ok(/uWind\.z > 0\.0/.test(gl), 'a still day skips the sway');
});
