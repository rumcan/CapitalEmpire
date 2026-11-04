// T327 (#927; the owner, 2026-11-04: "add gimmies"): gimmies in your own round (golf/play/yours.ts): inside the ring the gimme holes out for one
// stroke (a putt), outside it is not offered, off in a competition, the scorecard's mark, no handicap credit at 1 m or more, and the save round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, GIMME_RULES, canGimme, canMulligan, gimmeM, gimmiesOf, noHandicapWhy, normalizeYourRound, rowOf, rulesFor, startRound, takeGimme, type RoundRules, type YourRound } from '../src/game/golf/play/yours';
import { TILE_M } from '../src/game/golf/types';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';

const holes: PlayHole[] = Array.from({ length: 2 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: 4, tee, pin, line: [tee, pin] }; });
const lieAt = (x: number, y: number): Lie => Math.hypot(x - 150, y - (y < 25 ? 10 : 40)) <= 8 ? 'green' : 'fairway';
const view: CourseView = { holes, lieAt };
/** a round on both holes, two strokes played on the first, the ball on the green d metres from the cup */
const onGreen = (d: number, rules: RoundRules = DEFAULT_RULES): YourRound => {
  const r = startRound(view, [0, 1], 5, rules)!;
  return { ...r, card: r.card.map((c, k) => k === 0 ? { ...c, strokes: 2, putts: 0 } : c), ball: { x: 150 - d / TILE_M, y: 10 }, lie: 'green' };
};

test('a new round has gimmies inside the leather (about 0.6 m); the settings are off, the leather, 1 m and 2 m', () => {
  assert.equal(DEFAULT_RULES.gimme, 'leather');
  assert.deepEqual(GIMME_RULES.map(g => g.m), [0, 0.6, 1, 2]);
  assert.equal(gimmeM(startRound(view, [0], 1)!), 0.6);
});

test('inside the ring the gimme holes out for one stroke, counted as a putt', () => {
  const r = onGreen(0.5);
  assert.ok(canGimme(view, r));
  const g = takeGimme(view, r), row = rowOf(g);
  assert.equal(row.strokes, 3, 'one more stroke'); assert.equal(row.putts, 1, 'counted as a putt');
  assert.ok(row.done && row.gim && g.holed); assert.ok(!g.over, 'one more hole to play');
  assert.deepEqual(g.ball, holes[0]!.pin, 'in the cup');
  assert.ok(!canMulligan(g), 'no mulligan takes a gimme back');
  assert.ok(!canGimme(view, g), 'none once holed');
});

test('outside the ring, off the green or with gimmies off: none offered (and takeGimme changes nothing)', () => {
  const out = onGreen(0.8);
  assert.ok(!canGimme(view, out)); assert.equal(takeGimme(view, out), out);
  assert.ok(canGimme(view, onGreen(0.8, { mull: 'nine', gimme: 'm1' })), '1 m takes it');
  assert.ok(canGimme(view, onGreen(1.9, { mull: 'nine', gimme: 'm2' })));
  assert.ok(!canGimme(view, onGreen(0.3, { mull: 'nine', gimme: 'off' })));
  assert.ok(!canGimme(view, { ...onGreen(0.3), lie: 'fairway' }));
  const { rules: _r, ...old } = onGreen(0.3); void _r;
  assert.ok(!canGimme(view, old as YourRound), 'a round from before the setting: off');
});

test('off in a competition, whatever is chosen', () => {
  assert.equal(rulesFor('tournament', { mull: 'any', gimme: 'm2' }).gimme, 'off');
  assert.equal(rulesFor('match', { mull: 'nine', gimme: 'leather' }).gimme, 'off');
  assert.equal(rulesFor('everyday', { mull: 'nine', gimme: 'm2' }).gimme, 'm2');
});

test('the scorecard: the gimme marked and counted; 1 m or more keeps the round from your handicap, the leather does not', () => {
  const leather = takeGimme(view, onGreen(0.5));
  assert.equal(gimmiesOf(leather), 1); assert.equal(noHandicapWhy(leather), null, 'inside the leather: it counts');
  const m1 = takeGimme(view, onGreen(0.9, { mull: 'nine', gimme: 'm1' }));
  assert.equal(noHandicapWhy(m1), '1 gimme inside 1 m');
  assert.equal(noHandicapWhy(onGreen(0.9, { mull: 'nine', gimme: 'm2' })), null, 'none taken: it counts');
  const both = { ...m1, card: m1.card.map((c, k) => k === 0 ? { ...c, mull: 1 } : c) };
  assert.equal(noHandicapWhy(both), '1 mulligan, 1 gimme inside 1 m');
});

test('saved and reloaded: the same round, the gimme setting and mark kept', () => {
  const g = takeGimme(view, onGreen(1.5, { mull: 'any', gimme: 'm2' }));
  assert.deepEqual(normalizeYourRound(JSON.parse(JSON.stringify(g))), g);
  const r = onGreen(0.4); assert.deepEqual(normalizeYourRound(JSON.parse(JSON.stringify(r))), r);
  // a T325 round (mulligans, no gimme setting) reloads with gimmies off
  const t325 = { ...onGreen(0.4), rules: { mull: 'nine' as const } };
  const back = normalizeYourRound(JSON.parse(JSON.stringify(t325)))!;
  assert.deepEqual(back.rules, { mull: 'nine' }); assert.ok(!canGimme(view, back));
});
