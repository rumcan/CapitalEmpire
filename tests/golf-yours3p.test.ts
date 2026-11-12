// T430 to T432: your own round (play/yours.ts) played in the view from behind the golfer (play/yours3p.ts under play3p.ts). The view's inputs play the
// same round as the top view's playYours does (the same card, the same ball); the hole ends, holeDone goes on to the next tee, the last hole ends the
// round; a round saved mid-hole (normalizeYourRound, as the game's save keeps it) resumes at the same lie; a stroke's feat is named and pays its pull.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYourRound, playYours, startRound, rowOf, type YourRound } from '../src/game/golf/play/yours';
import type { CourseView, GameSkills, Lie, OwnerInput, PlayHole, Pt } from '../src/game/golf/play';
import { toView, type HoleEndMsg, type ShotMsg, type TurnMsg, type ViewInput } from '../src/game/golf/play/protocol3p';
import { Play3p } from '../src/game/golf/play/play3p';
import { yoursDriver } from '../src/game/golf/play/yours3p';
import { featOf } from '../src/game/golf/play/feats';
import { earnFromFeat } from '../src/game/golf/cards/earning';

const centre: Pt = { x: 200, y: 160 };
const holes: PlayHole[] = [100, 220].map((y, i) => ({ n: i + 1, par: 4 as const, tee: { x: 100, y }, pin: { x: 300, y }, line: [{ x: 100, y }, { x: 300, y }] }));
const view: CourseView = {
  holes,
  lieAt: (x, y): Lie => {
    for (const h of holes) {
      if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 8) return 'green';
      if (Math.hypot(x - 260, y - h.tee.y - 9) <= 3) return 'bunker';
      if (Math.abs(y - h.tee.y) <= 10 && x >= 98 && x <= 310) return x <= 102 && Math.abs(y - h.tee.y) < 2 ? 'tee' : 'fairway';
    }
    return 'rough';
  },
};
const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };
const SEED = 21;

/** a session on a round kept in `box` (as the game keeps it), and every stroke the played hook saw */
function sessionOn(box: { r: YourRound | null }) {
  const seen: { lie: Lie; holed: boolean }[] = [];
  const d = yoursDriver(view, sk, SEED, { get: () => box.r, set: r => { box.r = r; }, played: (s, b) => seen.push({ lie: b.lie, holed: s.holed }) });
  return { s: new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed: SEED, frame: centre, driver: d, gimmeM: 0 }), seen };
}
const turnIn = (ms: readonly { t: string }[]) => ms.find((m): m is TurnMsg => m.t === 'turn');
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });

test('yours3p: the view plays your round as the top view does: the same card and ball for the same inputs; holes go on by holeDone; the last ends it', () => {
  const box = { r: startRound(view, [0, 1], 3) as YourRound | null }, { s, seen } = sessionOn(box);
  let t = turnIn(s.start())!, ends: HoleEndMsg[] = [];
  assert.equal(t.golfer, -1); assert.equal(t.hole, 1); assert.equal(t.stroke, 1);
  const played: OwnerInput[] = [];
  for (let k = 0; k < 30 && t; k++) {
    const ms = s.input(answer(t)); played.push(s.inputs[s.inputs.length - 1]!);
    const e = ms.find((m): m is HoleEndMsg => m.t === 'holeEnd'); if (e) ends.push(e);
    const mine = ms.find((m): m is ShotMsg => m.t === 'shot')!;
    if (!box.r!.holed) assert.ok(Math.hypot(mine.rest[0] - toView(box.r!.ball, centre)[0], mine.rest[1] - toView(box.r!.ball, centre)[1]) < 1e-6 || mine.penalty, 'the rest is the round\'s ball');
    t = turnIn(ms)!;
    if (!t && e && !e.last) { assert.deepEqual(s.holeDone(e.holeIdx + 1), [], 'holeDone for another hole does nothing'); t = turnIn(s.holeDone(e.holeIdx))!; assert.equal(t.hole, 2, 'the next hole'); assert.equal(t.stroke, 1); }
  }
  assert.equal(ends.length, 2); assert.equal(ends[0]!.last, false); assert.equal(ends[1]!.last, true);
  assert.ok(box.r!.over, 'the round is over'); assert.equal(ends[0]!.strokes, box.r!.card[0]!.strokes); assert.equal(ends[1]!.strokes, box.r!.card[1]!.strokes);
  assert.equal(seen.length, played.length, 'the game heard every stroke');
  // the top view's own path: playYours with the same inputs, from the same start, gives the same card
  let r: YourRound = startRound(view, [0, 1], 3)!;
  for (const i of played) { if (r.holed && !r.over) r = { ...r, at: r.at + 1, holed: false, ball: { ...holes[r.at + 1]!.tee }, lie: 'tee' }; const { holeIdx: _h, stroke: _s, ...inp } = i; void _h; void _s; r = playYours(view, r, sk, inp, SEED).round; }
  assert.deepEqual(r.card.map(c => c.strokes), box.r!.card.map(c => c.strokes), 'the same card in both views');
});

test('yours3p: a round saved mid-hole and loaded resumes in the view at the same lie and stroke', () => {
  const box = { r: startRound(view, [0, 1], 3) as YourRound | null }, a = sessionOn(box).s, t1 = turnIn(a.start())!;
  const after = a.input(answer(t1)), t2 = turnIn(after)!;
  const saved = normalizeYourRound(JSON.parse(JSON.stringify(box.r)))!;
  const back = sessionOn({ r: saved }).s, t3 = turnIn(back.start())!;
  assert.equal(back.start().filter(m => m.t === 'shot').length, 0, 'nothing played again');
  assert.equal(t3.stroke, t2.stroke); assert.equal(t3.lie, t2.lie);
  assert.ok(Math.hypot(t3.ball[0] - t2.ball[0], t3.ball[1] - t2.ball[1]) < 1e-9, 'the same ball');
  assert.equal(rowOf(saved).strokes, 1);
});

test('feats: a holed bunker shot, an ace, a chip-in and a long drive are named; each pays its pull; the round keeps the ones paid', () => {
  const at = (x: number) => ({ x, y: 100 }), base = { penalty: 0 as const, from: at(260), to: at(300) };
  assert.equal(featOf({ ...base, club: 'sw', stroke: 3, holed: true }, 'bunker'), 'bunker');
  assert.equal(featOf({ ...base, club: 'iron8', stroke: 1, holed: true }, 'tee'), 'ace');
  assert.equal(featOf({ ...base, club: 'pw', stroke: 3, holed: true }, 'fairway'), 'chipin');
  assert.equal(featOf({ ...base, club: 'putter', stroke: 3, holed: true }, 'green'), null, 'a holed putt is no feat');
  assert.equal(featOf({ club: 'driver', stroke: 1, holed: false, penalty: 0, from: at(100), to: at(236) }, 'tee'), 'longdrive', '272 m');
  assert.equal(earnFromFeat('bunker').grade, 'silver'); assert.equal(earnFromFeat('ace').grade, 'gold');
  const r = normalizeYourRound(JSON.parse(JSON.stringify({ ...startRound(view, [0], 3)!, feats: ['bunker', 'nonsense', 'bunker'] })))!;
  assert.deepEqual(r.feats, ['bunker'], 'kept once, unknown ones dropped');
});
