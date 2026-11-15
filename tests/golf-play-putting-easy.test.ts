// The owner, 2026-11-15: "make sinking the ball at close range alot easier" (shot.ts PUTT_EASY, live.ts shotOutcome under MODEL_V 4): short putts drop far more often,
// the help fades to none at PUTT_EASY.nearM, and a putt played under version 3 rolls as it did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUTT_EASY, PUTT_V2, puttEase, putt, rng } from '../src/game/golf/play';

/** the share of putts from distM metres that drop for a golfer of `skill`, with a pace error `pace` (0: perfect) and the aim `deg` degrees off, under v3 (PUTT_V2) or v4 */
function rate(distM: number, v4: boolean, pace = 0.15, deg = 0, skill = 0.4, n = 4000): number {
  const ez = v4 ? puttEase(distM) : PUTT_V2, r = rng(7, Math.round(distM * 100), 3), tol = Math.min(ez.maxDeg, Math.max(PUTT_V2.minDeg, Math.atan(ez.cupM / Math.max(distM, 0.25)) * 180 / Math.PI));
  let made = 0;
  for (let i = 0; i < n; i++) { const f = deg <= tol ? Math.max(0, 1 - pace * distM / ez.windowM) : 0; if (putt(r, skill, distM, f, true, ez.offsetM).holed) made++; }
  return made / n;
}

test('a short putt drops far more often under v4: nearly always at a metre, most of the time at two', () => {
  const at = (m: number, v4: boolean, deg = 0) => rate(m, v4, 0.15, deg);
  assert.ok(at(1, true) > 0.9, `1 m: ${at(1, true)}`); assert.ok(at(2, true) > 0.8, `2 m: ${at(2, true)}`);
  for (const m of [0.5, 1, 1.5, 2, 2.5, 3]) assert.ok(at(m, true) > at(m, false) + 0.03, `${m} m: v4 ${at(m, true)} > v3 ${at(m, false)}`);
  // a putt a few degrees off the line still drops close in (it missed under v3)
  assert.equal(at(1, false, 6), 0); assert.ok(at(1, true, 6) > 0.85, `1 m, 6 degrees off: ${at(1, true, 6)}`);
});

test('the help fades to none at PUTT_EASY.nearM: a long putt is as hard as it was', () => {
  assert.deepEqual(puttEase(PUTT_EASY.nearM), { offsetM: PUTT_V2.offsetM, cupM: PUTT_V2.cupM, maxDeg: PUTT_V2.maxDeg, windowM: PUTT_V2.windowM });
  assert.deepEqual(puttEase(8), puttEase(PUTT_EASY.nearM)); assert.deepEqual(puttEase(NaN), puttEase(PUTT_EASY.nearM));
  assert.equal(puttEase(0).cupM, PUTT_EASY.cupM);
  assert.equal(rate(5, true), rate(5, false));
});

test('the make rates, for the record (a club golfer, a 15% pace error, on the line)', () => {
  const row = [1, 2, 3, 4, 6].map(m => `${m} m ${Math.round(rate(m, false) * 100)}% -> ${Math.round(rate(m, true) * 100)}%`).join(', ');
  console.log(row); assert.ok(row.length > 0);
});
