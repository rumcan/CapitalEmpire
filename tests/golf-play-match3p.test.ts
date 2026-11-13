// T428 (docs/CINDERLINKS-PORT.md): a money match in the view from behind the golfer (src/game/golf/play/match3p.ts), on golf-match.test.ts' synthetic course.
// A 9-hole match played by the suggested shots: it opens with the match and ends with it; each of the opponent's strokes follows a list with him addressing his
// ball; each decided hole sends its result and its end; the score the view is sent is match.ts' own; the match is the very one the manager game plays (the same
// round as playing it there with the same inputs); a stale input gets the turn again; and a strong golfer against a weak one wins, and settling it moves the stake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holeDecided, matchNextHole, matchScore, matchTurn, oppShot, opponentOf, playMatchYours, settleMatch, startMatch } from '../src/game/golf/play/match';
import { startProfile } from '../src/game/golf/player';
import { yourTurn } from '../src/game/golf/play/yours';
import { envOf } from '../src/game/golf/play/conditions';
import { MODEL_V } from '../src/game/golf/play/live';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';
import type { ActorsMsg, HostMsg, MatchMsg, ShotMsg, TurnMsg, ViewInput } from '../src/game/golf/play/protocol3p';
import { fromView } from '../src/game/golf/play/protocol3p';
import { Match3p, OPP_3P, OWNER_M3P, oppDress, oppSexOf } from '../src/game/golf/play/match3p';
import { GOLFER_PEOPLE } from '../src/game/library';

const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: h % 6 === 2 ? 3 : 4, tee, pin, line: [tee, pin] }; });
const lieAt = (x: number, y: number): Lie => {
  const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y);
  return d <= 8 ? 'green' : x < -5 ? 'out' : 'fairway';
};
const view: CourseView = { holes, lieAt };
const centre = { x: 75, y: 250 };
const nine = Array.from({ length: 9 }, (_, i) => i);
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });

function playAll(m: Match3p): HostMsg[] {
  const all: HostMsg[] = []; let ms = m.start();
  for (let k = 0; k < 200; k++) { all.push(...ms); const t = ms.filter((x): x is TurnMsg => x.t === 'turn').pop(); if (!t) break; ms = m.input(answer(t)); }
  return all;
}

test('a 9-hole match in the view: the match, the strokes in turn, each hole decided, the end', () => {
  const sk = { driving: 0.6, irons: 0.6, short: 0.6, putting: 0.6 }, o = opponentOf('Mia Lopez', 14), r0 = startMatch(view, nine, 3, o, 150, 2)!;
  const m = new Match3p({ view, round: r0, skills: sk, sex: 'm', oppSex: 'w', seed: 7, frame: centre });
  const all = playAll(m), mm = all.filter((x): x is MatchMsg => x.t === 'match');
  assert.equal(all[0]!.t, 'match'); assert.equal((all[0] as MatchMsg).why, 'start'); assert.equal((all[0] as MatchMsg).stake, 150); assert.equal((all[0] as MatchMsg).name, 'Mia Lopez');
  assert.equal(mm[mm.length - 1]!.why, 'end'); assert.ok(m.over && m.round.over, 'the match is over');
  const decided = mm.filter(x => x.why === 'hole');
  assert.equal(decided.length, m.round.match!.res.length, 'one result a decided hole');
  assert.equal(all.filter(x => x.t === 'holeEnd').length, decided.length);
  assert.deepEqual(mm[mm.length - 1]!.score.text, matchScore(m.round.match!.res, 9).text, 'the score is match.ts\'');
  all.forEach((x, i) => { if (x.t === 'shot' && x.golfer === OPP_3P) { const a = all[i - 1] as ActorsMsg; assert.equal(a.t, 'actors'); const opp = a.actors.find(q => q.id === OPP_3P)!; assert.equal(opp.doing, 'address');
    const b = fromView(opp.at, centre), f = fromView(x.from, centre); assert.ok(Math.hypot(b.x - f.x, b.y - f.y) < 1e-6, 'he addresses his ball'); assert.ok(a.actors.some(q => q.owner && q.id === OWNER_M3P)); } });
  const shots = all.filter((x): x is ShotMsg => x.t === 'shot');
  assert.ok(shots.some(s => s.golfer === OPP_3P) && shots.some(s => s.golfer === OWNER_M3P), 'both play');
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i]!.at > shots[i - 1]!.at, 'the strokes in order');
});

