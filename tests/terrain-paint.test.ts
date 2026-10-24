// Headless tests for the terrain painting helpers: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { HS, TC, type WaterPoint } from '../src/game/terrain/types';
import { makeNoise } from '../src/game/terrain/noise';
import { CH_SIZE, courseShadeInto } from '../src/game/ext/course-height';
import { shadeField, shadeRGBA, courseShadeRGBA, classAlpha, rockAlpha, waterShape, waterBox, woodlandTex, WOODLAND_TEX, type PathSink } from '../src/game/terrain-paint';
import fs from 'node:fs';
import { PRESETS, surfacePreset } from '../src/game/paint-presets';
import { PAINT_TEXES, isPaintPhoto } from '../src/game/paint';

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

test('shadeField: flat ground is exactly 0; the sun is at the upper right (toward -y): a field rising to +y (falling toward the sun) is lit, rising to -y is shaded', () => {
  const flat = new Float32Array(HS * HS).fill(10);
  for (const v of shadeField(flat)) assert.ok(Math.abs(v) < 1e-9);
  const up = new Float32Array(HS * HS), down = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) { up[j * HS + i] = j * 4; down[j * HS + i] = -j * 4; }
  const su = shadeField(up), sd = shadeField(down);
  // the sun leans only slightly toward -x (SUN_TILE_DIR.x ≈ -0.16), so x-facing slopes are not pinned here: the y slopes carry the test
  for (let j = 1; j < HS - 1; j++) for (let i = 1; i < HS - 1; i++) {
    assert.ok(su[j * HS + i]! > 0.1, `rising to +y (falling toward the sun) is lit at ${i},${j}`);
    assert.ok(sd[j * HS + i]! < -0.1, `rising to -y (facing away from the sun) is shaded at ${i},${j}`);
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

test('shadeRGBA: a course shade adds shadow alpha where the terrain shade alone gives none', () => {
  const flat = new Float32Array(HS * HS);
  const without = shadeRGBA(flat, 100, 100, 4, 4, 1);
  for (let k = 3; k < without.data.length; k += 4) assert.equal(without.data[k], 0);
  const course = new Float32Array(CH_SIZE * CH_SIZE).fill(-0.4);
  const withCourse = shadeRGBA(flat, 100, 100, 4, 4, 1, course);
  for (let k = 3; k < withCourse.data.length; k += 4) assert.ok(withCourse.data[k]! > 0, `shadow at ${k}`);
  assert.equal(withCourse.data[0], 14);
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

test('rockAlpha: a flat slope field has no rock (null), a field of steepness 3 is opaque everywhere', () => {
  const noise = makeNoise(1);
  assert.equal(rockAlpha(new Float32Array(HS * HS), 100, 100, 10, 10, 1, noise), null);
  const steep = rockAlpha(new Float32Array(HS * HS).fill(3), 100, 100, 10, 10, 1, noise);
  assert.ok(steep);
  for (let k = 3; k < steep.data.length; k += 4) assert.equal(steep.data[k], 255);
  for (let k = 0; k < steep.data.length; k += 4) assert.equal(steep.data[k], 0);
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

test('courseShadeRGBA: null on an all-zero course (flat)', () => {
  assert.equal(courseShadeRGBA(new Float32Array(CH_SIZE * CH_SIZE), 100, 100, 4, 4, 1), null);
});

test('courseShadeRGBA: shaded over a raised bump, null far from it', () => {
  const h = new Float32Array(CH_SIZE * CH_SIZE);
  for (let j = 0; j < CH_SIZE; j++) for (let i = 0; i < CH_SIZE; i++) h[j * CH_SIZE + i] = 1.5 * Math.exp(-((i - 250) ** 2 + (j - 250) ** 2) / (2 * 8 * 8));
  const shade = new Float32Array(CH_SIZE * CH_SIZE);
  courseShadeInto(h, shade, [470, 470, 530, 530]);
  const over = courseShadeRGBA(shade, 480, 480, 40, 40, 1);
  assert.ok(over, 'a box over the bump is shaded');
  let alphaMax = 0;
  for (let k = 3; k < over.data.length; k += 4) alphaMax = Math.max(alphaMax, over.data[k]!);
  assert.ok(alphaMax > 0, 'some pixel has alpha > 0');
  assert.equal(courseShadeRGBA(shade, 100, 100, 40, 40, 1), null);
});

test("the woodland floor paints with the Fescue: the preset for the course's fescue surface, else the owner's Fescue preset, else the old fescue photo", () => {
  // the owner, 2026-10-24: "the map has this vector texture and it should be Fescue texture"
  const expect = surfacePreset('fescue') ?? (PRESETS.some(p => p.id === 'fescue') ? 'preset:fescue' : 'golfFescue');
  assert.equal(WOODLAND_TEX, expect);
  assert.equal(WOODLAND_TEX, 'preset:fescue', "the presets the game is built with: the owner's Fescue (it stands for no surface yet)");
  assert.ok(isPaintPhoto(WOODLAND_TEX), 'laid in tile space like a painted course area, never the painted forest floor');
  assert.ok(PAINT_TEXES.some(t => t.id === WOODLAND_TEX && t.name === 'Fescue'), 'a Paint texture named Fescue (its swatch is the flat fill until a worker builds it)');
  assert.ok(fs.existsSync('src/assets/ground/preset-fescue.webp'), 'the preset has its baked picture, so the ground workers can build it');
  // the order of the choice
  assert.equal(woodlandTex([{ id: 'deep', surface: 'fescue' }, { id: 'fescue', surface: null }]), 'preset:deep', 'a preset standing for fescue wins: the woodland follows the course');
  assert.equal(woodlandTex([{ id: 'rough', surface: 'rough' }, { id: 'fescue', surface: null }]), 'preset:fescue');
  assert.equal(woodlandTex([{ id: 'rough', surface: 'rough' }]), 'golfFescue', "no Fescue preset: the course's old fescue photo");
  assert.equal(woodlandTex([]), 'golfFescue');
});
