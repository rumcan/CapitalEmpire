// T244 (#706): money matches (golf/play/match.ts): the stakes and what both can afford, the answer to a challenge, match-play scoring (holes up,
// dormie, 3&2, conceded holes), the opponent's shots by the round model and golf's order, a whole match skipped to its result, the settlement
// (money, reputation, rivals, your rounds), return challenges, and the save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_STAKE, REP_WIN, answerOf, clampStake, decideHole, holeDecided, holeOutcome, matchHoles, matchLengths, matchNextHole, matchScore, matchTurn, maxStake,
  opponentOf, oppShot, playMatchYours, remember, returnChallenge, rivalText, settleMatch, skillOfHcp, hcpOfSkill, skipMatch, stakeWhy, startMatch, type Rival,
} from '../src/game/golf/play/match';
import { normalizeYourRound, rowOf, rulesFor, yourTurn, canMulligan, canGimme, type YourRound } from '../src/game/golf/play/yours';
import { handicapOf, normalizePlayer, startProfile } from '../src/game/golf/player';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';

const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: h % 6 === 2 ? 3 : 4, tee, pin, line: [tee, pin] }; });
const lieAt = (x: number, y: number): Lie => {
  const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y);
  return d <= 8 ? 'green' : x < -5 ? 'out' : 'fairway';
};
const view: CourseView = { holes, lieAt };
const SK = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };

test('stakes: at least the least, at most what both of you can afford, in steps', () => {
  assert.equal(maxStake(500, 1200), 500); assert.equal(maxStake(1200, 345), 340); assert.equal(maxStake(5, 1000), 0, 'below the least stake: no match');
  assert.equal(clampStake(3, 500, 500), MIN_STAKE); assert.equal(clampStake(999, 500, 300), 300); assert.equal(clampStake(127, 500, 300), 130); assert.equal(clampStake(50, 0, 300), 0);
  assert.equal(stakeWhy(50, 500, 300, 'Mia Lopez'), null);
  assert.match(stakeWhy(600, 500, 1000, 'Mia Lopez')!, /You have \$500/);
  assert.match(stakeWhy(400, 500, 300, 'Mia Lopez')!, /Mia carries \$300/);
  assert.match(stakeWhy(5, 500, 300, 'Mia Lopez')!, /least/);
});

test('an opponent\'s skills give their handicap on your curve; their purse shrinks by what they lost to you and grows back', () => {
  for (const h of [4, 12, 18, 28]) { const o = opponentOf('Ray Kowalski', h); assert.ok(Math.abs(o.hcp - h) <= 0.3, `${h} -> ${o.hcp}`); assert.ok(Math.abs(handicapOf(o.skills) - o.hcp) < 1e-9); }
  assert.ok(Math.abs(hcpOfSkill(skillOfHcp(15)) - 15) < 0.2);
  const a = opponentOf('Ray Kowalski'), b = opponentOf('Ray Kowalski');
  assert.deepEqual(a, b, 'the same person every time');
  const riv: Rival = { name: 'Ray Kowalski', hcp: a.hcp, w: 1, l: 0, h: 0, net: 200, last: 10, res: 'w', stake: 200 };
  assert.equal(opponentOf('Ray Kowalski', a.hcp, riv, 10).purse, Math.max(0, a.purse - 200));
  assert.equal(opponentOf('Ray Kowalski', a.hcp, riv, 20).purse, a.purse, 'grown back after 10 days');
});

test('the answer: deterministic, keener on small stakes and weaker opponents, never past their purse; revenge makes it likelier', () => {
  const o = { ...opponentOf('Mia Lopez', 18), purse: 1000 };
  assert.deepEqual(answerOf(o, 18, 100, 18, null, 5), answerOf(o, 18, 100, 18, null, 5));
  assert.equal(answerOf(o, 18, 1200, 18, null, 5).yes, false, 'more than they carry');
  const small = answerOf(o, 18, 20, 18, null, 5).p, big = answerOf(o, 18, 900, 18, null, 5).p;
  assert.ok(small > big, 'a big share of their purse puts them off');
  assert.ok(answerOf(o, 25, 100, 18, null, 5).p > answerOf(o, 8, 100, 18, null, 5).p, 'they like it more against a worse golfer');
  const lostToYou: Rival = { name: 'Mia Lopez', hcp: 18, w: 1, l: 0, h: 0, net: 50, last: 1, res: 'w', stake: 50 };
  assert.ok(answerOf(o, 18, 100, 18, lostToYou, 5).p > answerOf(o, 18, 100, 18, null, 5).p);
  let yes = 0; for (let d = 0; d < 200; d++) if (answerOf(o, 18, 50, 18, null, d).yes) yes++;
  assert.ok(yes > 80 && yes < 190, `an even match at a small stake is mostly yes (${yes}/200)`);
});

