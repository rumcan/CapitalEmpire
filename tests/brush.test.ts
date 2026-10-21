// Headless tests for the Paint tool's round brush: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, dab, fillPoly, stroke, trace, type Mask } from '../src/game/brush';
import { MAX_PTS, checkArea, polyArea } from '../src/game/paint';

/** the area of an outline in tiles² (unsigned) */
const area = (o: number[]) => Math.abs(polyArea(o));

test('one round dab traces to one valid disc outline near its radius', () => {
  const m: Mask = new Set();
  dab(m, 100, 100, 5);
  const out = trace(m);
  assert.equal(out.length, 1);
  assert.equal(checkArea(out[0]!), '');
  assert.ok(Math.abs(area(out[0]!) / (Math.PI * 25) - 1) < 0.1, `area ${area(out[0]!)}`);
  for (let k = 0; k < out[0]!.length; k += 2) assert.ok(Math.hypot(out[0]![k]! - 100, out[0]![k + 1]! - 100) <= 5.6);
});

test('a round stroke traces to one outline close to the capsule area', () => {
  const m: Mask = new Set();
  stroke(m, 50, 50, 90, 60, 3);
  const out = trace(m);
  assert.equal(out.length, 1);
  assert.equal(checkArea(out[0]!), '');
  const len = Math.hypot(40, 10), capsule = 2 * 3 * len + Math.PI * 9;
  assert.ok(Math.abs(area(out[0]!) / capsule - 1) < 0.15, `area ${area(out[0]!)} vs ${capsule}`);
});

test('separate dabs trace to separate outlines and overlapping dabs merge', () => {
  const far: Mask = new Set();
  dab(far, 10, 10, 3); dab(far, 50, 50, 3);
  assert.equal(trace(far).length, 2);
  const over: Mask = new Set();
  dab(over, 10, 10, 3); dab(over, 12, 10, 3);
  assert.equal(trace(over).length, 1);
});

test('erasing the middle of a dab leaves a ring whose hole is filled (one outline)', () => {
  const m: Mask = new Set();
  dab(m, 100, 100, 6); dab(m, 100, 100, 3, true);
  const out = trace(m);
  assert.equal(out.length, 1);
  assert.equal(checkArea(out[0]!), '');
  assert.ok(area(out[0]!) > Math.PI * 36 * 0.8);
});

test('erasing a band across a stroke splits it into two outlines', () => {
  const m: Mask = new Set();
  stroke(m, 50, 50, 90, 60, 3);
  stroke(m, 70, 40, 70, 70, 1.5, true);
  const out = trace(m);
  assert.equal(out.length, 2);
  for (const o of out) assert.equal(checkArea(o), '');
});

test('a traced outline refilled with fillPoly and traced again keeps its count and area', () => {
  const m: Mask = new Set();
  stroke(m, 50, 50, 90, 60, 3);
  dab(m, 120, 120, 6);
  const first = trace(m);
  const again: Mask = new Set();
  for (const o of first) fillPoly(again, o);
  const second = trace(again);
  assert.equal(second.length, first.length);
  const a1 = first.reduce((s, o) => s + area(o), 0), a2 = second.reduce((s, o) => s + area(o), 0);
  assert.ok(Math.abs(a2 / a1 - 1) < 0.05, `${a1} vs ${a2}`);
});

test('a long wiggly stroke gives only valid outlines within the corner limit', () => {
  const m: Mask = new Set();
  for (let i = 0; i < 60; i++) stroke(m, 10 + i * 1.5, 50 + 6 * Math.sin(i * 0.5), 10 + (i + 1) * 1.5, 50 + 6 * Math.sin((i + 1) * 0.5), 2);
  const out = trace(m);
  assert.ok(out.length >= 1);
  for (const o of out) {
    assert.equal(checkArea(o), '');
    assert.ok(o.length >> 1 <= MAX_PTS);
  }
});

test('diagonal-only touching blocks trace to two separate valid outlines', () => {
  const m: Mask = new Set();
  fillPoly(m, [0, 0, 2, 0, 2, 2, 0, 2]);
  fillPoly(m, [2, 2, 4, 2, 4, 4, 2, 4]);
  const out = trace(m);
  assert.equal(out.length, 2);
  for (const o of out) assert.equal(checkArea(o), '');
});

test('a 120-tile stroke of radius 8 traces in under 50 ms', () => {
  const m: Mask = new Set();
  const t0 = performance.now();
  stroke(m, 100, 100, 220, 100, 8);
  const out = trace(m);
  const ms = performance.now() - t0;
  assert.equal(out.length, 1);
  assert.ok(ms < 50, `took ${ms.toFixed(1)} ms`);
  console.log(`brush: 120-tile stroke r=8 traced in ${ms.toFixed(2)} ms (cell ${CELL})`);
});
