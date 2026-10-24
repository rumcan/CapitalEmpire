import test from 'node:test';
import assert from 'node:assert/strict';
import {
  growStage,
  growMask,
  spawnSplash,
  stepSplash,
  easeOutBack,
  squash,
  breathe,
} from '../src/game/ext/course-fx';
import { makeGrid, paintDisc, SURF } from '../src/game/ext/course-grid';

test('1. A fairway seeded at month 0 is stage 0, 2 (month 1.5), 4 (month 3)', () => {
  // Fairway has 3 months grow-in duration
  // At month 0: elapsed = 0 -> share = 0 / 3 = 0.0 -> stage 0
  const stage0 = growStage(0 / 3);
  assert.equal(stage0, 0, `month 0 should be stage 0, got ${stage0}`);

  // At month 1.5: elapsed = 1.5 -> share = 1.5 / 3 = 0.5 -> stage 2
  const stage2 = growStage(1.5 / 3);
  assert.equal(stage2, 2, `month 1.5 should be stage 2, got ${stage2}`);

  // At month 3: elapsed = 3 -> share = 3 / 3 = 1.0 -> stage 4
  const stage4 = growStage(3 / 3);
  assert.equal(stage4, 4, `month 3 should be stage 4, got ${stage4}`);

  // Verify growMask alpha values correspond: round(255 * (1 - stage / 4))
  // stage 0 -> 255
  // stage 2 -> 128
  // stage 4 -> 0
  const g = makeGrid(0, 0, 128, 128);
  paintDisc(g, 16, 16, 10, SURF.fairway, 1, 0); // seeded at month 0

  const mask0 = growMask(g, 0, 0, 64, 0);
  const mask1_5 = growMask(g, 0, 0, 64, 1.5);
  const mask3 = growMask(g, 0, 0, 64, 3);

  // find a cell inside the painted fairway
  const cellIdx = 32 * 128 + 32; // x = 16, y = 16 tiles
  assert.equal(mask0[cellIdx], 255, 'stage 0 alpha must be 255 (full dirt)');
  assert.equal(mask1_5[cellIdx], 128, 'stage 2 alpha must be 128 (half grass)');
  assert.equal(mask3[cellIdx], 0, 'stage 4 alpha must be 0 (full grass)');
});

test('3. The same seed gives the same particles; all are dead after 450 ms', () => {
  const seed = 12345;
  const pA = spawnSplash(seed, 100, 100, 15, 'dirt');
  const pB = spawnSplash(seed, 100, 100, 15, 'dirt');

  // Particle counts: 8 to 12
  assert.ok(pA.length >= 8 && pA.length <= 12, `expected 8..12 particles, got ${pA.length}`);
  assert.deepEqual(pA, pB, 'identical seed must produce identical particles');

  // Step 200 ms: still alive
  stepSplash(pA, 200);
  for (const p of pA) {
    assert.equal(p.dead, false, 'particle should be alive at 200 ms');
    assert.ok(p.lifeMs > 0, 'remaining life must be positive');
  }

  // Step remaining 250 ms (total 450 ms): all must be dead
  stepSplash(pA, 250);
  for (const p of pA) {
    assert.equal(p.dead, true, 'all particles must be dead after 450 ms');
    assert.equal(p.lifeMs, 0, 'particle lifeMs must be 0 after 450 ms');
  }
});

test('4. squash(0) = 0.90, squash(260) = 1, and its peak is 1.04 ±0.01', () => {
  // squash(0) = 0.90
  const s0 = squash(0);
  assert.ok(Math.abs(s0 - 0.90) < 1e-6, `expected squash(0) to be 0.90, got ${s0}`);

  // squash(260) = 1.00
  const s260 = squash(260);
  assert.ok(Math.abs(s260 - 1.00) < 1e-6, `expected squash(260) to be 1.00, got ${s260}`);

  // peak is 1.04 ±0.01
  let peak = -Infinity;
  let peakTime = -1;
  for (let t = 0; t <= 260; t += 1) {
    const val = squash(t);
    if (val > peak) {
      peak = val;
      peakTime = t;
    }
  }
  assert.ok(
    peak >= 1.03 && peak <= 1.05,
    `expected peak 1.04 ±0.01, got ${peak} at t = ${peakTime} ms`,
  );
  assert.ok(peakTime > 0 && peakTime < 260, 'peak must occur strictly between 0 and 260 ms');
});

test('breathe(nowMs) oscillates with 1.4 s period between alpha 0.6..0.9 and scale 1.00..1.03', () => {
  const b0 = breathe(0);
  assert.ok(Math.abs(b0.alpha - 0.75) < 0.01);
  assert.ok(Math.abs(b0.scale - 1.015) < 0.01);

  // Period is 1400 ms: breathe(t) === breathe(t + 1400)
  for (let t = 0; t <= 2800; t += 100) {
    const b = breathe(t);
    const bNext = breathe(t + 1400);
    assert.ok(Math.abs(b.alpha - bNext.alpha) < 1e-6);
    assert.ok(Math.abs(b.scale - bNext.scale) < 1e-6);
    assert.ok(b.alpha >= 0.599 && b.alpha <= 0.901);
    assert.ok(b.scale >= 0.999 && b.scale <= 1.031);
  }
});

test('easeOutBack satisfies boundary conditions and overshoots 1', () => {
  assert.equal(easeOutBack(0), 0);
  assert.equal(easeOutBack(1), 1);
  let max = -Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    max = Math.max(max, easeOutBack(t));
  }
  assert.ok(max > 1.0, 'easeOutBack must overshoot 1');
});
