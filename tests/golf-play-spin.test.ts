// T318 (#904): spin control (src/game/golf/play/spin.ts and its use in shot.ts hitShot / live.ts shotOutcome): the dot and the clicks in the air to the
// spin, capped by the club (a driver takes little backspin, a wedge a lot) and the lie (the rough cuts it); the spin's outcome per club (a wedge spins back
// on a green, a driver barely checks, topspin runs out, side spin curves the flight); the clicks never move the landing; and saved inputs, with spin or from
// before it, replay exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, SPIN, SPIN_BACK_CAP, hitShot, makeField, playRound, readSpin, rng, shotOutcome, spinEffect, spinRoom, spinText, teeTimes } from '../src/game/golf/play';
import type { Club, CourseView, Lie, OwnerInput, OwnerTurn, PlayHole, Pt, Shot, SpinInput } from '../src/game/golf/play';
import { playYours, startRound } from '../src/game/golf/play/yours';

/** a view whose lie is `lie` everywhere (the hole is unused by hitShot) */
const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const SK = 0.6;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
/** the signed sideways distance (m) of p from the line from a toward b: + right of it as one faces b (y down) */
const side = (a: Pt, b: Pt, p: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return (dx * (p.y - a.y) - dy * (p.x - a.x)) / L * TILE_M; };
/** a full shot from (0,0) toward +x of `m` metres with club and spin (null: none), on a course of one lie, from a fairway; the same stream each time */
function hit(club: Club, m: number, spin: SpinInput | null, lie: Lie = 'green', from: Lie = 'fairway', seed = 3) {
  const e = spin ? spinEffect(spin, club, from) : undefined;
  return hitShot(rng(seed, 1, 2), SK, from, { x: 0, y: 0 }, { x: m / TILE_M, y: 0 }, club, flat(lie), e ? { spin: e } : undefined);
}
const BACK = (pump = 0): SpinInput => ({ x: 0, y: -1, pump });

test('spin: the dot gives up to SPIN.base, each click in the air SPIN.per more, up to the club’s cap (a driver little backspin, a wedge a lot)', () => {
  const sw0 = spinEffect(BACK(0), 'sw', 'fairway');
  assert.equal(sw0.back, SPIN.base); assert.equal(sw0.top, 0); assert.equal(sw0.side, 0);
  assert.ok(Math.abs(spinEffect(BACK(2), 'sw', 'fairway').back - (SPIN.base + 2 * SPIN.per)) < 1e-9, 'two clicks add two steps');
  assert.equal(spinEffect(BACK(20), 'sw', 'fairway').back, 1, 'the wedge takes full backspin');
  assert.equal(spinEffect(BACK(20), 'driver', 'fairway').back, SPIN_BACK_CAP.driver, 'the driver: little backspin, however many clicks');
  assert.ok(spinEffect(BACK(20), 'iron6', 'fairway').back < spinEffect(BACK(20), 'pw', 'fairway').back);
  // the room for more: clicks stop adding at the cap
  assert.ok(spinRoom(BACK(0), 'sw', 'fairway')); assert.ok(!spinRoom(BACK(5), 'sw', 'fairway')); assert.ok(!spinRoom(BACK(0), 'driver', 'fairway'));
  // topspin and side spin are not held to the backspin's cap
  assert.equal(spinEffect({ x: 0, y: 1, pump: 20 }, 'driver', 'fairway').top, 1);
  assert.equal(spinEffect({ x: -1, y: 0, pump: 20 }, 'driver', 'fairway').side, -1);
  // a dot at the centre is no spin, whatever the clicks; the putter takes none
  assert.equal(spinEffect({ x: 0, y: 0, pump: 9 }, 'sw', 'fairway').amount, 0);
  assert.equal(spinEffect(BACK(9), 'putter', 'green').amount, 0);
  assert.equal(spinText(spinEffect(BACK(1), 'sw', 'fairway')), 'Backspin 60%');
  assert.equal(spinText(spinEffect({ x: 0.7, y: 0.7, pump: 0 }, 'iron8', 'fairway')), 'Topspin 35% · fade');
});

