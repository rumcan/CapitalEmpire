// #1301 (the owner: "difference between fade and draw is very low. indicate if that is my handicap limit or not"): every club of the turn says what a full draw or fade bends its
// shot for him and for a scratch golfer, from the model's own numbers (shape.ts shapeEffect), so the view can tell him whether the small curve is his skill's limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bendOf, clubChoice, SCRATCH_SKILL } from '../src/game/golf/play/turn3p';
import { kitOf } from '../src/game/golf/play/mods';
import { HCP_CURVE } from '../src/game/golf/player';

const skillAt = (h: number) => { const { a, b, c } = HCP_CURVE; return (-b - Math.sqrt(b * b - 4 * c * (a - h))) / (2 * c); };

test('#1301: a full draw at 150 m bends 6.2 m for a handicap 18.5, 7.3 m for 9 and 8.5 m for scratch; a scratch golfer is the comparison', () => {
  const got = [18.5, 9, 0].map(h => bendOf('iron5', 150, kitOf(skillAt(h), 'iron5')));
  assert.deepEqual(got.map(g => g.m), [6.2, 7.3, 8.5]);
  for (const g of got) assert.equal(g.scrM, 8.5, 'a scratch golfer with a plain kit: 8.5 m at skill 0.737');
  assert.ok(got[0]!.pulled < got[1]!.pulled && got[1]!.pulled < got[2]!.pulled, 'the better the golfer, the more of the shape he pulls off');
  assert.ok(Math.abs(got[0]!.pulled - 0.63) < 0.01);
  assert.ok(SCRATCH_SKILL > 0.7 && SCRATCH_SKILL < 0.8);
});
test('#1301: the bend scales with the carry (the model holds the curve between 0.4 and 1.2 of 200 m) and a club of the turn carries it, a putter does not', () => {
  const k = kitOf(0.5, 'driver'), d = bendOf('driver', 250, k), s = bendOf('driver', 100, k);
  assert.ok(d.m > s.m * 4 && d.m < s.m * 7, 'a longer carry bends more, in metres about as the carry squared: ' + d.m + ' against ' + s.m);
  assert.ok(clubChoice(0.5, 'iron7', 'fairway', null, 1, 0).bend!.m > 0);
  assert.equal(clubChoice(0.5, 'putter', 'green', null, 1, 0).bend, undefined);
});
