// Tests for CourseStatsPanel pure formatting helpers (ui-coursestats.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency, formatHoleLength, parColorClass, qualityBadgeClass,
} from '../src/ui/coursestatsFormat';

test('formatCurrency formats positive and negative amounts correctly', () => {
  assert.equal(formatCurrency(0), '$0');
  assert.equal(formatCurrency(1200), '$1,200');
  assert.equal(formatCurrency(-500), '-$500');
  assert.equal(formatCurrency(45000.4), '$45,000');
});

test('formatHoleLength formats metres and yards', () => {
  assert.equal(formatHoleLength(440, 481), '440 m (481 yd)');
  assert.equal(formatHoleLength(150, 164), '150 m (164 yd)');
});

test('parColorClass returns distinct Tailwind classes by par', () => {
  assert.ok(parColorClass(3).includes('sky'));
  assert.ok(parColorClass(4).includes('emerald'));
  assert.ok(parColorClass(5).includes('amber'));
});

test('qualityBadgeClass returns proper styling by score tier', () => {
  const high = qualityBadgeClass(90);
  assert.ok(high.text.includes('emerald'));
  const mid = qualityBadgeClass(70);
  assert.ok(mid.text.includes('amber'));
  const low = qualityBadgeClass(45);
  assert.ok(low.text.includes('rose'));
});