test('spin: the lie cuts it (the rough and the fescue), the tee and the fairway do not', () => {
  const f = spinEffect(BACK(20), 'sw', 'fairway').back, t = spinEffect(BACK(20), 'sw', 'tee').back;
  const r = spinEffect(BACK(20), 'sw', 'rough').back, fe = spinEffect(BACK(20), 'sw', 'fescue').back;
  assert.equal(f, 1); assert.equal(t, 1);
  assert.ok(r < 0.5 && fe < r, `rough ${r}, fescue ${fe}`);
});

test('spin: a saved spin is read back clamped (the dot into the ball, whole clicks up to maxPump), and junk is refused', () => {
  assert.deepEqual(readSpin({ x: 0, y: -0.5, pump: 3 }), { x: 0, y: -0.5, pump: 3 });
  const r = readSpin({ x: 3, y: 4, pump: 99.7 })!;
  assert.ok(Math.abs(Math.hypot(r.x, r.y) - 1) < 1e-9); assert.equal(r.pump, SPIN.maxPump);
  assert.equal(readSpin({ x: 0, y: -1, pump: -2.5 })!.pump, 0);
  for (const j of [null, 3, 'spin', {}, { x: 0, y: 0 }, { x: NaN, y: 0, pump: 0 }]) assert.equal(readSpin(j), null);
});

test('spin outcome: a wedge with full backspin spins back on a green (its rest short of the landing, with a check past it); the clicks never move the landing', () => {
  const none = hit('sw', 80, null), some = hit('sw', 80, BACK(0)), full = hit('sw', 80, BACK(5));
  assert.deepEqual(some.landing.at, none.landing.at); assert.deepEqual(full.landing.at, none.landing.at);
  const O = { x: 0, y: 0 };
  assert.ok(dist(O, none.to) > dist(O, none.landing.at), 'without spin the wedge rolls on');
  assert.ok(dist(O, some.to) <= dist(O, none.to), 'half backspin checks');
  assert.ok(dist(O, full.to) < dist(O, full.landing.at) - 3, `full backspin spins back (${dist(full.landing.at, full.to).toFixed(1)} m)`);
  assert.ok(full.landing.spin! < 0 && full.landing.check, 'the roll hook and the check');
  assert.ok(dist(O, full.landing.check!) > dist(O, full.landing.at), 'the check is past the landing');
  assert.equal(none.landing.spin, undefined); assert.equal(none.landing.check, undefined);
});

test('spin outcome: a driver with all the backspin it takes barely checks (it still runs on past the landing); topspin runs further', () => {
  const O = { x: 0, y: 0 };
  const none = hit('driver', 220, null, 'fairway', 'tee'), back = hit('driver', 220, BACK(20), 'fairway', 'tee'), top = hit('driver', 220, { x: 0, y: 1, pump: 5 }, 'fairway', 'tee');
  const roll = (s: typeof none) => dist(O, s.to) - dist(O, s.landing.at);
  assert.ok(roll(back) > 0 && roll(back) < roll(none) && roll(back) > 0.6 * roll(none), `driver back ${roll(back).toFixed(1)} vs ${roll(none).toFixed(1)}`);
  assert.ok(roll(top) > 1.8 * roll(none), `topspin ${roll(top).toFixed(1)} vs ${roll(none).toFixed(1)}`);
  // a wedge's full backspin on a fairway checks less than on a green
  const g = hit('sw', 80, BACK(5), 'green'), f = hit('sw', 80, BACK(5), 'fairway');
  assert.ok(dist(O, f.to) > dist(O, g.to), 'the green grips the spin more');
});

test('spin outcome: side spin curves the flight (a draw lands left, a fade right) and kicks the bounce the same way', () => {
  const none = hit('iron6', 160, null, 'fairway'), draw = hit('iron6', 160, { x: -1, y: 0, pump: 5 }, 'fairway'), fade = hit('iron6', 160, { x: 1, y: 0, pump: 5 }, 'fairway');
  const O = { x: 0, y: 0 }, A = { x: 1, y: 0 };
  assert.ok(side(O, A, draw.landing.at) < side(O, A, none.landing.at) - 5, 'the draw lands left');
  assert.ok(side(O, A, fade.landing.at) > side(O, A, none.landing.at) + 5, 'the fade lands right');
  // the kick: the roll leaves the flight's line toward the spin's side
  const kick = (s: typeof none) => side(s.landing.at, { x: s.landing.at.x * 2, y: s.landing.at.y * 2 }, s.to);
  assert.ok(kick(fade) > 0 && kick(draw) < 0);
});

