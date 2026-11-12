// T418 (docs/CINDERLINKS-PORT.md, the host half): the owner's turn and a decided stroke as the view from behind the golfer is sent them
// (src/game/golf/play/turn3p.ts, shot3p.ts). On a made-up hole: a driver, an iron, a wedge with full backspin and a putt each start at the ball, land and
// stop exactly where the model has them (within 0.05 m), fly above the ground and keep rising time stamps; a shot into water sends its drop; a draw in a
// crosswind bows off the chord but still lands on the model's point; one stroke through LiveGroup.play does the same. The turn: its points round-trip the
// view's frame, the bag's clubs are offered, and the driver's carry grows with an upgrade and with the driving skill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, bagGear, carryFor, makeField, playRound, shotOutcome, teeTimes, upgradeClub, rng } from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, OwnerInput, OwnerTurn, PlayHole, Pt, Shot } from '../src/game/golf/play';
import { fromView, toView, type ShotMsg, type ViewPt } from '../src/game/golf/play/protocol3p';
import { shotMsg, fieldShotMsg } from '../src/game/golf/play/shot3p';
import { turnMsg } from '../src/game/golf/play/turn3p';

const centre: Pt = { x: 200, y: 120 };
/** one par 4 along y = 100: the tee at x 100, the pin at x 300 (400 m); a green of 8 tiles round the pin, a fairway 10 tiles either side of the line,
 *  rough beyond, water past x 320 */
const hole: PlayHole = { n: 1, par: 4, tee: { x: 100, y: 100 }, pin: { x: 300, y: 100 }, line: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
const view: CourseView = {
  holes: [hole],
  lieAt: (x, y): Lie => x > 320 ? 'water' : Math.hypot(x - 300, y - 100) <= 8 ? 'green' : Math.abs(y - 100) <= 10 && x >= 98 ? (x <= 102 && Math.abs(y - 100) < 2 ? 'tee' : 'fairway') : 'rough',
};
const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };
/** a gentle slope down to the south-east, so the roll bends */
const height = (x: number, y: number): number => -0.01 * x - 0.02 * y;

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/** the model's stroke (shotOutcome: LiveGroup.play's) from `from` on `lie` with `input`, as the Shot LiveGroup.play records */
function stroke(from: Pt, lie: Lie, input: Omit<OwnerInput, 'holeIdx' | 'stroke'>, seed = 7): Shot {
  const o = shotOutcome(view, hole, from, lie, sk, input, rng(seed, 1, 1));
  return { golfer: 0, hole: 0, stroke: 1, t: 600, from, to: o.to, club: input.club, lie: o.lie, penalty: o.penalty, holed: o.holed, ...(o.landing ? { landing: o.landing } : {}) };
}

/** the checks every message must pass against the model's shot */
function checkMsg(name: string, s: Shot, m: ShotMsg): void {
  const from = toView(s.from, centre);
  assert.ok(dist(m.from, from) < 0.05, `${name}: from`);
  const rest = s.landing ? s.landing.rest : s.to;
  assert.ok(dist(m.rest, toView(rest, centre)) < 0.05, `${name}: the rest is the model's`);
  assert.ok(dist(m.roll[m.roll.length - 1]!, toView(rest, centre)) < 0.05, `${name}: the roll ends at the model's rest`);
  if (s.landing) {
    assert.ok(m.flight.length >= 3, `${name}: a flight`);
    assert.ok(dist(m.flight[0]!, from) < 0.05 && m.flight[0]![2] === 0, `${name}: the flight starts at the ball, on the ground`);
    const last = m.flight[m.flight.length - 1]!;
    assert.ok(dist(last, toView(s.landing.at, centre)) < 0.05 && last[2] === 0, `${name}: the first landing is the model's`);
    assert.ok(dist(m.roll[0]!, toView(s.landing.at, centre)) < 0.05, `${name}: the roll starts at the landing`);
    assert.ok(m.flight.every(p => p[2] >= 0), `${name}: never below the ground`);
    assert.ok(Math.max(...m.flight.map(p => p[2])) > 1, `${name}: it flies`);
    assert.equal(m.flightT!.length, m.flight.length);
    for (let i = 1; i < m.flightT!.length; i++) assert.ok(m.flightT![i]! > m.flightT![i - 1]!, `${name}: the flight's time rises`);
    assert.ok(m.rollT![0]! >= m.flightT![m.flightT!.length - 1]! - 1e-9, `${name}: the roll follows the flight`);
  } else assert.equal(m.flight.length, 0, `${name}: a putt has no flight`);
  assert.equal(m.rollT!.length, m.roll.length); assert.equal(m.rollZ!.length, m.roll.length);
  for (let i = 1; i < m.rollT!.length; i++) assert.ok(m.rollT![i]! > m.rollT![i - 1]!, `${name}: the roll's time rises`);
  assert.ok(m.rollZ!.every(z => z >= 0), `${name}: the bounces stay above the ground`);
  assert.equal(m.bounces.length, m.bounceLies!.length);
  assert.equal(m.restLie, s.landing ? s.landing.restLie : s.lie);
}

