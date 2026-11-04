// T310 (#895): the sun through the clouds (src/game/sun-patches.ts): the noise picture tiles and spreads over its range, the field's gaps cover a
// share of the map and are a few hundred metres across, the clock runs in game time (and at 1x while paused), and the setting holds its range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_TEX, clampSun, sampleNoise, sunAt, sunNoise, sunOffsets, sunStep, WIND, WIND_SPEED } from '../src/game/sun-patches';

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

test('the clock runs in game time, at 1x while paused', () => {
  assert.equal(sunStep(0.1, 4), 0.4);
  assert.equal(sunStep(0.1, 20), 2);
  assert.equal(sunStep(0.1, 0), 0.1);
  assert.equal(sunStep(-1, 4), 0);
  for (const v of sunOffsets(12345.6)) assert.ok(v >= 0 && v < 1);
});

test('the setting holds its range', () => {
  assert.deepEqual(clampSun(null), { on: true, strength: 1 });
  assert.deepEqual(clampSun({ on: false, strength: 9 }), { on: false, strength: 2 });
  assert.deepEqual(clampSun({ strength: 'x' }), { on: true, strength: 1 });
  assert.ok(Math.abs(sampleNoise(tex, 0.25, 0.75) - sampleNoise(tex, 1.25, -0.25)) < 1e-9, 'the picture repeats');
});
