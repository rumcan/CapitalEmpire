// T334 (#960), the play pass's putting fix (src/game/golf/play/shot.ts PUTT_V2, live.ts shotOutcome): the playtest found a 0.5 m putt missed one time in four and half the holes taking
// three putts or more, for a golfer clicking the 3-click meter like a person (tests/helpers/swing-bot.ts). The second version of the putting: the make chance falls from 0.6 m, the aim's
// tolerance is the cup's angle at the distance (not a flat 3 degrees) and the power's error counts in metres (not 25% of the putt). An input struck under it says so (OwnerInput.v 2);
// a saved input without it (a save from before) plays as before, exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, MODEL_V, PUTT_V2, makeField, playRound, putt, rng, shotOutcome, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, OwnerInput, PlayHole } from '../src/game/golf/play';
import { HUMANS, botRound, botSwing, mean, type Human } from './helpers/swing-bot';

const green = (): CourseView => ({ holes: [], lieAt: () => 'green' as Lie });
const hole: PlayHole = { n: 1, par: 4, tee: { x: 0, y: 0 }, pin: { x: 100, y: 0 }, line: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
/** the share of `n` putts of `distM` metres a person holes, at a putting skill, under the model version v */
function makeRate(distM: number, skill: number, h: Human, v: 1 | 2, n = 600): number {
  const from = { x: 100 - distM / TILE_M, y: 0 }, r = rng(77, 1, 2), clicks = rng(5, distM * 10, v);
  let made = 0;
  for (let k = 0; k < n; k++) {
    const sw = botSwing(clicks, h, skill, 1, true), o = shotOutcome(green(), hole, from, 'green', skill, { club: 'putter', aim: hole.pin, power: 1, swing: sw, ...(v === 2 ? { v: 2 } : {}) }, r);
    if (o.holed) made++;
  }
  return made / n;
}

test('putting v2: tap-ins drop (a 0.5 m putt of a club golfer, a sharp one), where v1 missed one in four; the make chance from 0.6 m', () => {
  const c1 = makeRate(0.5, 0.5, HUMANS.club, 1), c2 = makeRate(0.5, 0.5, HUMANS.club, 2), s1 = makeRate(0.5, 0.75, HUMANS.sharp, 1), s2 = makeRate(0.5, 0.75, HUMANS.sharp, 2);
  assert.ok(c2 > c1 + 0.08 && c2 > 0.88, `club at 0.5 m: ${c1.toFixed(2)} -> ${c2.toFixed(2)}`);
  assert.ok(s2 > s1 + 0.04 && s2 > 0.93, `sharp at 0.5 m: ${s1.toFixed(2)} -> ${s2.toFixed(2)}`);
  const m1 = makeRate(1, 0.5, HUMANS.club, 1), m2 = makeRate(1, 0.5, HUMANS.club, 2);
  assert.ok(m2 > m1 + 0.07 && m2 > 0.72, `club at 1 m: ${m1.toFixed(2)} -> ${m2.toFixed(2)}`);
  // the base chance itself (no meter): 1 m is likelier from 0.6 m out, and the long ones are the same
  const base = (d: number, v2: boolean) => { let n = 0; const r = rng(3, 4, 5); for (let k = 0; k < 4000; k++) if (putt(r, 0.5, d, 1, v2).holed) n++; return n / 4000; };
  assert.ok(base(1, true) > base(1, false) + 0.05 && base(0.4, true) >= 0.98 * base(0.4, false), 'a short putt is likelier');
  assert.ok(Math.abs(base(8, true) - base(8, false)) < 0.04, 'and the long ones are not easier');
  assert.ok(base(3, true) > base(3, false) && base(3, true) < 0.5, 'a 3 m putt: likelier than before, still under half');
});

test('putting v2: the long putts are not easier (the aim’s tolerance narrows to the cup’s angle: 8 m is hard as it was)', () => {
  const l1 = makeRate(8, 0.75, HUMANS.sharp, 1, 1500), l2 = makeRate(8, 0.75, HUMANS.sharp, 2, 1500), t1 = makeRate(4, 0.75, HUMANS.sharp, 1, 1500), t2 = makeRate(4, 0.75, HUMANS.sharp, 2, 1500);
  assert.ok(l2 <= l1 + 0.03, `8 m: ${l1.toFixed(3)} -> ${l2.toFixed(3)}`);
  assert.ok(t2 < 0.4 && t2 <= t1 + 0.06, `4 m: ${t1.toFixed(2)} -> ${t2.toFixed(2)}`);
});

test('putting v2: the aim’s tolerance is the cup’s angle at the distance, the power’s window is in metres', () => {
  const tol = (m: number) => Math.min(PUTT_V2.maxDeg, Math.max(PUTT_V2.minDeg, Math.atan(PUTT_V2.cupM / Math.max(m, 0.25)) * 180 / Math.PI));
  assert.ok(tol(0.5) > 8 * 0.99 - 0.5 && tol(1) > 5 && tol(1) < 5.2 && tol(2) > 2.5 && tol(2) < 2.7 && tol(10) === PUTT_V2.minDeg && tol(0.1) === PUTT_V2.maxDeg, `${[0.1, 0.5, 1, 2, 10].map(m => tol(m).toFixed(1))}`);
  // a shot's miss of 4 degrees (a hook that is only a pull for a putt: MISS.puttDeg 30 per unit): holes a 1 m putt under v2 (tolerance 5 degrees) but not under v1 (3 degrees)
  const from = { x: 100 - 1 / TILE_M, y: 0 }, miss = (v: 1 | 2, acc: number, pw = 1) => { let n = 0; const r = rng(9, 9, v); for (let k = 0; k < 400; k++) if (shotOutcome(green(), hole, from, 'green', 1, { club: 'putter', aim: hole.pin, power: 1, swing: { power: pw, acc, boost: 0 }, ...(v === 2 ? { v: 2 } : {}) }, r).holed) n++; return n / 400; };
  // acc 0.17 on the meter: 0.17 - 0.07 (the sweet spot at skill 1) = 0.1 beyond it: 3 degrees of pull... pick 0.205: (0.205 - 0.07) * 30 = 4 degrees
  assert.ok(miss(2, 0.205) > 0.4 && miss(1, 0.205) === 0, `4 degrees: v1 ${miss(1, 0.205)}, v2 ${miss(2, 0.205)}`);
  // the power: 10% long on a 0.5 m putt is 5 cm (v2 hardly minds); on a 6 m putt it is 0.6 m (v2 minds it)
  const f = (d: number, pw: number) => Math.max(0, 1 - Math.abs(pw - 1) * d / PUTT_V2.windowM);
  assert.ok(f(0.5, 1.1) > 0.9 && f(6, 1.1) < 0.4 && f(0.5, 1.1) > 1 - 4 * 0.1 + 0.3, 'the window is in metres');
});

test('putting v2: a golfer’s round: fewer putts and fewer three-putts, the same scores to within a stroke or two on the green side only', () => {
  // the synthetic 18 of the tests (golf-play-conditions.test.ts): a hand-made course, one bot per version over the same days
  const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const seg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
  const view: CourseView = { holes, lieAt: (x, y) => { for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green'; let d = Infinity; for (const h of holes) d = Math.min(d, seg({ x, y }, h.tee, h.pin)); return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out'; } };
  const sk = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 }, run = (v: 1 | 2) => { const rs = Array.from({ length: 10 }, (_, k) => botRound(view, sk, HUMANS.club, 400 + k, 1 + k, () => (v === 2 ? { v: 2 } : {}))); return { putts: mean(rs.map(r => r.putts)), score: mean(rs.map(r => r.total - r.par)) }; };
  const a = run(1), b = run(2);
  assert.ok(b.putts < a.putts - 2, `putts a round: ${a.putts.toFixed(1)} -> ${b.putts.toFixed(1)}`);
  assert.ok(b.score < a.score && b.score > a.score - 8, `score: ${a.score.toFixed(1)} -> ${b.score.toFixed(1)}`);
  assert.ok(b.putts > 26 && b.putts < 36, `a mid golfer still takes 26 to 36 putts: ${b.putts.toFixed(1)}`);
});

