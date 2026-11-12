// T418: the owner's play in the view from behind the golfer (play/play3p.ts): the view's input is played through LiveGroup and answered with exactly one
// stroke of his, whose rest is the model's; the next turn has his ball there; a stale input is answered with the turn again; the hole ends with
// holeEnd, and a two-hole session goes on to the second hole's tee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { rng, shotOutcome } from '../src/game/golf/play';
import type { CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import { toView, type HostMsg, type ShotMsg, type TurnMsg, type ViewInput } from '../src/game/golf/play/protocol3p';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';

const centre: Pt = { x: 200, y: 160 };
/** two par 4s along y = 100 and y = 220: tee at x 100, pin at x 300 (400 m); a green of 8 tiles round each pin, a fairway 10 tiles either side */
const holes: PlayHole[] = [100, 220].map((y, i) => ({ n: i + 1, par: 4 as const, tee: { x: 100, y }, pin: { x: 300, y }, line: [{ x: 100, y }, { x: 300, y }] }));
const view: CourseView = {
  holes,
  lieAt: (x, y): Lie => {
    for (const h of holes) {
      if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 8) return 'green';
      if (Math.abs(y - h.tee.y) <= 10 && x >= 98 && x <= 310) return x <= 102 && Math.abs(y - h.tee.y) < 2 ? 'tee' : 'fairway';
    }
    return 'rough';
  },
};
const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };
const SEED = 11;
const session = (idx: number[] = [0]) => new Play3p({ view, holes: idx, skills: sk, sex: 'm', seed: SEED, frame: centre });

const turnsOf = (ms: HostMsg[]) => ms.filter((m): m is TurnMsg => m.t === 'turn');
const shotsOf = (ms: HostMsg[]) => ms.filter((m): m is ShotMsg => m.t === 'shot');
/** the view's answer to a turn: the suggested club, aim and power */
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
const near = (a: readonly number[], b: readonly number[], eps = 1e-6) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < eps;

test('play3p: the session opens with his turn on the tee, in the view\'s frame, with his bag', () => {
  const ms = session().start();
  assert.equal(ms.length, 1);
  const t = turnsOf(ms)[0]!;
  assert.equal(t.golfer, OWNER_3P); assert.equal(t.hole, 1); assert.equal(t.stroke, 1); assert.equal(t.lie, 'tee');
  assert.ok(near(t.ball, toView(holes[0]!.tee, centre)), 'the ball is on the tee');
  assert.ok(near(t.pin, toView(holes[0]!.pin, centre)), 'the pin is the hole\'s');
  assert.ok(t.clubs.length >= 7 && t.clubs.some(c => c.club === 'driver'));
});

test('play3p: an input gives exactly one stroke of his, its rest the model\'s; the next turn has his ball there', () => {
  const s = session(), t = turnsOf(s.start())[0]!, vi = answer(t);
  const ms = s.input(vi), mine = shotsOf(ms).filter(m => m.golfer === OWNER_3P);
  assert.equal(mine.length, 1, 'one stroke of his');
  const m = mine[0]!, rec = s.plan.shots.find(x => x.golfer === OWNER_3P && x.stroke === 1)!;
  assert.ok(near(m.rest, toView(rec.landing?.rest ?? rec.to, centre), 1e-6), 'the rest is the recorded one');
  // the one model, struck again by hand with the same stream: the same rest
  const { holeIdx: _h, stroke: _s, ...played } = s.inputs[0]!; void _h; void _s; // (as played: the aim back in tiles, the conditions and the model's version filled in)
  assert.equal(played.club, vi.club); assert.equal(played.power, vi.power); assert.ok(played.env, 'the host filled in the conditions');
  const own = shotOutcome(s.view, s.view.holes[0]!, holes[0]!.tee, 'tee', sk, played, rng(SEED, OWNER_3P, 0 * 32 + 1), { last: true });
  assert.ok(near(m.rest, toView(own.landing?.rest ?? own.to, centre), 1e-6), 'the rest is shotOutcome\'s');
  assert.ok(m.flight.length > 2, 'a drive flies');
  assert.ok(Math.hypot(m.rest[0] - t.ball[0], m.rest[1] - t.ball[1]) > 100, 'and goes a long way');
  const next = turnsOf(ms);
  assert.equal(next.length, 1); assert.equal(next[0]!.stroke, 2);
  assert.ok(near(next[0]!.ball, toView(rec.to, centre), 1e-6), 'the next turn is from where the ball came to rest');
  assert.equal(ms[ms.length - 1]!.t, 'turn', 'the turn comes after the strokes');
});

test('play3p: a stale or repeated input plays nothing and gets the turn again', () => {
  const s = session(), t = turnsOf(s.start())[0]!;
  s.input(answer(t));
  const again = s.input(answer(t));
  assert.equal(again.length, 1); assert.equal(again[0]!.t, 'turn'); assert.equal((again[0] as TurnMsg).stroke, 2);
  assert.equal(s.inputs.length, 1, 'played once');
});

test('play3p: the hole ends with holeEnd (his strokes, last), then nothing; the same inputs give the same rests', () => {
  const play = () => {
    const s = session(), rests: number[][] = []; let t = turnsOf(s.start())[0]!, end: HostMsg | undefined;
    for (let k = 0; k < 15 && t; k++) {
      const ms = s.input(answer(t));
      for (const m of shotsOf(ms)) rests.push(m.rest);
      end = ms.find(m => m.t === 'holeEnd'); t = turnsOf(ms)[0]!;
      if (end) { assert.equal(turnsOf(ms).length, 0, 'no turn after the last hole'); break; }
    }
    return { s, rests, end };
  };
  const a = play(), b = play();
  assert.ok(a.end && a.end.t === 'holeEnd', 'the hole ended');
  assert.equal(a.end.last, true); assert.equal(a.end.hole, 1);
  assert.equal(a.end.strokes, a.s.plan.shots.filter(x => x.golfer === OWNER_3P).reduce((n, x) => n + 1 + x.penalty, 0));
  assert.deepEqual(a.rests, b.rests, 'deterministic');
  assert.equal(a.s.current, null); assert.deepEqual(a.s.input({ holeIdx: 0, stroke: 9, club: 'putter', aim: [0, 0], power: 1 }), []);
});

test('play3p: two holes: holeEnd (not last), then the second hole\'s turn from its tee', () => {
  const s = session([0, 1]); let t = turnsOf(s.start())[0]!, seen: HostMsg[] = [];
  for (let k = 0; k < 15 && t.holeIdx === 0; k++) { seen = s.input(answer(t)); t = turnsOf(seen)[0]!; }
  const end = seen.find(m => m.t === 'holeEnd');
  assert.ok(end && end.t === 'holeEnd' && !end.last && end.hole === 1);
  assert.equal(t.hole, 2); assert.equal(t.stroke, 1);
  assert.ok(near(t.ball, toView(holes[1]!.tee, centre)), 'on the second tee');
  assert.ok(seen.indexOf(end) < seen.indexOf(t), 'holeEnd before the next turn');
  void TILE_M;
});
