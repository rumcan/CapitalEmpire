// T316 (#902): the 3-click swing meter (src/game/golf/play/swing.ts) and its shots (live.ts OwnerInput.swing): click times to power and accuracy, the
// miss's side and shape, the skill's slower marker and wider sweet spot, the automatic turns at the arc's ends, the key-spam boost and its cap, the
// overswing, a saved outcome read back, and the replay of saved outcomes on the synthetic course of golf-play-live.test.ts.
// T345 (#987): the sweet spot is a window in time (SWEET seconds, whatever the marker's speed), scaled by the skill, the accuracy stat and the clubs' and cards' `sweet`; the miss is read from the click's time
// error; a person can hit it (the scripted golfers of tests/helpers/swing-bot.ts); and an outcome saved before it (no `v`) is read against the first meter's sweet spot, exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { BOOST, HOLD_V, LiveGroup, METER, METER_TIME, METER_V, SWEET, SWEET_V1, SwingMeter, applyMods, boostOf, clickError, kitOf, makeField, markerSpeed, meterMark, playRound, readSwing, rng, shotOutcome, shotReport, swingEffect, sweetSeconds, sweetSpot, sweetSpotV1, swingTime, teeTimes } from '../src/game/golf/play';
import type { CourseView, GameSkills, Lie, OwnerInput, OwnerTurn, PlayHole, Pt, Shot, SwingOutcome } from '../src/game/golf/play';
import { HUMANS, botSwing } from './helpers/swing-bot';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
/** a swing outcome from the meter of T345 (what the game writes: the window in time) */
const v2 = (o: Omit<SwingOutcome, 'v'>): SwingOutcome => ({ ...o, v: METER_V });

/** a swing at skill s: click 1 at 0, click 2 at t2, click 3 at t3 (s), with Space presses at the given times */
function swing(s: number, t2: number, t3: number, presses: number[] = []): SwingMeter {
  const m = new SwingMeter(s);
  m.click(0);
  for (const p of presses.filter(p => p < t2)) m.press(p);
  m.click(t2);
  for (const p of presses.filter(p => p >= t2)) m.press(p);
  m.click(t3);
  return m;
}

test('swing: click 2 sets the power where the marker is (100% after swingTime), click 3 the accuracy on the way back at the same speed', () => {
  const s = 0.4, T = swingTime(s);
  near(T, METER_TIME[0] + (METER_TIME[1] - METER_TIME[0]) * s);
  const m = swing(s, T, 2 * T);
  assert.equal(m.phase, 'done');
  const o = m.outcome()!;
  near(o.power, 1, 1e-9); near(o.acc, 0, 1e-9); assert.equal(o.boost, 0);
  // a half swing: the marker turns at click 2 and is back at the snap line after as long again
  const h = swing(s, T / 2, T).outcome()!;
  near(h.power, 0.5); near(h.acc, 0);
  // the marker's position mid-swing
  const live = new SwingMeter(s); live.click(10);
  near(live.pos(10 + T / 4), 0.25); live.click(10 + T / 2); near(live.pos(10 + T / 2 + T / 4), 0.25);
});

test('swing: a better golfer gets a slower marker and a wider sweet spot (in time: the window grows from 80 to 190 ms), and the meter is never tighter than the first one was', () => {
  assert.ok(swingTime(0.9) > swingTime(0.3));
  assert.ok(sweetSeconds(0.9) > sweetSeconds(0.3) && sweetSeconds(0.3) > sweetSeconds(0.1));
  near(2 * sweetSeconds(0), SWEET[0]); near(2 * sweetSeconds(1), SWEET[1]); near(SWEET[0], 0.08); near(SWEET[1], 0.19);
  // the coordinator's rule (T345): the top end is never tighter than the first meter's (95 ms against 91 either side at skill 1), nor is any skill's between: the ticket is about making the meter hittable, not harder
  for (let s = 0; s <= 1.0001; s += 0.05) assert.ok(sweetSeconds(s) >= sweetSpotV1(s) / markerSpeed(s), `skill ${s.toFixed(2)}: ${(1000 * sweetSeconds(s)).toFixed(1)} ms against the first meter's ${(1000 * sweetSpotV1(s) / markerSpeed(s)).toFixed(1)}`);
  assert.ok(sweetSeconds(1) > sweetSpotV1(1) / markerSpeed(1) && sweetSeconds(1) >= 0.095 - 1e-12);
  // a click 60 ms early is inside the good golfer's window (+-90 ms at skill 0.9) and a miss for a beginner's (+-46 ms at skill 0.1), whatever the marker's speed
  for (const sp of [0.85, 1, 1.15]) {
    const o = v2({ power: 1, acc: 0.06 * markerSpeed(0.9, sp), boost: 0 }), o2 = v2({ power: 1, acc: 0.06 * markerSpeed(0.1, sp), boost: 0 });
    assert.equal(swingEffect(o, 0.9, false, 1, 1, sp).shape, 'straight', `speed ${sp}`);
    assert.notEqual(swingEffect(o2, 0.1, false, 1, 1, sp).shape, 'straight', `speed ${sp}`);
  }
});

