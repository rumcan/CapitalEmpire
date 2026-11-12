// T441, T442, T443: shaping, ball control and the unlocks in the view from behind the golfer. unlocks.ts: a new save has earned nothing; a Tour driver
// and the Power Mash card give the boost. play3p.ts: what he has not earned is taken out of his input before the model plays it, and a boost spends a
// charge; the preview (the model's shot with no luck) curves a draw left of the straight shot, and a low-skill golfer's real draws miss it wider than a
// high-skill one's. The model: a wedge with full backspin from the fairway stops within 2 m of where it pitched, from the rough it runs on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { START_SKILLS } from '../src/game/golf/player';
import { rng, shotOutcome } from '../src/game/golf/play';
import type { CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import type { TurnMsg, ViewInput, ShotMsg, PreviewMsg } from '../src/game/golf/play/protocol3p';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';
import { ALL_EARNED, earned } from '../src/game/golf/play/unlocks';

const centre: Pt = { x: 200, y: 120 };
const hole: PlayHole = { n: 1, par: 4, tee: { x: 100, y: 100 }, pin: { x: 300, y: 100 }, line: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
const view: CourseView = {
  holes: [hole],
  lieAt: (x, y): Lie => Math.hypot(x - 300, y - 100) <= 8 ? 'green' : Math.abs(y - 100) <= 10 && x >= 98 ? (x <= 102 && Math.abs(y - 100) < 2 ? 'tee' : 'fairway') : 'rough',
};
const sk = (v: number): GameSkills => ({ driving: v, irons: v, short: v, putting: v, accuracy: v, touch: v });

test('unlocks: a new save has earned nothing; skills, a Tour driver and the cards earn the extras', () => {
  const none = earned({ skills: START_SKILLS, bag: null, mech: [] });
  for (const k of ['draw', 'fade', 'high', 'low', 'side', 'back', 'tour', 'boost'] as const) { assert.equal(none[k], false, k); assert.ok(none.why[k], `${k} says what unlocks it`); }
  assert.equal(none.charges, 0);
  const tour = earned({ skills: START_SKILLS, bag: { v: 1, lv: { driver: 2 } }, mech: ['boost'] });
  assert.ok(tour.boost && tour.charges === 1 && tour.draw, 'a Tour driver and Power Mash: the boost, and the curve (a Tour club)');
  assert.equal(earned({ skills: START_SKILLS, bag: { v: 1, lv: { driver: 3 } }, mech: ['boost'] }).charges, 2, 'a Prototype driver: two charges');
  assert.equal(earned({ skills: START_SKILLS, bag: { v: 1, lv: { driver: 2 } }, mech: [] }).boost, false, 'no card, no boost');
  const good = earned({ skills: { ...START_SKILLS, accuracy: 60, touch: 60, short: 45 }, mech: ['airspin'] });
  assert.ok(good.draw && good.high && good.side && good.back && good.tour && !good.boost);
});

const session = (skills: GameSkills, e = ALL_EARNED, seed = 3) => new Play3p({ view, holes: [0], skills, sex: 'm', seed, frame: centre, earned: e });
const firstTurn = (s: Play3p) => s.start().find((m): m is TurnMsg => m.t === 'turn')!;
const base = (t: TurnMsg, club = t.suggested.club): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club, aim: t.suggested.aim, power: 1 });

test('play3p: what he has not earned is taken out before the model plays it; a boost spends a charge', () => {
  const none = earned({ skills: START_SKILLS, bag: null, mech: [] }), s = session(sk(0.5), none), t = firstTurn(s);
  assert.equal(t.earned!.draw, false); assert.equal(t.charges, 0);
  s.input({ ...base(t), shape: { curve: -1, flight: 1 }, spin: { x: 0.5, y: -0.8, pump: 3 }, swing: { power: 1, acc: 0, boost: 0.06, v: 2 } });
  const i = s.inputs[0]!;
  assert.equal(i.shape, undefined, 'no shape'); assert.equal(i.spin, undefined, 'no spin'); assert.equal(i.swing!.boost, 0, 'no boost');
  const e = { ...ALL_EARNED, charges: 1 }, s2 = session(sk(0.5), e), t2 = firstTurn(s2);
  assert.equal(t2.charges, 1);
  const ms = s2.input({ ...base(t2), swing: { power: 1, acc: 0, boost: 0.06, v: 2 } });
  assert.equal(s2.inputs[0]!.swing!.boost, 0.06, 'the boost is played');
  assert.equal(ms.find((m): m is TurnMsg => m.t === 'turn')!.charges, 0, 'and the charge is spent for the hole');
  s2.input({ ...base(ms.find((m): m is TurnMsg => m.t === 'turn')!), swing: { power: 1, acc: 0, boost: 0.06, v: 2 } });
  assert.equal(s2.inputs[1]!.swing!.boost, 0, 'no charge left: no boost');
});

