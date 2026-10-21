import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACE_TEX } from '../src/game/golf/paintcourse';
import {
  SURFACE_COST, TEX_SURFACE, areaBuildCost, areaMonthlyUpkeep, areaSqm, canSod,
  courseMonthlyUpkeep, growInMonths, growInShare, monthlyUpkeepSqm, paintCostSqm,
  surfaceOfTex, unitBuildCost,
} from '../src/game/golf/costs';
import type { GolfSurface } from '../src/game/golf/types';

describe('golf course costs (G2c)', () => {
  it('maps every SURFACE_TEX PaintTex id back to its GolfSurface', () => {
    for (const [s, { tex }] of Object.entries(SURFACE_TEX) as [GolfSurface, { tex: string }][]) {
      assert.equal(TEX_SURFACE[tex as keyof typeof TEX_SURFACE], s);
      assert.equal(surfaceOfTex(tex as any), s);
    }
    assert.equal(surfaceOfTex('asphalt' as any), null);
  });

  it('enforces 3x to 5x sod-to-seed price ratio on all sodded turf surfaces', () => {
    const turf: GolfSurface[] = ['green', 'fringe', 'tee', 'fairway', 'firstCut', 'rough'];
    for (const s of turf) {
      assert.equal(canSod(s), true);
      const ratio = unitBuildCost(s, 'sod') / unitBuildCost(s, 'seed');
      assert.ok(ratio >= 3 && ratio <= 5, `${s} ratio ${ratio}`);
    }
    for (const s of ['fescue', 'bunker', 'waste', 'water', 'path', 'other'] as GolfSurface[]) {
      assert.equal(canSod(s), false);
      assert.equal(unitBuildCost(s, 'sod'), SURFACE_COST[s].seed);
    }
  });

  it('computes polygon m² (4 m²/tile²) and painting cost for seed and sod', () => {
    const rect10x5 = [0, 0, 10, 0, 10, 5, 0, 5]; // 50 tiles² = 200 m²
    assert.equal(areaSqm(rect10x5), 200);
    assert.equal(areaSqm([0, 0, 1, 1]), 0);
    assert.equal(paintCostSqm('green', 200, 'seed'), 1200);
    assert.equal(paintCostSqm('green', 200, 'sod'), 5000);
    assert.equal(paintCostSqm('green', -10, 'seed'), 0);
    assert.equal(areaBuildCost(rect10x5, 'golfFairway', 'seed'), 400);
    assert.equal(areaBuildCost(rect10x5, 'golfFairway', 'sod'), 1600);
    assert.equal(areaBuildCost(rect10x5, 'bunker', 'sod'), 800);
    assert.equal(areaBuildCost(rect10x5, 'asphalt' as any, 'seed'), 0);
  });

  it('computes grow-in months and maturity share for seed vs sod', () => {
    assert.equal(growInMonths('green', 'seed'), 6);
    assert.equal(growInMonths('fringe', 'seed'), 4);
    assert.equal(growInMonths('tee', 'seed'), 3);
    assert.equal(growInMonths('fairway', 'seed'), 3);
    assert.equal(growInMonths('firstCut', 'seed'), 2);
    assert.equal(growInMonths('rough', 'seed'), 2);
    assert.equal(growInMonths('fescue', 'seed'), 3);
    assert.equal(growInMonths('green', 'sod'), 0);
    assert.equal(growInMonths('bunker', 'seed'), 0);
    assert.equal(growInShare('green', 'seed', -2), 0);
    assert.equal(growInShare('green', 'seed', 0), 0);
    assert.equal(growInShare('green', 'seed', 3), 0.5);
    assert.equal(growInShare('green', 'seed', 9), 1);
    assert.equal(growInShare('green', 'sod', 0), 1);
    assert.equal(growInShare('water', 'seed', 0), 1);
  });

  it('computes monthly maintenance per m² and across course/paint areas', () => {
    const rect = [0, 0, 10, 0, 10, 6, 0, 6]; // 60 tiles² = 240 m²
    assert.equal(monthlyUpkeepSqm('green', 240), 60); // 240 * 3.0 / 12
    assert.equal(monthlyUpkeepSqm('fairway', 240), 12); // 240 * 0.6 / 12
    assert.equal(areaMonthlyUpkeep(rect, 'golfGreen'), 60);
    const total = courseMonthlyUpkeep([
      { surface: 'green', pts: rect },
      { tex: 'golfFairway' as any, pts: rect },
      { tex: 'asphalt' as any, pts: rect },
    ]);
    assert.equal(total, 72);
  });
});