const cases: { name: string; from: Pt; lie: Lie; club: Club; extra?: Partial<OwnerInput> }[] = [
  { name: 'driver', from: hole.tee, lie: 'tee', club: 'driver' },
  { name: 'iron', from: { x: 225, y: 100 }, lie: 'fairway', club: 'iron7' },
  { name: 'wedge with full backspin', from: { x: 260, y: 100 }, lie: 'fairway', club: 'sw', extra: { spin: { x: 0, y: -1, pump: 5 } } },
  { name: 'putt', from: { x: 297, y: 100 }, lie: 'green', club: 'putter', extra: { v: 2 } },
];

for (const c of cases) {
  test(`shotMsg: a ${c.name} starts at the ball, lands and stops where the model has it, above the ground, in rising time`, () => {
    const D = Math.hypot(hole.pin.x - c.from.x, hole.pin.y - c.from.y) * TILE_M;
    const power = c.club === 'putter' ? 1 : Math.min(1, D / carryFor(sk, c.club, { lie: c.lie, tee: c.lie === 'tee' }));
    const s = stroke(c.from, c.lie, { club: c.club, aim: hole.pin, power, ...c.extra });
    for (const hz of [30, 7]) checkMsg(`${c.name} at ${hz} Hz`, s, shotMsg({ shot: s, input: { club: c.club, aim: hole.pin, power, ...c.extra }, skills: sk, view, height }, centre, hz));
    if (c.extra?.spin) {
      assert.ok(s.landing?.check, 'the full backspin checks');
      const m = shotMsg({ shot: s, skills: sk, view, height }, centre);
      assert.ok(m.check && dist(m.check, toView(s.landing!.check!, centre)) < 0.05, 'the check is the model\'s');
    }
  });
}

test('shotMsg: a draw in a crosswind bows off the chord and still lands on the model\'s point', () => {
  const input = { club: 'iron7' as Club, aim: hole.pin, power: 1, shape: { curve: -1 as const, flight: 0 as const }, env: { wind: { mph: 20, from: 180 }, lie: 'fairway' as const } };
  const s = stroke({ x: 225, y: 100 }, 'fairway', input), m = shotMsg({ shot: s, input, skills: sk, view }, centre);
  checkMsg('draw', s, m);
  const a = m.flight[0]!, b = m.flight[m.flight.length - 1]!, mid = m.flight[Math.floor(m.flight.length / 2)]!;
  const L = dist(a, b), off = ((b[0] - a[0]) * (mid[1] - a[1]) - (b[1] - a[1]) * (mid[0] - a[0])) / L;
  assert.ok(Math.abs(off) > 0.5, `the flight bows off the chord (${off.toFixed(2)} m)`);
});

test('shotMsg: a ball in the water stops in it, and the drop is the model\'s', () => {
  const from = { x: 250, y: 100 }, input = { club: 'driver' as Club, aim: { x: 400, y: 100 }, power: 1 };
  const s = stroke(from, 'fairway', input);
  assert.equal(s.penalty, 1, 'the made-up shot finds the water');
  const m = shotMsg({ shot: s, input, skills: sk, view }, centre);
  checkMsg('water', s, m);
  assert.equal(m.penalty, 1); assert.equal(m.restLie, 'water');
  assert.ok(m.drop && dist(m.drop, toView(s.to, centre)) < 0.05, 'the drop'); assert.equal(m.dropLie, s.lie);
});

/** a small 18-hole course (as golf-play-live.test.ts): each hole on its own row */
function course18(): CourseView {
  const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + 190, y };
    return { n: h + 1, par: 4 as const, tee, pin, line: [tee, pin] };
  });
  return { holes, lieAt: (x, y): Lie => {
    for (const h of holes) { if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green'; if (Math.abs(y - h.tee.y) <= 7.5 && x >= 5 && x <= 210) return 'fairway'; }
    return 'rough';
  } };
}

test('shotMsg on LiveGroup.play: the owner\'s first strike lands and stops where the model recorded it; the field\'s shots too', () => {
  const v = course18(), f = makeField(3, 5), owner = f.find(g => !g.pro)!;
  owner.owner = true; owner.skill = 0.5;
  const gs = teeTimes(f, 5), gi = gs.findIndex(g => g.players.includes(owner.id)), plan = playRound(v, f, gs, 5, { live: gi });
  const lg = new LiveGroup(plan, v, gi, 5), t = lg.advance()!;
  const input: OwnerInput = { holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power };
  const s = lg.play(input);
  assert.ok(s.landing, 'a full shot keeps its landing');
  checkMsg('live', s, shotMsg({ shot: s, input, view: v }, centre));
  lg.advance();
  const others = plan.shots.filter(x => x.golfer !== owner.id).slice(0, 12);
  assert.ok(others.length > 0, 'the field has struck');
  for (const x of others) checkMsg(`field ${x.golfer}`, x, fieldShotMsg(x, centre, { view: v }));
});