/** the side of a point off the line from the tee (+ right of the hole's line east: south, + y), metres */
const sideOf = (p: readonly number[]) => p[1]! - (hole.tee.y - centre.y) * TILE_M;
const land = (m: ShotMsg) => m.flight[m.flight.length - 1]!;

test('play3p preview: a draw curves left of the straight shot and plays nothing; the real draws miss it wider for a low-skill golfer', () => {
  const s = session(sk(0.6)), t = firstTurn(s), club = 'iron5' as const;
  const straight = s.preview(1, base(t, club)), draw = s.preview(2, { ...base(t, club), shape: { curve: -1, flight: 0 } }) as PreviewMsg;
  assert.equal(draw.key, 2); assert.equal(s.inputs.length, 0, 'a preview plays nothing');
  const bend = sideOf(land(straight.shot!)) - sideOf(land(draw.shot!));
  assert.ok(bend > 5, `the draw lands left of the straight shot (${bend.toFixed(1)} m)`);
  // the same draw struck for real by a weak and a strong golfer, many times: the weak one's landings stray further from his own preview
  const stray = (v: number) => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const g = session(sk(v), ALL_EARNED, seed), tt = firstTurn(g), vi = { ...base(tt, club), shape: { curve: -1 as const, flight: 0 as const } };
      const pv = land(g.preview(1, vi).shot!), real = g.input(vi).find((m): m is ShotMsg => m.t === 'shot' && m.golfer === OWNER_3P)!;
      sum += Math.hypot(land(real)[0] - pv[0], land(real)[1] - pv[1]); n++;
    }
    return sum / n;
  };
  const weak = stray(0.15), strong = stray(0.95);
  assert.ok(weak > strong * 1.3, `a weak golfer strays more (${weak.toFixed(1)} m against ${strong.toFixed(1)} m)`);
});

test('the model: a wedge with full backspin from the fairway stops within 2 m of where it pitched; from the rough it runs on', () => {
  const g = sk(0.9), spin = { x: 0, y: -1, pump: 0 };
  const from = (p: Pt, lie: Lie) => shotOutcome(view, hole, p, lie, g, { club: 'sw', aim: { x: 300, y: 100 }, power: 1, spin, v: 3 }, () => 0.75);
  const fw = from({ x: 262, y: 100 }, 'fairway'), ro = from({ x: 262, y: 112 }, 'rough');
  const d = (o: typeof fw) => Math.hypot(o.landing!.rest.x - o.landing!.at.x, o.landing!.rest.y - o.landing!.at.y) * TILE_M;
  assert.equal(fw.landing!.lie, 'green', 'pitched on the green');
  assert.ok(d(fw) < 2, `from the fairway it stops ${d(fw).toFixed(2)} m from its pitch mark`);
  // (along the flight: + past the pitch mark, - spun back toward the golfer)
  const along = (o: typeof fw, p: Pt) => { const ux = o.landing!.at.x - p.x, uy = o.landing!.at.y - p.y, L = Math.hypot(ux, uy); return ((o.landing!.rest.x - o.landing!.at.x) * ux + (o.landing!.rest.y - o.landing!.at.y) * uy) / L * TILE_M; };
  const aF = along(fw, { x: 262, y: 100 }), aR = along(ro, { x: 262, y: 112 });
  assert.ok(aR > aF, `from the rough it runs further past its pitch mark (${aR.toFixed(2)} m against ${aF.toFixed(2)} m): the grass takes spin off`);
  // tour spin (clicks in the air, the Mid-Flight Whisper card) puts on enough to spin it back
  const tourSpin = shotOutcome(view, hole, { x: 262, y: 100 }, 'fairway', g, { club: 'sw', aim: { x: 300, y: 100 }, power: 1, spin: { x: 0, y: -1, pump: 4 }, v: 3 }, () => 0.75);
  assert.ok(along(tourSpin, { x: 262, y: 100 }) < 0, 'with tour spin it comes back past its pitch mark');
  void rng;
});
