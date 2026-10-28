// Tests for the course stats panel model (golf/coursestats.ts): hole rows, totals, monthly upkeep, quality hints, and tier needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCourseHeightBrush, createCourseHeightField } from '../src/game/ext/course-height';
import { generateOldNine } from '../src/game/golf/coursegen';
import { NEED_LABEL, buildCourseStatsPanel, courseQuality, metresToYards } from '../src/game/golf/coursestats';
import { courseStats, deriveHoles } from '../src/game/golf/holes';
import { sampleLine } from '../src/game/golf/hole-terrain';
import type { Need } from '../src/game/golf/tour';
import type { CourseLayout } from '../src/game/golf/types';

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

test('T038: with no height field the slope adjustments are zero, the plays-like length is the length, and the score is the course quality', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const panel = buildCourseStatsPanel(layout, 1, have);
  assert.deepEqual(panel.slopeQuality, { steepGreens: 0, steepFairways: 0, shaped: 0 });
  for (const r of panel.rows) { assert.equal(r.riseM, 0); assert.equal(r.playsLikeM, r.lengthM); }
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  assert.equal(panel.qualityScore, courseQuality(layout, holes, courseStats(holes)).score);
});

test('T038: a flat height field adds no slope adjustments and leaves the score unchanged', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const base = buildCourseStatsPanel(layout, 1, have);
  const flat = buildCourseStatsPanel(layout, 1, have, 7, { field: createCourseHeightField(), areas: layout.areas });
  assert.deepEqual(flat.slopeQuality, { steepGreens: 0, steepFairways: 0, shaped: 0 });
  for (const r of flat.rows) { assert.equal(r.riseM, 0); assert.equal(r.playsLikeM, r.lengthM); }
  assert.equal(flat.qualityScore, base.qualityScore);
});

test('T038: a steep green (over 6%) costs 4 quality, and the height bonus still counts', () => {
  // one tee set a hole (T254's "for every golfer" term stays 0), so the flat score is not capped at 100 and the sums stay exact
  const old = generateOldNine(SITE, 4), layout = { ...old, tees: old.tees.filter(t => t.kind === 'back') };
  const have = new Set<Need>(['carpark']);
  const centroid = (pts: number[]) => { let x = 0, y = 0; for (let k = 0; k + 1 < pts.length; k += 2) { x += pts[k]!; y += pts[k + 1]!; } const n = pts.length / 2; return { x: x / n, y: y / n }; };
  const flat = buildCourseStatsPanel(layout, 1, have, 7, { field: createCourseHeightField(), areas: layout.areas });
  const pin = layout.pins.find(p => p.hole === 1)!;
  const green = layout.areas.filter(a => a.surface === 'green').reduce((best, g) => {
    const c = centroid(g.pts), b = centroid(best.pts);
    return Math.hypot(c.x - pin.x, c.y - pin.y) < Math.hypot(b.x - pin.x, b.y - pin.y) ? g : best;
  });
  const steep = createCourseHeightField();
  applyCourseHeightBrush(steep, { x: green.pts[0]!, y: green.pts[1]!, radiusTiles: 8, mode: 'raise', strength: 3 });
  const tagged = layout.areas.map(a => (a === green ? { hole: pin.hole, surface: a.surface, pts: a.pts } : { surface: a.surface, pts: a.pts }));
  const panel = buildCourseStatsPanel(layout, 1, have, 7, { field: steep, areas: tagged });
  assert.deepEqual(panel.slopeQuality, { steepGreens: -4, steepFairways: 0, shaped: 0 });
  // the raw numbers: the flat score, plus the bonus this bump earns, minus the 4 for the steep green
  assert.equal(panel.qualityScore, flat.qualityScore + panel.heightBonus - 4);
});

test('T038: a fairway over 12% along its line is a warning, costs 3 quality, and counts in warningCount', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  const line = sampleLine(holes[0]!.line);
  const mid = line[Math.floor(line.length / 2)]!;
  const ramp = createCourseHeightField();
  applyCourseHeightBrush(ramp, { x: mid.x, y: mid.y, radiusTiles: 4, mode: 'raise', strength: 3 });
  const panel = buildCourseStatsPanel(layout, 1, have, 7, { field: ramp, areas: layout.areas });
  assert.ok(panel.rows[0]!.warnings.includes('Fairway slope over 12% (smooth it)'));
  assert.equal(panel.slopeQuality.steepFairways, -3);
  assert.equal(panel.warningCount, 1);
  assert.ok(panel.qualityHints.includes('Smooth the steep fairway on hole 1'));
});

test('T038: a raised pin makes a hole climb and lengthens its plays-like length; a par 3 that plays past 230 m gets the plays-like hint', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const pin = layout.pins.find(p => p.hole === 1)!;
  const field = createCourseHeightField();
  applyCourseHeightBrush(field, { x: pin.x, y: pin.y, radiusTiles: 20, mode: 'raise', strength: 3 });
  const panel = buildCourseStatsPanel(layout, 1, have, 7, { field, areas: layout.areas });
  const row = panel.rows.find(r => r.hole === 1)!;
  assert.ok(row.riseM > 1, `rise ${row.riseM}`);
  assert.ok(row.playsLikeM > row.lengthM, `plays ${row.playsLikeM} vs ${row.lengthM}`);
  // a one-hole course: a 228 m par 3 (tee and pin 114 tiles apart) with its pin raised 3 m plays about 231 m, a par 4
  const one: CourseLayout = { areas: [], tees: [{ hole: 1, x: 20, y: 20, kind: 'back' }], pins: [{ hole: 1, x: 134, y: 20 }], aims: [], clubhouse: { x: 0, y: 0 } };
  const raised = createCourseHeightField();
  applyCourseHeightBrush(raised, { x: 134, y: 20, radiusTiles: 20, mode: 'raise', strength: 3 });
  const short = buildCourseStatsPanel(one, 1, have, 7, { field: raised, areas: [] });
  assert.equal(short.rows[0]!.lengthM, 228);
  assert.equal(short.rows[0]!.par, 3);
  assert.equal(short.rows[0]!.playsLikeM, 231);
  assert.equal(short.rows[0]!.riseM, 3);
  assert.ok(short.qualityHints.includes('Hole 1 plays like a par 4 (uphill)'));
});

test('T038: three holes raised at the pin are shaped (+1 quality); two are not', () => {
  const layout = generateOldNine(SITE, 4);
  const have = new Set<Need>(['carpark']);
  const raiseHoles = (ns: number[]) => {
    const field = createCourseHeightField();
    for (const n of ns) { const pin = layout.pins.find(p => p.hole === n)!; applyCourseHeightBrush(field, { x: pin.x, y: pin.y, radiusTiles: 20, mode: 'raise', strength: 3 }); }
    return buildCourseStatsPanel(layout, 1, have, 7, { field, areas: layout.areas });
  };
  const three = raiseHoles([1, 4, 7]);
  for (const n of [1, 4, 7]) assert.ok(three.rows.find(r => r.hole === n)!.riseM >= 1);
  assert.equal(three.slopeQuality.shaped, 1);
  assert.equal(raiseHoles([1, 4]).slopeQuality.shaped, 0);
});
