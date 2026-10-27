// T216 (the owner, 2026-10-27: "at a certain zoom the bushes disappear but the shadows stay when you zoom out ... just remove the shadows too"):
// a sprite's shadows carry its cull, so at the district zoom a hidden bush hides its cast, contact and vector shadows with it. Headless: the packed
// contact and vector instances carry the picture's own height and the cull flag (1 for a cullable sprite, 0 for a big one), a mover's height is its
// picture's and not its lamps' box, and every sprite shadow pass gets the one cull from the engine. The GPU side (gl.ts VS_CAST, VS_SHADOW, VS_VEC)
// culls on those numbers with uMinPx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIBRARY } from '../src/game/library';
import { SHADOW_STRIDE, VECTOR_STRIDE } from '../src/game/gl';
import { packShadow, packVector, spriteRect, vecOf, type Drawable } from '../src/game/sprites';

/** a drawable of library sprite i at (x, y), its footprint a 2 m box about its anchor */
function placed(i: number, x = 200.5, y = 300.5): Drawable {
  return { item: i, x, y, flip: false, scale: 1, x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 };
}
const small = LIBRARY.findIndex(it => !it.big && it.kind !== 'lot');
const big = LIBRARY.findIndex(it => it.big);

test('a cullable sprite packs its picture height and cull flag 1 into its contact shadow instance', () => {
  assert.ok(small >= 0 && big >= 0, 'the library has a small sprite and a big one');
  const d = placed(small), r = spriteRect(d), h = r[3]! - r[1]!, out = new Float32Array(SHADOW_STRIDE);
  assert.ok(h > 0, 'its picture has a height');
  packShadow(d, out, 0, 0, 0, r);
  assert.equal(out[12], Math.fround(h), 'its picture height, world px');
  assert.equal(out[13], 1, 'cullable: hidden with the sprite at the district zoom');
});

test('a big sprite packs flag 0 into its contact shadow instance: its shadow is never culled', () => {
  const d = placed(big), r = spriteRect(d), out = new Float32Array(SHADOW_STRIDE);
  packShadow(d, out, 0, 0, 0, r);
  assert.equal(out[13], 0, 'big: never culled');
  assert.equal(out[12], Math.fround(r[3]! - r[1]!), 'its picture height');
});

test('a mover with lamps: its shadow takes its picture height, not the height of the rect its lamps grew', () => {
  const d = placed(small), r = spriteRect(d), h = r[3]! - r[1]!, grown = [r[0]!, r[1]! - 9, r[2]!, r[3]! + 9], out = new Float32Array(SHADOW_STRIDE);
  packShadow(d, out, 0, 0, 0, grown, h);
  assert.equal(out[12], Math.fround(h), 'the sprite\'s own height');
  assert.equal(out[13], 1);
});

test('a vector shadow packs its picture height and cull flag in its instance', () => {
  const v = LIBRARY.findIndex((it, k) => !it.big && vecOf(k));
  assert.ok(v >= 0, 'a small sprite with a vector shadow');
  const d = placed(v), r = spriteRect(d), h = r[3]! - r[1]!, out = new Float32Array(VECTOR_STRIDE);
  assert.ok(packVector(d, out, 0, 0, 0, r), 'packed');
  assert.equal(out[16], Math.fround(h), 'its picture height');
  assert.equal(out[17], 1, 'cullable');
});

test('the game gives every sprite shadow pass the one cull, and the shaders cull on it', () => {
  const engine = readFileSync(resolve('src/game/engine.ts'), 'utf8'), gl = readFileSync(resolve('src/game/gl.ts'), 'utf8');
  assert.match(engine, /const minPx = tier === 'district' \? CULL_MIN_PX \* this\.dpr : 0;/, 'one threshold, district zoom only');
  assert.match(engine, /gl\.drawCast\(pAt[^;]*, minPx\);/, 'cast shadows');
  assert.match(engine, /gl\.drawShadows\(sAt[^;]*, minPx\);/, 'contact shadows');
  assert.match(engine, /gl\.drawVector\(vAt\[k\]![^;]*, far, minPx\)\)/, 'vector shadows');
  assert.match(engine, /gl\.drawSprites\(pAt[^;]*, minPx\);/, 'sprites');
  assert.equal(gl.split('bool cull = ').length - 1, 4, 'VS_SPRITE, VS_CAST, VS_SHADOW and VS_VEC each cull');
  assert.match(gl, /bool cull = aMisc\.z > 0\.5 && \(aRect\.w - aRect\.y\) \* uCam\.z < uMinPx;/, 'the sprite\'s own rule');
});
