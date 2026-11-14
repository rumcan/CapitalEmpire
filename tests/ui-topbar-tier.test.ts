// J8 (#1261), J13 (#1277): the top bar's pictures by the room it has (uiScale.ts topBarTier). Measured in the jam build's bar with a browser: 1366 px at 100% and 1280 px at 100% hold every
// picture in one row, 1366 px at the largest Text size (125%) holds it without the speed bar's and zoom's, and 1280 px at 125% without the Cash chip's either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topBarTier } from '../src/ui/uiScale';

test('the top bar shows every picture where it has the room, and fewer on a narrow screen at a big Text size', () => {
  for (const [w, s] of [[1920, 1], [1920, 1.25], [1536, 1.25], [1440, 1.25], [1366, 1], [1366, 1.1], [1280, 1], [1280, 1.1]] as const) assert.equal(topBarTier(w, s), 2, `${w} px at ${s * 100}%`);
  assert.equal(topBarTier(1366, 1.25), 1, '1366 px at 125%: not the speed bar\'s and zoom\'s');
  assert.equal(topBarTier(1280, 1.25), 0, '1280 px at 125%: not the Cash chip\'s either');
  assert.equal(topBarTier(1024, 1), 0);
  assert.equal(topBarTier(Number.NaN, 1), 2, 'no width known: every picture');
  assert.equal(topBarTier(1366, 0), 2, 'a bad scale counts as 100%');
});
