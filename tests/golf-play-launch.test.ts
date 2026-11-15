// #1344: the practice readout's numbers (play/launch.ts lastBall): believable speeds, smash, launch and spin by club, a mishit's lower smash and its tip, the chipping and putting
// subsets, the tips' rules, and the practice driver sending one readout per ball (deterministic: the same ball, the same numbers)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { Club, GameSkills, Pt } from '../src/game/golf/play';
import { carryFor } from '../src/game/golf/play/shot';
import { KMH_PER_MPH, lastBall, smashOf, type LaunchIn, type Played } from '../src/game/golf/play/launch';
import { LOFT } from '../src/game/golf/play/bag';
import { PracticeDriver, practiceCourse, type PracticeIn } from '../src/game/golf/play/practice3p';
import { Play3p } from '../src/game/golf/play/play3p';
import type { HostMsg, TurnMsg } from '../src/game/golf/play/protocol3p';

const T = (m: number) => m / TILE_M;   // metres as tiles
const SK = 0.45;   // a mid-handicap's skill
/** a ball hit due north (y falls) from the origin at an aim `aimM` out: carried `carryM`, rolled `rollM`, `offM` right of the line (+ right) */
function ball(club: Club, o: { aimM?: number; carryM?: number; rollM?: number; offM?: number; power?: number; mis?: number; flier?: boolean; lie?: LaunchIn['lie']; kind?: LaunchIn['kind'];
  boost?: number; held?: boolean; fx?: Played['fx']; shape?: LaunchIn['shape']; wind?: { mph: number; from: number }; pin?: Pt; holed?: boolean } = {}): LaunchIn {
  const full = carryFor(SK, club), power = o.power ?? 1, carry = o.carryM ?? full * power * (o.mis ?? 1), roll = o.rollM ?? carry * 0.08, off = o.offM ?? 0, aimM = o.aimM ?? carry;
  const land = { x: T(off * carry / Math.max(1, carry + roll)), y: -T(carry) }, rest = { x: T(off), y: -T(carry + roll) };
  return { kind: o.kind ?? 'full', club, lie: o.lie ?? 'tee', from: { x: 0, y: 0 }, aim: { x: 0, y: -T(aimM) }, pin: o.pin ?? { x: 0, y: -T(aimM) }, land: o.kind === 'putt' ? null : land, rest,
    restLie: 'fairway', holed: !!o.holed, penalty: 0,
    played: { power, fullM: full, boost: o.boost ?? 0, held: o.held ?? true, strike: o.kind === 'putt' ? null : { mis: o.mis !== undefined, mf: o.mis ?? 1, flier: !!o.flier, stillM: carry }, fx: o.fx ?? null },
    shape: o.shape ?? null, sw: null, env: o.wind ? { wind: o.wind } : null };
}