test('swing: early on the way back misses left (pull, then hook), late misses right (push, then slice), scaled by the offset; putts pull and push', () => {
  const s = 0.4, w = sweetSpot(s);
  const st = swingEffect(v2({ power: 1, acc: w * 0.9, boost: 0 }), s, false);
  assert.equal(st.shape, 'straight'); assert.equal(st.deg, 0);
  const pull = swingEffect(v2({ power: 1, acc: w + 0.02, boost: 0 }), s, false), hook = swingEffect(v2({ power: 1, acc: w + 0.12, boost: 0 }), s, false);
  const push = swingEffect(v2({ power: 1, acc: -(w + 0.02), boost: 0 }), s, false), slice = swingEffect(v2({ power: 1, acc: -(w + 0.12), boost: 0 }), s, false);
  assert.equal(pull.shape, 'pull'); assert.ok(pull.deg < 0);
  assert.equal(hook.shape, 'hook'); assert.ok(hook.deg < pull.deg, 'a bigger offset misses further');
  assert.equal(push.shape, 'push'); assert.ok(push.deg > 0);
  assert.equal(slice.shape, 'slice'); assert.ok(slice.deg > push.deg);
  assert.ok(hook.roll > 1 && slice.carry < 1, 'a hook runs on, a slice carries short');
  // the worst miss is capped
  assert.ok(Math.abs(swingEffect(v2({ power: 1, acc: METER.low, boost: 0 }), 0, false).deg) <= 18);
  // a putt: the same side, a smaller scale, no hooks on a green
  const pp = swingEffect(v2({ power: 1, acc: w + 0.12, boost: 0 }), s, true);
  assert.equal(pp.shape, 'pull'); assert.ok(pp.deg < 0 && Math.abs(pp.deg) < Math.abs(hook.deg));
  // the meter's timing: click 3 a little early is an early (left) miss
  const T = swingTime(s), e = swing(s, T, 2 * T - 0.15 * T).outcome()!;
  near(e.acc, 0.15, 1e-9); assert.ok(swingEffect(e, s, false).deg < 0);
});

