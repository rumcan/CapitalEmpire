// T372 (#1027): cliff-sided raised tees. On the map: a tee raised past ROCK_STEEP_H keeps steepening to a near-sheer cliff face, and from CLIFF_FROM_H it is
// drawn as cliff rock (course-walls faceForm, cliffRun); the Height slider reaches TEE_MAX_H. In the view's export (golf/play/cliff3p.ts teeLift): the tee's
// raise is added as a sharp step the view reads as a cliff (steeper than its 1.25 cliff slope over the 1.5 m lattice), with a walkable ramp where the map
// draws the stairs; a low tee gets no ramp. And the export of a painted course keeps the step and the ramp.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLIFF_FROM_H, CLIFF_RATIO, FaceForm, HEIGHT_RANGE, ROCK_STEEP_H, SURF_HEIGHT, TEE_MAX_H, WallMat, cliffRun, faceForm, surfHeights } from '../src/game/ext/course-walls';
import { SURF } from '../src/game/ext/course-grid';
import { RAMP_GRADE, RAMP_MIN_RAISE, teeLift } from '../src/game/golf/play/cliff3p';
import { exportCourse3p, frame3p, sampleHeights, HEIGHT_STEP_M } from '../src/game/golf/play/export3p';
import { TILE_M, type CourseArea } from '../src/game/golf/types';

const TEE = SURF.tee;
const heightsAt = (h: number) => SURF_HEIGHT.map((v, s) => (s === TEE ? h : v));

describe('T372 cliff tees on the map', () => {
  it('lets a tee be raised to TEE_MAX_H, and its face steepens past ROCK_STEEP_H to a near-sheer cliff', () => {
    assert.equal(HEIGHT_RANGE[TEE]![1], TEE_MAX_H);
    assert.ok(TEE_MAX_H >= 4, 'several metres');
    assert.equal(surfHeights([undefined, undefined, undefined, undefined, undefined, 9])[TEE], TEE_MAX_H, 'clamped to the top');
    const run = (h: number) => faceForm(TEE, WallMat.Turf, heightsAt(h));
    assert.equal(run(1).f, FaceForm.Rock);
    assert.ok(run(2.2).r < run(ROCK_STEEP_H).r, 'steeper above the old top');
    assert.ok(Math.abs(run(4).r - CLIFF_RATIO * 0.5) < 1e-9, 'sheer at and above CLIFF_STEEP_H');
    // the T127 tees below ROCK_STEEP_H are as they were
    assert.ok(Math.abs(run(ROCK_STEEP_H).r - 0.45 * 0.5) < 1e-9);
  });
  it('draws a tee CLIFF_FROM_H high or more as cliff rock, and a lower one as before', () => {
    const run = (h: number) => faceForm(TEE, WallMat.Turf, heightsAt(h)).r;
    assert.ok(cliffRun(run(CLIFF_FROM_H)));
    assert.ok(cliffRun(run(4)));
    assert.ok(!cliffRun(run(1.5)));
    assert.ok(!cliffRun(run(0.6)), 'the default tee keeps its look');
  });
});

describe('T372 the tee lift in the view', () => {
  // a tee from x 100..110, y 100..112 (tiles); its stairs on the east side, facing east (+x), 2 tiles wide
  const isTee = (x: number, y: number) => x >= 100 && x < 110 && y >= 100 && y < 112;
  const stairs = [{ x: 110, y: 106, nx: 1, ny: 0, half: 1 }];

  it('stands the tee its raise up, runs a ramp down at the stairs, and leaves the rest of the ground alone', () => {
    const lift = teeLift({ raise: 3, isTee, stairs })!;
    assert.equal(lift(105, 106), 3);
    assert.equal(lift(95, 106), 0, 'off the tee on the west: a sheer drop');
    const len = 3 / RAMP_GRADE / TILE_M; // tiles
    assert.ok(Math.abs(lift(110, 106) - 3) < 1e-9, 'the ramp starts at the tee top');
    assert.ok(Math.abs(lift(110 + len / 2, 106) - 1.5) < 1e-9, 'halfway down');
    assert.equal(lift(110 + len + 0.5, 106), 0, 'and ends on the ground');
    assert.equal(lift(112, 100), 0, 'beside the ramp: the cliff');
  });
  it('gives a low tee no ramp (a step), and nothing at all with no raise', () => {
    const low = teeLift({ raise: RAMP_MIN_RAISE - 0.1, isTee, stairs })!;
    assert.equal(low(111, 106), 0);
    assert.equal(teeLift({ raise: 0, isTee, stairs }), null);
  });
  it('a tee 3 m up exports as a cliff (steeper than the view’s cliff slope over the lattice) with a ramp walkable all the way down', async () => {
    const tee: CourseArea = { id: 1, surface: 'tee', pts: [100, 100, 110, 100, 110, 112, 100, 112] };
    const green: CourseArea = { id: 2, surface: 'green', pts: [100, 20, 110, 20, 110, 30, 100, 30] };
    const lift = teeLift({ raise: 3, isTee, stairs })!;
    const inp = { areas: [tee, green], tees: [{ hole: 1, kind: 'middle' as const, x: 105, y: 106 }], pins: [{ hole: 1, x: 105, y: 25 }], aims: [], heightAt: (x: number, y: number) => lift(x, y) };
    const f = frame3p(inp), t0 = performance.now(), file = await exportCourse3p(inp), ms = performance.now() - t0;
    assert.ok(file.height, 'heights exported');
    // read the lattice the export samples: across the tee's west edge the ground drops 3 m within one 1.5 m step (slope 2 > the view's 1.25 cliff)
    const box: [number, number, number, number] = [-60, -120, 60, 120], g = sampleHeights(inp.heightAt, f, box), at = (X: number, Y: number) => {
      const i = Math.round((X - g.x0) / g.step), j = Math.round((g.y0 - Y) / g.step); return g.m[j * g.w + i]!;
    };
    const [wx, wy] = [(100 - f.cx) * TILE_M, -(106 - f.cy) * TILE_M];
    let steepest = 0;
    for (let X = wx - 6; X <= wx + 6; X += HEIGHT_STEP_M) steepest = Math.max(steepest, Math.abs(at(X + HEIGHT_STEP_M, wy) - at(X, wy)) / HEIGHT_STEP_M);
    assert.ok(steepest > 1.25, `a cliff: ${steepest.toFixed(2)}`);
    // along the ramp (east of the tee) no step is steeper than the walker climbs (0.65 m in half a metre, 1.3)
    const [ex] = [(110 - f.cx) * TILE_M];
    let worst = 0;
    for (let X = ex - 3; X <= ex + 3 / RAMP_GRADE + 3; X += HEIGHT_STEP_M) worst = Math.max(worst, Math.abs(at(X + HEIGHT_STEP_M, wy) - at(X, wy)) / HEIGHT_STEP_M);
    assert.ok(worst < 1.3, `the ramp is walkable: ${worst.toFixed(2)}`);
    assert.ok(ms < 300, `the export took ${ms.toFixed(0)} ms`);
  });
});
