// T266 (#800): everyday golf's pace options. The day/night town clock (sim/townclock.ts DayProfile): the golf hours run at the asked rate, the night
// faster, the day keeps its length, townMinute and simTimeAt stay inverses across the day's pieces, and retime and jumpTo keep the profile (null
// drops it, the tournament day's). The watchable golfers' pacer (golf/play/pacer.ts): a brisk walk at most, still while held, and a fade to the
// walk's end when the schedule runs ahead. npm test (bundled by esbuild, run by node --test; no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpTo, localRate, profileFor, retime, simTimeAt, townMinute, townTimeOf, type TownClock } from '../src/game/sim/townclock';
import { FADE_S, GAP, Pacer } from '../src/game/golf/play/pacer';

const day = (rate: number) => ({ t0: 0, m0: 0, rate }) as TownClock;

test('profileFor: a 10-minute day (2.4 a second) runs 06:00-20:00 at 1.5 and the night at 15, and still lasts 600 s', () => {
  const p = profileFor(2.4, 1.5)!; assert.ok(p);
  const c: TownClock = { ...day(2.4), prof: p };
  assert.ok(Math.abs(simTimeAt(c, 1440) - 600) < 1e-6, 'the day keeps its length');
  assert.ok(Math.abs(simTimeAt(c, 1200) - simTimeAt(c, 360) - 840 / 1.5) < 1e-6, 'the golf hours last 840 / 1.5 s');
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 600)) - 1.5) < 1e-9);
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 100)) - 15) < 1e-6);
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 1300)) - 15) < 1e-6);
  assert.equal(profileFor(0.8, 1.5), null, 'a 30-minute day is already slower than 1.5: flat');
});

test('townMinute and simTimeAt are inverses over three days of the profile clock, and the hour is continuous', () => {
  const c: TownClock = { t0: 50, m0: 200, rate: 2.4, prof: profileFor(2.4, 1.5) };
  let last = -Infinity;
  for (let t = 50; t < 50 + 1800; t += 0.7) {
    const m = townMinute(c, t); assert.ok(m > last, 'monotonic'); last = m;
    assert.ok(Math.abs(simTimeAt(c, m) - t) < 1e-6, `inverse at ${t}`);
  }
  assert.equal(townTimeOf(c, 50).dayMin, 200);
});

test('retime and jumpTo keep the profile; null drops it (the tournament day runs flat at 1 a second)', () => {
  const p = profileFor(2.4, 1.5)!, c: TownClock = { ...day(2.4), prof: p };
  const r = retime(c, 100, 2.4); assert.deepEqual(r.prof, p); assert.ok(Math.abs(townMinute(r, 100) - townMinute(c, 100)) < 1e-9);
  const j = jumpTo(c, 100, 420, 2.4); assert.deepEqual(j.prof, p); assert.ok(Math.abs(townTimeOf(j, 100).dayMin - 420) < 1e-9);
  const tourney = jumpTo(c, 100, 300, 1, null); assert.equal(tourney.prof, undefined); assert.equal(localRate(tourney, 200), 1);
  // the flat clock is as before (no prof key at all)
  assert.deepEqual(retime(day(2.4), 10, 1), { t0: 10, m0: 24, rate: 1 });
});

test('the pacer walks at its cap, holds still while held, and follows a slow schedule exactly', () => {
  const P = new Pacer(4, 1.4);
  P.step(0, 0, 0, NaN, NaN, false, 0, 0);
  // the schedule steps half a tile in half a sim second (slower than the cap): followed exactly, walking
  P.step(0, 0.5, 0, 1, 0, false, 0.5, 0.5); assert.equal(P.x, 0.5); assert.ok(P.walked); assert.equal(P.alpha, 1);
  // held: still, however far the schedule goes
  P.step(0, 2, 0, 9, 0, true, 0.6, 0.6); assert.equal(P.x, 0.5); assert.ok(!P.walked);
  // released: no more than the cap a sim second
  P.step(0, 2, 0, 9, 0, false, 0.7, 1.1); assert.ok(Math.abs(P.x - (0.5 + 1.4 * 0.5)) < 1e-9);
});

test('the pacer fades out when the schedule runs GAP ahead, comes back at the walk end and waits there for it', () => {
  const P = new Pacer(1, 1.4);
  P.step(0, 0, 0, NaN, NaN, false, 0, 0);
  // a sprint of 40 tiles a sim second toward (100, 0)
  let t = 0;
  for (; t < 0.2; t += 1 / 60) P.step(0, 40 * t, 0, 100, 0, false, t, t);
  assert.ok(P.alpha < 1 && P.x < 1, 'walking, fading');
  for (; t < 1 && P.x !== 100; t += 1 / 60) P.step(0, 40 * t, 0, 100, 0, false, t, t);
  assert.equal(P.x, 100, 'back at the walk end'); assert.ok(P.alpha < 0.5, 'fading in'); assert.ok(t < 0.2 + FADE_S + 0.05, 'within a fade');
  for (; t < 2.4; t += 1 / 60) P.step(0, Math.min(100, 40 * t), 0, 100, 0, false, t, t);
  assert.equal(P.x, 100); assert.equal(P.alpha, 1, 'faded in, waiting'); assert.ok(GAP > 0);
  // the schedule arrives and walks on slowly: followed again
  P.step(0, 100.5, 0, 101, 0, false, 2.5, 2.5); assert.ok(P.x > 100 && P.walked);
});
