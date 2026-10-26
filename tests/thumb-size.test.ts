// The sprite studio's thumbnail size steps (scripts/assets/review/thumb-size.mjs, T144): a Library card asks for its picture at one of a few long
// sides (the step not below what it shows, capped), so the server's WebP cache is reused as the size slider moves and the browser never holds a
// picture bigger than its card. studio.html repeats the rounding inline (it cannot import): this test pins the module's. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THUMB_STEPS, thumbStep } from '../scripts/assets/review/thumb-size.mjs';

test('the steps rise and end at the cap', () => {
  assert.deepEqual(THUMB_STEPS, [128, 256, 384, 512]);
  for (let i = 1; i < THUMB_STEPS.length; i++) assert.ok(THUMB_STEPS[i] > THUMB_STEPS[i - 1]);
});

test('a size rounds up to the next step and never past the cap', () => {
  assert.equal(thumbStep(1), 128);
  assert.equal(thumbStep(52), 128);
  assert.equal(thumbStep(128), 128);
  assert.equal(thumbStep(129), 256);
  assert.equal(thumbStep(300.4), 384);
  assert.equal(thumbStep(384), 384);
  assert.equal(thumbStep(385), 512);
  assert.equal(thumbStep(512), 512);
  assert.equal(thumbStep(2000), 512);
  // a step is always one of the steps (the cache has one file per step)
  for (const px of [3, 77, 200, 399, 511, 9999]) assert.ok(THUMB_STEPS.includes(thumbStep(px)));
});

test('a bad or missing size is the smallest step', () => {
  assert.equal(thumbStep(0), 128);
  assert.equal(thumbStep(-5), 128);
  assert.equal(thumbStep(NaN), 128);
  assert.equal(thumbStep(undefined), 128);
  assert.equal(thumbStep('abc'), 128);
  assert.equal(thumbStep('256'), 256);
});
