// Headless tests for the base grass settings (src/game/base-grass.ts; the mix itself needs a canvas and is checked in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjustPixels, clampMix, clampSide, DEFAULT_MIX, DEFAULT_SIDE, RANGES, type BaseGrassFile } from '../src/game/base-grass';

test('base grass: the default side leaves pixels as they are', () => {
  const px = new Uint8ClampedArray([10, 200, 30, 255, 128, 128, 128, 255, 255, 0, 90, 255]), before = px.slice();
  adjustPixels(px, DEFAULT_SIDE);
  assert.deepEqual([...px], [...before]);
});

test('base grass: brightness, saturation 0, hue and tint do what they say', () => {
  const p = () => new Uint8ClampedArray([100, 150, 50, 255]);
  const b = p(); adjustPixels(b, { ...DEFAULT_SIDE, bright: 1.2 }); assert.deepEqual([...b.slice(0, 3)], [120, 180, 60]);
  const g = p(); adjustPixels(g, { ...DEFAULT_SIDE, sat: 0 }); assert.ok(Math.abs(g[0] - g[1]) <= 1 && Math.abs(g[1] - g[2]) <= 1, 'grey');
  const h = p(); adjustPixels(h, { ...DEFAULT_SIDE, hue: 120 }); assert.ok(h[2] > h[1], 'green turns towards blue');
  const t = p(); adjustPixels(t, { ...DEFAULT_SIDE, tint: '#ff0000', tintAmt: 1 }); assert.ok(t[0] > t[1] && t[0] > t[2], 'red tint');
  assert.equal(t[3], 255, 'alpha kept');
});

test('base grass: clampSide and clampMix hold values to the ranges and fill defaults', () => {
  const s = clampSide({ src: 'x.webp', scale: 99, bright: -1, hue: 400, tint: 'red' });
  assert.deepEqual([s.scale, s.bright, s.hue, s.tint, s.sat], [RANGES.scale[1], RANGES.bright[0], RANGES.hue[1], DEFAULT_SIDE.tint, 1]);
  assert.deepEqual(clampMix({}), DEFAULT_MIX);
  assert.equal(clampMix({ share: 2, soft: 0 }).share, 1);
  assert.equal(clampMix({ share: 2, soft: 0 }).soft, RANGES.soft[0]);
});

test('base grass: the file the studio writes is valid as it stands (clamping changes nothing)', () => {
  const f = JSON.parse(readFileSync('src/game/base-grass.json', 'utf8')) as BaseGrassFile;
  assert.equal(f.v, 1);
  assert.deepEqual(clampMix(f.mix), f.mix);
  assert.deepEqual(clampSide(f.a), f.a);
  assert.deepEqual(clampSide(f.b), f.b);
});
