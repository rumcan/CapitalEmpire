// Tests for course stats view model derivation and hole stats
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseStatsPanel } from '../src/game/golf/coursestats';
import { surfaceOfTex } from '../src/game/golf/costs';
import type { CourseArea, CourseLayout } from '../src/game/golf/types';
import type { PaintArea } from '../src/game/paint';

test('derives course stats panel data from painted areas and golf layout', () => {
  const paintAreas: PaintArea[] = [
    { id: 1, tex: 'golfRough', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000', bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000', pts: [0, 0, 100, 0, 100, 100, 0, 100] },
    { id: 2, tex: 'golfGreen', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000', bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000', pts: [30, 30, 50, 30, 50, 50, 30, 50] },
    { id: 3, tex: 'bunkerSand', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000', bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000', pts: [20, 20, 25, 20, 25, 25, 20, 25] },
  ];

  const courseAreas: CourseArea[] = paintAreas.map(a => ({
    id: a.id,
    surface: surfaceOfTex(a.tex) ?? 'other',
    pts: a.pts,
  }));

  const layout: CourseLayout = {
    areas: courseAreas,
    tees: [{ hole: 1, x: 10, y: 10, kind: 'back' }, { hole: 1, x: 12, y: 10, kind: 'middle' }, { hole: 1, x: 14, y: 10, kind: 'forward' }],
    pins: [{ hole: 1, x: 40, y: 40 }],
    aims: [],
    clubhouse: { x: 5, y: 5 },
  };

  const stats = buildCourseStatsPanel(layout, 1);
  assert.equal(stats.tier, 1);
  assert.equal(stats.nextTier, 2);
  assert.equal(stats.rows.length, 1);
  assert.equal(stats.rows[0]?.hole, 1);
  assert.ok(stats.monthlyUpkeep > 0, 'monthly upkeep should be computed from areas');
  assert.ok(stats.qualityHints.length > 0, 'should generate quality hints for incomplete course');
});

test('handles missing or unmapped textures gracefully with fallback to other', () => {
  assert.equal(surfaceOfTex('rockyDirt'), null);
  const fallback = surfaceOfTex('rockyDirt') ?? 'other';
  assert.equal(fallback, 'other');

  const layout: CourseLayout = {
    areas: [{ id: 1, surface: fallback, pts: [0, 0, 20, 0, 20, 20, 0, 20] }],
    tees: [],
    pins: [],
    aims: [],
    clubhouse: { x: 0, y: 0 },
  };

  const stats = buildCourseStatsPanel(layout, 2);
  assert.equal(stats.totals.holes, 0);
  assert.equal(stats.rows.length, 0);
});
