// A course surface's joint with its own collar is a soft shade, not a hard line (T196, paint-edges JOINT_SOFT; the owner: "the hard line between
// golf textures like green texture to fringe. this should be blurred to be a shadow not a hard line"). npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOINT_SOFT, jointFeather, jointLen, jointRamp, jointShadeAlpha, jointShadeWeight, smooth01 } from '../src/game/paint-edges';

test('the joint shade has no hard step: at the closest zoom its alpha changes by at most 20% of its peak from one cache px to the next, across the joint too', () => {
  const px = 1 / (Math.hypot(64, 32) * 0.6); // a cache px at the closest level, tiles
  for (const w of [JOINT_SOFT.lit, 0.7, 1]) {
    const peak = JOINT_SOFT.shade * w;
    let prev = jointShadeAlpha(-1, w);
    for (let d = -1; d <= 1.5; d += px) {
      const a = jointShadeAlpha(d, w);
      assert.ok(Math.abs(a - prev) <= 0.2 * peak + 1e-9, `w ${w}: step ${(a - prev).toFixed(4)} at d ${d.toFixed(3)}`);
      prev = a;
    }
  }
});

test('the joint shade peaks at the joint and lies on the lower side: it reaches len into the collar and only inner x len back over the surface', () => {
  const len = jointLen(0.6);
  assert.equal(jointShadeAlpha(0, 1), JOINT_SOFT.shade);
  assert.equal(jointShadeAlpha(len, 1), 0);
  assert.equal(jointShadeAlpha(-len * JOINT_SOFT.inner, 1), 0);
  assert.ok(jointShadeAlpha(len / 2, 1) > jointShadeAlpha(-len / 2 * JOINT_SOFT.inner * 1.5, 1), 'more on the collar side');
  assert.ok(JOINT_SOFT.shade <= 0.4, 'a shade, never a near-black line');
});

test('the joint shade is stronger turned from the sun, smoothly: lit facing it, 1 turned away, no jump between neighbouring facings', () => {
  assert.equal(jointShadeWeight(1), JOINT_SOFT.lit);
  assert.equal(jointShadeWeight(-1), 1);
  for (let f = -1; f < 1; f += 0.05) assert.ok(Math.abs(jointShadeWeight(f + 0.05) - jointShadeWeight(f)) < 0.1, `jump at ${f.toFixed(2)}`);
});

test('the shade and the cross-fade span a few cache px at every zoom (a blur, never a hairline), at most 1.5 tiles', () => {
  for (const L of [0.6, 0.3, 0.15, 0.08, 0.03]) {
    const px = Math.hypot(64, 32) * L; // cache px a tile
    assert.ok(jointLen(L) * px >= Math.min(4, 1.5 * px) - 1e-9 && jointLen(L) <= 1.5, `L ${L}: shade ${jointLen(L)} tiles`);
    assert.ok(jointFeather(L) * px >= 2.5 - 1e-9 && jointFeather(L) <= 1.5, `L ${L}: cross-fade ${jointFeather(L)} tiles`);
  }
});

test('jointRamp\'s strokes stack to the falloff: the coverage at d (the strokes wider than 2d) follows a x (1 - smooth01(d / reach)) within 0.04', () => {
  const reach = 0.5, a = 0.34, R = jointRamp(reach, a);
  assert.ok(R.every((s, k) => k === 0 || s.half < R[k - 1]!.half), 'widest first');
  for (let d = 0.01; d < reach; d += 0.02) {
    let c = 0; for (const s of R) if (s.half > d) c = 1 - (1 - c) * (1 - s.alpha);
    const want = a * (1 - smooth01(d / reach));
    assert.ok(Math.abs(c - want) <= 0.04, `d ${d.toFixed(2)}: ${c.toFixed(3)} against ${want.toFixed(3)}`);
  }
});