test('T345: the sweet spot is a window in time: its width in seconds is the skill’s (80 ms to 190 ms), the same at any marker speed, scaled by the kit’s sweet factor and narrowed by the boost; its width on the arc follows the marker', () => {
  for (const s of [0, 0.3, 0.7, 1]) {
    const want = 0.5 * (SWEET[0] + (SWEET[1] - SWEET[0]) * s);
    near(sweetSeconds(s), want);
    for (const sp of [0.7, 0.85, 1, 1.15, 1.4]) {
      // the half width on the arc is the half window in seconds times the marker's speed; read back in time it is the window, whatever the speed
      near(sweetSpot(s, 0, 1, sp), want * markerSpeed(s, sp)); near(clickError(sweetSpot(s, 0, 1, sp), s, sp), want, 1e-12);
      // the edge of the window: just inside is straight, just outside a pull (early) or a push (late), by the same time error at every speed
      const edge = (dt: number) => swingEffect(v2({ power: 1, acc: dt * markerSpeed(s, sp), boost: 0 }), s, false, 1, 1, sp);
      assert.equal(edge(want * 0.98).shape, 'straight'); assert.equal(edge(-want * 0.98).shape, 'straight');
      assert.equal(edge(want * 1.05).shape, 'pull'); assert.equal(edge(-want * 1.05).shape, 'push');
    }
  }
  // the sweet factor (the accuracy stat, the bag and the cards through applyMods) scales the window; the boost narrows it by up to BOOST.narrow
  near(sweetSeconds(0.3, 0, 1.4), 1.4 * sweetSeconds(0.3)); near(sweetSeconds(0.3, 0, 0.6), 0.6 * sweetSeconds(0.3));
  near(sweetSeconds(0.3, BOOST.max), (1 - BOOST.narrow) * sweetSeconds(0.3)); near(sweetSeconds(0.3, BOOST.max / 2), (1 - BOOST.narrow / 2) * sweetSeconds(0.3));
  // through the kit: a golfer at 100 accuracy has a 40% wider window and a 15% slower marker (so its arc is 1.4 x 0.85 = 1.19 as wide); at 0 accuracy a 40% narrower one on a 15% faster marker
  const sk = (a: number): GameSkills => ({ driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3, accuracy: a });
  const hi = applyMods(sk(1), 'iron6'), lo = applyMods(sk(0), 'iron6'), mid = applyMods(sk(0.5), 'iron6');
  near(sweetSeconds(mid.skill, 0, hi.sweet) / sweetSeconds(mid.skill, 0, mid.sweet), 1.4); near(sweetSeconds(mid.skill, 0, lo.sweet) / sweetSeconds(mid.skill, 0, mid.sweet), 0.6);
  near(sweetSpot(mid.skill, 0, hi.sweet, hi.speed) / sweetSpot(mid.skill, 0, mid.sweet, mid.speed), 1.4 * 0.85, 1e-9);
  // the first meter's sweet spot was a width on the arc: 33 ms either side at the starting skill (0.3), 18 ms at skill 0, 91 ms at skill 1, and the beginner’s marker the fastest
  near(SWEET_V1[0], 0.025); near(SWEET_V1[1], 0.07);
  near(sweetSpotV1(0.3) / markerSpeed(0.3), 0.0385 / 1.1364, 1e-3); assert.ok(sweetSpotV1(0) / markerSpeed(0) < 0.019 && sweetSpotV1(1) / markerSpeed(1) > 0.09);
  assert.ok(sweetSeconds(0.3) > 1.4 * sweetSpotV1(0.3) / markerSpeed(0.3), 'the starting skill’s window is half as wide again');
});

test('T345: the miss stays degrees per meter unit, read from the click’s time error past the window (a slower marker misses less for the same error, a window scaled by the kit moves the edge)', () => {
  const s = 0.3, w = sweetSeconds(s);
  for (const sp of [0.85, 1, 1.15]) {
    const sk = markerSpeed(s, sp);
    // 80 ms late: past the window by (0.08 - w) s, which is (0.08 - w) x the marker's speed meter units, at MISS.fullDeg (90) degrees a unit
    const e = swingEffect(v2({ power: 1, acc: -0.08 * sk, boost: 0 }), s, false, 1, 1, sp);
    near(e.deg, 90 * (0.08 - w) * sk, 1e-9); assert.equal(e.shape, 'push');
  }
  // 120 ms late is a slice (5 degrees or more); the same time error with the accuracy stat's slower marker and wider window is a smaller miss in degrees (and its wider window a smaller error past it)
  const a = swingEffect(v2({ power: 1, acc: -0.12 * markerSpeed(s, 1), boost: 0 }), s, false, 1, 1, 1), b = swingEffect(v2({ power: 1, acc: -0.12 * markerSpeed(s, 0.85), boost: 0 }), s, false, 1.4, 1, 0.85);
  assert.equal(a.shape, 'slice'); assert.ok(Math.abs(b.deg) < Math.abs(a.deg) * 0.6, `${b.deg.toFixed(1)} against ${a.deg.toFixed(1)} degrees`);
  // a big miss is a hook or a slice from 5 degrees, and the worst is capped at 18 (a putt 30 degrees a unit, at most 8), as before
  const big = swingEffect(v2({ power: 1, acc: 0.2 * markerSpeed(s), boost: 0 }), s, false), putt = swingEffect(v2({ power: 1, acc: 0.2 * markerSpeed(s), boost: 0 }), s, true);
  assert.equal(big.shape, 'hook'); assert.ok(Math.abs(big.deg) <= 18 && Math.abs(putt.deg) <= 8 && putt.shape === 'pull');
});