test('launch: a clean full shot: speeds, smash, launch and spin in a real golfer\'s ranges, by club', () => {
  const d = lastBall(ball('driver')), i7 = lastBall(ball('iron7')), sw = lastBall(ball('sw'));
  const kmh = (mph: number) => mph * KMH_PER_MPH;
  assert.ok(kmh(d.clubMph!) >= 140 && kmh(d.clubMph!) <= 175, `driver club ${d.clubMph} mph`);
  assert.ok(Math.abs(d.smash! - 1.44) <= 0.02, `driver smash ${d.smash}`);
  assert.ok(i7.smash! >= 1.29 && i7.smash! <= 1.38, `7-iron smash ${i7.smash}`);
  assert.ok(sw.smash! >= 1.17 && sw.smash! <= 1.23, `wedge smash ${sw.smash}`);
  assert.ok(d.backRpm! >= 2500 && d.backRpm! <= 3000, `driver spin ${d.backRpm}`);
  assert.ok(sw.backRpm! >= 8000 && sw.backRpm! <= 10500, `wedge spin ${sw.backRpm}`);
  assert.ok(i7.backRpm! > d.backRpm! && sw.backRpm! > i7.backRpm!, 'more loft, more spin');
  assert.ok(d.ballMph! > i7.ballMph! && i7.ballMph! > sw.ballMph!, 'longer clubs, faster balls');
  assert.ok(d.launchDeg! < i7.launchDeg! && i7.launchDeg! < sw.launchDeg!, 'more loft, higher launch');
  assert.ok(d.apexM! > 0 && sw.apexM! > 0);
  assert.equal(d.sideRpm, 0); assert.deepEqual(d.tips, ['Great strike!']);
  assert.equal(d.carryM, Math.round(carryFor(SK, 'driver') * 10) / 10);
  assert.deepEqual(lastBall(ball('iron7')), i7, 'deterministic');
});
test('launch: a mishit lowers the smash and says so; a part swing is slower; the boost is faster', () => {
  const clean = lastBall(ball('driver')), bad = lastBall(ball('driver', { mis: 0.5 }));
  assert.ok(bad.smash! < clean.smash! - 0.05, `mishit smash ${bad.smash}`);
  assert.equal(bad.clubMph, clean.clubMph, 'the same swing');
  assert.match(bad.tips[0]!, /^Struck low on the face: smash 1\.\d\d \(good is 1\.44\)$/);
  assert.match(lastBall(ball('iron7', { mis: 0.5 })).tips[0]!, /^Caught it thin/);
  assert.ok(lastBall(ball('pw', { power: 0.5 })).clubMph! < lastBall(ball('pw')).clubMph! * 0.6);
  assert.ok(lastBall(ball('driver', { power: 1.12 })).clubMph! > clean.clubMph!);
});
test('launch: the side spin follows the shape and the taps; the tips name the pull, the push, the faded boost and the wind', () => {
  assert.ok(lastBall(ball('iron7', { shape: { curve: -1, flight: 0 } })).sideRpm! < -500, 'a draw is minus');
  assert.ok(lastBall(ball('iron7', { fx: { side: 0.5, top: 0, back: 0, amount: 0.5, cap: 1, air: true } })).sideRpm! > 200, 'a fade tapped in is plus');
  assert.ok(lastBall(ball('pw', { fx: { side: 0, top: 0, back: 0.5, amount: 0.5, cap: 1, air: true } })).backRpm! > lastBall(ball('pw')).backRpm!, 'backspin tapped adds rpm');
  assert.ok(lastBall(ball('pw', { lie: 'rough' })).backRpm! < lastBall(ball('pw')).backRpm!, 'the rough cuts the spin');
  assert.ok(lastBall(ball('pw', { flier: true, lie: 'rough' })).tips.some(t => /flier/.test(t)));
  assert.deepEqual(lastBall(ball('iron7', { offM: -9 })).tips, ['Pulled 9 m left: early release']);
  assert.deepEqual(lastBall(ball('iron7', { offM: 12 })).tips, ['Pushed 12 m right: late release']);
  assert.match(lastBall(ball('iron7', { offM: -12, shape: { curve: -1, flight: 0 } })).tips[0]!, /^The draw finished 12 m left: aim further right/);
  assert.deepEqual(lastBall(ball('driver', { boost: 0.01, power: 1.03 })).tips, ['Boost had faded: release at the top of your taps']);
  assert.ok(!lastBall(ball('driver', { boost: 0.01, held: false })).tips.some(t => /Boost/.test(t)), 'only the hold swing taps');
  assert.ok(lastBall(ball('pw', { wind: { mph: 15, from: 0 } })).tips.some(t => /backspin for the wind/.test(t)), 'a headwind (from the north) on a spinning wedge');
  assert.ok(!lastBall(ball('pw', { wind: { mph: 15, from: 180 } })).tips.some(t => /wind/.test(t)), 'not downwind');
  assert.match(lastBall(ball('iron7', { aimM: 160, carryM: 130 })).tips[0]!, /^Carried 30 m short of your aim/);
  assert.ok(lastBall(ball('iron7', { offM: -9, mis: 0.5 })).tips.length <= 2, 'at most two tips');
});
test('launch: a chip has no speeds; a putt has its length, leave and line', () => {
  const ch = lastBall(ball('sw', { kind: 'chip', power: 0.3, carryM: 12, rollM: 6, aimM: 14, pin: { x: 0, y: -T(14) } }));
  assert.equal(ch.ballMph, undefined); assert.equal(ch.clubMph, undefined); assert.ok(ch.backRpm! > 0);
  assert.equal(ch.rollM, 6); assert.equal(ch.pinM, 4); assert.match(ch.tips[0]!, /^Ran 4 m past/);
  assert.deepEqual(lastBall(ball('sw', { kind: 'chip', power: 0.3, carryM: 12, rollM: 1.5, aimM: 14, pin: { x: 0, y: -T(14) } })).tips, ['Great touch!']);
  const pt = (restY: number, restX = 0, holed = false): LaunchIn => ({ kind: 'putt', club: 'putter', lie: 'green', from: { x: 0, y: 0 }, aim: { x: 0, y: -T(5) }, pin: { x: 0, y: -T(5) }, land: null,
    rest: { x: T(restX), y: -T(restY) }, restLie: 'green', holed, penalty: 0, played: { power: 1, fullM: 0, boost: 0, held: true, strike: null, fx: null }, shape: null, sw: null, env: null });
  const s = lastBall(pt(4.2));
  assert.equal(s.puttM, 5); assert.equal(s.leaveM, -0.8); assert.equal(s.ballMph, undefined); assert.equal(s.backRpm, undefined);
  assert.match(s.tips[0]!, /^Never up, never in: 0\.8 m short/);
  assert.equal(lastBall(pt(6.6)).leaveM, 1.6); assert.match(lastBall(pt(6.6)).tips[0]!, /^1\.6 m past/);
  assert.match(lastBall(pt(5.2, -0.5)).tips[0]!, /^Missed 0\.5 m left/); assert.equal(lastBall(pt(5.2, -0.5)).lineM, -0.5);
  assert.deepEqual(lastBall(pt(5, 0, true)).tips, ['Holed it!']);
});
test('launch: the smash and spin tables by loft', () => {
  assert.ok(Math.abs(smashOf(LOFT.driver) - 1.44) < 0.01); assert.ok(smashOf(LOFT.iron5) <= 1.38 && smashOf(LOFT.iron9) >= 1.26); assert.ok(Math.abs(smashOf(LOFT.sw) - 1.2) < 0.01);
});

