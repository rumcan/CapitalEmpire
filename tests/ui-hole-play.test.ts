// T349 (#992): the hole card's Play and a practice round on screen, rendered to static markup: the question (Just hole N / All N / Cancel), the scorecard of a practice round (its title, the one-hole result in
// words, "Back to the course", the note that nothing is recorded) against a normal round's, and the round bar's Practice tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { HolePlayChoice } from '../src/ui/golf/HoleCard';
import { RoundBar, ScoreCard } from '../src/ui/golf/YourRound';
import { cardTotals, type YourRound, type YourRoundView } from '../src/game/golf/play/yours';

const none = () => { /* none */ };
const choice = (count: number, n = 4): string => renderToStaticMarkup(createElement(HolePlayChoice, { n, count, onHole: none, onAll: none, onCancel: none }));
const round = (over: Partial<YourRound> = {}): YourRound => ({ v: 1, day: 3, holes: [3], at: 0, card: [{ i: 3, n: 4, par: 4, strokes: 3, putts: 1, pen: 0, done: true }], ball: { x: 1, y: 1 }, lie: 'green', holed: true, over: true, ...over });
const view = (r: YourRound): YourRoundView => ({ round: r, hole: r.card[r.at]!.n, par: r.card[r.at]!.par, stroke: r.card[r.at]!.strokes, distM: 0, lie: r.lie, totals: cardTotals(r.card), canJump: false, inCart: false, nearCart: false, canMull: false, mullLeft: 0, canGimme: false, cartFar: false, card: true, flying: false, addressing: false });
const card = (r: YourRound): string => renderToStaticMarkup(createElement(ScoreCard, { v: view(r), onNext: none, onDone: none, onClose: none }));
const bar = (r: YourRound): string => renderToStaticMarkup(createElement(RoundBar, { v: view(r), onJump: none, onCart: none, onCallCart: none, onMull: none, onGimme: none, onCard: none, onQuit: none }));

test('hole card Play: the question offers just this hole, all of the real holes (All 9 on a 9-hole course), and Cancel', () => {
  const h = choice(9);
  assert.ok(h.includes('data-testid="hole-play-choice"') && /Practice round: free, not an event, not recorded/.test(h), 'the question');
  assert.ok(h.includes('data-testid="hole-play-hole"') && />Just hole 4</.test(h), 'just this hole');
  assert.ok(h.includes('data-testid="hole-play-all"') && />All 9</.test(h), 'all nine');
  assert.ok(h.includes('data-testid="hole-play-cancel"') && />Cancel</.test(h), 'cancel');
  assert.ok(/>All 18</.test(choice(18)), 'and All 18 on an 18-hole course');
  assert.ok(!choice(0).includes('hole-play-all'), 'no All without holes');
});

test('practice scorecard: a one-hole round says the hole’s score in words and ends with Back to the course; nothing is recorded', () => {
  const h = card(round({ practice: true }));
  assert.ok(/Practice round · scorecard/.test(h) && !/Your round · scorecard/.test(h), 'its title');
  assert.ok(/Hole 4: Birdie \(3, par 4\)/.test(h), 'the hole’s score in words');
  assert.ok(h.includes('data-testid="round-done"') && />Back to the course</.test(h) && !/Done: into your rounds/.test(h), 'back to the course');
  assert.ok(h.includes('data-testid="card-practice"') && /not recorded/.test(h), 'the note');
});

test('practice scorecard: a full practice round is the normal card with its title and the way back; a normal round is unchanged', () => {
  const two = round({ practice: true, holes: [3, 4], card: [{ i: 3, n: 4, par: 4, strokes: 3, putts: 1, pen: 0, done: true }, { i: 4, n: 5, par: 3, strokes: 4, putts: 2, pen: 0, done: true }], at: 1 });
  const h = card(two);
  assert.ok(/Practice round · scorecard/.test(h) && /Round over/.test(h) && />Back to the course</.test(h), 'a full practice round');
  const plain = card(round());
  assert.ok(/Your round · scorecard/.test(plain) && />Done: into your rounds</.test(plain), 'a normal round');
  assert.ok(!/card-practice|Back to the course|Practice round/.test(plain), 'no practice words on a normal round');
});

test('round bar: a practice round is tagged Practice and its Quit says nothing is recorded; a normal round has neither', () => {
  const p = bar(round({ practice: true, holed: false, over: false }));
  assert.ok(p.includes('data-testid="round-practice"') && />Practice</.test(p), 'the tag');
  assert.ok(/Stop the practice round: nothing is recorded/.test(p), 'the Quit title');
  const n = bar(round({ holed: false, over: false }));
  assert.ok(!n.includes('round-practice') && /the holes done go into your rounds/.test(n), 'a normal round');
});
