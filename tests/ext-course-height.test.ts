import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CH_MAX_M,
  CH_MIN_M,
  CH_SIZE,
  CH_STEP,
  SUN_LIGHT,
  SUN_TILE_DIR,
  applyCourseHeightBrush,
  clampCourseHeightM,
  courseShadeAt,
  courseShadeInto,
  courseSlopeAt,
  createCourseHeightField,
  evaluateCourseHeightQuality,
  flattenCourseCorridor,
  loadCourseHeight,
  sampleCourseHeight,
  saveCourseHeight,
} from '../src/game/ext/course-height';

describe('ext/course-height (T026)', () => {
  it('creates a zeroed 1024x1024 field at 2-tile (4 m) step and clamps heights to [-3, +3] m', () => {
    const f = createCourseHeightField();
    assert.equal(CH_STEP, 2);
    assert.equal(CH_SIZE, 1024);
    assert.equal(f.data.length, 1024 * 1024);
    assert.equal(sampleCourseHeight(f, 500, 500), 0);
    assert.equal(clampCourseHeightM(9.5), CH_MAX_M);
    assert.equal(clampCourseHeightM(-8.2), CH_MIN_M);
    assert.equal(clampCourseHeightM(NaN), 0);
  });

  it('raises, lowers, smooths, and flattens terrain with smoothstep falloff', () => {
    const f = createCourseHeightField();
    const box = applyCourseHeightBrush(f, { x: 200, y: 200, radiusTiles: 10, mode: 'raise', strength: 1.2 });
    assert.ok(box !== null);
    const peak = sampleCourseHeight(f, 200, 200);
    assert.ok(peak > 1.0 && peak <= 1.25, `expected raised peak near 1.2 m, got ${peak}`);
    assert.equal(sampleCourseHeight(f, 230, 230), 0);

    applyCourseHeightBrush(f, { x: 200, y: 200, radiusTiles: 10, mode: 'smooth', strength: 0.8 });
    const smoothed = sampleCourseHeight(f, 200, 200);
    assert.ok(smoothed < peak && smoothed > 0, `expected smoothed peak < ${peak}, got ${smoothed}`);

    applyCourseHeightBrush(f, { x: 200, y: 200, radiusTiles: 12, mode: 'flatten', strength: 1.0 });
    assert.ok(Math.abs(sampleCourseHeight(f, 200, 200)) < 0.05);
  });

  it('auto-flattens road corridors to 0 m while keeping surrounding course contours', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 300, y: 300, radiusTiles: 16, mode: 'raise', strength: 2.0 });
    assert.ok(sampleCourseHeight(f, 300, 300) > 1.5);

    const roadBox = flattenCourseCorridor(f, { ax: 280, ay: 300, bx: 320, by: 300, halfWidthTiles: 4, marginTiles: 2 });
    assert.ok(roadBox !== null);
    assert.equal(sampleCourseHeight(f, 300, 300), 0);
    assert.ok(sampleCourseHeight(f, 300, 310) > 0.2, 'mound outside road corridor remains raised');
  });

  it('the sun is at the upper right: SUN_TILE_DIR projects opposite the 145° shadows and SUN_LIGHT is its unit light vector', () => {
    const sx = (SUN_TILE_DIR.x - SUN_TILE_DIR.y) * 64, sy = (SUN_TILE_DIR.x + SUN_TILE_DIR.y) * 32;
    const deg = (Math.atan2(sy, sx) * 180) / Math.PI;
    assert.ok(Math.abs(deg - -35) < 0.5, `sun screen angle ${deg}, expected -35 (325, opposite 145)`);
    assert.ok(sx > 0 && sy < 0, 'the sun projects to the upper right of the screen');
    assert.ok(Math.abs(Math.hypot(SUN_TILE_DIR.x, SUN_TILE_DIR.y) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(SUN_LIGHT.lx, SUN_LIGHT.ly, SUN_LIGHT.lz) - 1) < 1e-9);
    assert.ok(Math.abs(SUN_LIGHT.lz - 1.05 / Math.hypot(0.85, 0.55, 1.05)) < 0.01, `lz ${SUN_LIGHT.lz} keeps the old elevation`);
    assert.ok(SUN_LIGHT.lx * SUN_TILE_DIR.x > 0 && SUN_LIGHT.ly * SUN_TILE_DIR.y > 0, 'the light leans toward SUN_TILE_DIR');
  });

  it('lights slopes that face the sun (toward SUN_TILE_DIR) and shades the far side of a hill', () => {
    const f = createCourseHeightField();
    assert.equal(courseShadeAt(f, 400, 400), 0);
    applyCourseHeightBrush(f, { x: 400, y: 400, radiusTiles: 12, mode: 'raise', strength: 1.5 });
    const sunward = courseShadeAt(f, 400 + 6 * SUN_TILE_DIR.x, 400 + 6 * SUN_TILE_DIR.y);
    const away = courseShadeAt(f, 400 - 6 * SUN_TILE_DIR.x, 400 - 6 * SUN_TILE_DIR.y);
    assert.ok(sunward > 0, `expected the sun-facing slope lit (>0), got ${sunward}`);
    assert.ok(away < 0, `expected the slope facing away shaded (<0), got ${away}`);
    assert.ok(courseSlopeAt(f, 400 + 5 * SUN_TILE_DIR.x, 400 + 5 * SUN_TILE_DIR.y).mag > 0.01);
  });

  it('evaluates course quality bonus (+0..+5) and flags steep putting greens (>6%)', () => {
    const f = createCourseHeightField();
    const flatEval = evaluateCourseHeightQuality(f, [
      { hole: 1, surface: 'fairway', pts: [100, 100, 140, 100, 140, 112, 100, 112] },
      { hole: 1, surface: 'green', pts: [145, 100, 155, 100, 155, 110, 145, 110] },
    ]);
    assert.equal(flatEval.bonusPoints, 0);
    assert.equal(flatEval.steepGreenHoles.length, 0);

    applyCourseHeightBrush(f, { x: 120, y: 106, radiusTiles: 10, mode: 'raise', strength: 0.8 });
    const gentleEval = evaluateCourseHeightQuality(f, [
      { hole: 1, surface: 'fairway', pts: [100, 100, 140, 100, 140, 112, 100, 112] },
      { hole: 1, surface: 'green', pts: [145, 100, 155, 100, 155, 110, 145, 110] },
    ]);
    assert.ok(gentleEval.bonusPoints >= 1);
    assert.equal(gentleEval.steepGreenHoles.length, 0);

    applyCourseHeightBrush(f, { x: 145, y: 105, radiusTiles: 4, mode: 'raise', strength: 2.8 });
    applyCourseHeightBrush(f, { x: 155, y: 105, radiusTiles: 4, mode: 'lower', strength: 2.8 });
    const steepEval = evaluateCourseHeightQuality(f, [
      { hole: 1, surface: 'fairway', pts: [100, 100, 140, 100, 140, 112, 100, 112] },
      { hole: 1, surface: 'green', pts: [145, 100, 155, 100, 155, 110, 145, 110] },
    ]);
    assert.deepEqual(steepEval.steepGreenHoles, [1]);
    assert.ok(steepEval.hints.some(h => h.includes('hole 1')));
  });

  it('round-trips non-zero height blocks through saveCourseHeight and loadCourseHeight', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 64, y: 64, radiusTiles: 8, mode: 'raise', strength: 1.45 });
    const saved = saveCourseHeight(f);
    assert.ok(saved.length > 0 && saved.length < 10);
    const loaded = loadCourseHeight(saved);
    assert.ok(Math.abs(sampleCourseHeight(loaded, 64, 64) - sampleCourseHeight(f, 64, 64)) <= 0.01);
  });

  it('courseShadeInto: flat ground is all zeros; on a raised hill it matches courseShadeAt, lit toward the sun and shaded away from it', () => {
    const whole: [number, number, number, number] = [0, 0, CH_SIZE * CH_STEP, CH_SIZE * CH_STEP];
    const flatOut = new Float32Array(CH_SIZE * CH_SIZE);
    courseShadeInto(createCourseHeightField().data, flatOut, whole);
    assert.ok(flatOut.every(v => v === 0));

    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 500, y: 500, radiusTiles: 12, mode: 'raise', strength: 1.5 });
    const out = new Float32Array(CH_SIZE * CH_SIZE);
    courseShadeInto(f.data, out, whole);
    for (let j = 248; j <= 249; j++) for (let i = 246; i <= 255; i++) {
      const ref = courseShadeAt(f, (i + 0.5) * CH_STEP, (j + 0.5) * CH_STEP);
      assert.ok(Math.abs(out[j * CH_SIZE + i]! - ref) <= 0.02, `sample ${i},${j}: ${out[j * CH_SIZE + i]} vs ${ref}`);
    }
    const at = (x: number, y: number) => out[Math.floor(y / CH_STEP) * CH_SIZE + Math.floor(x / CH_STEP)]!;
    assert.ok(at(500 + 6 * SUN_TILE_DIR.x, 500 + 6 * SUN_TILE_DIR.y) > 0, 'the side toward the sun is lit');
    assert.ok(at(500 - 6 * SUN_TILE_DIR.x, 500 - 6 * SUN_TILE_DIR.y) < 0, 'the side away from the sun is shaded');
  });
});
