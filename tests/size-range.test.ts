// T190 (#489; the owner: "you should always alow for being able to make a sprite atleast 50% bigger or smaller"): every library item's range
// spans at least 0.5 to 1.5 times its baseline; lookOf draws the asked scale up to 1.5x; the soft note only past the pixel limit; the lab's grow
// stops at 1.5x (or the pixels' limit when more); cars too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { PIXEL_LIMIT, PIXEL_SLACK } from '../src/game/sizes';
import { SIZE_HI, SIZE_LO, baselineOf, lookOf, maxDrawScale, softAt, drawnAsStandIn } from '../src/game/newart';
import { growWithin } from '../src/game/dev/lot-edit';
import { presetScales } from '../scripts/assets/preset-scales.mjs';

const own = LIBRARY.map((it, i) => ({ it, i })).filter(({ i, it }) => !drawnAsStandIn(i) && it.kind !== 'walker');

test("every library item's range spans at least 0.5x to 1.5x its baseline (the cap is max(pixel limit, 1.5 x baseline))", () => {
  assert.equal(SIZE_LO, 0.5); assert.equal(SIZE_HI, 1.5);
  let short = 0;
  for (const { it, i } of own) {
    const b = baselineOf(it), cap = maxDrawScale(i);
    assert.ok(cap >= SIZE_HI * b - 1e-9, `${it.id}: cap ${cap} under 1.5 x ${b}`);
    // the cap is the larger of the two: never below the pixels' limit (a parked car's in its own units)
    if (it.kind !== 'car') assert.ok(cap >= PIXEL_LIMIT[i]! * PIXEL_SLACK - 1e-9, it.id);
    if (PIXEL_LIMIT[i]! < SIZE_HI * b) short++;
  }
  assert.ok(short > 0, 'some pictures had a cap under 1.5x before (the owner\'s houses and cars)');
});

test('lookOf draws the asked scale up to 1.5 x the baseline, and caps past it; the soft note only past the pixel limit', () => {
  const house = own.find(({ it, i }) => it.kind !== 'car' && it.kind !== 'tree' && PIXEL_LIMIT[i]! * PIXEL_SLACK < SIZE_HI * baselineOf(it))!;
  assert.ok(house, 'a sprite whose pixels stop short of 1.5x');
  const { it, i } = house, b = baselineOf(it), d = (scale: number) => ({ item: i, flip: false, scale, x: 0, y: 0 });
  for (const k of [0.5, 1, 1.5]) assert.equal(lookOf(d(k * b)).scale, k * b, `drawn at ${k}x`);
  assert.ok(Math.abs(lookOf(d(3 * b)).scale - Math.max(PIXEL_LIMIT[i]!, 1.5 * b)) < 1e-9, 'past 1.5x: capped');
  assert.equal(softAt(i, 1.5 * b), true, 'past its pixels: soft at the closest zoom');
  assert.equal(softAt(i, Math.min(PIXEL_LIMIT[i]!, b) * 0.9), false);
  const sharp = own.find(({ it, i }) => it.kind !== 'car' && PIXEL_LIMIT[i]! > 2 * SIZE_HI * baselineOf(it))!;
  assert.equal(softAt(sharp.i, 1.5 * baselineOf(sharp.it)), false, 'a picture with the pixels: never soft at 1.5x');
});

test("the lab's grow reaches 1.5x and the shrink 0.5x, for a house and a car", () => {
  for (const kind of ['building', 'car']) {
    const e = own.find(({ it, i }) => (kind === 'car' ? it.kind === 'car' : it.kind === 'building') && PIXEL_LIMIT[i]! < SIZE_HI * baselineOf(it))
      ?? own.find(({ it }) => (kind === 'car' ? it.kind === 'car' : it.kind === 'building'))!;
    const b = baselineOf(e.it), lim = maxDrawScale(e.i);
    let s = b; for (let k = 0; k < 20; k++) { const n = growWithin(s, 1.05, lim); if (n === null) break; s = n; }
    assert.ok(s >= 1.5 * b - 1e-6, `${e.it.id}: grows to ${(s / b).toFixed(2)}x`);
    let t = b; for (let k = 0; k < 20; k++) t = growWithin(t, 1 / 1.05, lim)!;
    assert.ok(t <= 0.5 * b, `${e.it.id}: shrinks to ${(t / b).toFixed(2)}x`);
  }
});

test("the Rebuild packs a picture at the presets' larger scale (read only, capped at 1.5)", () => {
  const m = presetScales(process.cwd());
  for (const v of m.values()) assert.ok(v > 1 && v <= 1.5);
  assert.equal(presetScales('Z:/no/such/root').size, 0, 'no presets file: an empty map');
});
