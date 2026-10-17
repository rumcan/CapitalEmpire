// Headless tests for the terrain painting helpers: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { HS, TC, type WaterPoint } from '../src/game/terrain/types';
import { makeNoise } from '../src/game/terrain/noise';
import { shadeField, shadeRGBA, classAlpha, waterShape, waterBox, type PathSink } from '../src/game/terrain-paint';

/** a sink that records every call as a plain list of points, arcs and closes */
function recorder() {
  const quads: { x: number; y: number }[][] = [];
  let arcs = 0, cur: { x: number; y: number }[] | null = null;
  const sink: PathSink = {
    moveTo(x, y) { cur = [{ x, y }]; },
    lineTo(x, y) { cur?.push({ x, y }); },
    arc() { arcs++; cur = null; },
    closePath() { if (cur && cur.length === 4) quads.push(cur); cur = null; },
  };
  return { sink, quads, arcs: () => arcs };
}

test('shadeField: flat ground is exactly 0, a field rising to +x is lit, falling to +x is shaded', () => {
  const flat = new Float32Array(HS * HS).fill(10);
  for (const v of shadeField(flat)) assert.ok(Math.abs(v) < 1e-9);
  const rise = new Float32Array(HS * HS), fall = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) { rise[j * HS + i] = i * 4; fall[j * HS + i] = -i * 4; }
  const sr = shadeField(rise), sf = shadeField(fall);
  for (let j = 1; j < HS - 1; j++) for (let i = 1; i < HS - 1; i++) {
    assert.ok(sr[j * HS + i] > 0, `rising slope lit at ${i},${j}`);
    assert.ok(sf[j * HS + i] < 0, `falling slope shaded at ${i},${j}`);
  }
});

test('shadeRGBA: returns W*H*4 bytes with W = ceil(w*res)', () => {
  const shade = shadeField(new Float32Array(HS * HS).map((_, k) => (k % HS) * 3));
  const out = shadeRGBA(shade, 100, 50, 10.5, 7, 3);
  assert.equal(out.W, Math.ceil(10.5 * 3));
  assert.equal(out.H, Math.ceil(7 * 3));
  assert.equal(out.data.length, out.W * out.H * 4);
  const flat = shadeRGBA(new Float32Array(HS * HS), 0, 0, 4, 4, 1);
  assert.equal(flat.W, 4);
  assert.equal(flat.data.length, 4 * 4 * 4);
});

test('classAlpha: a fully covered box is opaque, a box without the class is null', () => {
  const noise = makeNoise(1);
  const hill = new Uint8Array(MAP * MAP).fill(TC.HILL);
  const full = classAlpha(hill, TC.HILL, 100, 100, 8, 8, 2, noise);
  assert.ok(full);
  assert.equal(full.W, 16);
  assert.equal(full.H, 16);
  for (let k = 3; k < full.data.length; k += 4) assert.equal(full.data[k], 255);
  for (let k = 0; k < full.data.length; k += 4) assert.equal(full.data[k], 0);
  const ground = new Uint8Array(MAP * MAP).fill(TC.GROUND);
  assert.equal(classAlpha(ground, TC.HILL, 100, 100, 8, 8, 2, noise), null);
});

test('waterShape: arcs and quads, every quad winds the same way as the arcs', () => {
  const pts: WaterPoint[] = [{ x: 0, y: 0, w: 4 }, { x: 10, y: 0, w: 4 }, { x: 10, y: 10, w: 6 }];
  const { sink, quads, arcs } = recorder();
  assert.equal(waterShape(sink, pts, 0, [-100, -100, 100, 100]), true);
  assert.equal(arcs(), 3);
  assert.equal(quads.length, 2);
  for (const q of quads) {
    let s = 0;
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
    assert.ok(s > 0, `quad shoelace ${s} should be positive`);
  }
  const far = recorder();
  assert.equal(waterShape(far.sink, pts, 0, [500, 500, 600, 600]), false);
  assert.equal(far.arcs(), 0);
  assert.equal(far.quads.length, 0);
});

test('waterBox: the points grown by half the widest water plus pad', () => {
  const pts: WaterPoint[] = [{ x: 0, y: 0, w: 4 }, { x: 10, y: 5, w: 6 }];
  assert.deepEqual(waterBox(pts, 1), [-4, -4, 14, 9]);
});
