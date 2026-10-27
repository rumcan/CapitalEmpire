// A range start's grown town paves its own jammed streets (T178, src/game/golf/townpave.ts): the worst jammed junctions' gravel arms first, within
// the budget, at most PAVE.PER_STEP junctions a step, an arm shared by two junctions once; the budget grows with the built lots. npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAVE, paveBudget, pickPave, type PaveArm } from '../src/game/golf/townpave';
import type { Junction } from '../src/game/sim/bottlenecks';

const J = (x: number, loss: number, los: string): Junction => ({ key: `${x},0`, x, y: 0, type: 'plain', arms: 4, loss, through: 100, delay: 40, los });
const arm = (x0: number, x1: number): PaveArm => ({ a: { x: x0, y: 0 }, b: { x: x1, y: 0 }, len: Math.abs(x1 - x0) });
/** each junction at x has two gravel arms of 10 tiles, to x - 10 and x + 10 (neighbours 10 apart share one) */
const armsAt = (x: number) => [arm(x - 10, x), arm(x, x + 10)];

test('paveBudget: PER_LOT street tiles a built lot, less what is paved; never below 0', () => {
  assert.equal(paveBudget(100, 0), 100 * PAVE.PER_LOT);
  assert.equal(paveBudget(100, 100 * PAVE.PER_LOT + 5), 0);
});

test('pickPave: only E and F junctions over LOSS, the worst first, at most PER_STEP of them', () => {
  const js = [J(100, PAVE.LOSS - 1, 'F'), J(200, 900, 'D'), J(300, 400, 'E'), J(400, 1200, 'F'), J(500, 600, 'F'), J(600, 500, 'F')];
  const got = pickPave(js, armsAt, 1e9);
  assert.equal(got.length, 6, 'two arms each for three junctions');
  assert.deepEqual([...new Set(got.map(a => Math.round((a.a.x + a.b.x) / 2 / 100) * 100))].sort(), [400, 500, 600], 'the three worst jammed');
  assert.ok(!got.some(a => a.a.x >= 190 && a.b.x <= 210), 'a D junction is never paved');
});

test('pickPave: the budget stops it (a junction that does not fit is skipped, a smaller one may follow); an arm shared is paved once', () => {
  const big = (x: number) => (x === 100 ? [arm(0, 100), arm(100, 200)] : armsAt(x));
  // 100 is the worst but its 200 tiles do not fit in 30: skipped; 120 (20 tiles) fits; 110 shares 110-120 with 120, so it adds 10 only
  const got = pickPave([J(100, 2000, 'F'), J(120, 1000, 'F'), J(110, 800, 'F')], big, 30);
  const keys = got.map(a => `${a.a.x}-${a.b.x}`);
  assert.deepEqual(keys, ['110-120', '120-130', '100-110']);
  assert.equal(pickPave([J(100, 2000, 'F')], armsAt, 0).length, 0, 'no budget, no paving');
  assert.equal(pickPave([J(100, 2000, 'F')], () => [], 100).length, 0, 'no gravel arms, nothing');
});