test('T345: a person can hit it: the scripted golfers (a club golfer 60 ms of spread and 20 ms late, a novice 90 and 30, a sharp one 35 and 10) swing straight far more often than on the first meter, at any marker speed', () => {
  // the share of straight swings of a person at a skill on a meter (1: the first, 2: the window in time) with the stats' marker speed; the same clicks for every meter and speed (one stream), so the shares compare exactly
  const share = (h: typeof HUMANS.club, skill: number, meter: number, speed = 1, n = 8000): number => {
    const r = rng(345, Math.round(skill * 100), 7); let k = 0;
    for (let i = 0; i < n; i++) if (swingEffect(botSwing(r, h, skill, 1, false, 0, speed, meter), skill, false, 1, 1, speed).shape === 'straight') k++;
    return k / n;
  };
  // the first meter let a club golfer at the starting skill (0.3) swing straight about 4 times in 10 and a novice (skill 0.1) 2 in 10
  const club1 = share(HUMANS.club, 0.3, 1), nov1 = share(HUMANS.novice, 0.1, 1), sharp1 = share(HUMANS.sharp, 0.5, 1);
  const club2 = share(HUMANS.club, 0.3, 2), nov2 = share(HUMANS.novice, 0.1, 2), sharp2 = share(HUMANS.sharp, 0.5, 2);
  assert.ok(club1 > 0.37 && club1 < 0.44 && nov1 > 0.15 && nov1 < 0.23, `the first meter: club ${club1.toFixed(2)}, novice ${nov1.toFixed(2)}`);
  assert.ok(club2 >= 0.60 && club2 <= 0.66, `club golfer ${club2.toFixed(2)}`); assert.ok(nov2 >= 0.34 && nov2 <= 0.40, `novice ${nov2.toFixed(2)}`); assert.ok(sharp2 >= 0.92 && sharp2 <= 0.95, `sharp ${sharp2.toFixed(2)}`);
  assert.ok(club2 > club1 + 0.12 && nov2 > nov1 + 0.12 && sharp2 > sharp1 + 0.04, 'a window a person can hit');
  // a faster or slower marker does not change how hard it is to hit (the accuracy stat's +-15%): the same clicks in time are the same shares; on the first meter a faster marker was harder
  for (const sp of [0.85, 1.15]) assert.ok(Math.abs(share(HUMANS.club, 0.3, 2, sp) - club2) < 0.002, `speed ${sp}: ${share(HUMANS.club, 0.3, 2, sp).toFixed(3)} against ${club2.toFixed(3)}`);
  assert.ok(share(HUMANS.club, 0.3, 1, 1.15) < share(HUMANS.club, 0.3, 1, 0.85) - 0.03, 'the first meter was harder with a faster marker');
  // the beginner no longer has the narrowest spot by far: a club golfer at skill 0 swings straight about as often as the starting skill did on the first meter, and the better golfer more often
  const c0 = share(HUMANS.club, 0, 2), c1 = share(HUMANS.club, 1, 2);
  assert.ok(c0 > 0.42 && c1 > c0 + 0.1, `skill 0 ${c0.toFixed(2)}, skill 1 ${c1.toFixed(2)}`);
  // and no skill is worse off than on the first meter (the top end was the one a 150 ms top made tighter)
  for (const [h, s] of [[HUMANS.novice, 0.1], [HUMANS.club, 0.3], [HUMANS.club, 1], [HUMANS.sharp, 0.5], [HUMANS.sharp, 1]] as const) assert.ok(share(h, s, 2) >= share(h, s, 1), `skill ${s}: ${share(h, s, 2).toFixed(3)} against ${share(h, s, 1).toFixed(3)}`);
});

