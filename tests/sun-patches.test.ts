// T310 (#895): the sun through the clouds (src/game/sun-patches.ts): the noise picture tiles and spreads over its range, the field's gaps cover a
// share of the map and are a few hundred metres across, the clock runs in game time (and at 1x while paused), and the setting holds its range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_BOOST, CLOUD_CEILING, CLOUD_KNEE, SUN_TEX, clampSun, cloudRate, sampleNoise, sunAt, sunNoise, sunOffsets, sunStep, WIND, WIND_SPEED } from '../src/game/sun-patches';
import { SPEEDS } from '../src/game/golf/watch';

const tex = sunNoise();

test('the noise picture tiles seamlessly and uses its range', () => {
  const N = SUN_TEX; let edge = 0, inner = 0;
  for (let k = 0; k < N; k++) {
    edge = Math.max(edge, Math.abs(tex[k * N]! - tex[k * N + N - 1]!), Math.abs(tex[k]! - tex[(N - 1) * N + k]!));
    inner = Math.max(inner, Math.abs(tex[k * N + 200]! - tex[k * N + 201]!));
  }
  assert.ok(edge <= inner + 2, `the wrap is as smooth as any neighbouring pair (${edge} vs ${inner})`);
  let lo = 255, hi = 0, m = 0; for (const v of tex) { lo = Math.min(lo, v); hi = Math.max(hi, v); m += v; }
  m /= tex.length;
  assert.ok(lo < 40 && hi > 215 && Math.abs(m - 127.5) < 4, `spread ${lo}..${hi}, mean ${m.toFixed(1)}`);
  assert.deepEqual(sunNoise(), tex, 'seeded: the same picture every time');
});

test('the sun covers part of the map, in patches a few hundred metres across with soft edges', () => {
  const off = sunOffsets(0); let lit = 0, soft = 0, n = 0, runs = 0, prev = -1, runLen: number[] = [], len = 0;
  for (let y = 0; y < 2048; y += 64) for (let x = 0; x < 2048; x += 2, n++) {
    const s = sunAt(tex, x, y, off); lit += s; if (s > 0.02 && s < 0.98) soft++;
    const b = s > 0.5 ? 1 : 0; if (b !== prev) { if (prev === 1) runLen.push(len); runs++; len = 0; prev = b; } len++;
  }
  const share = lit / n;
  assert.ok(share > 0.2 && share < 0.55, `sun share ${share.toFixed(2)}`);
  assert.ok(soft / n > 0.05, 'soft edges');
  runLen = runLen.filter(v => v > 1); const mean = runLen.reduce((a, b) => a + b, 0) / runLen.length * 2 * 2; // samples of 2 tiles, 2 m a tile
  assert.ok(mean > 60 && mean < 600, `a patch is about ${mean.toFixed(0)} m across`);
});

test('the patches drift with the wind and change shape on the way', () => {
  // follow a point with the wind: read A moves with it exactly; the field as a whole only nearly (B slides), so its shape changes
  const t = 120, d = WIND_SPEED * t, o0 = sunOffsets(0), o1 = sunOffsets(t);
  let same = 0, moved = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const x = 300 + (k % 20) * 37, y = 400 + Math.floor(k / 20) * 41, a = sunAt(tex, x, y, o0);
    same += Math.abs(a - sunAt(tex, x + WIND.x * d, y + WIND.y * d, o1)); moved += Math.abs(a - sunAt(tex, x, y, o1)); n++;
  }
  assert.ok(same / n < moved / n * 0.7, `carried by the wind (${(same / n).toFixed(3)} vs ${(moved / n).toFixed(3)} staying put)`);
  assert.ok(same / n > 0.002, 'and its shape changes');
});

