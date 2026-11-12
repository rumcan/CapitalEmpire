// T422: the host's lie grid for the view (play/lies3p.ts): ten points of a painted course read the same kind from the grid as from the model's kindAt,
// in the view's frame; off the grid it says nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { CourseView, Lie, LieKind } from '../src/game/golf/play';
import { toView } from '../src/game/golf/play/protocol3p';
import { lieGrid3p, lieGridAt } from '../src/game/golf/play/lies3p';

/** a fairway along y = 50 from x 20 to 120 (5 tiles either side), a first cut ring of 1.5 tiles, a green at x 125, a deep patch, fescue far out, a bunker, water */
const kindAt = (x: number, y: number): LieKind => {
  const dy = Math.abs(y - 50);
  if (Math.hypot(x - 125, y - 50) <= 6) return 'green';
  if (Math.hypot(x - 100, y - 60) <= 3) return 'bunker';
  if (x > 60 && x < 70 && y > 70 && y < 80) return 'water';
  if (x >= 20 && x <= 120 && dy <= 5) return x < 24 ? 'tee' : 'fairway';
  if (x >= 18.5 && x <= 121.5 && dy <= 6.5) return 'firstcut';
  if (x > 30 && x < 40 && y > 30 && y < 40) return 'deep';
  return dy > 25 ? 'fescue' : 'rough';
};
const view: Pick<CourseView, 'lieAt' | 'kindAt'> = { lieAt: (): Lie => 'rough', kindAt };
const centre = { x: 70, y: 50 };

test('lies3p: ten points read the same kind from the grid as from kindAt', () => {
  const g = lieGrid3p(view, [0, 0, 150, 100], centre);
  assert.equal(g.w, 150); assert.equal(g.h, 100); assert.equal(g.step, TILE_M);
  assert.ok(g.r.length < g.w * g.h / 4, 'run-length coded');
  const pts = [[21, 50], [50, 52], [50, 55.7], [80, 44.2], [35, 35], [80, 90], [125, 52], [100, 60], [65, 75], [5, 5]].map(([x, y]) => ({ x: x! + 0.3, y: y! + 0.4 }));
  const seen = new Set<string>();
  for (const p of pts) {
    const v = toView(p, centre), want = kindAt(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5);
    assert.equal(lieGridAt(g, v[0], v[1]), want, `at ${p.x}, ${p.y}`); seen.add(want);
  }
  assert.ok(seen.size >= 8, 'the points cover most kinds');
  assert.equal(lieGridAt(g, -1e4, 0), null, 'off the grid: nothing');
});