test('match-play scoring: up and down, dormie, decided early (3&2), the last hole, halved', () => {
  assert.equal(matchScore([], 18).text, 'All square');
  assert.equal(matchScore([1, 0, 1], 18).text, '2 up thru 3');
  assert.equal(matchScore([-1], 9).short, '1 down');
  const d = matchScore([1, 1, 0, 0, 0, 0, 0], 9); assert.ok(d.dormie); assert.equal(d.text, '2 up: dormie 2'); assert.equal(d.over, false);
  const w = matchScore([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 18); assert.ok(w.over); assert.equal(w.result, 'w'); assert.equal(w.text, 'You won 3&2');
  const l = matchScore([-1, -1, -1, -1, -1], 9); assert.ok(l.over); assert.equal(l.result, 'l'); assert.equal(l.text, 'You lost 5&4');
  assert.equal(matchScore([1, 0, 0, 0, 0, 0, 0, 0, 0], 9).text, 'You won 1 up');
  const h = matchScore([1, -1, 0, 0, 0, 0, 0, 0, 0], 9); assert.equal(h.result, 'h'); assert.equal(h.text, 'Match halved');
});

test('a hole is decided once neither side can do better (match play concedes the rest)', () => {
  assert.equal(holeOutcome({ strokes: 4, done: true }, { strokes: 5, holed: true }), 1);
  assert.equal(holeOutcome({ strokes: 4, done: true }, { strokes: 4, holed: true }), 0);
  assert.equal(holeOutcome({ strokes: 4, done: true }, { strokes: 4, holed: false }), 1, 'they are on 4 without holing: they can at best take 5');
  assert.equal(holeOutcome({ strokes: 4, done: true }, { strokes: 3, holed: false }), null, 'they can still halve it');
  assert.equal(holeOutcome({ strokes: 3, done: false }, { strokes: 3, holed: true }), -1);
  assert.equal(holeOutcome({ strokes: 2, done: false }, { strokes: 3, holed: true }), null);
});

test('a match round: no mulligans, no gimmies; golf\'s order (the honour, then the one away); the opponent plays by the model', () => {
  const o = opponentOf('Mia Lopez', 16), r = startMatch(view, matchHoles(18, 9), 4, o, 100, 2)!;
  assert.equal(r.mode, 'match'); assert.deepEqual(r.rules, rulesFor('match')); assert.equal(r.holes.length, 9);
  assert.deepEqual(r.match!.ball, holes[0]!.tee); assert.equal(r.match!.stake, 100);
  assert.equal(matchTurn(view, r), 'you', 'your honour on the first tee');
  const a = playMatchYours(view, r, SK, { club: 'driver', aim: { x: 120, y: 10 }, power: 1 }, 7).round;
  assert.equal(canMulligan(a), false); assert.equal(canGimme(view, { ...a, lie: 'green', ball: { ...holes[0]!.pin } }), false);
  assert.equal(matchTurn(view, a), 'opp', 'they have not hit: they are away on the tee');
  const b = oppShot(view, a, 7);
  assert.equal(b.round.match!.strokes, 1); assert.equal(b.shot.golfer, -2);
  assert.deepEqual(oppShot(view, a, 7).shot, b.shot, 'the same shot on a reload');
  // the one farther from the pin plays next
  const pin = holes[0]!.pin, dy = Math.hypot(pin.x - b.round.ball.x, pin.y - b.round.ball.y), dO = Math.hypot(pin.x - b.round.match!.ball.x, pin.y - b.round.match!.ball.y);
  assert.equal(matchTurn(view, b.round), dO > dy ? 'opp' : 'you');
});

test('a hole you lose without holing out is conceded: your row is picked up, the scorecard goes on; the honour follows the winner', () => {
  const o = opponentOf('Mia Lopez', 16); let r = startMatch(view, matchHoles(18, 9), 4, o, 100, 2)!;
  r = { ...r, card: r.card.map((c, k) => k === 0 ? { ...c, strokes: 3 } : c), match: { ...r.match!, strokes: 3, holed: true } };
  const d = decideHole(r);
  assert.ok(holeDecided(d)); assert.equal(d.holed, true); assert.equal(rowOf(d).up, true); assert.deepEqual(d.match!.res, [-1]); assert.deepEqual(d.match!.ocard, [3]);
  const n = matchNextHole(view, d);
  assert.equal(n.at, 1); assert.deepEqual(n.match!.ball, holes[1]!.tee); assert.equal(n.match!.strokes, 0); assert.equal(n.match!.holed, false);
  assert.equal(matchTurn(view, n), 'opp', 'their honour after winning the hole');
});

test('skip to result: the whole match played by the model, decided, deterministic; settled into money, reputation, rivals and your rounds', () => {
  const o = opponentOf('Mia Lopez', 18), r = startMatch(view, matchHoles(18, 18), 4, o, 150, 1)!;
  const end = skipMatch(view, r, SK, 11);
  assert.equal(end.over, true);
  const sc = matchScore(end.match!.res, 18); assert.ok(sc.over);
  assert.deepEqual(skipMatch(view, r, SK, 11), end);
  assert.equal(end.match!.res.length, end.card.filter(c => c.done).length, 'every hole played has a result');
  const p = { ...startProfile(), round: end }, s = settleMatch(p, end);
  assert.equal(s.profile.round, undefined);
  assert.equal(s.money, sc.result === 'w' ? 150 : sc.result === 'l' ? -150 : 0);
  assert.equal(s.rep, sc.result === 'w' ? REP_WIN : 0);
  const rv = s.profile.rivals![0]!; assert.equal(rv.name, 'Mia Lopez'); assert.equal(rv.net, s.money); assert.equal(rv.res, sc.result);
  assert.equal(s.profile.rounds.at(-1)!.kind, 'match');
  const lost = { ...end, match: { ...end.match!, res: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as (0 | -1)[] } };
  assert.equal(settleMatch({ ...startProfile(), round: lost }, lost).text, 'Mia beat you 1 up: -$150');
  // conceding mid-match: a loss
  const mid = settleMatch({ ...startProfile(), round: r }, r, true); assert.equal(mid.money, -150); assert.equal(mid.result, 'l'); assert.equal(mid.profile.rounds.length, 0, 'no hole played: no round');
});

test('a match never offers more holes than the course has; skipped from mid-hole it carries on from where you are', () => {
  assert.deepEqual(matchLengths(18), [9, 18]); assert.deepEqual(matchLengths(12), [9]); assert.deepEqual(matchLengths(6), [6]); assert.deepEqual(matchLengths(0), []);
  assert.deepEqual(matchHoles(12, 18), []);
  const o = opponentOf('Ray Kowalski', 10); let r = startMatch(view, matchHoles(18, 9), 2, o, 50, 0)!;
  const t = yourTurn(view, r, SK)!; r = playMatchYours(view, r, SK, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power }, 3).round;
  const end = skipMatch(view, r, SK, 3); assert.equal(end.over, true); assert.equal(end.card[0]!.strokes >= 1, true);
});

