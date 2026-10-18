// Headless tests of the town street grid (lots/seedtowns.ts): npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { townGrid, TOWN_BLOCKS } from '../src/game/lots/seedtowns';
import { BLOCK } from '../src/game/lots/roads';
import { TC } from '../src/game/terrain/types';

// the grid of a centre (1000, 1000) with 6 blocks: the origin is (880, 880)
const C = { x: 1000, y: 1000 }, X0 = 880, Y0 = 880;

test('townGrid on all GROUND: 2n(n+1) = 84 legs for n = 6, the two middle lines avenues, the rest streets', () => {
  const g = townGrid(C, TOWN_BLOCKS, () => TC.GROUND);
  assert.equal(g.legs.length, 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1));
  assert.equal(g.cls.length, g.legs.length);
  const avenues = g.legs.filter((_, k) => g.cls[k] === 'avenue');
  assert.equal(avenues.length, 2 * TOWN_BLOCKS);
  for (const l of avenues) assert.ok((l.a.x === X0 + 3 * BLOCK && l.b.x === X0 + 3 * BLOCK) || (l.a.y === Y0 + 3 * BLOCK && l.b.y === Y0 + 3 * BLOCK), 'an avenue on a middle line');
  assert.ok(g.cls.filter(c => c === 'street').length === 2 * TOWN_BLOCKS * (TOWN_BLOCKS + 1) - 2 * TOWN_BLOCKS);
  for (const l of g.legs) assert.ok(Math.abs(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) - BLOCK) < 1e-9, 'each leg is one block long');
});

test('townGrid: PATCH is buildable too; legs over a HILL square at a block corner are dropped', () => {
  assert.equal(townGrid(C, TOWN_BLOCKS, () => TC.PATCH).legs.length, 84);
  // HILL on the tiles [875, 885) x [875, 885): the corner point (880, 880) and the legs running over it
  const hill = (x: number, y: number) => (x >= X0 - 5 && x < X0 + 5 && y >= Y0 - 5 && y < Y0 + 5 ? TC.HILL : TC.GROUND);
  const g = townGrid(C, TOWN_BLOCKS, hill);
  assert.equal(g.legs.length, 82, 'the two legs starting at the corner are dropped');
  assert.ok(!g.legs.some(l => l.a.x === X0 && l.a.y === Y0), 'no leg from the corner');
  // the same grid again: deterministic
  assert.deepEqual(townGrid(C, TOWN_BLOCKS, hill), g);
});
