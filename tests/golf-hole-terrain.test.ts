import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCourseHeightBrush, createCourseHeightField } from '../src/game/ext/course-height';
import { courseTerrain, holeTerrain, sampleLine } from '../src/game/golf/hole-terrain';
import type { Hole } from '../src/game/golf/holes';

/** a hole along y = 100 from x = 100 to x = 300 (200 tiles = 400 m) */
const hole = (n: number): Hole => ({ n, par: 4, lengthM: 400, memberLengthM: 360, line: [{ x: 100, y: 100 }, { x: 300, y: 100 }], warnings: [] });

describe('golf/hole-terrain (T037)', () => {
  it('samples a polyline every 2 tiles along its path, keeping the first and last points', () => {
    const straight = sampleLine([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    assert.deepEqual(straight.map(p => p.x), [0, 2, 4, 6, 8, 10]);
    assert.ok(straight.every(p => p.y === 0));
    const bent = sampleLine([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }]);
    assert.equal(bent.length, 4);
    assert.ok(Math.abs(bent[1]!.x - 2) < 1e-9 && Math.abs(bent[1]!.y) < 1e-9);
    assert.ok(Math.abs(bent[2]!.x - 3) < 1e-9 && Math.abs(bent[2]!.y - 1) < 1e-9);
    assert.deepEqual(bent[3], { x: 3, y: 3 });
    assert.deepEqual(sampleLine([]), []);
    assert.deepEqual(sampleLine([{ x: 5, y: 7 }]), [{ x: 5, y: 7 }]);
    assert.deepEqual(sampleLine([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }]).map(p => p.x), [0, 2, 4]);
  });

  it('gives a flat hole no rise, relief or slope, and plays its true length', () => {
    const t = holeTerrain(createCourseHeightField(), hole(1));
    assert.equal(t.riseM, 0);
    assert.equal(t.reliefM, 0);
    assert.equal(t.maxSlope, 0);
    assert.equal(t.playsLikeM, 400);
  });

  it('plays a hole with an empty line as its length, with every terrain number at 0', () => {
    const t = holeTerrain(createCourseHeightField(), { ...hole(3), line: [] });
    assert.deepEqual(t, { hole: 3, teeM: 0, pinM: 0, riseM: 0, minM: 0, maxM: 0, reliefM: 0, maxSlope: 0, playsLikeM: 400 });
  });

  it('a raised pin end makes an uphill hole that plays longer', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 300, y: 100, radiusTiles: 20, mode: 'raise', strength: 2 });
    const t = holeTerrain(f, hole(1));
    assert.ok(t.riseM > 1, `riseM ${t.riseM}`);
    assert.ok(t.pinM > t.teeM);
    assert.ok(t.playsLikeM > 400, `playsLikeM ${t.playsLikeM}`);
    assert.ok(t.maxSlope > 0, `maxSlope ${t.maxSlope}`);
  });

  it('a lowered pin end makes a downhill hole that plays shorter, never below half its length', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 300, y: 100, radiusTiles: 20, mode: 'lower', strength: 2 });
    const t = holeTerrain(f, hole(1));
    assert.ok(t.riseM < -1, `riseM ${t.riseM}`);
    assert.ok(t.playsLikeM < 400, `playsLikeM ${t.playsLikeM}`);
    assert.ok(t.playsLikeM >= 200, `playsLikeM ${t.playsLikeM}`);
    assert.ok(t.maxSlope > 0);
  });

  it('a bump in the middle has no rise but has relief and a high point above the tee', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 200, y: 100, radiusTiles: 20, mode: 'raise', strength: 2 });
    const t = holeTerrain(f, hole(1));
    assert.ok(Math.abs(t.riseM) < 0.05, `riseM ${t.riseM}`);
    assert.ok(t.reliefM > 1, `reliefM ${t.reliefM}`);
    assert.ok(t.maxM > t.teeM);
  });

  it('gives one terrain entry per hole, in order', () => {
    const all = courseTerrain(createCourseHeightField(), [hole(1), hole(2)]);
    assert.equal(all.length, 2);
    assert.deepEqual(all.map(t => t.hole), [1, 2]);
  });
});
