// #1368 ("tapping the boost during the swing turns a drive into a 30-40 m duff"): the host side of a boosted drive in the view. The duff itself was the trailer
// robot letting go of Space after its taps, on the meter's way back down (the hold meter rises to 100% in 1 / speed seconds and falls back: 09-hud.md hostSwing);
// the model plays what the view sends. What the host owes the view, checked here through the `fly` protocol (#1336) as the view's HUD sends it:
// - a tapped boost (the HUD's numbers: the level times TAP_BOOST.plain) carries a drive farther than none, on the flight the view flew;
// - the stroke played at the landing is the flight that was flown, even when the wind has moved on since the strike (the wind is read in real time: engine
//   windNow; a drive is five seconds or more in the air). Before #1368 the landing re-read the wind, so the stroke came down a metre or more from where the
//   view had landed the ball. Both hosts: Play3p (a free hole, your round) and Match3p (a money match).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { TAP_BOOST, tapBoost } from '../src/game/golf/play';
import type { CourseView, GameSkills, Lie, PlayHole, Pt } from '../src/game/golf/play';
import type { HostMsg, ShotMsg, TurnMsg, ViewInput } from '../src/game/golf/play/protocol3p';
import type { WindNow } from '../src/game/golf/play/wind';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';
import { Match3p, OWNER_M3P } from '../src/game/golf/play/match3p';
import { opponentOf, startMatch } from '../src/game/golf/play/match';
import { ALL_EARNED } from '../src/game/golf/play/unlocks';

const centre: Pt = { x: 200, y: 120 };
/** a 300 m par 4 down a wide fairway: the driver from the tee */
const hole: PlayHole = { n: 1, par: 4, tee: { x: 40, y: 100 }, pin: { x: 190, y: 100 }, line: [{ x: 40, y: 100 }, { x: 190, y: 100 }] };
const view: CourseView = {
  holes: [hole],
  lieAt: (x, y): Lie => Math.hypot(x - 190, y - 100) <= 12 ? 'green' : Math.abs(y - 100) <= 60 && x >= 38 ? (x <= 42 && Math.abs(y - 100) < 2 ? 'tee' : 'fairway') : 'rough',
};
const sk: GameSkills = { driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3, accuracy: 0.3, touch: 0.3 };
/** the hold swing's outcome as the HUD sends it (09-hud.md hostSwing: power the meter's u, no accuracy click, v 3) */
const HOLD = (u: number, boost: number) => ({ power: u, acc: 0, boost, v: 3 });
const isTurn = (m: HostMsg): m is TurnMsg => m.t === 'turn';
const owner = (ms: readonly HostMsg[], id: number) => ms.find((m): m is ShotMsg => m.t === 'shot' && m.golfer === id)!;
const carryOf = (m: ShotMsg) => { const L = m.flight[m.flight.length - 1]!; return Math.hypot(L[0] - m.from[0], L[1] - m.from[1]) * TILE_M; };

/** a free-hole session whose wind the test moves (the engine's wind is read in real time) */
function freeHole(seed: number) {
  const w: { now: WindNow } = { now: { mph: 0, from: 0 } };
  const s = new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed, frame: centre, earned: ALL_EARNED, wind: () => w.now });
  return { s, w, t: s.start().find(isTurn)! };
}
/** the strike (`fly`) and the landing (the same input, its taps in the air), as the HUD sends them (hostStrike, hostAirLand) */
function drive(s: { input(vi: ViewInput): HostMsg[] }, t: TurnMsg, id: number, u: number, boost: number, between?: () => void) {
  const inp: ViewInput = { holeIdx: t.holeIdx, stroke: t.stroke, club: 'driver', aim: t.suggested.aim, power: u, swing: HOLD(u, boost) };
  const fl = owner(s.input({ fly: true, ...inp }), id);
  between?.();
  const st = owner(s.input({ ...inp, spin: { x: 0, y: 0, pump: 0, ax: 0, ay: 0 } }), id);
  return { fl, st };
}

test('#1368: the stroke at the landing is the flight that was flown, though the wind moved on while the ball was in the air (a free hole)', () => {
  const { s, w, t } = freeHole(11);
  w.now = { mph: 4, from: 0 };
  const { fl, st } = drive(s, t, OWNER_3P, 0.97, tapBoost(0.41, false), () => { w.now = { mph: 25, from: 90 }; });   // (a gust across the hole while it flies)
  assert.equal(fl.air, true, 'the strike is answered with its flight'); assert.ok(!st.air, 'the landing with the stroke');
  assert.deepEqual(st.flight, fl.flight, 'the stroke flies the flight the view flew');
  assert.deepEqual(s.inputs[0]!.env?.wind, { mph: 4, from: 0 }, 'and the save keeps the wind it was struck in, so a replay plays the same stroke');
});

test('#1368: a tapped boost carries a drive farther than none, on the flight the view flew, at the HUD\'s numbers', () => {
  // (the same stream for each: a fresh session on the same seed; the HUD's boost is the tap level times TAP_BOOST.plain, to the ten-thousandth)
  const carry = (boost: number, u = 0.97) => { const { s, t } = freeHole(23), { fl, st } = drive(s, t, OWNER_3P, u, boost); assert.deepEqual(st.flight, fl.flight); return carryOf(st); };
  const none = carry(0), some = carry(tapBoost(0.17, false)), half = carry(tapBoost(0.41, false)), full = carry(TAP_BOOST.plain);
  assert.ok(none > 150, `an unboosted drive at 97% is a drive (${none.toFixed(1)} m)`);
  assert.ok(some > none && half > some && full > half, `each more boost carries farther: ${[none, some, half, full].map(n => n.toFixed(1)).join(' < ')} m`);
  // what the issue saw: the same boost let go on the meter's way back down (u 0.15, the robot's release after its taps) is the duff, boosted or not
  const late = carry(tapBoost(0.41, false), 0.3), lateNone = carry(0, 0.3);
  assert.ok(late < none / 2, `a release at 30% on the falling meter is the duff (${late.toFixed(1)} m against ${none.toFixed(1)} m): the swing's power, not the boost`);
  assert.ok(late > lateNone, `and the boost still adds to it (${lateNone.toFixed(1)} < ${late.toFixed(1)} m)`);
});

test('#1368: a money match\'s landing is played in the wind the ball was struck in too', () => {
  const holes: PlayHole[] = Array.from({ length: 9 }, (_, h) => { const tee = { x: 0, y: 10 + 40 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: 4 as const, tee, pin, line: [tee, pin] }; });
  const mview: CourseView = { holes, lieAt: (x, y): Lie => { const h = holes[Math.max(0, Math.min(8, Math.round((y - 10) / 40)))]!; return Math.hypot(x - h.pin.x, y - h.pin.y) <= 8 ? 'green' : x < -5 ? 'out' : 'fairway'; } };
  const w: { now: WindNow } = { now: { mph: 3, from: 180 } };
  const r0 = startMatch(mview, holes.map((_, i) => i), 3, opponentOf('Mia Lopez', 14), 150, 2)!;
  const m = new Match3p({ view: mview, round: r0, skills: sk, sex: 'm', oppSex: 'w', seed: 7, frame: { x: 75, y: 170 }, wind: () => w.now });
  const t = m.start().filter(isTurn).pop()!;
  assert.ok(t, 'his turn');
  const { fl, st } = drive(m, t, OWNER_M3P, 0.97, tapBoost(0.41, false), () => { w.now = { mph: 25, from: 90 }; });
  assert.equal(fl.air, true); assert.ok(!st.air);
  assert.deepEqual(st.flight, fl.flight, 'the stroke flies the flight the view flew');
});
