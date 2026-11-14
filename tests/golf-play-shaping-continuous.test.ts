// J5f (the owner, 2026-11-14: "add a slider so you can increase and decrease the draw or fade. low or high flight too"): the shot's shape is a continuous amount, -1..1 for the
// curve (a full draw .. straight .. a full fade) and for the flight (low .. normal .. high), from the view's sliders (src/game/golf/play/shape.ts). The old picks, -1, 0 and 1,
// are its ends and middle and play exactly as before; every effect is in proportion to the amount; a save or a message with an amount reads it, held to -1..1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { SHAPE, hitShot, pickText, readShape, rng, shapeEffect, shapeLines } from '../src/game/golf/play';
import type { CourseView, Lie, Pt, ShotShape } from '../src/game/golf/play';
import { SHAPE_MIN } from '../src/game/golf/play/shape';
import { APEX, apexOf } from '../src/game/golf/play/shot3p';

const close = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) < eps;

test('shape (J5f): an amount is read as it is, held to -1..1, to the hundredth; a hair off the middle is none; the old whole picks read as before', () => {
  assert.deepEqual(readShape({ curve: -0.4, flight: 0.25 }), { curve: -0.4, flight: 0.25 });
  assert.deepEqual(readShape({ curve: 0.333333, flight: 0 }), { curve: 0.33, flight: 0 });
  assert.deepEqual(readShape({ curve: 3, flight: -9 }), { curve: 1, flight: -1 });
  assert.equal(readShape({ curve: SHAPE_MIN / 2, flight: -SHAPE_MIN / 2 }), null, 'a slider a hair off the middle is the straight normal shot');
  assert.deepEqual(readShape({ curve: -1, flight: 1 }), { curve: -1, flight: 1 }); assert.deepEqual(readShape({ curve: 0, flight: -1 }), { curve: 0, flight: -1 });
  assert.equal(readShape({ curve: 'fade' }), null); assert.equal(readShape({ curve: NaN, flight: Infinity }), null);
});

test('shape (J5f): every effect is in proportion to the amount, and a full amount is exactly the old pick', () => {
  const full = shapeEffect({ curve: 1, flight: 0 }, 'iron6', 200, 1), half = shapeEffect({ curve: 0.5, flight: 0 }, 'iron6', 200, 1);
  assert.ok(close(full.curve, SHAPE.curveDeg * Math.PI / 180), 'a full fade: the old curve');
  assert.ok(close(half.curve, full.curve / 2), 'half a fade curves half as much');
  assert.ok(close(shapeEffect({ curve: -0.25, flight: 0 }, 'iron6', 200, 1).curve, -full.curve / 4), 'a quarter draw, a quarter of it the other way');
  assert.ok(close(half.run, 1 - SHAPE.runCurve * 0.5) && close(half.miss, 1 + SHAPE.missCurve * 0.5), 'the run and the miss in proportion too');
  const hiF = shapeEffect({ curve: 0, flight: 1 }, 'iron6', 150, 0.5), hiH = shapeEffect({ curve: 0, flight: 0.5 }, 'iron6', 150, 0.5);
  assert.ok(close(hiF.carry, SHAPE.high.carry) && close(hiF.wind, SHAPE.high.wind), 'a full high flight: the old factors');
  assert.ok(close(hiH.carry, 1 + (SHAPE.high.carry - 1) / 2) && close(hiH.wind, 1 + (SHAPE.high.wind - 1) / 2) && close(hiH.miss, 1 + SHAPE.missFlight / 2), 'half of it: half of each');
  const loH = shapeEffect({ curve: 0, flight: -0.5 }, 'iron6', 150, 0.5);
  assert.ok(close(loH.carry, 1 + (SHAPE.low.carry - 1) / 2) && close(loH.run, 1 + (SHAPE.low.run - 1) / 2), 'half a low flight');
  // the cost grows with the amount: a light draw costs less than a full one
  const light = shapeEffect({ curve: -0.3, flight: 0 }, 'iron6', 150, 0.2), heavy = shapeEffect({ curve: -1, flight: 0 }, 'iron6', 150, 0.2);
  assert.ok(light.mishit < heavy.mishit && light.spread < heavy.spread && light.miss < heavy.miss);
  // the drawn apex follows the flight's amount
  const a0 = apexOf('iron6', 150), aH = apexOf('iron6', 150, { shape: { curve: 0, flight: 0.5 } } as never), aF = apexOf('iron6', 150, { shape: { curve: 0, flight: 1 } } as never);
  assert.ok(close(aF / a0, APEX.high) && close(aH / a0, 1 + (APEX.high - 1) / 2));
});

test('shape (J5f): through the model, a half draw lands between straight and a full draw', () => {
  const flat: CourseView = { holes: [], lieAt: (): Lie => 'fairway' }, O: Pt = { x: 0, y: 0 }, m = 160;
  const side = (shape: ShotShape | null) => {
    let s = 0; const n = 200;
    for (let k = 0; k < n; k++) { const fx = shapeEffect(shape, 'iron6', m, 0.9), o = hitShot(rng(90 + k, 2, 7), 0.9, 'fairway', O, { x: m / TILE_M, y: 0 }, 'iron6', flat, shape ? { shape: fx } : {}); s += o.landing.at.y * TILE_M; }
    return s / n;
  };
  const straight = side(null), half = side({ curve: -0.5, flight: 0 }), full = side({ curve: -1, flight: 0 });
  assert.ok(full < half && half < straight, `the side of the landing (m): full draw ${full.toFixed(1)}, half ${half.toFixed(1)}, straight ${straight.toFixed(1)}`);
  assert.ok(Math.abs((half - straight) - (full - straight) / 2) < Math.abs(full - straight) * 0.25, 'about half the bend');
});

test('shape (J5f): the player reads how much ("Draw 40%"); a full pick reads as before', () => {
  assert.equal(pickText({ curve: -0.4, flight: 0 }), 'Draw 40%'); assert.equal(pickText({ curve: 0.75, flight: 0.5 }), 'Fade 75%, high 50%');
  assert.equal(pickText({ curve: -1, flight: 0 }), 'Draw'); assert.equal(pickText({ curve: 1, flight: 1 }), 'Fade, high'); assert.equal(pickText({ curve: 0, flight: -1 }), 'Low');
  const s = { curve: 0, flight: 0.5 }, lines = shapeLines(s, shapeEffect(s, 'iron6', 150, 0.5));
  assert.match(lines[0]!, /^-3% carry · lands soft · wind x1\.1/);
});
