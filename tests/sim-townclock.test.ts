// The town day's clock (src/game/sim/townclock.ts, T048): the clock's pieces (retime keeps the minute, jumpTo goes forward to a set hour), the hour and the
// day continuous over changes, and a golf City's tournament day: the clock reads 05:00 at its start, at 1 minute a sim second, and the normal rate again
// after the round closes. npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { townClockFor, townMinute, townTimeOf, retime, jumpTo, townHourIndex, simTimeAt, type TownClock } from '../src/game/sim/townclock';
import { LotTrips } from '../src/game/sim/trips';
import type { Sim } from '../src/game/sim/sim';
import type { Lot } from '../src/game/lots/lots';
import { LU } from '../src/game/lots/town';
import { City } from '../src/game/city';
import type { BizDef } from '../src/game/business/state';
import { MAP } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

test('townClockFor(600) reads 12:00 at sim time 300 (a 600 s day is 1440 minutes: 2.4 minutes a second)', () => {
  const c = townClockFor(600), r = townTimeOf(c, 300);
  assert.equal(r.day, 1);
  assert.equal(r.hour, 12);
  assert.equal(r.minute, 0);
  assert.ok(Math.abs(r.dayMin - 720) < 1e-9, `dayMin ${r.dayMin}`);
  assert.ok(Math.abs(townMinute(c, 600) - 1440) < 1e-9, 'the next day starts at 600 s');
});

test('retime keeps the minute at the switch and runs at the new rate after it', () => {
  const c = townClockFor(600), t = 300, d = retime(c, t, 1);
  assert.ok(Math.abs(townMinute(d, t) - townMinute(c, t)) < 1e-9, 'no jump at the switch');
  assert.ok(Math.abs(townMinute(d, t + 100) - (townMinute(c, t) + 100)) < 1e-9, 'a minute a second after the switch');
});

test('jumpTo from 14:00 goes to the next day\'s 05:00, from 03:00 to the same day\'s 05:00', () => {
  const c = townClockFor(1440); // a classic day: one minute a second, so sim time is the minute
  const late = jumpTo(c, 14 * 60, 300, 1), r1 = townTimeOf(late, 14 * 60);
  assert.equal(r1.day, 2, 'the next day');
  assert.equal(r1.hour, 5);
  assert.equal(r1.minute, 0);
  const early = jumpTo(c, 3 * 60, 300, 1), r2 = townTimeOf(early, 3 * 60);
  assert.equal(r2.day, 1, 'the same day');
  assert.equal(r2.hour, 5);
  assert.equal(r2.minute, 0);
  assert.equal(townTimeOf(late, 14 * 60 + 60).hour, 6, 'it runs on from there');
});

test('jumpTo sets the rate it is given (the tournament day runs at 1 minute a second)', () => {
  const c = jumpTo(townClockFor(600), 100, 300, 1);
  assert.equal(c.rate, 1);
  assert.equal(townTimeOf(c, 100 + 17 * 60).hour, 22, '17 hours of a tournament day from 05:00 end at 22:00');
});

test('hour and day stay continuous (never decrease) over three retimes and a jump', () => {
  let c: TownClock = townClockFor(600);
  const switches: [number, (k: TownClock) => TownClock][] = [
    [500, k => retime(k, 500, 1)],
    [1000, k => retime(k, 1000, 2.4)],
    [1500, k => jumpTo(k, 1500, 300, 1)],
    [2600, k => retime(k, 2600, 1440 / 1800)],
  ];
  let next = 0, lastH = -Infinity, lastD = -Infinity;
  for (let t = 0; t <= 4000; t += 0.1) {
    if (next < switches.length && t >= switches[next]![0]) { const [at, f] = switches[next]!; const before = townMinute(c, at); c = f(c); if (at !== 1500) assert.ok(Math.abs(townMinute(c, at) - before) < 1e-6, `no jump at ${at}`); next++; }
    const h = townHourIndex(c, t), d = townTimeOf(c, t).day;
    assert.ok(h >= lastH, `hour index fell at ${t}: ${h} < ${lastH}`);
    assert.ok(d >= lastD, `day fell at ${t}: ${d} < ${lastD}`);
    lastH = h; lastD = d;
  }
  assert.equal(next, switches.length, 'all the switches ran');
});

