// T325 (#925; the owner, 2026-11-04: "add muligan to the game"): mulligans in your own round (golf/play/yours.ts): a mulligan puts the ball back and
// takes the stroke away, the replayed shot has its own stream, the first tee's limit (none / one per nine / unlimited), the scorecard's mark and the
// round's count, no handicap credit (golf/player.ts playedRound), the save round trip (an old save unchanged), and none in a competition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, canMulligan, mulligansLeft, mulligansOf, nextHole, noHandicapWhy, normalizeYourRound, playYours, rowOf, rulesFor, startRound, takeMulligan, yourTurn, type YourRound } from '../src/game/golf/play/yours';
import { playedRound, startProfile } from '../src/game/golf/player';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';

const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: 4, tee, pin, line: [tee, pin] }; });
const lieAt = (x: number, y: number): Lie => {
  const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y);
  return d <= 8 ? 'green' : x < -5 ? 'out' : 'fairway';
};
const view: CourseView = { holes, lieAt };
const SK = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };
const SEED = 77;
/** the suggested shot from where the ball lies */
const hit = (r: YourRound) => { const t = yourTurn(view, r, SK)!; return playYours(view, r, SK, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: t.suggested.power, acc: 0.3, boost: 0 } }, SEED).round; };
/** plays the hole out (the suggested shots) */
const holeOut = (r: YourRound) => { for (let k = 0; k < 20 && !r.holed; k++) r = hit(r); return r; };

test('a new round has one mulligan per nine; a mulligan puts the ball back and takes the stroke away', () => {
  const r0 = startRound(view, [0, 1, 2], 4)!;
  assert.deepEqual(r0.rules, DEFAULT_RULES); assert.equal(r0.rules!.mull, 'nine');
  assert.ok(!canMulligan(r0), 'nothing to take back before the first shot');
  const r1 = hit(r0);
  assert.equal(rowOf(r1).strokes, 1); assert.notDeepEqual(r1.ball, r0.ball);
  assert.ok(canMulligan(r1)); assert.equal(mulligansLeft(r1), 1);
  const m = takeMulligan(r1);
  assert.deepEqual(m.ball, r0.ball, 'back where it was hit from'); assert.equal(m.lie, 'tee');
  assert.equal(rowOf(m).strokes, 0, 'no stroke counted'); assert.equal(rowOf(m).mull, 1, 'the hole is marked');
  assert.equal(m.mk, 1); assert.equal(m.undo, undefined, 'the same shot cannot be taken back twice');
  assert.equal(mulligansLeft(m), 0); assert.ok(!canMulligan(hit(m)), 'one per nine: none left');
});

test('the replayed shot has a stream of its own (the same swing is not the same outcome)', () => {
  const r0 = startRound(view, [0], 4)!, a = hit(r0), b = hit(takeMulligan(a));
  assert.notDeepEqual(b.ball, a.ball);
});

test('one per nine: the back nine has its own; none and unlimited; a round from before the setting has none', () => {
  const all = Array.from({ length: 18 }, (_, i) => i);
  let r = startRound(view, all, 1)!;
  r = takeMulligan(hit(r)); r = holeOut(r); r = nextHole(view, r);
  assert.ok(!canMulligan(hit(r)), 'the front nine\'s is used (hole 2)');
  // on to the 10th
  for (let k = 0; k < 8; k++) { r = holeOut(r); r = nextHole(view, r); }
  assert.equal(r.at, 9);
  r = hit(r); assert.ok(canMulligan(r), 'the back nine has one'); assert.equal(mulligansLeft(r), 1);
  const none = hit(startRound(view, [0], 1, { mull: 'none' })!);
  assert.ok(!canMulligan(none)); assert.equal(mulligansLeft(none), 0);
  let any = startRound(view, [0], 1, { mull: 'any' })!;
  for (let k = 0; k < 5; k++) { any = hit(any); assert.ok(canMulligan(any)); any = takeMulligan(any); }
  assert.equal(rowOf(any).mull, 5); assert.equal(mulligansLeft(any), Infinity);
  const old = hit(startRound(view, [0], 1)!); const { rules: _r, ...pre } = old; void _r;
  assert.ok(!canMulligan(pre as YourRound), 'an old round: no mulligans');
});

test('the scorecard: the hole marked, the round\'s count, and no handicap credit', () => {
  let r = startRound(view, [0, 1], 2, { mull: 'any' })!;
  r = takeMulligan(hit(r)); r = takeMulligan(hit(r)); r = holeOut(r);
  assert.equal(r.card[0]!.mull, 2); assert.equal(r.card[0]!.done, true);
  assert.equal(mulligansOf(r), 2); assert.equal(noHandicapWhy(r), '2 mulligans');
  assert.equal(noHandicapWhy(holeOut(startRound(view, [0], 2)!)), null, 'none taken: it counts');
  const p = startProfile(), counted = playedRound(p, { day: 2, kind: 'everyday', strokes: 4, par: 4, holes: 1 });
  const casual = playedRound(p, { day: 2, kind: 'everyday', strokes: 4, par: 4, holes: 1, noHcp: noHandicapWhy(r) });
  assert.ok(counted.skills.nerve > p.skills.nerve, 'a counted round raises your nerve');
  assert.equal(casual.skills.nerve, p.skills.nerve, 'a round with mulligans does not');
  assert.equal(casual.rounds.length, 1, 'it is still in your rounds'); assert.equal(casual.rounds[0]!.noHcp, '2 mulligans'); assert.equal(casual.rounds[0]!.nerve, 0);
});

test('saved and reloaded: the same round (its settings, marks, count and undo); an old save is unchanged', () => {
  let r = startRound(view, [0, 1], 3, { mull: 'nine' })!;
  r = takeMulligan(hit(r)); r = hit(r);
  const back = normalizeYourRound(JSON.parse(JSON.stringify(r)))!;
  assert.deepEqual(back, r);
  assert.deepEqual(hit(back), hit(r), 'the next shot plays the same');
  assert.deepEqual(takeMulligan(back), takeMulligan(r));
  const old = { v: 1, day: 3, holes: [0], at: 0, card: [{ i: 0, n: 1, par: 4, strokes: 2, putts: 0, pen: 0, done: false }], ball: { x: 40, y: 10 }, lie: 'fairway', holed: false, over: false };
  assert.deepEqual(normalizeYourRound(old), old, 'no new fields on an old save');
});

test('never in a competition: the tournament and a money match play with none, whatever is chosen', () => {
  assert.equal(rulesFor('tournament', { mull: 'any' }).mull, 'none');
  assert.equal(rulesFor('match', { mull: 'nine' }).mull, 'none');
  assert.equal(rulesFor('everyday', { mull: 'any' }).mull, 'any');
});