// the practice driver: one readout per ball, sent once in the practice message after it
const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
const disc = (x: number, y: number, r: number) => { const p: number[] = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return p; };
const input: PracticeIn = {
  outfield: sq(0, -3, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [10, 20, 30, 40, 50].map(x => ({ x, y: 0 })), greens: [50, 100, 150].map((d, i) => ({ x: 35, y: T(d), r: 4 + i, m: d })),
  area: [100, 20, 140, 60], areas: [{ id: 1, surface: 'green', pts: disc(120, 40, 6) }, { id: 2, surface: 'bunker', pts: disc(129, 40, 2.5) }],
  chip: { cup: { x: 120, y: 40 }, stands: [{ x: 130, y: 40 }, { x: 120, y: 51 }] }, name: 'Test practice',
};
const sk: GameSkills = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };
test('practice3p: each ball leaves its readout (full on the range, a chip and a putt at the short game), the same for the same ball', () => {
  const run = () => {
    const c = practiceCourse(input), drv = new PracticeDriver(c, 'range', sk, 5, { drills: () => null, judged: () => {} });
    const play = new Play3p({ view: c.view, holes: [0], skills: sk, sex: 'm', seed: 1, frame: { x: 60, y: 30 }, driver: drv });
    const t = play.start().filter((x): x is TurnMsg => x.t === 'turn').pop()!;
    assert.equal(drv.last, null);
    play.input({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: 1, acc: 0, boost: 0, v: 3 } });
    return drv.last;
  };
  const a = run()!;
  assert.equal(a.kind, 'full'); assert.ok(a.carryM > 40 && a.ballMph! > 40 && a.clubMph! > 30 && a.backRpm! > 1000, JSON.stringify(a)); assert.ok(a.tips.length >= 1 && a.tips.length <= 2);
  assert.deepEqual(run(), a, 'deterministic');
  const c = practiceCourse(input), sd = new PracticeDriver(c, 'short', sk, 5, { drills: () => null, judged: () => {} });
  const sp = new Play3p({ view: c.view, holes: [1], skills: sk, sex: 'm', seed: 1, frame: { x: 60, y: 30 }, driver: sd });
  let ms: HostMsg[] = sp.start(); let t = ms.find((x): x is TurnMsg => x.t === 'turn')!;
  sp.input({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
  assert.equal(sd.last!.kind, 'chip'); assert.equal(sd.last!.ballMph, undefined);
  sd.pick('putting'); ms = sp.refresh(); t = ms.find((x): x is TurnMsg => x.t === 'turn')!;
  sp.input({ holeIdx: t.holeIdx, stroke: t.stroke, club: 'putter', aim: t.suggested.aim, power: 1 });
  assert.equal(sd.last!.kind, 'putt'); assert.ok(sd.last!.puttM! >= 2.9 && sd.last!.puttM! <= 6.1, `putt ${sd.last!.puttM}`);
});
// #1344: the shot shape's lock lines: the stat, what he has, the drill; none once earned, and none at practice (where the shape is open)
import { earned, practiceEarned } from '../src/game/golf/play/unlocks';
test('unlocks: a locked curve or flight carries its short line for the shot panel', () => {
  const e = earned({ skills: { accuracy: 48, touch: 52.4, irons: 20 } });
  assert.deepEqual(e.lock, { curve: 'Accuracy 60 (you have 48) · practise Shot shaping', flight: 'Touch 60 (you have 52) · practise Flight' });
  assert.deepEqual(earned({ skills: { accuracy: 61, touch: 52, irons: 20 } }).lock, { flight: 'Touch 60 (you have 52) · practise Flight' });
  assert.equal(earned({ skills: { accuracy: 61, touch: 61 } }).lock, undefined);
  assert.equal(practiceEarned(e).lock, undefined);
});