test('T345: an outcome saved before it (no `v`) is read against the first meter’s sweet spot, exactly as it was (a reference of the T316 formula over a grid), and the new meter’s outcome carries its version', () => {
  // the first meter, as it was: the half width SWEET_V1 by skill, narrowed by the boost, times sweet; the offset past it is the miss, 90 degrees a unit at most 18 (a putt 30, at most 8)
  const ref = (o: { power: number; acc: number; boost: number }, skill: number, putting: boolean, sweet: number, miss: number) => {
    const boost = Math.min(BOOST.max, Math.max(0, o.boost)), acc = Math.min(METER.top, Math.max(METER.low, o.acc)), w = (0.025 + (0.07 - 0.025) * Math.min(1, Math.max(0, skill))) * (1 - 0.4 * boost / BOOST.max) * sweet;
    const off = Math.abs(acc) <= w ? 0 : (Math.abs(acc) - w) * Math.sign(acc), deg0 = off === 0 ? 0 : -Math.sign(off) * Math.min(putting ? 8 : 18, Math.abs(off) * (putting ? 30 : 90));
    return deg0 * miss;
  };
  let n = 0;
  for (const skill of [0, 0.15, 0.3, 0.5, 0.8, 1]) for (const acc of [-0.2, -0.1, -0.05, -0.03, -0.01, 0, 0.01, 0.03, 0.05, 0.09, 0.2, 1]) for (const boost of [0, 0.03, BOOST.max]) for (const putting of [false, true]) for (const [sweet, miss] of [[1, 1], [1.4, 1], [0.6, 0.5]] as const) {
    const o = { power: 1, acc, boost }, e = swingEffect(o, skill, putting, sweet, miss, 1.15);
    assert.equal(e.deg, ref(o, skill, putting, sweet, miss), `skill ${skill} acc ${acc} boost ${boost}`); n++;
    // (the stats' marker speed is no part of the first meter: its sweet spot is a width on the arc)
    assert.equal(swingEffect(o, skill, putting, sweet, miss).deg, e.deg);
  }
  assert.equal(n, 6 * 12 * 3 * 2 * 3);
  // the meter writes its version, and a save keeps it (a number that is not the new meter's is the first meter's)
  const m = swing(0.4, 0.5, 1); assert.equal(m.outcome()!.v, METER_V);
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02, v: METER_V }), { power: 0.8, acc: -0.03, boost: 0.02, v: METER_V });
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02, v: 1 }), { power: 0.8, acc: -0.03, boost: 0.02 });
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02, v: 'x' }), { power: 0.8, acc: -0.03, boost: 0.02 });
  // an acc between the two meters' widths: a pull on the first and straight on the new one (at skill 0.3: 0.0385 against 0.057)
  const mid = { power: 1, acc: 0.05, boost: 0 };
  assert.equal(swingEffect(mid, 0.3, false).shape, 'pull'); assert.equal(swingEffect({ ...mid, v: METER_V }, 0.3, false).shape, 'straight');
});

test('T345: a saved input replays the meter it was swung on: an input from before (no `v`) plays as it did, one from the new meter keeps its version through a save and replays to the same round', () => {
  const seed = 11;
  // the shot model's own read of an outcome between the two widths: the first meter pulls the ball, the new one goes straight (the same input otherwise; the kit is the plain skill)
  const view = course(), hole = view.holes[1]!, from = { x: hole.tee.x, y: hole.tee.y }, aim = { x: hole.tee.x + 60, y: hole.tee.y }, mk = (swing: SwingOutcome): Omit<OwnerInput, 'holeIdx' | 'stroke'> => ({ club: 'iron6', aim, power: 1, swing });
  const click = { power: 1, acc: 0.05, boost: 0 };
  const a = shotOutcome(view, hole, from, 'fairway', 0.3, mk(click), rng(3, 1, 1)), b = shotOutcome(view, hole, from, 'fairway', 0.3, mk({ ...click, v: METER_V }), rng(3, 1, 1)), c = shotOutcome(view, hole, from, 'fairway', 0.3, mk({ ...click, acc: 0 }), rng(3, 1, 1));
  assert.notDeepEqual(a.landing!.at, b.landing!.at, 'the first meter pulled it'); assert.deepEqual(b.landing!.at, c.landing!.at, 'the new one is straight, as a click on the line');
  assert.equal(a.sw!.v, undefined); assert.equal(b.sw!.v, METER_V);
  // a live group with both kinds of input: the versions are kept in the saved inputs, and a replay through JSON plays the same round
  const { lg, view: v, f, gs, gi } = live(seed);
  let k = 0, t: OwnerTurn | null; const outs: SwingOutcome[] = [{ power: 1, acc: 0.05, boost: 0 }, { power: 1, acc: 0.05, boost: 0, v: METER_V }, { power: 0.9, acc: -0.07, boost: 0.02, v: METER_V }, { power: 1, acc: -0.04, boost: 0 }];
  while ((t = lg.advance()) && k < 16) { lg.play(swung(t, outs[k % outs.length]!)); k++; }
  assert.deepEqual(lg.inputs.map(i => i.swing!.v), Array.from({ length: k }, (_, j) => outs[j % outs.length]!.v));
  const saved = JSON.parse(JSON.stringify(lg.inputs)) as OwnerInput[], plan2 = playRound(v, f, gs, seed, { live: gi }), lg2 = new LiveGroup(plan2, v, gi, seed);
  lg2.replay(saved);
  assert.deepEqual(lg2.inputs, lg.inputs, 'the same inputs, versions and all');
  const own = f.find(g => g.owner)!.id, mine = (p: { shots: Shot[] }) => p.shots.filter(s => s.golfer === own), plan1 = (lg as unknown as { plan: { shots: Shot[] } }).plan;
  assert.ok(mine(plan1).length >= 16);
  assert.equal(JSON.stringify(mine(plan2)), JSON.stringify(mine(plan1)), 'the same shots');
  // the kit's marker speed reaches the model: a golfer with 100 accuracy (a slower marker, a wider window) reads the same click as the plain golfer reads it, in time
  const sk: GameSkills = { driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3, accuracy: 1 }, kit = kitOf(sk, 'iron6');
  const late = (dt: number) => shotOutcome(view, hole, from, 'fairway', sk, mk({ power: 1, acc: -dt * markerSpeed(kit.skill, kit.speed), boost: 0, v: METER_V }), rng(3, 1, 1)).landing!.at;
  assert.deepEqual(late(sweetSeconds(kit.skill, 0, kit.sweet) * 0.95), shotOutcome(view, hole, from, 'fairway', sk, mk({ power: 1, acc: 0, boost: 0, v: METER_V }), rng(3, 1, 1)).landing!.at, 'inside his window: straight');
  assert.notDeepEqual(late(sweetSeconds(kit.skill, 0, kit.sweet) * 1.6), late(0), 'outside it: a miss');
});

