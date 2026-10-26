// The played course (docs/GOLF-PLAY.md P2a, src/game/golf/play/courseview.ts): the holes in play order (18 of them: a 9-hole course twice, a 6-hole
// course cycled), each played hole as its line, the lie of each surface, and the out-of-bounds rule off the painted course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCourseView } from '../src/game/golf/play';
import type { Lie } from '../src/game/golf/play';
import type { Hole } from '../src/game/golf/holes';
import type { GolfSurface } from '../src/game/golf/types';

/** a derived hole n of par p on a straight line along the row y (tee at x = 10, pin at x = 200) */
function hole(n: number, par: 3 | 4 | 5, y: number): Hole {
  return { n, par, lengthM: 0, memberLengthM: 0, line: [{ x: 10, y }, { x: 200, y }], warnings: [] };
}

/** count holes, each on its own row (y = 20 + 60 * i) */
function holes(count: number): Hole[] {
  return Array.from({ length: count }, (_, i) => hole(i + 1, 4, 20 + 60 * i));
}

/** the surface -> lie table (the fringe and the first cut play as fairway, the waste area as sand, paths and other paint as rough) */
const MAP: [GolfSurface, Lie][] = [
  ['green', 'green'], ['fringe', 'fairway'], ['tee', 'tee'], ['fairway', 'fairway'], ['firstCut', 'fairway'], ['rough', 'rough'],
  ['fescue', 'fescue'], ['bunker', 'bunker'], ['waste', 'bunker'], ['water', 'water'], ['path', 'rough'], ['other', 'rough'],
];

test('lieAt: each surface plays as its lie, whatever the point', () => {
  for (const [surface, lie] of MAP) {
    const v = makeCourseView(holes(3), () => surface);
    assert.equal(v.lieAt(50, 50), lie, `${surface} plays as ${lie}`);
    assert.equal(v.lieAt(-900, 3000), lie, `${surface} far off the course too: a painted surface wins over the distance`);
  }
});

test('lieAt: with no surface, rough within 40 tiles of a played line and out of bounds beyond (point to line distance)', () => {
  const v = makeCourseView([hole(1, 4, 20)], () => null);
  assert.equal(v.lieAt(100, 20), 'rough', 'on the line');
  assert.equal(v.lieAt(100, 60), 'rough', '40 tiles off the line is still rough');
  assert.equal(v.lieAt(100, 60.5), 'out', 'past 40 tiles off the line is out');
  assert.equal(v.lieAt(100, -21), 'out', 'the other side too');
  assert.equal(v.lieAt(230, 20), 'rough', 'past the tee-to-pin line end, within 40 tiles of its end');
  assert.equal(v.lieAt(241, 20), 'out', 'beyond the end by more than 40 tiles');
  assert.equal(makeCourseView([], () => null).lieAt(100, 20), 'out', 'no holes: every point is out');
});

test('makeCourseView: a 9-hole course is played twice (18 holes; PlayHole.n is the hole\'s own number)', () => {
  const v = makeCourseView(holes(9), () => 'rough');
  assert.equal(v.holes.length, 18);
  assert.deepEqual(v.holes.map(h => h.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(v.holes[9]!.tee, v.holes[0]!.tee, 'the second 1 is played from the same tee');
});

test('makeCourseView: a course of another count is cycled to 18 (6 holes three times), more than 18 gives the first 18', () => {
  const six = makeCourseView(holes(6), () => 'rough');
  assert.deepEqual(six.holes.map(h => h.n), [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
  const twenty = makeCourseView(holes(20), () => 'rough');
  assert.deepEqual(twenty.holes.map(h => h.n), Array.from({ length: 18 }, (_, i) => i + 1));
});

test('makeCourseView: no holes gives an empty course; a hole with no line (fewer than two points) is not played', () => {
  assert.equal(makeCourseView([], () => 'rough').holes.length, 0);
  const bare: Hole = { ...hole(2, 3, 80), line: [{ x: 10, y: 80 }] };
  const v = makeCourseView([hole(1, 4, 20), bare, hole(3, 5, 140)], () => 'rough');
  assert.deepEqual(v.holes.map(h => h.n), [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]);
});

test('makeCourseView: a played hole is its line: the tee is the first point, the pin the last, the par and the line as derived', () => {
  const line = [{ x: 10, y: 20 }, { x: 120, y: 25 }, { x: 200, y: 30 }];
  const v = makeCourseView([{ ...hole(7, 5, 20), line }], () => null);
  const h = v.holes[0]!;
  assert.deepEqual([h.n, h.par], [7, 5]);
  assert.deepEqual(h.tee, { x: 10, y: 20 });
  assert.deepEqual(h.pin, { x: 200, y: 30 });
  assert.deepEqual(h.line, line);
});
