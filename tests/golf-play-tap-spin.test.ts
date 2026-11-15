// #1336 (the owner, 2026-11-15: "the boost should work like in the tiger woods games where you spam a button ... Then you pick a direction on the arrow keys and
// spam it to induce side or back or front spin"): the tapped boost while the swing is held (swing.ts TAP_BOOST: each tap adds, the level drains all the time, the
// level at the release is played, every golfer's up to the plain cap, the Power Mash charge's up to BOOST.max, none on a putt) and the spin tapped in the air
// (spin.ts AIR: each arrow adds a step, the opposite takes one off, capped by the club and the lie, never moving the landing). Version 5 (live.ts MODEL_V): an
// input from before plays exactly as it did. The protocol (play3p.ts, `fly`): the strike is answered with the flight only, and the stroke is played from the
// input kept then and the taps sent at the landing; the save keeps the totals and replays the same shots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  AIR, BOOST, LiveGroup, MODEL_V, SPIN_BACK_CAP, TAP_BOOST, airEffect, airTaps, curveOf, playRound, readSpin, shotOutcome, spinEffect, tapAdd, tapBoost, tapDrain, tapLevel, teeTimes,
} from '../src/game/golf/play';
import type { CourseView, GameSkills, Lie, OwnerInput, PlayHole, Pt, SpinInput } from '../src/game/golf/play';
import type { ShotMsg, TurnMsg, ViewInput } from '../src/game/golf/play/protocol3p';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';
import { ALL_EARNED } from '../src/game/golf/play/unlocks';

