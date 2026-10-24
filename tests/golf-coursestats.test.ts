// Tests for the course stats panel model (golf/coursestats.ts): hole rows, totals, monthly upkeep, quality hints, and tier needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCourseHeightBrush, createCourseHeightField } from '../src/game/ext/course-height';
import { generateOldNine } from '../src/game/golf/coursegen';
import { NEED_LABEL, buildCourseStatsPanel, metresToYards } from '../src/game/golf/coursestats';
import type { Need } from '../src/game/golf/tour';

const SITE = { x0: 0, y0: 0, x1: 300, y1: 450 };

test('buildCourseStatsPanel on the Old Nine produces 9 valid hole rows, par 36, monthly upkeep, and high quality', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const panel = buildCourseStatsPanel(layout, 1, have);
  assert.equal(panel.rows.length, 9);
  assert.equal(panel.totals.holes, 9);
  assert.equal(panel.totals.par, 36);
  assert.deepEqual(panel.totals.mix, { 3: 2, 4: 5, 5: 2 });
  assert.equal(panel.totals.lengthYards, metresToYards(panel.totals.lengthM));
  assert.equal(panel.warningCount, 0);
  assert.ok(panel.monthlyUpkeep > 0);
  assert.equal(panel.qualityScore, 100);
  assert.deepEqual(panel.missingForCurrent, []);
  // Tier 2 needs gate, foodTent, toilets in addition to carpark
  assert.equal(panel.nextTier, 2);
  assert.deepEqual(panel.missingForNext, ['gate', 'foodTent', 'toilets']);
  assert.deepEqual(panel.missingLabels, [NEED_LABEL.gate, NEED_LABEL.foodTent, NEED_LABEL.toilets]);
});

test('buildCourseStatsPanel reports hole warnings, quality deductions, and Tier 3 18-hole / 5800m shortfalls', () => {
  const layout = generateOldNine(SITE, 11);
  // move hole 1 pin off the green into rough and drop bunkers/water
  const broken = {
    ...layout,
    areas: layout.areas.filter(a => a.surface !== 'bunker' && a.surface !== 'water'),
    pins: layout.pins.map(p => (p.hole === 1 ? { ...p, x: SITE.x0 + 2, y: SITE.y0 + 2 } : p)),
  };
  const panel = buildCourseStatsPanel(broken, 2, new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']));
  assert.ok(panel.warningCount >= 1);
  assert.ok(panel.rows[0]!.warnings.includes('The pin is not on a green'));
  assert.ok(panel.qualityScore < 100);
  assert.equal(panel.nextTier, 3);
  assert.ok(panel.missingForNext.includes('holes'));
  assert.ok(panel.missingForNext.includes('length'));
});

test('buildCourseStatsPanel with the course height: a flat field changes nothing, a raised fairway adds a bonus, a steep green is flagged on its hole', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const centroid = (pts: number[]) => { let x = 0, y = 0; for (let k = 0; k + 1 < pts.length; k += 2) { x += pts[k]!; y += pts[k + 1]!; } const n = pts.length / 2; return { x: x / n, y: y / n }; };
  const base = buildCourseStatsPanel(layout, 1, have);
  assert.equal(base.heightBonus, 0);
  assert.deepEqual(base.steepGreenHoles, []);

  const flat = buildCourseStatsPanel(layout, 1, have, 7, { field: createCourseHeightField(), areas: layout.areas });
  assert.equal(flat.qualityScore, base.qualityScore);
  assert.equal(flat.heightBonus, 0);
  assert.deepEqual(flat.steepGreenHoles, []);

  const fairway = layout.areas.find(a => a.surface === 'fairway')!;
  const raised = createCourseHeightField();
  const fc = centroid(fairway.pts);
  applyCourseHeightBrush(raised, { x: fc.x, y: fc.y, radiusTiles: 10, mode: 'raise', strength: 0.8 });
  const bumpy = buildCourseStatsPanel(layout, 1, have, 7, { field: raised, areas: layout.areas });
  assert.ok(bumpy.heightBonus >= 1, `height bonus ${bumpy.heightBonus}`);

  // the green nearest hole 1's pin is hole 1's green: a steep raise at its edge flags that hole
  const pin = layout.pins.find(p => p.hole === 1)!;
  const greens = layout.areas.filter(a => a.surface === 'green');
  const green = greens.reduce((best, g) => {
    const c = centroid(g.pts), b = centroid(best.pts);
    return Math.hypot(c.x - pin.x, c.y - pin.y) < Math.hypot(b.x - pin.x, b.y - pin.y) ? g : best;
  });
  const steep = createCourseHeightField();
  applyCourseHeightBrush(steep, { x: green.pts[0]!, y: green.pts[1]!, radiusTiles: 8, mode: 'raise', strength: 3 });
  const tagged = layout.areas.map(a => (a === green ? { hole: pin.hole, surface: a.surface, pts: a.pts } : { surface: a.surface, pts: a.pts }));
  const steepPanel = buildCourseStatsPanel(layout, 1, have, 7, { field: steep, areas: tagged });
  assert.deepEqual(steepPanel.steepGreenHoles, [pin.hole]);
  assert.ok(steepPanel.rows.find(r => r.hole === pin.hole)!.warnings.includes('Green too steep (over 6%)'));
  assert.ok(steepPanel.warningCount >= 1);
});