test('rivals: the record, the words, and return challenges on later days within what both can afford', () => {
  let rv = remember([], 'Mia Lopez', 18, 'w', 100, 3, 100);
  rv = remember(rv, 'Mia Lopez', 18, 'l', -50, 5, 50); rv = remember(rv, 'Ray Kowalski', 9, 'h', 0, 5, 20);
  assert.equal(rv.length, 2); assert.equal(rv[0]!.name, 'Mia Lopez'); assert.equal(rv[0]!.w, 1); assert.equal(rv[0]!.l, 1); assert.equal(rv[0]!.net, 50);
  assert.equal(rivalText(rv[0]!), 'You 1-1 · +$50');
  assert.equal(returnChallenge(rv, 6, 1, 1000), null, 'not straight after the match');
  let got = 0; for (let d = 7; d < 107; d++) { const c = returnChallenge(rv, d, 1, 1000); if (c) { got++; assert.ok(c.stake >= MIN_STAKE && c.stake <= 1000); assert.ok(c.holes === 9 || c.holes === 18); } }
  assert.ok(got > 5 && got < 60, `some days a rival asks (${got}/100)`);
  assert.equal(returnChallenge(rv, 50, 1, 0), null, 'nothing when you cannot afford the least stake');
});

test('saved: a match round, rivals and a waiting challenge survive a reload; a broken match is a casual round', () => {
  const o = opponentOf('Mia Lopez', 16), r = startMatch(view, matchHoles(18, 9), 4, o, 100, 2)!;
  const a = oppShot(view, playMatchYours(view, r, SK, { club: 'driver', aim: { x: 120, y: 10 }, power: 1 }, 7).round, 7).round;
  const back = normalizeYourRound(JSON.parse(JSON.stringify(a)))!;
  assert.deepEqual(back.match, a.match); assert.equal(back.mode, 'match'); assert.deepEqual(back.rules, rulesFor('match'));
  const broke = normalizeYourRound({ ...JSON.parse(JSON.stringify(a)), match: { name: 'x' } })! as YourRound;
  assert.equal(broke.mode, undefined); assert.equal(broke.match, undefined);
  const p = normalizePlayer(JSON.parse(JSON.stringify({ ...startProfile(), rivals: remember([], 'Mia Lopez', 16, 'w', 100, 3, 100), challenge: { name: 'Mia Lopez', stake: 150, holes: 9, day: 8 }, chDay: 8 })))!;
  assert.equal(p.rivals![0]!.w, 1); assert.deepEqual(p.challenge, { name: 'Mia Lopez', stake: 150, holes: 9, day: 8 }); assert.equal(p.chDay, 8);
  assert.equal(normalizePlayer(startProfile())!.rivals, undefined, 'an old save has none');
});
