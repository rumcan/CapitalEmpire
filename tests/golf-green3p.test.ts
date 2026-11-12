// T423: the green in the view from behind the golfer (play/green3p.ts, play3p.ts): a 3 m putt across a 4% slope, aimed along the host's read (its start
// line), holes out in the model far more often than one aimed straight at the cup, which misses by the break; the grid is the host's slope; a gimme is
// played as a conceded putt only within the round's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import { toView, type HoleEndMsg, type ShotMsg, type TurnMsg, type ViewPt } from '../src/game/golf/play/protocol3p';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';

const centre: Pt = { x: 100, y: 100 };
const pin = { x: 101.5, y: 100 };
const holeAt = (tee: Pt): PlayHole => ({ n: 1, par: 3, tee, pin, line: [tee, pin] });
const viewOf = (h: PlayHole): CourseView => ({ holes: [h], lieAt: (x, y): Lie => Math.hypot(x - pin.x, y - pin.y) <= 8 ? 'green' : 'rough' });
const height = (_x: number, y: number) => 0.04 * 2 * y;   // (4% across the putt: the ground rises to the south, so the ball falls north, to the left)
const sk: GameSkills = { driving: 0.8, irons: 0.8, short: 0.8, putting: 0.8 };
const session = (tee: Pt, seed: number, gimmeM = 0.6) => { const h = holeAt(tee); return new Play3p({ view: viewOf(h), holes: [0], skills: sk, sex: 'm', seed, frame: centre, height, gimmeM }); };
const turnOf = (s: Play3p) => s.start().find((m): m is TurnMsg => m.t === 'turn')!;
const turnPt = (ball: ViewPt, to: ViewPt, deg: number): ViewPt => { const a = deg * Math.PI / 180, dx = to[0] - ball[0], dy = to[1] - ball[1]; return [ball[0] + dx * Math.cos(a) - dy * Math.sin(a), ball[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };

test('green3p: the turn on the green carries the host\'s slope grid, the read and the holed way; the way starts off the pin\'s line, uphill of it', () => {
  const t = turnOf(session({ x: 100, y: 100 }, 1));
  assert.ok(t.green, 'the green is sent'); const g = t.green!;
  assert.ok(g.pts.length >= 5 * 20, 'a grid of points'); assert.ok(/breaks/.test(g.read), g.read);
  const fall = g.pts.filter((_, k) => k % 5 === 3), slope = g.pts.filter((_, k) => k % 5 === 4);
  assert.ok(fall.every(v => v < -0.9) && slope.every(v => Math.abs(v - 0.04) < 0.002), 'downhill is north (-y), 4%');
  assert.ok(Math.abs(g.startDeg) > 1, `the way starts off the line (${g.startDeg.toFixed(2)} deg)`);
  assert.ok(g.startDeg > 0, 'the start is to the right of the pin (uphill, south), so it falls back left into the cup');
  const end = g.path[g.path.length - 1]!, cup = toView(pin, centre); assert.ok(Math.hypot(end[0] - cup[0], end[1] - cup[1]) < 1e-6, 'the way ends in the cup');
});

test('green3p: a 3 m breaking putt aimed by the read holes out in the model; aimed at the cup it misses by the break', () => {
  let byRead = 0, atCup = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const read of [true, false]) {
      const s = session({ x: 100, y: 100 }, seed), t = turnOf(s), cup = t.pin, aim = read ? turnPt(t.ball, cup, t.green!.startDeg) : cup;
      const ms = s.input({ holeIdx: t.holeIdx, stroke: t.stroke, club: 'putter', aim, power: 1 });
      const mine = ms.find((m): m is ShotMsg => m.t === 'shot' && m.golfer === OWNER_3P)!;
      if (mine.holed) { if (read) byRead++; else atCup++; }
    }
  }
  assert.ok(byRead >= 20, `aimed along the read, ${byRead} of 30 drop`);
  assert.equal(atCup, 0, `aimed at the cup, ${atCup} of 30 drop`);
});

test('green3p: a gimme inside the rule is a conceded putt; outside it, or with none allowed, the turn comes again', () => {
  const s = session({ x: 101.3, y: 100 }, 2), t = turnOf(s);
  assert.equal(t.gimmeM, 0.6);
  const ms = s.gimme(t.holeIdx, t.stroke), shot = ms.find((m): m is ShotMsg => m.t === 'shot')!, end = ms.find((m): m is HoleEndMsg => m.t === 'holeEnd')!;
  assert.ok(shot.holed && end && end.strokes === 1, 'holed in one stroke');
  assert.equal(s.inputs[0]!.gim, true, 'kept as a gimme');
  const far = session({ x: 100, y: 100 }, 2), tf = turnOf(far), again = far.gimme(tf.holeIdx, tf.stroke);
  assert.equal(again.length, 1); assert.equal(again[0]!.t, 'turn'); assert.equal(far.inputs.length, 0, '3 m is not a gimme');
  const none = session({ x: 101.3, y: 100 }, 2, 0), tn = turnOf(none);
  assert.equal(tn.gimmeM, undefined); assert.equal(none.gimme(tn.holeIdx, tn.stroke)[0]!.t, 'turn', 'no gimmes in a match');
});
