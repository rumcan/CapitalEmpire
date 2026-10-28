// T266 (#800): golf's watchable pace. The day/night town clock (sim/townclock.ts DayProfile): the night keeps its 40 s and the golf hours take the
// rest of the town day, the day keeps its length, townMinute and simTimeAt stay inverses across the day's pieces, and retime and jumpTo keep the
// profile (null drops it, the tournament day's). The watchable golfers' pacer (golf/play/pacer.ts): a brisk walk at most, still while held, a walk
// he can make in time never faded, and a short fade to the walk's end when he cannot. The pace's setting (golf/pace.ts). npm test (bundled by
// esbuild, run by node --test; no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpTo, localRate, profileFor, retime, simTimeAt, townMinute, townTimeOf, type TownClock } from '../src/game/sim/townclock';
import { FADE_IN_S, FADE_OUT_S, Pacer } from '../src/game/golf/play/pacer';
import { NIGHT_S, capped, dayNight, paceOf, paceOfSetting, settingOf } from '../src/game/golf/pace';
import { RangeSim, defaultRangeBiz, rangeScene } from '../src/game/golf/rangebiz';

const day = (rate: number) => ({ t0: 0, m0: 0, rate }) as TownClock;
const night = (c: TownClock) => simTimeAt(c, 1440 + 360) - simTimeAt(c, 1200);

test('profileFor: the 10-minute day runs 06:00-20:00 at 1.5 and a 40 s night at 15, and still lasts 600 s', () => {
  const p = profileFor(2.4, NIGHT_S)!; assert.ok(p); assert.ok(Math.abs(p.k - 1.6) < 1e-9);
  const c: TownClock = { ...day(2.4), prof: p };
  assert.ok(Math.abs(simTimeAt(c, 1440) - 600) < 1e-6, 'the day keeps its length');
  assert.ok(Math.abs(simTimeAt(c, 1200) - simTimeAt(c, 360) - 840 / 1.5) < 1e-6, 'the golf hours last 840 / 1.5 s');
  assert.ok(Math.abs(night(c) - 40) < 1e-6, 'the night lasts 40 s');
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 600)) - 1.5) < 1e-9);
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 100)) - 15) < 1e-6);
  assert.ok(Math.abs(localRate(c, simTimeAt(c, 1300)) - 15) < 1e-6);
});

test('profileFor: a longer town day keeps the 40 s night and gives its time to the golf hours; a day too short for it stays flat', () => {
  for (const min of [5, 10, 15, 30]) {
    const L = min * 60, c: TownClock = { ...day(1440 / L), prof: profileFor(1440 / L, NIGHT_S) };
    assert.ok(Math.abs(night(c) - 40) < 1e-6, `${min} min: a 40 s night`);
    assert.ok(Math.abs(simTimeAt(c, 1440) - L) < 1e-6, `${min} min: the day keeps its length`);
    assert.ok(Math.abs(localRate(c, simTimeAt(c, 600)) - 840 / (L - 40)) < 1e-9, `${min} min: the golf hours take the rest`);
  }
  assert.equal(profileFor(1440 / 96, NIGHT_S), null, 'a 96 s day: its flat night is already 40 s');
  assert.equal(profileFor(1440 / 30, NIGHT_S), null, 'a 30 s day: flat');
});

test('townMinute and simTimeAt are inverses over three days of the profile clock, and the hour is continuous', () => {
  const c: TownClock = { t0: 50, m0: 200, rate: 2.4, prof: profileFor(2.4, NIGHT_S) };
  let last = -Infinity;
  for (let t = 50; t < 50 + 1800; t += 0.7) {
    const m = townMinute(c, t); assert.ok(m > last, 'monotonic'); last = m;
    assert.ok(Math.abs(simTimeAt(c, m) - t) < 1e-6, `inverse at ${t}`);
  }
  assert.equal(townTimeOf(c, 50).dayMin, 200);
});

test('retime and jumpTo keep the profile; null drops it (the tournament day runs flat at 1 a second)', () => {
  const p = profileFor(2.4, NIGHT_S)!, c: TownClock = { ...day(2.4), prof: p };
  const r = retime(c, 100, 2.4); assert.deepEqual(r.prof, p); assert.ok(Math.abs(townMinute(r, 100) - townMinute(c, 100)) < 1e-9);
  const j = jumpTo(c, 100, 420, 2.4); assert.deepEqual(j.prof, p); assert.ok(Math.abs(townTimeOf(j, 100).dayMin - 420) < 1e-9);
  const tourney = jumpTo(c, 100, 300, 1, null); assert.equal(tourney.prof, undefined); assert.equal(localRate(tourney, 200), 1);
  // the flat clock is as before (no prof key at all)
  assert.deepEqual(retime(day(2.4), 10, 1), { t0: 10, m0: 24, rate: 1 });
});