test('the match is the manager game\'s: the same round as playing it there with the same inputs; a stale input gets the turn again', () => {
  const sk = { driving: 0.55, irons: 0.55, short: 0.55, putting: 0.55 }, o = opponentOf('Dale Hart', 10), r0 = startMatch(view, nine, 5, o, 100, 1)!;
  const m = new Match3p({ view, round: r0, skills: sk, sex: 'm', seed: 11, frame: centre });
  const first = m.start(), t = first.filter((x): x is TurnMsg => x.t === 'turn').pop()!;
  const stale = m.input({ ...answer(t), stroke: t.stroke + 3 }); assert.equal(stale.length, 1); assert.equal(stale[0]!.t, 'turn');
  m.input(answer(t)); let ms: HostMsg[] = m.input(answer(t)); void ms;   // (the second is stale now: the turn has moved on)
  // the same match played directly through match.ts with the inputs the view sent
  const m2 = new Match3p({ view, round: r0, skills: sk, sex: 'm', seed: 11, frame: centre }), inputs: ViewInput[] = [];
  let ms2 = m2.start();
  for (let k = 0; k < 200; k++) { const tt = ms2.filter((x): x is TurnMsg => x.t === 'turn').pop(); if (!tt) break; const vi = answer(tt); inputs.push(vi); ms2 = m2.input(vi); }
  let r = r0, q = 0;
  for (let k = 0; k < 400 && !r.over; k++) {
    if (holeDecided(r)) { const n = matchNextHole(view, r); if (n === r) break; r = n; continue; }
    const who = matchTurn(view, r);
    if (who === 'opp') { r = oppShot(view, r, 11).round; continue; }
    const vi = inputs[q++]!, aim = fromView(vi.aim, centre), y = yourTurn(view, r, sk)!, env = vi.club === 'putter' ? null : envOf(null, view.kindAt, null, y.ball, y.lie, aim);
    r = playMatchYours(view, r, sk, { club: vi.club, aim, power: vi.power, v: MODEL_V, ...(env ? { env } : {}) }, 11).round;
  }
  assert.equal(q, inputs.length, 'every input played');
  assert.deepEqual(m2.round.match!.res, r.match!.res, 'the same holes won and lost');
  assert.deepEqual(m2.round.card.map(c => c.strokes), r.card.map(c => c.strokes), 'the same strokes');
});

test('a strong golfer beats a weak one, and settling it moves the stake', () => {
  const sk = { driving: 0.95, irons: 0.95, short: 0.95, putting: 0.95 }, o = opponentOf('Gary Hill', 30), r0 = startMatch(view, nine, 2, o, 200, 3)!;
  const m = new Match3p({ view, round: r0, skills: sk, sex: 'm', seed: 3, frame: centre }), all = playAll(m), end = all.filter((x): x is MatchMsg => x.t === 'match').pop()!;
  assert.equal(end.score.result, 'w', `won (${end.score.text})`);
  const s = settleMatch({ ...startProfile(), round: m.round }, m.round);
  assert.equal(s.result, 'w'); assert.equal(s.money, 200, 'the stake is his');
});

test('T450b: the opponent is drawn as the golfer the map shows him as (engine.ts matchBegin: GOLFER_PEOPLE[look]), his sex the look sex', () => {
  GOLFER_PEOPLE.forEach((p, look) => {
    const id = p.id.replace(/^golfer:/, ''), d = oppDress('Pat Doe', look);
    assert.equal(d.art, id, `look ${look}`);
    assert.equal(d.sex, id.includes('_w') ? 'w' : 'm'); assert.equal(oppSexOf(look), d.sex);
  });
  assert.equal(oppSexOf(8, 'm'), 'm', 'the host sex wins when it sends one');
});