test('townTimeOf: the minute and the minute of the day agree', () => {
  const c = jumpTo(townClockFor(777), 50, 610, 1.3);
  for (let t = 0; t < 3000; t += 3.7) {
    const r = townTimeOf(c, t), mi = Math.floor(r.dayMin);
    assert.equal(r.hour, Math.floor(mi / 60), `hour at ${t}`);
    assert.equal(r.minute, mi % 60, `minute at ${t}`);
    assert.equal(r.hour * 60 + r.minute, mi, `dayMin at ${t}`);
    assert.ok(r.dayMin >= 0 && r.dayMin < 1440, `dayMin range at ${t}`);
  }
});

// a golf City on open ground with a clubhouse, the town day set to 600 s as the worker's townDay message does
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
const CLUB: BizDef = { id: 2, type: 'clubhouse', x: 1000, y: 1000, w: 40, h: 24 };
function golfCity(): City {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  city.setBusinesses([CLUB]);
  city.setGolf({ tier: 1, rep: 40 });
  city.sim.dayLen = 600; city.sim.townFree = true; city.sim.town = retime(city.sim.town, city.sim.t, 1440 / 600);
  return city;
}

test('golf City: the tournament day reads 05:00 at its start at rate 1, and the normal rate is back after closeRound', () => {
  const city = golfCity();
  // 30 s short of the first game day's end (the season's boundary), so the tournament starts within the steps
  city.sim.shift = 1440 - 30 - city.sim.t;
  for (let k = 0; k < 100 && city.round.stage === 'free'; k++) city.step(10);
  assert.notEqual(city.round.stage, 'free', 'the tournament started');
  assert.equal(city.tourneyDay, true, 'the tournament day is running');
  const r = townTimeOf(city.sim.town, city.sim.t);
  assert.equal(r.hour, 5, `the town reads 05:00 (${r.hour}:${r.minute})`);
  assert.equal(r.minute, 0);
  assert.equal(city.sim.town.rate, 1, 'the clock runs at 1 game minute a sim second');

  // the round's surge and eval; the day ends at the close (or earlier at 22:00, see City.dayOver)
  let steps = 0;
  while (city.round.stage === 'surge' && steps++ < 200) city.step(100);
  if (city.round.stage === 'eval' && city.round.draft) city.pickCard(city.round.draft[0]!);
  if (city.round.stage === 'eval') assert.equal(city.closeRound(), true, 'the round closes');
  assert.equal(city.round.stage, 'free', 'the round is free again');
  assert.equal(city.tourneyDay, false, 'the tournament day has ended');
  assert.ok(Math.abs(city.sim.town.rate - 1440 / 600) < 1e-9, `the normal rate is back (${city.sim.town.rate})`);
});

test('simTimeAt is townMinute backwards on a piece (a stopped clock gives its t0)', () => {
  const c: TownClock = { t0: 120, m0: 390, rate: 2.4 };
  for (const t of [120, 133.5, 600, 28800]) assert.ok(Math.abs(simTimeAt(c, townMinute(c, t)) - t) < 1e-6, `t ${t}`);
  assert.equal(simTimeAt({ t0: 50, m0: 300, rate: 0 }, 900), 50);
});

test("a golf town hour's lot trips leave within that hour in sim seconds (T098: town minutes are not sim seconds)", () => {
  let seed = 7;
  const lt = new LotTrips(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const lot = (key: string, x: number, y: number) => ({ key, c: { x, y } }) as unknown as Lot;
  lt.setBuilt([{ lot: lot('home', 100, 100), use: LU.RES, pop: 1000, jobs: 0 }, { lot: lot('work', 120, 100), use: LU.COM, pop: 0, jobs: 200 }]);
  // 08:00 on day 3 at sim time 100, a 600 s day (2.4 town minutes a sim second): the hour is 25 sim seconds long
  const rate = 1440 / 600, t = 100, sim = { townFree: true, town: { t0: t, m0: 2 * 1440 + 8 * 60, rate }, t, dayLen: 600, townTraffic: 1, stats: { dropped: 0 } } as unknown as Sim;
  lt.step(sim);
  const due = (lt as unknown as { busy: { pend: { due: number }[] }[] }).busy.flatMap(r => r.pend.map(p => p.due));
  assert.ok(due.length > 0, 'the morning hour makes trips');
  for (const d of due) assert.ok(d >= t && d < t + 60 / rate, `a trip leaves at sim ${d.toFixed(1)}, within 08:00-09:00 (sim ${t}-${t + 60 / rate})`);
});