test('swing: the marker turns back at the arc’s top by itself (the most overswing), and the swing ends at its low end without a third click', () => {
  const s = 0.4, T = swingTime(s), m = new SwingMeter(s);
  m.click(0);
  m.tick(T * METER.top + 0.01);
  assert.equal(m.phase, 'back'); assert.equal(m.power, METER.top);
  m.tick(T * METER.top + T * (METER.top - METER.low) + 0.01);
  assert.equal(m.phase, 'done'); assert.equal(m.acc, METER.low);
  assert.equal(m.click(99), 'done', 'a click after the end does nothing');
  assert.deepEqual(m.outcome(), { power: METER.top, acc: METER.low, boost: 0, v: METER_V });
});

test('swing: overswing past 100% adds distance (half of it) and spread', () => {
  const e = swingEffect({ power: METER.top, acc: 0, boost: 0 }, 0.4, false), f = swingEffect({ power: 1, acc: 0, boost: 0 }, 0.4, false);
  near(e.power, 1 + 0.5 * (METER.top - 1)); near(f.power, 1);
  assert.ok(e.spread > f.spread); near(f.spread, 1);
  // the aim's mark on the arc is where that power comes from
  near(meterMark(1.05, false), 1.1); near(meterMark(0.7, false), 0.7); near(meterMark(1.1, true), 1.1);
  // a putt's power is the meter's (100% is the hole)
  near(swingEffect({ power: 1.1, acc: 0, boost: 0 }, 0.4, true).power, 1.1);
});

test('swing: Space presses during the swing add BOOST.per each up to BOOST.max; before the start and after the end they do not count; the boost narrows the sweet spot and widens the spread', () => {
  assert.equal(boostOf(0), 0); near(boostOf(3), 3 * BOOST.per); assert.equal(boostOf(50), BOOST.max);
  const s = 0.4, T = swingTime(s), m = new SwingMeter(s);
  m.press(-1); // before the swing
  m.click(0); for (let k = 0; k < 4; k++) m.press(0.1 + k * 0.05);
  m.click(T); for (let k = 0; k < 20; k++) m.press(T + 0.05 + k * 0.01);
  m.click(2 * T); m.press(2 * T + 0.1); // after the end
  assert.equal(m.presses, 24); assert.equal(m.outcome()!.boost, BOOST.max);
  const plain = swingEffect({ power: 1, acc: 0, boost: 0 }, s, false), boosted = swingEffect({ power: 1, acc: 0, boost: BOOST.max }, s, false);
  near(boosted.power, 1 + BOOST.max); assert.ok(boosted.spread > plain.spread);
  assert.ok(sweetSpot(s, BOOST.max) < sweetSpot(s));
  // an early click inside the plain sweet spot is a miss with the boost on
  const acc = sweetSpot(s) * 0.85;
  assert.equal(swingEffect(v2({ power: 1, acc, boost: 0 }), s, false).shape, 'straight');
  assert.notEqual(swingEffect(v2({ power: 1, acc, boost: BOOST.max }), s, false).shape, 'straight');
  // a saved boost past the cap is read at the cap
  assert.equal(swingEffect({ power: 1, acc: 0, boost: 1 }, s, false).power, 1 + BOOST.max);
});

