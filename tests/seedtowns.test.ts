// Headless tests of the town street grid (lots/seedtowns.ts): npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { townGrid, TOWN_BLOCKS } from '../src/game/lots/seedtowns';
import { BLOCK } from '../src/game/lots/roads';
import { TC } from '../src/game/terrain/types';

// the grid of a centre (1000, 1000) with TOWN_BLOCKS blocks: the origin is (840, 840) for 8 blocks
const C = { x: 1000, y: 1000 }, X0 = C.x - TOWN_BLOCKS * BLOCK / 2, Y0 = C.y - TOWN_BLOCKS * BLOCK / 2;

test('townGrid on all GROUND: 2n(n+1) legs for n = TOWN_BLOCKS, the two middle lines avenues, the rest streets', () => {
  const g = townGrid(C, TOWN_BLOCKS, () => TC.GROUND);
  assert.equal(g.legs.length, 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1));
  assert.equal(g.cls.length, g.legs.length);
  const avenues = g.legs.filter((_, k) => g.cls[k] === 'avenue');
  assert.equal(avenues.length, 2 * TOWN_BLOCKS);
  const mid = (TOWN_BLOCKS / 2) * BLOCK;
  for (const l of avenues) assert.ok((l.a.x === X0 + mid && l.b.x === X0 + mid) || (l.a.y === Y0 + mid && l.b.y === Y0 + mid), 'an avenue on a middle line');
  assert.ok(g.cls.filter(c => c === 'street').length === 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1) - 2 * TOWN_BLOCKS);
  for (const l of g.legs) assert.ok(Math.abs(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) - BLOCK) < 1e-9, 'each leg is one block long');
});

test('townGrid: PATCH is buildable too; legs over a HILL square at a block corner are dropped', () => {
  assert.equal(townGrid(C, TOWN_BLOCKS, () => TC.PATCH).legs.length, 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1));
  // HILL on the tiles [X0 - 5, X0 + 5) x [Y0 - 5, Y0 + 5): the origin corner (X0, Y0) and the legs running over it
  const hill = (x: number, y: number) => (x >= X0 - 5 && x < X0 + 5 && y >= Y0 - 5 && y < Y0 + 5 ? TC.HILL : TC.GROUND);
  const g = townGrid(C, TOWN_BLOCKS, hill);
  assert.equal(g.legs.length, 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1) - 2, 'the two legs starting at the corner are dropped');
  assert.ok(!g.legs.some(l => l.a.x === X0 && l.a.y === Y0), 'no leg from the corner');
  // the same grid again: deterministic
  assert.deepEqual(townGrid(C, TOWN_BLOCKS, hill), g);
});