test('putting v2: the version is kept with the saved input, and an input without it plays as it did; the field’s day with conditions putts by v2 and a day without by v1', () => {
  const view = green(), swing = { power: 1, acc: 0.02, boost: 0 };
  const from = { x: 100 - 3 / TILE_M, y: 0 }, old = shotOutcome(view, hole, from, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing }, rng(1, 1, 1)), explicit = shotOutcome(view, hole, from, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing, v: 1 }, rng(1, 1, 1));
  assert.deepEqual(old, explicit, 'v 1 is no version');
  // the live group keeps v 2 in its inputs (and none otherwise), and the replay of either reaches the same shots
  const PARS = [4, 4, 3], hs: PlayHole[] = PARS.map((par, i) => { const y = 20 + 60 * i, tee = { x: 10, y }, pin = { x: 10 + 100, y }; return { n: i + 1, par: par as 3 | 4, tee, pin, line: [tee, pin] }; });
  const v: CourseView = { holes: hs, lieAt: (x, y) => hs.some(h => Math.hypot(x - h.pin.x, y - h.pin.y) <= 5) ? 'green' : Math.abs(((y - 20) % 60 + 60) % 60) < 8 ? 'fairway' : 'rough' };
  const f = makeField(2, 5), owner = f.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const gs = teeTimes(f, 5), gi = gs.findIndex(g => g.players.includes(owner.id));
  for (const ver of [1, 2] as const) {
    const pa = playRound(v, f, gs, 5, { live: gi }), a = new LiveGroup(pa, v, gi, 5);
    for (let k = 0; k < 60; k++) { const t = a.advance(); if (!t) break; const inp: Omit<OwnerInput, 'holeIdx' | 'stroke'> = { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing, ...(ver === 2 ? { v: MODEL_V } : {}) }; a.play({ holeIdx: t.holeIdx, stroke: t.stroke, ...inp }); }
    assert.ok(a.inputs.length > 5 && a.inputs.every(i => (ver === 2 ? i.v === 2 : !('v' in i))), `version ${ver}: ${a.inputs.length} inputs keep it`);
    const pb = playRound(v, f, gs, 5, { live: gi }), b = new LiveGroup(pb, v, gi, 5);
    b.replay(JSON.parse(JSON.stringify(a.inputs)) as OwnerInput[]);
    assert.equal(JSON.stringify(pb.shots), JSON.stringify(pa.shots), `version ${ver}: the replay is the same round`);
  }
});