test('swing: a saved outcome is read back clamped to the meter, and junk is refused', () => {
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02 }), { power: 0.8, acc: -0.03, boost: 0.02 });
  assert.deepEqual(readSwing({ power: 9, acc: -9, boost: 9 }), { power: METER.top, acc: METER.low, boost: BOOST.max });
  assert.equal(readSwing({ power: 1, acc: 'x', boost: 0 }), null);
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02, v: METER_V, junk: 1 }), { power: 0.8, acc: -0.03, boost: 0.02, v: METER_V }, 'the meter’s version is kept, nothing else');
  assert.equal(readSwing(null), null);
  assert.equal(readSwing({ power: NaN, acc: 0, boost: 0 }), null);
});

// ---- the shots, on the synthetic course of golf-play-live.test.ts ----
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** each hole on its own row, a wide fairway along its line, rough out to 40 tiles, a green at the pin (no water: the misses stay in play) */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 120 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 12 ? 'fairway' : d <= 55 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
function world(seed: number) {
  const view = course(), f = makeField(3, seed), owner = f.find(g => !g.pro)!;
  owner.owner = true; owner.skill = 0.4;
  const gs = teeTimes(f, seed), gi = gs.findIndex(g => g.players.includes(owner.id));
  return { view, f, gs, gi, owner };
}
const live = (seed: number) => { const w = world(seed); return { ...w, lg: new LiveGroup(playRound(w.view, w.f, w.gs, seed, { live: w.gi }), w.view, w.gi, seed) }; };
/** the input that plays a turn as suggested, swung with outcome o */
const swung = (t: OwnerTurn, o: SwingOutcome): OwnerInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing: o });
/** the signed sideways distance (tiles) of p from the line from a toward b: + right of it as one faces b (y down) */
const side = (a: Pt, b: Pt, p: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return (dx * (p.y - a.y) - dy * (p.x - a.x)) / L; };

test('swing shots: from the same first tee a hook finishes left of a straight shot and a slice right of it; a 100% straight swing carries about the club', () => {
  const seed = 5, out: Record<string, Shot> = {};
  for (const [k, acc] of [['straight', 0], ['hook', 0.2], ['slice', -0.18]] as const) {
    const { lg } = live(seed), t = lg.advance()!;
    out[k] = lg.play(swung(t, { power: 1, acc, boost: 0 }));
  }
  const { lg } = live(seed), t = lg.advance()!, aim = t.suggested.aim;
  const sS = side(t.ball, aim, out.straight!.to), sH = side(t.ball, aim, out.hook!.to), sL = side(t.ball, aim, out.slice!.to);
  assert.ok(sH < sS - 5, `the hook (${sH.toFixed(1)}) is left of the straight (${sS.toFixed(1)})`);
  assert.ok(sL > sS + 5, `the slice (${sL.toFixed(1)}) is right of the straight (${sS.toFixed(1)})`);
  // the reports: the hook's text names it; a full shot has a carry and a total
  const rep = shotReport(out.hook!, swingEffect({ power: 1, acc: 0.2, boost: 0 }, 0.4, false));
  assert.match(rep.text, /Hook, \d+° left · carry \d+ m/);
  assert.ok(rep.carryM! > 0);
  void lg;
});

test('swing shots: overswing and the boost carry further than a 100% swing (on average over seeds)', () => {
  let base = 0, more = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const a = live(seed), ta = a.lg.advance()!, sa = a.lg.play(swung(ta, { power: 1, acc: 0, boost: 0 }));
    const b = live(seed), tb = b.lg.advance()!, sb = b.lg.play(swung(tb, { power: METER.top, acc: 0, boost: BOOST.max }));
    base += Math.hypot(sa.landing!.at.x - sa.from.x, sa.landing!.at.y - sa.from.y);
    more += Math.hypot(sb.landing!.at.x - sb.from.x, sb.landing!.at.y - sb.from.y);
  }
  assert.ok(more > base * 1.08, `overswing + boost ${more.toFixed(0)} vs ${base.toFixed(0)}`);
});

