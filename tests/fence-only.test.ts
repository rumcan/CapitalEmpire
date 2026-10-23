// Headless test: an empty lot keeps its share of the fence grid (compose fenceOnly): the boundary fence it owns, wooden privacy panels only,
// the same every time; nothing else stands on it and it has no ground of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acrossLines, fenceOnly } from '../src/game/lots/compose';

test('fenceOnly: privacy panels only, on the owned side, deterministic', () => {
  const lot = { o: { x: 100, y: 200 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 18 };
  const c = fenceOnly(lot, 7);
  assert.ok(c.props.length > 0, 'it has a fence');
  assert.ok(c.props.every(p => p.id.startsWith('expansion:fence-privacy')), c.props.map(p => p.id).join());
  assert.ok(c.props.every(p => p.x >= 100 - 0.5 && p.x <= 112 + 0.5 && p.y >= 200 - 0.5 && p.y <= 218 + 0.5), 'on the lot');
  assert.deepEqual(fenceOnly(lot, 7), c);
  assert.ok(!c.ground.some(g => g.tex !== 'marks'), 'no ground of its own');
});

test('fenceOnly fences only the lines asked for; acrossLines points just across the owned side and back', () => {
  const lot = { o: { x: 100, y: 200 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 18 };
  assert.equal(fenceOnly(lot, 7, { side: false, back: false }).props.length, 0);
  const side = fenceOnly(lot, 7, { side: true, back: false }).props, back = fenceOnly(lot, 7, { side: false, back: true }).props;
  assert.ok(side.length > 0 && side.every(p => Math.abs(p.x - 112) < 1), 'the side line at the higher x end');
  assert.ok(back.length > 0 && back.every(p => Math.abs(p.y - 218) < 1), 'the back line');
  const a = acrossLines(lot);
  assert.ok(a.side.x > 112 && a.side.x < 113 && a.side.y > 200 && a.side.y < 218);
  assert.deepEqual(a.back, { x: 106, y: 218.5 });
  // a lot facing the other way does not own its back line
  assert.equal(acrossLines({ ...lot, n: { x: 0, y: -1 } }).back, null);
});