test('the pace setting: watchable (mix) by default, fast is the old pace; the dev options parse', () => {
  assert.equal(paceOfSetting(null), 'mix'); assert.equal(paceOfSetting('watchable'), 'mix'); assert.equal(paceOfSetting('fast'), 'main');
  assert.equal(settingOf('mix'), 'watchable'); assert.equal(settingOf('main'), 'fast');
  assert.ok(dayNight('mix') && capped('mix') && !dayNight('main') && !capped('main'));
  assert.equal(paceOf('long'), 'long'); assert.equal(paceOf('nope'), null);
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

test('the pacer never fades a walk he can make at the cap by his deadline: he walks it, behind the schedule', () => {
  const P = new Pacer(1, 1.4);
  P.step(0, 0, 0, NaN, NaN, false, 0, 0);
  // the schedule sprints 5 tiles in 0.1 s; he is needed there by sim second 6 (5 tiles at 1.4 take 3.6 s)
  let t = 0, minA = 1;
  for (; t < 6; t += 1 / 60) { const sx = Math.min(5, 50 * t); P.step(0, sx, 0, 5, 0, false, t, t, 6 - t); minA = Math.min(minA, P.alpha); }
  assert.equal(minA, 1, 'never faded'); assert.ok(Math.abs(P.x - 5) < 1e-6, 'he got there');
});

test('the pacer fades out at once when the walk cannot be made in time, comes back at the walk end and waits there for the schedule', () => {
  const P = new Pacer(1, 1.4);
  P.step(0, 0, 0, NaN, NaN, false, 0, 0);
  // a sprint of 40 tiles a sim second toward (100, 0), needed there by sim second 2.5 (100 tiles at 1.4 take 71 s)
  let t = 1 / 60;
  for (; t < 1 && P.x !== 100; t += 1 / 60) P.step(0, Math.min(100, 40 * t), 0, 100, 0, false, t, t, 2.5 - t);
  assert.equal(P.x, 100, 'back at the walk end'); assert.ok(t < FADE_OUT_S + 0.05, 'right after a short fade out'); assert.ok(P.alpha < 0.5, 'fading in');
  for (; t < 2.4; t += 1 / 60) P.step(0, Math.min(100, 40 * t), 0, 100, 0, false, t, t, 2.5 - t);
  assert.equal(P.x, 100); assert.equal(P.alpha, 1, 'faded in within FADE_IN_S, waiting'); assert.ok(FADE_IN_S < 0.5);
  // the schedule arrives and walks on slowly: followed again
  P.step(0, 100.5, 0, 101, 0, false, 2.5, 2.5, 5); assert.ok(P.x > 100 && P.walked);
});

test('a mover new on the screen on a walk it cannot make starts at the walk end, fading in (no blink where the schedule is)', () => {
  const P = new Pacer(1, 4.5);
  P.step(0, 0, 0, 60, 0, false, 10, 10, 0.8); assert.equal(P.x, 60); assert.equal(P.alpha, 0);
});

// the range on the day/night clock: rangehost.ts runs its time at the clock's rate over the day's mean (Game's range pace), so over whole town days it
// sells what it sells on the flat day (the prototype ran its hours on the local rate and its golfers' walks in sim seconds: it sold 13% more)
test('the range sells as much over whole town days on the day/night clock as on the flat day (6 seeds x 2 days)', () => {
  const plot: [number, number, number, number] = [200, 200, 70, 150], L = 600, frame = 0.1, c = { tier: 2, exits: 2, residents: 3000 };
  const days = (seed: number, prof: boolean) => {
    const s = defaultRangeBiz(), sc = rangeScene(plot, 2, s), r = new RangeSim(seed, 10);
    r.setScene(sc, Array.from({ length: 12 }, (_, i) => ({ x: plot[0] + 52 + (i % 6) * 2.6, y: plot[1] + 6 + Math.floor(i / 6) * 6, hx: 0, hy: 1 })), { x: plot[0] + 69, y: plot[1] + 10 });
    const clock: TownClock = { t0: 0, m0: 0, rate: 1440 / L, ...(prof ? { prof: profileFor(1440 / L, NIGHT_S)! } : {}) };
    let booked = 0;
    for (let t = 0; t < 2 * L; t += frame) {
      const at = townTimeOf(clock, t), dt = frame * (prof ? localRate(clock, t) * L / 1440 : 1);
      for (let left = dt; left > 1e-9; left -= 0.5) booked += r.step(Math.min(0.5, left), { hour: at.hour + at.minute / 60, day: at.day }, s, c, L);
    }
    return booked;
  };
  let flat = 0, dn = 0;
  for (let seed = 1; seed <= 6; seed++) { flat += days(seed, false); dn += days(seed, true); }
  assert.ok(flat > 0 && Math.abs(dn / flat - 1) < 0.04, `the day/night clock's range books ${dn} against the flat day's ${flat}`);
});
