// T349 (#992): the hole card's Play (golf/play/practice.ts): which holes a practice round plays (just this hole, or each of the course's real holes once: a 9-hole course is "All 9"), what keeps a hole
// from being played (a tee, a pin, a green), and the round itself (YourRound.practice: kept by the save, never a competition's, a one-hole round ends after the putt from the hole's tee).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allLabel, missingParts, missingWhy, practicePick, realHoleCount } from '../src/game/golf/play/practice';
import { cardTotals, holeOf, normalizeYourRound, playYours, scoreName, startRound, yourTurn, type YourRound } from '../src/game/golf/play/yours';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';

/** a course of `real` holes played out to 18 (as courseview.ts makeCourseView does: a 9-hole course shows its numbers twice) */
const holesOf = (real: number): PlayHole[] => Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: (h % real) + 1, par: h % 3 === 0 ? 5 : 4, tee, pin, line: [tee, pin] }; });
const course = (real: number): CourseView => {
  const holes = holesOf(real);
  const lieAt = (x: number, y: number): Lie => { const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y); return d <= 8 ? 'green' : x < -5 ? 'out' : 'fairway'; };
  return { holes, lieAt };
};
const SK = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };

test('practice: the real hole count (a 9-hole course is played out to 18: each hole counts once)', () => {
  assert.equal(realHoleCount(course(18)), 18);
  assert.equal(realHoleCount(course(9)), 9);
  assert.equal(realHoleCount(course(3)), 3);
  assert.equal(realHoleCount({ holes: [] }), 0);
  assert.equal(allLabel(9), 'All 9'); assert.equal(allLabel(18), 'All 18');
});

test('practice: just hole n is its first turn in the played course; all is every real hole once, from the first', () => {
  const c18 = course(18), c9 = course(9);
  assert.deepEqual(practicePick(c18, 4, 'hole'), [3]);
  assert.deepEqual(practicePick(c9, 4, 'hole'), [3], 'a 9-hole course: its first turn, not the repeat');
  assert.deepEqual(practicePick(c9, 19, 'hole'), [], 'no such hole');
  assert.deepEqual(practicePick(c18, 4, 'all'), Array.from({ length: 18 }, (_, i) => i));
  assert.deepEqual(practicePick(c9, 4, 'all'), Array.from({ length: 9 }, (_, i) => i), 'All 9 plays each hole once');
  assert.deepEqual(practicePick({ holes: [] }, 1, 'all'), []);
});

test('practice: what keeps a hole from being played, and what the tooltip says', () => {
  assert.deepEqual(missingParts({ tee: true, pin: true, green: true }), []);
  assert.equal(missingWhy(4, []), null);
  assert.deepEqual(missingParts({ tee: false, pin: true, green: true }), ['a tee']);
  assert.deepEqual(missingParts({ tee: true, pin: false, green: false }), ['a pin', 'a green']);
  assert.equal(missingWhy(4, missingParts({ tee: false, pin: false, green: true })), 'Cannot play hole 4 yet: it needs a tee and a pin');
  assert.equal(missingWhy(7, missingParts({ tee: true, pin: true, green: false })), 'Cannot play hole 7 yet: it needs a green');
});

test('practice: a one-hole round starts on that hole’s tee, ends after the putt, and says its score; the flag is kept by the save and never on a competition', () => {
  const view = course(9), day = 5;
  const r0 = startRound(view, practicePick(view, 4, 'hole'), day)!;
  assert.equal(r0.card.length, 1); assert.equal(r0.card[0]!.n, 4);
  const tee = holeOf(view, 3)!.tee;
  assert.deepEqual(r0.ball, { x: tee.x, y: tee.y }, 'the ball is on that hole’s tee');
  let r: YourRound = { ...r0, practice: true };
  for (let k = 0; k < 40 && !r.over; k++) { const t = yourTurn(view, r, SK)!; r = playYours(view, r, SK, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: t.suggested.power, acc: 0.3, boost: 0 } }, 31).round; }
  assert.ok(r.holed && r.over, 'the round ends after the hole’s putt');
  assert.equal(r.practice, true, 'and stays a practice round');
  const t = cardTotals(r.card);
  assert.equal(t.thru, 1); assert.ok(t.strokes >= 1 && scoreName(t.strokes, t.par).length > 0, 'the score in words');
  const back = normalizeYourRound(JSON.parse(JSON.stringify(r)))!;
  assert.equal(back.practice, true, 'saved and read back');
  assert.equal(normalizeYourRound(JSON.parse(JSON.stringify(r0)))!.practice, undefined, 'a normal round is not practice');
  assert.equal(normalizeYourRound(JSON.parse(JSON.stringify({ ...r, practice: 'yes' })))!.practice, undefined, 'only true counts');
  assert.equal(normalizeYourRound(JSON.parse(JSON.stringify({ ...r, mode: 'mayors-cup' })))!.practice, undefined, 'a competition is never practice');
});

test('practice: all N is a normal round on each real hole once', () => {
  const view = course(9), picks = practicePick(view, 1, 'all');
  const r = startRound(view, picks, 2)!;
  assert.equal(r.card.length, 9); assert.deepEqual(r.card.map(c => c.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(r.holes.length, 9);
});
