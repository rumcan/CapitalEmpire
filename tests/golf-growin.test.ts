// Tests for golf course surface grow-in: seed/sod planting, monthly maturity progression, texture switching, and quality scoring
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTuples, toTuple, type PaintArea, type PaintTuple } from '../src/game/paint';
import { growInMonths, growInShare } from '../src/game/golf/costs';
import { isAreaMature } from '../src/game/paint-tool';
import { courseQuality } from '../src/game/golf/coursestats';
import type { CourseLayout } from '../src/game/golf/types';
import type { CourseStats, Hole } from '../src/game/golf/holes';

test('toTuple and fromTuples preserve plantKind and plantedMonth with backward compatibility', () => {
  // New area with seed planting in season month 8 (September)
  const seededArea: PaintArea = {
    id: 1,
    pts: [0, 0, 10, 0, 10, 10, 0, 10],
    tex: 'golfGreen',
    scale: 1,
    angle: 0,
    border: 2,
    btex: 'golfFringe',
    radius: 0,
    tone: 0,
    toneAmt: 0.35,
    tint: '#000000',
    bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000',
    hole: 1,
    kind: 'green',
    plantKind: 'seed',
    plantedMonth: 8,
  };

  const tuple = toTuple(seededArea);
  assert.equal(tuple[12], 'seed');
  assert.equal(tuple[13], 8);

  const restored = fromTuples([tuple]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0]!.plantKind, 'seed');
  assert.equal(restored[0]!.plantedMonth, 8);

  // Backward compatibility: old 10-element tuple without plantKind
  const oldTuple: PaintTuple = ['golfGreen', 1, 0, 2, 'golfFringe', [0, 0, 10, 0, 10, 10, 0, 10], 0, 0, 0.35, '#000000'];
  const oldRestored = fromTuples([oldTuple]);
  assert.equal(oldRestored.length, 1);
  assert.equal(oldRestored[0]!.plantKind, undefined, 'old save areas should have undefined plantKind (already mature)');
  assert.equal(oldRestored[0]!.plantedMonth, undefined);
});

test('growInMonths and growInShare compute proper progress across golf surfaces', () => {
  // Green takes 6 months from seed, 0 from sod
  assert.equal(growInMonths('green', 'seed'), 6);
  assert.equal(growInMonths('green', 'sod'), 0);
  assert.equal(growInMonths('fairway', 'seed'), 3);
  assert.equal(growInMonths('bunker', 'seed'), 0);

  // growInShare progress for 6-month green
  assert.equal(growInShare('green', 'seed', 0), 0);
  assert.equal(growInShare('green', 'seed', 3), 0.5);
  assert.equal(growInShare('green', 'seed', 6), 1.0);
  assert.equal(growInShare('green', 'seed', 8), 1.0, 'clamped at 1.0 after maturity');

  // Sod is instantly 1.0
  assert.equal(growInShare('green', 'sod', 0), 1.0);
});

test('isAreaMature determines maturity by month and switches texture from golfSod', () => {
  // Seeded green planted in September (month 8), needs 6 months
  const seededGreen: PaintArea = {
    id: 1,
    pts: [0, 0, 10, 0, 10, 10, 0, 10],
    tex: 'golfGreen',
    scale: 1,
    angle: 0,
    border: 2,
    btex: 'golfFringe',
    radius: 0,
    tone: 0,
    toneAmt: 0.35,
    tint: '#000000',
    bscale: 1, bangle: 0, btone: 0, btoneAmt: 0.35, btint: '#000000',
    plantKind: 'seed',
    plantedMonth: 8,
  };

  // Month 8 (0 months elapsed): immature
  assert.equal(isAreaMature(seededGreen, 8), false);
  // Month 11 (3 months elapsed): immature
  assert.equal(isAreaMature(seededGreen, 11), false);
  // Month 2 (Feb, 6 months elapsed): mature!
  assert.equal(isAreaMature(seededGreen, 14), true);
  assert.equal(isAreaMature(seededGreen, 20), true, 'a year after planting it is still mature (months are an absolute count, not modulo 12)');

  // Sod area is mature immediately in planting month
  const sodGreen: PaintArea = { ...seededGreen, plantKind: 'sod' };
  assert.equal(isAreaMature(sodGreen, 8), true);

  // Legacy area without plantKind is mature immediately
  const legacyGreen: PaintArea = { ...seededGreen, plantKind: undefined };
  assert.equal(isAreaMature(legacyGreen, 8), true);
});

test('courseQuality penalizes unfinished grow-in areas proportionally', () => {
  const holes: Hole[] = [
    { n: 1, par: 4, lengthM: 350, memberLengthM: 320, line: [{ x: 10, y: 10 }, { x: 50, y: 10 }], warnings: [] },
  ];
  const stats: CourseStats = {
    holes: 9,
    par: 36,
    lengthM: 2800,
    memberLengthM: 2600,
    mix: { 3: 2, 4: 5, 5: 2 },
  };

  // Fully mature course layout
  const matureLayout: CourseLayout = {
    areas: [
      { id: 1, surface: 'green', pts: [0, 0, 10, 0, 10, 10, 0, 10], plantKind: 'sod' },
      { id: 2, surface: 'bunker', pts: [15, 0, 20, 0, 20, 5, 15, 5] },
      { id: 3, surface: 'water', pts: [30, 0, 40, 0, 40, 10, 30, 10] },
    ],
    tees: [],
    pins: [],
    aims: [],
    clubhouse: { x: 0, y: 0 },
  };

  const matureQual = courseQuality(matureLayout, holes, stats, 7);

  // Layout with seeded green planted in month 6 (June), only 1 month old in July (month 7)
  const growingLayout: CourseLayout = {
    ...matureLayout,
    areas: [
      { id: 1, surface: 'green', pts: [0, 0, 10, 0, 10, 10, 0, 10], plantKind: 'seed', plantedMonth: 6 },
      { id: 2, surface: 'bunker', pts: [15, 0, 20, 0, 20, 5, 15, 5] },
      { id: 3, surface: 'water', pts: [30, 0, 40, 0, 40, 10, 30, 10] },
    ],
  };

  const growingQual = courseQuality(growingLayout, holes, stats, 7);

  assert.ok(growingQual.score < matureQual.score, 'unfinished grow-in should lower quality score');
  assert.ok(growingQual.hints.some(h => h.includes('grow in')), 'hints should advise allowing surfaces to grow in');
});
