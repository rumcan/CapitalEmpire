// Headless tests for the texture presets' mowing stripes (src/game/paint-presets.ts stripePixels, clampStripes, stripePairs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STRIPES, clampPreset, clampStripes, stripePairs, stripePixels } from '../src/game/paint-presets';

const grey = (W: number, H: number) => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 100; d[i + 3] = 255; } return d; };
const g = (d: Uint8ClampedArray, W: number, x: number, y: number) => d[(y * W + x) * 4 + 1]!;

test('stripes: off by default and in old presets; values held to their ranges', () => {
  assert.equal(clampStripes(null).on, false);
  assert.equal(clampPreset({ name: 'Old', a: { src: 'a' }, b: { src: 'b' } } as never)!.stripes.on, false);
  const s = clampStripes({ on: true, dir: 'diag' as never, width: 99, light: -1, lightCol: 'green' });
  assert.deepEqual([s.on, s.dir, s.width, s.light, s.lightCol], [true, 'x', 16, 0, DEFAULT_STRIPES.lightCol]);
});

test('stripePairs fits whole light + dark pairs into one repeat', () => {
  assert.deepEqual(stripePairs(24, 3), { pairs: 4, width: 3 });
  assert.deepEqual(stripePairs(24, 5), { pairs: 2, width: 6 });
  assert.deepEqual(stripePairs(4, 16), { pairs: 1, width: 2 });
});

test('bands along x vary down the picture only, alternate light and dark, and wrap seamlessly', () => {
  const W = 64, H = 64, d = grey(W, H);
  stripePixels(d, W, H, { ...DEFAULT_STRIPES, on: true, dir: 'x', width: 2, soft: 0, tint: 0 }, 8);
  for (let y = 0; y < H; y += 7) assert.equal(g(d, W, 0, y), g(d, W, 63, y));
  assert.ok(g(d, W, 10, 4) > 100 && g(d, W, 10, 20) < 100);
  assert.equal(g(d, W, 5, 0), g(d, W, 5, 15)); assert.equal(g(d, W, 5, 63), g(d, W, 5, 31));
  const off = grey(W, H); stripePixels(off, W, H, DEFAULT_STRIPES, 8); assert.deepEqual(off, grey(W, H));
});

test('a checkerboard is light where both waves agree and dark where they differ', () => {
  const W = 64, H = 64, d = grey(W, H);
  stripePixels(d, W, H, { ...DEFAULT_STRIPES, on: true, dir: 'check', width: 4, soft: 0, tint: 0 }, 8);
  assert.ok(g(d, W, 8, 8) > 100 && g(d, W, 40, 40) > 100 && g(d, W, 8, 40) < 100 && g(d, W, 40, 8) < 100);
});