const centre: Pt = { x: 200, y: 120 };
const hole: PlayHole = { n: 1, par: 4, tee: { x: 100, y: 100 }, pin: { x: 300, y: 100 }, line: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
/** a long fairway with a big green at the far end (the wedge shots land on it) */
const view: CourseView = {
  holes: [hole],
  lieAt: (x, y): Lie => Math.hypot(x - 300, y - 100) <= 30 ? 'green' : Math.abs(y - 100) <= 40 && x >= 98 ? (x <= 102 && Math.abs(y - 100) < 2 ? 'tee' : 'fairway') : 'rough',
};
const sk = (v: number, mech?: GameSkills['mech']): GameSkills => ({ driving: v, irons: v, short: v, putting: v, accuracy: v, touch: v, ...(mech ? { mech } : {}) });
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
const HOLD = (power: number, boost: number) => ({ power, acc: 0, boost, v: 3 });

// ---------------------------------------------------------------- the boost

test('tap boost: each tap adds TAP_BOOST.per, the level halves every TAP_BOOST.half seconds, and it follows how fast he taps', () => {
  assert.equal(tapLevel([], 1), 0, 'no tap: no boost');
  assert.ok(Math.abs(tapLevel([0], 0) - TAP_BOOST.per) < 1e-12, 'one tap');
  assert.ok(Math.abs(tapLevel([0], TAP_BOOST.half) - TAP_BOOST.per / 2) < 1e-12, 'half of it gone after the half-life');
  assert.ok(tapLevel([0], 5) < 0.001, 'gone when he stops');
  assert.equal(tapAdd(0.95), 1, 'never past full');
  assert.ok(Math.abs(tapDrain(0.8, 1.2) - 0.2) < 1e-12);
  const taps = (hz: number, secs: number) => Array.from({ length: Math.floor(hz * secs) }, (_, k) => k / hz);
  const fast = tapLevel(taps(9, 2), 2 - 1 / 9), slow = tapLevel(taps(2, 2), 2 - 1 / 2);
  assert.ok(fast > 0.9, `fast tapping nearly fills it (${fast.toFixed(2)})`);
  assert.ok(slow < 0.4, `slow tapping stays low (${slow.toFixed(2)})`);
  // the peak: just after a tap it is at its highest; let go a moment later and it has fallen
  const t9 = taps(9, 2), last = t9[t9.length - 1]!, peak = tapLevel(t9, last), later = tapLevel(t9, last + 0.4);
  assert.ok(peak > later + 0.2, `releasing at the peak plays more (${peak.toFixed(2)} against ${later.toFixed(2)})`);
  assert.equal(tapBoost(1, false), TAP_BOOST.plain, 'a full level plays the plain cap');
  assert.equal(tapBoost(1, true), BOOST.max, 'with a charge armed, BOOST.max');
  assert.equal(tapBoost(0.5, false), 0.02);
});

test('tap boost in the model (version 5): every golfer\'s hold swing plays it up to the plain cap, the card\'s up to BOOST.max; none on a putt', () => {
  const noCard = sk(0.6, []), card = sk(0.6, ['boost']), from = hole.tee, aim = { x: 230, y: 100 };
  const carry = (s: GameSkills, boost: number, v = MODEL_V) => {
    const o = shotOutcome(view, hole, from, 'tee', s, { club: 'iron7', aim, power: 1, swing: HOLD(1, boost), v }, () => 0.5);
    return { at: dist(from, o.landing!.at), boost: o.sw!.boost };
  };
  const none = carry(noCard, 0), plain = carry(noCard, TAP_BOOST.plain), over = carry(noCard, BOOST.max), full = carry(card, BOOST.max);
  assert.equal(plain.boost, TAP_BOOST.plain, 'no card: the plain cap is played'); assert.ok(plain.at > none.at + 1, `and it carries farther (${(plain.at - none.at).toFixed(1)} m)`);
  assert.equal(over.boost, TAP_BOOST.plain, 'no card: held to the plain cap');
  assert.equal(full.boost, BOOST.max, 'the card: all of it'); assert.ok(full.at > plain.at);
  // the old rule for an input from before version 5: no card, no boost
  assert.equal(carry(noCard, TAP_BOOST.plain, 4).boost, 0, 'version 4: no card, no boost');
  assert.equal(carry(card, BOOST.max, 4).boost, BOOST.max);
  // version 6 (the owner, 2026-11-15: "make it bigger"): the same saved boost carries TAP_BOOST.gain times as far as it did under version 5
  { const gain6 = plain.at - none.at, gain5 = carry(noCard, TAP_BOOST.plain, 5).at - carry(noCard, 0, 5).at;
    assert.equal(MODEL_V, 7); assert.ok(gain6 > gain5 * 2.4 && gain6 < gain5 * 5, `${TAP_BOOST.gain}x the power: well over twice the carry gain: v6 ${gain6.toFixed(1)} m, v5 ${gain5.toFixed(1)} m`); }
  // a putt takes none (a hold putt's power is its share of the way to the hole)
  const putt = shotOutcome(view, hole, { x: 290, y: 100 }, 'green', card, { club: 'putter', aim: hole.pin, power: 1, swing: HOLD(1, BOOST.max), v: MODEL_V }, () => 0.5);
  assert.equal(putt.sw!.boost, 0, 'no boost on a putt');
  // the 3-click meter's Space spam stays the card's
  const meter = shotOutcome(view, hole, from, 'tee', noCard, { club: 'iron7', aim, power: 1, swing: { power: 1, acc: 0, boost: 0.03, v: 2 }, v: MODEL_V }, () => 0.5);
  assert.equal(meter.sw!.boost, 0, 'the 3-click meter: no card, no boost');
});

// ---------------------------------------------------------------- the spin in the air

const AIRS = (ax: number, ay: number): SpinInput => ({ x: 0, y: 0, pump: 0, ax, ay });

test('air spin: each tap adds AIR.per that way, the opposite takes it off, and it never drains', () => {
  const back3 = airEffect(AIRS(0, -3), 'sw', 'fairway');
  assert.ok(Math.abs(back3.back - 3 * AIR.per) < 1e-12 && back3.top === 0 && back3.side === 0 && back3.air, 'three taps down: three steps of backspin');
  assert.ok(Math.abs(airEffect(AIRS(0, 2), 'sw', 'fairway').top - 2 * AIR.per) < 1e-12, 'up: topspin');
  assert.ok(Math.abs(airEffect(AIRS(-4, 0), 'sw', 'fairway').side + 4 * AIR.per) < 1e-12, 'left: a draw\'s side spin');
  assert.ok(Math.abs(airEffect(AIRS(4, 0), 'sw', 'fairway').side - 4 * AIR.per) < 1e-12, 'right: a fade\'s');
  // the opposite key takes taps off: three down then two up is one down; three down and three up is none
  assert.ok(Math.abs(airEffect(AIRS(0, -3 + 2), 'sw', 'fairway').back - AIR.per) < 1e-12);
  assert.equal(airEffect(AIRS(0, 0), 'sw', 'fairway').amount, 0);
  // the save keeps whole net taps, at most AIR.max either way
  assert.deepEqual(readSpin({ x: 0, y: 0, pump: 0, ax: 2.4, ay: -99 }), { x: 0, y: 0, pump: 0, ax: 2, ay: -AIR.max });
  assert.deepEqual(readSpin({ x: 0, y: 0, pump: 0 }), { x: 0, y: 0, pump: 0 }, 'no taps: the old spin');
  // spinEffect reads the taps (the dot plays no part once they are there), and the flight never curves with them
  const e = spinEffect({ x: -1, y: 0, pump: 0, ax: 5, ay: 0 }, 'iron7', 'fairway');
  assert.ok(e.air && e.side > 0, 'the taps win over the dot');
  assert.equal(curveOf(e, 150), 0, 'no curve in the flight');
});

test('air spin caps: the club (a driver takes little backspin), the lie (the rough cuts it), and the card (AIR.plain of it without the Mid-Flight Whisper)', () => {
  assert.equal(airEffect(AIRS(0, -15), 'sw', 'fairway').back, 1, 'a wedge: full backspin');
  assert.equal(airEffect(AIRS(0, -15), 'driver', 'fairway').back, SPIN_BACK_CAP.driver, 'a driver: little');
  assert.ok(airEffect(AIRS(0, -15), 'sw', 'rough').back < 0.5, 'the rough cuts it');
  assert.equal(airEffect(AIRS(0, -15), 'sw', 'fairway', undefined, 1, AIR.plain).back, AIR.plain, 'no card: AIR.plain of the cap');
  assert.equal(airEffect(AIRS(0, -15), 'putter', 'green').amount, 0, 'the putter takes none');
  // the taps that still add spin each way (the view holds its counts to them)
  assert.deepEqual(airTaps('sw', 'fairway'), { side: 13, top: 13, back: 13 });
  assert.deepEqual(airTaps('sw', 'fairway', undefined, 1, AIR.plain), { side: 8, top: 8, back: 8 });
  assert.equal(airTaps('driver', 'fairway', undefined, 1, AIR.plain).back, 1, 'a small cap still takes one tap');
  assert.deepEqual(airTaps('putter', 'green'), { side: 0, top: 0, back: 0 });
});

test('air spin in the model: the landing never moves with the taps; backspin checks on the green, topspin runs out, side spin kicks', () => {
  const s = sk(0.8, ['airspin']), from = { x: 255, y: 100 };
  const shot = (sp: SpinInput | undefined) => shotOutcome(view, hole, from, 'fairway', s, { club: 'sw', aim: { x: 300, y: 100 }, power: 1, v: MODEL_V, ...(sp ? { spin: sp } : {}) }, () => 0.5);
  const none = shot(undefined), back = shot(AIRS(0, -13)), top = shot(AIRS(0, 13)), left = shot(AIRS(-10, 0)), right = shot(AIRS(10, 0));
  for (const o of [back, top, left, right]) assert.deepEqual(o.landing!.at, none.landing!.at, 'the same landing');
  assert.equal(none.landing!.lie, 'green');
  const run = (o: typeof none) => (o.landing!.rest.x - o.landing!.at.x) * TILE_M;
  assert.ok(run(back) < 0, `full backspin spins back (${run(back).toFixed(1)} m)`);
  assert.ok(run(top) > run(none) + 0.5, `topspin runs out (${run(top).toFixed(1)} against ${run(none).toFixed(1)} m)`);
  assert.ok(left.landing!.rest.y < none.landing!.rest.y && right.landing!.rest.y > none.landing!.rest.y, 'side spin kicks the bounce its way');
  assert.deepEqual(back.spin, { x: 0, y: 0, pump: 0, ax: 0, ay: -13 }, 'the read the save keeps: the totals');
});

test('version gate: an input from before version 5 plays exactly as it did, taps in the air dropped', () => {
  const s = sk(0.7, []), from = { x: 220, y: 100 };
  const play = (inp: Omit<OwnerInput, 'holeIdx' | 'stroke'>) => JSON.stringify(shotOutcome(view, hole, from, 'fairway', s, inp, () => 0.4));
  const old = { club: 'sw' as const, aim: { x: 290, y: 100 }, power: 1, v: 4, spin: { x: 0.3, y: -0.8, pump: 0 }, swing: HOLD(0.9, 0.03) };
  const a = JSON.parse(play(old)), b = JSON.parse(play({ ...old, spin: { ...old.spin, ax: 6, ay: -9 } }));
  assert.deepEqual(b.to, a.to); assert.deepEqual(b.landing, a.landing); assert.deepEqual(b.spin, a.spin, 'the taps are not read');
  assert.equal(a.sw.boost, 0, 'and the boost without the card is none, as before');
});

// ---------------------------------------------------------------- the protocol

const session = (skills: GameSkills, seed = 5) => new Play3p({ view, holes: [0], skills, sex: 'm', seed, frame: centre, earned: { ...ALL_EARNED, charges: 1 } });
const firstTurn = (s: Play3p) => s.start().find((m): m is TurnMsg => m.t === 'turn')!;
const mine = (ms: readonly { t: string }[]) => ms.find((m): m is ShotMsg => m.t === 'shot' && (m as ShotMsg).golfer === OWNER_3P)!;

test('protocol: a strike with fly is answered with its flight only; the input at the landing plays it with the taps, on the same flight; the save replays it', () => {
  const g = sk(0.7, ['airspin']), s = session(g), t = firstTurn(s);
  const strike: ViewInput = { holeIdx: t.holeIdx, stroke: t.stroke, club: 'iron5', aim: t.suggested.aim, power: 1, swing: HOLD(0.95, 0.03), fly: true };
  assert.ok(t.clubs.every(c => c.club === 'putter' || (c.air && c.air.back >= 1 && c.air.top >= 1)), 'the turn sends the taps each club takes');
  const a = s.input(strike);
  assert.equal(a.length, 1); const fl = a[0] as ShotMsg;
  assert.equal(fl.t, 'shot'); assert.equal(fl.air, true); assert.equal(fl.roll.length, 0); assert.equal(fl.bounces.length, 0);
  assert.deepEqual(fl.rest, [fl.flight[fl.flight.length - 1]![0], fl.flight[fl.flight.length - 1]![1]], 'the rest is the landing');
  assert.equal(s.inputs.length, 0, 'nothing played yet');
  // the landing: the same input with the taps (and a different swing, which is not read: the flight is the first's)
  const b = s.input({ ...strike, fly: undefined, swing: HOLD(0.3, 0), spin: { x: 0, y: 0, pump: 0, ax: -2, ay: 3 } });
  const m = mine(b);
  assert.ok(m && !m.air, 'the stroke'); assert.deepEqual(m.flight, fl.flight, 'on the same flight');
  assert.ok(b.some(x => x.t === 'turn'), 'and the next turn');
  assert.equal(s.inputs.length, 1); const saved = s.inputs[0]!;
  assert.deepEqual(saved.spin, { x: 0, y: 0, pump: 0, ax: -2, ay: 3 }, 'the save keeps the totals'); assert.equal(saved.swing!.power, 0.95, 'and the strike\'s swing');
  assert.equal(saved.v, MODEL_V);
  // the save replays the same stroke
  const golfer = { id: OWNER_3P, name: 'You', sex: 'm' as const, pro: false, look: 0, owner: true, skill: 0.7, skills: g };
  const groups = teeTimes([golfer], 5), plan = playRound(view, [golfer], groups, 5, { live: 0 }), lg = new LiveGroup(plan, view, 0, 5);
  lg.replay([saved]);
  const again = plan.shots.find(x => x.golfer === OWNER_3P)!, first = s.plan.shots.find(x => x.golfer === OWNER_3P)!;
  assert.deepEqual(again.to, first.to); assert.deepEqual(again.landing, first.landing);
});

test('protocol: an input for another stroke drops the kept flight; the next input then plays at once', () => {
  const s = session(sk(0.7)), t = firstTurn(s);
  const strike: ViewInput = { holeIdx: t.holeIdx, stroke: t.stroke, club: 'iron5', aim: t.suggested.aim, power: 1, swing: HOLD(0.95, 0), fly: true };
  s.input(strike);
  const wrong = s.input({ ...strike, fly: undefined, stroke: t.stroke + 1 });
  assert.equal(wrong[0]!.t, 'turn', 'the turn again'); assert.equal(s.inputs.length, 0);
  const b = s.input({ ...strike, fly: undefined, spin: { x: 0, y: 0, pump: 0, ax: 0, ay: -1 } });
  assert.ok(mine(b) && !mine(b).air, 'played from the landing input once the kept one is gone (no flight was kept)');
});
