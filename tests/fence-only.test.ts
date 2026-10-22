// Headless test: an empty lot keeps its share of the fence grid (compose fenceOnly): the boundary fence it owns, wooden privacy panels only,
// the same every time; nothing else stands on it and it has no ground of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenceOnly } from '../src/game/lots/compose';

test('fenceOnly: privacy panels only, on the owned side, deterministic', () => {
  const lot = { o: { x: 100, y: 200 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 18 };
  const c = fenceOnly(lot, 7);
  assert.ok(c.props.length > 0, 'it has a fence');
  assert.ok(c.props.every(p => p.id.startsWith('expansion:fence-privacy')), c.props.map(p => p.id).join());
  assert.ok(c.props.every(p => p.x >= 100 - 0.5 && p.x <= 112 + 0.5 && p.y >= 200 - 0.5 && p.y <= 218 + 0.5), 'on the lot');
  assert.deepEqual(fenceOnly(lot, 7), c);
  assert.ok(!c.ground.some(g => g.tex !== 'marks'), 'no ground of its own');
});
