// Tests for golf basics fixes: carpark inclusion in course stats and $600k starting funds
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseStatsPanel } from '../src/game/golf/coursestats';
import { City } from '../src/game/city';
import type { CourseLayout } from '../src/game/golf/types';
import type { Need } from '../src/game/golf/tour';

test('buildCourseStatsPanel does not report carpark as lacking when carpark is present in have', () => {
  const layout: CourseLayout = {
    areas: [{ id: 1, surface: 'fairway', pts: [0, 0, 50, 0, 50, 50, 0, 50] }],
    tees: [{ hole: 1, x: 5, y: 5, kind: 'back' }],
    pins: [{ hole: 1, x: 45, y: 45 }],
    aims: [],
    clubhouse: { x: 0, y: 0 },
  };

  const withoutCarpark = buildCourseStatsPanel(layout, 1, new Set<Need>());
  assert.ok(withoutCarpark.missingLabels.includes('Car park'), 'should list Car park as lacking when not present');

  const withCarpark = buildCourseStatsPanel(layout, 1, new Set<Need>(['carpark']));
  assert.ok(!withCarpark.missingLabels.includes('Car park'), 'should not list Car park when carpark is present in have');
});

test('city starts with $600,000 in golf mode versus $800,000 in classic mode', () => {
  const cls = new Uint8Array(160 * 160);
  const entry = { x: 10, y: 10 };
  const towns = [{ x: 50, y: 50 }];

  // Classic mode with towns starts with $800,000
  const classicCity = new City(1);
  classicCity.terrain(cls, entry, 1, towns, undefined, false);
  assert.equal(classicCity.budget.money, 800000);

  // Golf mode with town starts with $600,000
  const golfCity = new City(1);
  golfCity.terrain(cls, entry, 1, towns, undefined, true);
  assert.equal(golfCity.budget.money, 600000);
});
