// T316 (#902): the 3-click swing meter (src/game/golf/play/swing.ts) and its shots (live.ts OwnerInput.swing): click times to power and accuracy, the
// miss's side and shape, the skill's slower marker and wider sweet spot, the automatic turns at the arc's ends, the key-spam boost and its cap, the
// overswing, a saved outcome read back, and the replay of saved outcomes on the synthetic course of golf-play-live.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { BOOST, LiveGroup, METER, METER_TIME, SwingMeter, boostOf, makeField, meterMark, playRound, readSwing, shotReport, swingEffect, sweetSpot, swingTime, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, OwnerInput, OwnerTurn, PlayHole, Pt, Shot, SwingOutcome } from '../src/game/golf/play';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

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

test('swing: a better golfer gets a slower marker and a wider sweet spot', () => {
  assert.ok(swingTime(0.9) > swingTime(0.3));
  assert.ok(sweetSpot(0.9) > sweetSpot(0.3));
  // the same 0.05 early click is inside the good player's sweet spot and a miss for the weak one
  const o: SwingOutcome = { power: 1, acc: 0.05, boost: 0 };
  assert.equal(swingEffect(o, 0.9, false).shape, 'straight');
  assert.notEqual(swingEffect(o, 0.1, false).shape, 'straight');
});

test('swing: early on the way back misses left (pull, then hook), late misses right (push, then slice), scaled by the offset; putts pull and push', () => {
  const s = 0.4, w = sweetSpot(s);
  const st = swingEffect({ power: 1, acc: w * 0.9, boost: 0 }, s, false);
  assert.equal(st.shape, 'straight'); assert.equal(st.deg, 0);
  const pull = swingEffect({ power: 1, acc: w + 0.02, boost: 0 }, s, false), hook = swingEffect({ power: 1, acc: w + 0.12, boost: 0 }, s, false);
  const push = swingEffect({ power: 1, acc: -(w + 0.02), boost: 0 }, s, false), slice = swingEffect({ power: 1, acc: -(w + 0.12), boost: 0 }, s, false);
  assert.equal(pull.shape, 'pull'); assert.ok(pull.deg < 0);
  assert.equal(hook.shape, 'hook'); assert.ok(hook.deg < pull.deg, 'a bigger offset misses further');
  assert.equal(push.shape, 'push'); assert.ok(push.deg > 0);
  assert.equal(slice.shape, 'slice'); assert.ok(slice.deg > push.deg);
  assert.ok(hook.roll > 1 && slice.carry < 1, 'a hook runs on, a slice carries short');
  // the worst miss is capped
  assert.ok(Math.abs(swingEffect({ power: 1, acc: METER.low, boost: 0 }, 0, false).deg) <= 18);
  // a putt: the same side, a smaller scale, no hooks on a green
  const pp = swingEffect({ power: 1, acc: w + 0.12, boost: 0 }, s, true);
  assert.equal(pp.shape, 'pull'); assert.ok(pp.deg < 0 && Math.abs(pp.deg) < Math.abs(hook.deg));
  // the meter's timing: click 3 a little early is an early (left) miss
  const T = swingTime(s), e = swing(s, T, 2 * T - 0.15 * T).outcome()!;
  near(e.acc, 0.15, 1e-9); assert.ok(swingEffect(e, s, false).deg < 0);
});

test('swing: the marker turns back at the arc’s top by itself (the most overswing), and the swing ends at its low end without a third click', () => {
  const s = 0.4, T = swingTime(s), m = new SwingMeter(s);
  m.click(0);
  m.tick(T * METER.top + 0.01);
  assert.equal(m.phase, 'back'); assert.equal(m.power, METER.top);
  m.tick(T * METER.top + T * (METER.top - METER.low) + 0.01);
  assert.equal(m.phase, 'done'); assert.equal(m.acc, METER.low);
  assert.equal(m.click(99), 'done', 'a click after the end does nothing');
  assert.deepEqual(m.outcome(), { power: METER.top, acc: METER.low, boost: 0 });
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
  assert.equal(swingEffect({ power: 1, acc, boost: 0 }, s, false).shape, 'straight');
  assert.notEqual(swingEffect({ power: 1, acc, boost: BOOST.max }, s, false).shape, 'straight');
  // a saved boost past the cap is read at the cap
  assert.equal(swingEffect({ power: 1, acc: 0, boost: 1 }, s, false).power, 1 + BOOST.max);
});

test('swing: a saved outcome is read back clamped to the meter, and junk is refused', () => {
  assert.deepEqual(readSwing({ power: 0.8, acc: -0.03, boost: 0.02 }), { power: 0.8, acc: -0.03, boost: 0.02 });
  assert.deepEqual(readSwing({ power: 9, acc: -9, boost: 9 }), { power: METER.top, acc: METER.low, boost: BOOST.max });
  assert.equal(readSwing({ power: 1, acc: 'x', boost: 0 }), null);
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