test('swing shots: the saved outcomes replay to the same round (the inputs keep the outcome, never the click times), and a swingless input still plays', () => {
  const seed = 9, { lg, view, f, gs, gi } = live(seed), outs: SwingOutcome[] = [{ power: 1, acc: 0.01, boost: 0 }, { power: 0.9, acc: -0.12, boost: 0.03 }, { power: 1.1, acc: 0.15, boost: 0 }];
  let k = 0, t: OwnerTurn | null;
  const shots: Shot[] = [];
  while ((t = lg.advance()) && k < 14) {
    // every third shot as before T316 (no meter), the rest swung
    shots.push(lg.play(k % 3 === 2 ? { holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power } : swung(t, outs[k % 3]!)));
    k++;
  }
  assert.equal(lg.inputs.length, k);
  assert.deepEqual(lg.inputs[0]!.swing, outs[0]);
  assert.equal(lg.inputs[2]!.swing, undefined);
  for (const i of lg.inputs) assert.deepEqual(Object.keys(i.swing ?? {}).sort(), i.swing ? ['acc', 'boost', 'power'] : []);
  // a save is JSON: replay the inputs through it on a fresh plan of the same seed
  const saved = JSON.parse(JSON.stringify(lg.inputs)) as OwnerInput[];
  const plan2 = playRound(view, f, gs, seed, { live: gi }), lg2 = new LiveGroup(plan2, view, gi, seed);
  lg2.replay(saved);
  const own = f.find(g => g.owner)!.id, mine = (p: { shots: Shot[] }) => p.shots.filter(s => s.golfer === own);
  // the replayed group's shots are the played ones
  const plan1 = (lg as unknown as { plan: { shots: Shot[] } }).plan;
  assert.deepEqual(mine(plan2), mine(plan1));
  assert.deepEqual(mine(plan2).map(s => s.to), shots.map(s => s.to));
});

test('T446: the hold-and-release swing (HOLD_V) has no timing miss: straight whatever its acc, its power and boost count, and the shot keeps all of the model\'s direction spread', () => {
  assert.deepEqual(readSwing({ power: 0.7, acc: 0, boost: 0.03, v: HOLD_V }), { power: 0.7, acc: 0, boost: 0.03, v: HOLD_V }, 'a save keeps its version');
  for (const acc of [0, 0.15, -0.2]) {
    const e = swingEffect({ power: 0.7, acc, boost: 0.03, v: HOLD_V }, 0.3, false);
    assert.equal(e.shape, 'straight'); near(e.deg, 0); near(e.power, 0.73);
  }
  near(swingEffect({ power: 0.6, acc: 0.1, boost: 0, v: HOLD_V }, 0.3, true).deg, 0, 1e-12);
  // over many seeds a hold shot spreads across the line by the model's whole direction spread; a click on the line of the clicked meter keeps METER_ANG of it
  const view = course(), hole = view.holes[1]!, from = { x: hole.tee.x, y: hole.tee.y }, aim = { x: hole.tee.x + 60, y: hole.tee.y };
  const mk = (swing: SwingOutcome): Omit<OwnerInput, 'holeIdx' | 'stroke'> => ({ club: 'iron6', aim, power: 1, swing });
  const across = (sw: SwingOutcome): number => {
    const ys: number[] = [];
    for (let s = 1; s <= 80; s++) ys.push(shotOutcome(view, hole, from, 'fairway', 0.3, mk(sw), rng(s, 1, 1)).landing!.at.y - from.y);
    const m = ys.reduce((a, b) => a + b, 0) / ys.length;
    return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length);
  };
  const hold = across({ power: 1, acc: 0, boost: 0, v: HOLD_V }), click = across({ power: 1, acc: 0, boost: 0, v: METER_V });
  assert.ok(hold > click * 1.5, `the hold shot's spread across the line (${hold.toFixed(3)}) is the model's whole one, about twice the clicked meter's (${click.toFixed(3)})`);
});