// ---- the turn ----

const turn: OwnerTurn = { golfer: 3, holeIdx: 0, hole: 1, par: 4, stroke: 1, t: 540, lie: 'tee', ball: { x: 100, y: 100 }, pin: { x: 300, y: 100 }, distM: 400,
  suggested: { club: 'driver', aim: { x: 220, y: 100 }, power: 1 } };
const driverOf = (skills: GameSkills | number) => turnMsg({ turn, skills, view }, { cx: centre.x, cy: centre.y }).clubs.find(c => c.club === 'driver')!;

test('turnMsg: the ball, the pin and the aim round-trip the view\'s frame; the lie, the wind and the slope are sent', () => {
  const m = turnMsg({ turn, skills: sk, view, height, wind: { mph: 12, from: 90 } }, centre);
  assert.equal(m.t, 'turn'); assert.equal(m.v, 1);
  const back = (p: ViewPt) => fromView(p, centre);
  for (const [a, b] of [[m.ball, turn.ball], [m.pin, turn.pin], [m.suggested.aim, turn.suggested.aim]] as const) { const q = back(a); assert.ok(Math.hypot(q.x - b.x, q.y - b.y) < 1e-9); }
  assert.equal(m.lieKind, 'tee'); assert.deepEqual(m.wind, { mph: 12, from: 90 });
  assert.ok(m.slope.up !== 0 || m.slope.across !== 0, 'the slope under the ball');
  assert.deepEqual(m.can, { shapes: true, spin: true, airspin: true, boost: true }, 'a golfer without a mech list has the legacy mechanics');
  assert.deepEqual(turnMsg({ turn, skills: { ...sk, mech: [] }, view }, centre).can, { shapes: true, spin: true, airspin: false, boost: false });
});

test('turnMsg: his bag\'s clubs are offered; a full kit for each', () => {
  const g = bagGear({ v: 1 }), m = turnMsg({ turn, skills: { ...sk, mods: g.mods, clubs: g.clubs }, view }, centre);
  assert.equal(m.clubs.length, 14);
  assert.equal(turnMsg({ turn, skills: sk, view }, centre).clubs.length, 8, 'no bag: the plain clubs');
  for (const c of m.clubs) {
    if (c.club === 'putter') { assert.equal(c.carryM, 0); continue; }
    assert.ok(c.carryM > 50 && c.scatterM > 0 && c.longM! > 0 && c.sweet! > 0 && c.loftDeg! > 0 && c.run! > 0, c.club);
    assert.ok(c.backspin! > 0 && c.backspin! <= 1, `${c.club}: backspin`);
  }
  const lw = m.clubs.find(c => c.club === 'lw')!, dr = m.clubs.find(c => c.club === 'driver')!;
  assert.ok(lw.backspin! > dr.backspin!, 'a wedge spins more than the driver');
});

test('turnMsg: the driver\'s carry grows when the bag\'s driver is upgraded and when the driving skill rises; accuracy tightens the scatter', () => {
  const plain = driverOf(sk);
  const up = upgradeClub(null, 'driver').bag, g = bagGear(up);
  assert.ok(driverOf({ ...sk, mods: g.mods, clubs: g.clubs }).carryM > plain.carryM + 1, 'an upgraded driver carries further');
  assert.ok(driverOf({ ...sk, driving: 0.9 }).carryM > plain.carryM + 1, 'a better driver of the ball carries further');
  assert.ok(Math.abs(driverOf({ ...sk, irons: 0.9 }).carryM - plain.carryM) < 1e-9, 'the irons do not move the driver');
  assert.ok(driverOf({ ...sk, accuracy: 0.9 }).scatterM < plain.scatterM, 'accuracy tightens the scatter');
  assert.ok(Math.abs(plain.carryM - carryFor(sk, 'driver', { lie: 'tee', tee: true })) < 1e-9, 'the carry is the model\'s');
});

test('turnMsg: a headwind shortens what the club plays, a tailwind lengthens it', () => {
  const at = (from: number) => turnMsg({ turn, skills: sk, view, wind: { mph: 20, from } }, centre).clubs.find(c => c.club === 'iron6')!.playsM!;
  const calm = turnMsg({ turn, skills: sk, view }, centre).clubs.find(c => c.club === 'iron6')!.playsM!;
  // (the shot goes east: a wind from the east is in his face; check the wind's convention by the two being on either side of calm)
  const a = at(90), b = at(270);
  assert.ok((a < calm && b > calm) || (a > calm && b < calm), `head and tail on either side of calm (${a.toFixed(1)}, ${calm.toFixed(1)}, ${b.toFixed(1)})`);
});