// T379 (#1035; the owner, 2026-11-08: "clouds should move at x8 speed when you are on x1 and adjust accordingly for the rest"): the clouds drift at 8x the wind's base
// rate at game speed 1x, in step with the game speed (2x: 16x, 1/4x: 2x), still when paused, eased to a ceiling at the top speeds so they do not flicker
test('the clouds drift at 8x the old rate at 1x and follow the game speed; paused, they are still', () => {
  assert.equal(CLOUD_BOOST, 8);
  const close = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} vs ${b}`);
  close(cloudRate(1), 8, '1x'); close(cloudRate(2), 16, '2x'); close(cloudRate(0.25), 2, '1/4x'); close(cloudRate(0.5), 4, '1/2x'); close(cloudRate(4), 32, '4x');
  close(sunStep(0.1, 1), 0.8, 'a frame of 0.1 s at 1x'); close(sunStep(0.1, 2), 1.6, 'at 2x'); close(sunStep(0.1, 0.25), 0.2, 'at 1/4x');
  // every speed of the speed bar up to 8x is exactly CLOUD_BOOST times the speed (the knee is 8x's rate)
  for (const k of SPEEDS.filter(s => s <= 8)) close(cloudRate(k), 8 * k, `speed ${k}`);
  assert.equal(CLOUD_KNEE, 8 * 8, 'the knee is the rate at 8x');
  // paused: nothing (it was the 1x rate before), and no step for a bad frame
  assert.equal(cloudRate(0), 0); assert.equal(sunStep(0.1, 0), 0); assert.equal(sunStep(5, 0), 0); assert.equal(cloudRate(-1), 0); assert.equal(cloudRate(NaN), 0);
  assert.equal(sunStep(-1, 4), 0); assert.equal(sunStep(0, 4), 0);
  // paused, the field does not move at all: the clock after a second of frames
  let t = 123.4; for (let i = 0; i < 60; i++) t += sunStep(1 / 60, 0);
  assert.equal(t, 123.4); assert.deepEqual(sunOffsets(t), sunOffsets(123.4));
  for (const v of sunOffsets(12345.6)) assert.ok(v >= 0 && v < 1);
});

test('the top speeds ease to a ceiling: 20x and over do not flicker; the rate never falls as the speed rises and has no kink at the knee', () => {
  assert.ok(CLOUD_CEILING > CLOUD_KNEE);
  let prev = 0;
  for (const k of [1 / 40, 1 / 16, 1 / 4, 1 / 2, 1, 2, 4, 8, 8.5, 10, 12, 16, 20, 30, 50, 100, 1000, Infinity]) {
    const r = cloudRate(k); assert.ok(r >= prev, `${k}x: ${r} after ${prev}`); assert.ok(r <= CLOUD_CEILING, `${k}x under the ceiling`); prev = r;
  }
  const at20 = cloudRate(20); assert.ok(at20 > cloudRate(8) && at20 < CLOUD_CEILING + 1e-9, `20x: ${at20}`); assert.ok(at20 < 8 * 20 * 0.6, '20x is far under 8 times its speed');
  assert.ok(Math.abs(cloudRate(Infinity) - CLOUD_CEILING) < 1e-9, 'the ceiling is where it ends');
  // the slope at the knee is the straight line's (8 a game speed): no kink
  const h = 1e-6, k0 = CLOUD_KNEE / CLOUD_BOOST, slope = (cloudRate(k0 + h) - cloudRate(k0)) / h; assert.ok(Math.abs(slope - CLOUD_BOOST) < 1e-3, `slope ${slope}`);
  // the most a frame moves the field at the ceiling: tiles at 60 fps
  const tiles = CLOUD_CEILING * WIND_SPEED / 60; assert.ok(tiles < 2, `${tiles.toFixed(2)} tiles a frame`);
  assert.equal(sunStep(1 / 60, 20), (1 / 60) * at20);
});

test('the setting holds its range', () => {
  assert.deepEqual(clampSun(null), { on: true, strength: 1 });
  assert.deepEqual(clampSun({ on: false, strength: 9 }), { on: false, strength: 2 });
  assert.deepEqual(clampSun({ strength: 'x' }), { on: true, strength: 1 });
  assert.ok(Math.abs(sampleNoise(tex, 0.25, 0.75) - sampleNoise(tex, 1.25, -0.25)) < 1e-9, 'the picture repeats');
});
