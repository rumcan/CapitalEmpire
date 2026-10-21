// Tests for TournamentResults pure formatting helpers (ui-results.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent, formatResultMoney, repDelta, satisfactionBadge,
} from '../src/ui/TournamentResults';

test('formatResultMoney formats positive, negative, and explicit plus values', () => {
  assert.equal(formatResultMoney(0), '$0');
  assert.equal(formatResultMoney(15000), '$15,000');
  assert.equal(formatResultMoney(15000, true), '+$15,000');
  assert.equal(formatResultMoney(-4200), '-$4,200');
});

test('formatPercent formats percentage values', () => {
  assert.equal(formatPercent(78.4), '78%');
  assert.equal(formatPercent(100), '100%');
});

test('satisfactionBadge returns proper tier label and colors', () => {
  assert.equal(satisfactionBadge(90).label, 'Outstanding');
  assert.equal(satisfactionBadge(75).label, 'Good');
  assert.equal(satisfactionBadge(60).label, 'Average');
  assert.equal(satisfactionBadge(40).label, 'Poor');
});

test('repDelta computes positive, negative, and neutral reputation shifts', () => {
  const up = repDelta(50, 56);
  assert.equal(up.label, '+6');
  assert.equal(up.positive, true);
  const down = repDelta(65, 58);
  assert.equal(down.label, '-7');
  assert.equal(down.positive, false);
  const same = repDelta(70, 70);
  assert.equal(same.label, '0');
});
