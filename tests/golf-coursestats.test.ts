// Tests for the course stats panel model (golf/coursestats.ts): hole rows, totals, monthly upkeep, quality hints, and tier needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