// ---- the owner's shots with spin: the tournament's live group (the synthetic course of golf-play-swing.test.ts) and your own round ----
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
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
function live(seed: number) {
  const view = course(), f = makeField(3, seed), owner = f.find(g => !g.pro)!;
  owner.owner = true; owner.skill = 0.4;
  const gs = teeTimes(f, seed), gi = gs.findIndex(g => g.players.includes(owner.id));
  return { view, f, gs, gi, owner, lg: new LiveGroup(playRound(view, f, gs, seed, { live: gi }), view, gi, seed) };
}
const asSuggested = (t: OwnerTurn, spin?: SpinInput): OwnerInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, ...(spin ? { spin } : {}) });

test('spin shots: inputs with spin (and without it, as before T318) replay to the same round through a JSON save; a putt keeps no spin', () => {
  const seed = 11, { lg, view, f, gs, gi, owner } = live(seed);
  const spins: (SpinInput | undefined)[] = [BACK(3), undefined, { x: 0.5, y: 0.5, pump: 2 }, { x: -0.8, y: 0, pump: 0 }];
  let k = 0, t: OwnerTurn | null;
  while ((t = lg.advance()) && k < 16) { lg.play(asSuggested(t, spins[k % spins.length])); k++; }
  for (const i of lg.inputs) {
    if (i.club === 'putter') assert.equal(i.spin, undefined, 'a putt keeps no spin');
    else if (i.spin) assert.deepEqual(Object.keys(i.spin).sort(), ['pump', 'x', 'y']);
  }
  assert.ok(lg.inputs.some(i => i.spin), 'some shots kept their spin');
  const saved = JSON.parse(JSON.stringify(lg.inputs)) as OwnerInput[];
  const plan2 = playRound(view, f, gs, seed, { live: gi }), lg2 = new LiveGroup(plan2, view, gi, seed);
  lg2.replay(saved);
  const mine = (p: { shots: Shot[] }) => p.shots.filter(s => s.golfer === owner.id);
  assert.deepEqual(mine(plan2), mine((lg as unknown as { plan: { shots: Shot[] } }).plan));
});

test('spin shots: an input without spin plays exactly as one with a centred dot (no spin), and the field around it is unchanged', () => {
  const a = live(4), b = live(4);
  let ta: OwnerTurn | null, tb: OwnerTurn | null, n = 0;
  while ((ta = a.lg.advance()) && (tb = b.lg.advance()) && n < 10) {
    const sa = a.lg.play(asSuggested(ta)), sb = b.lg.play(asSuggested(tb, { x: 0, y: 0, pump: 7 }));
    assert.deepEqual(sa, sb); n++;
  }
  assert.ok(n >= 5);
});

test('spin shots: the clicks in the air change only the roll, never the landing (the tournament and your round)', () => {
  const view = course(), from = view.holes[0]!.tee, aim = { x: view.holes[0]!.pin.x, y: view.holes[0]!.pin.y };
  const input = (pump: number) => ({ club: 'iron8' as Club, aim, power: 1, spin: BACK(pump) });
  const o0 = shotOutcome(view, view.holes[0]!, from, 'tee', 0.6, input(0), rng(1, 2, 3)), o5 = shotOutcome(view, view.holes[0]!, from, 'tee', 0.6, input(5), rng(1, 2, 3));
  assert.deepEqual(o5.landing!.at, o0.landing!.at);
  assert.notDeepEqual(o5.to, o0.to);
  assert.deepEqual(o5.spin, BACK(5));
  // your round: the same shot again with the clicks, from the round before it
  const r = startRound(view, [0, 1], 2)!;
  const y0 = playYours(view, r, { driving: 0.6, irons: 0.6, short: 0.6, putting: 0.6 }, input(0), 7), y5 = playYours(view, r, { driving: 0.6, irons: 0.6, short: 0.6, putting: 0.6 }, input(5), 7);
  assert.deepEqual(y5.shot.landing!.at, y0.shot.landing!.at);
  assert.ok(dist(from, y5.shot.to) < dist(from, y0.shot.to), 'more backspin stops it shorter');
});
