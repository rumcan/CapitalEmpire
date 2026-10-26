// A new game starts at its own month (T135, issue #259): the season month is read from the city's game clock, which a new valley
// (City.terrain: every new game, from the gear menu or a fresh load) starts again at the season's first instant, so a game played on to Jul 1985
// is followed by one in Sep 1984, on town day 1, with fresh books and no tournament; the physics time runs on. The range's today counts start
// again too (RangeSim.newDay).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import type { BizDef } from '../src/game/business/state';
import { GAME_DAY } from '../src/game/budget';
import { MAP } from '../src/game/iso';
import { MONTH_LEN, seasonLabel } from '../src/game/golf/calendar';
import { townTimeOf } from '../src/game/sim/townclock';
import { RangeSim } from '../src/game/golf/rangebiz';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
const CLUB: BizDef = { id: 2, type: 'clubhouse', x: 1000, y: 1000, w: 40, h: 24 };

/** a new golf valley on open ground, as the engine's sendTerrain gives the worker for every new game */
function valley(city: City, seed: number): void { city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, seed, CENTRES, undefined, true); }
/** a golf game's city, as the browser's worker has it */
function golfCity(): City {
  const city = new City(7); city.autoStadium = false;
  valley(city, 7); city.setGolf({ tier: 1, rep: 40 });
  return city;
}
/** the season the HUD shows (Engine.golfView: seasonLabel of the clock and the seasons played) */
const label = (city: City) => seasonLabel(city.sim.clock, city.round.runs);
/** the town day (1-based) the HUD shows */
const townDay = (city: City) => townTimeOf(city.sim.town, city.sim.t).day;

test('a fresh game starts in Sep 1984, on town day 1, its books from day 1', () => {
  const city = golfCity();
  assert.equal(label(city), 'Sep 1984');
  assert.equal(townDay(city), 1);
  assert.equal(city.budget.dayOf(city.sim.clock), 1);
});

test('a new game after one played on to Jul 1985 starts in Sep 1984 again: the season clock, the town day and the books start again', () => {
  const city = golfCity();
  // the old game: ten months and a bit into the season (Jul 1985), several town days in, the books a day on
  for (let k = 0; k < 20; k++) city.step(10);
  city.sim.shift = 10 * MONTH_LEN + 30 - city.sim.t;
  city.sim.town = { t0: city.sim.t, m0: 3 * 1440 + 600, rate: city.sim.town.rate };
  for (let k = 0; k < 20; k++) city.step(10);
  assert.equal(label(city), 'Jul 1985', 'the old game is in Jul 1985');
  assert.equal(townDay(city), 4, 'on town day 4');
  const t = city.sim.t;
  // New game
  valley(city, 8); city.setGolf({ tier: 1, rep: 40 });
  assert.equal(city.sim.clock, 0, 'the clock at the season\'s first instant');
  assert.equal(label(city), 'Sep 1984', 'the new game starts in Sep 1984, not Jul 1985');
  assert.equal(townDay(city), 1, 'on town day 1');
  assert.ok(townTimeOf(city.sim.town, city.sim.t).dayMin < 1, 'at the town day\'s midnight');
  assert.equal(city.budget.base, 0, 'the books start at the clock\'s first day');
  assert.equal(city.budget.dayOf(city.sim.clock), 1);
  assert.equal(city.round.runs, 0, 'no seasons played');
  assert.ok(city.sim.t >= t, 'the physics time runs on (nothing that reads it jumps back)');
  // and it plays on from there
  for (let k = 0; k < 30; k++) city.step(10);
  assert.ok(city.sim.clock > 0 && city.sim.clock < MONTH_LEN, `the clock runs on from 0 (${city.sim.clock})`);
  assert.equal(label(city), 'Sep 1984');
});

test('a new game during the tournament day (the clock frozen at the season\'s end) starts unfrozen in Sep 1984, with no round', () => {
  const city = golfCity();
  city.setBusinesses([CLUB]);
  city.sim.shift = GAME_DAY - 30 - city.sim.t;
  for (let k = 0; k < 100 && city.round.stage === 'free'; k++) city.step(10);
  assert.equal(city.round.stage, 'surge', 'the tournament runs');
  assert.ok(city.sim.frozen, 'the clock is frozen');
  valley(city, 9); city.setGolf({ tier: 1, rep: 40 });
  assert.equal(city.sim.frozen, false, 'the clock runs');
  assert.equal(city.round.stage, 'free', 'no round');
  assert.equal(label(city), 'Sep 1984');
  assert.equal(townDay(city), 1);
  const c = city.sim.clock;
  for (let k = 0; k < 10; k++) city.step(10);
  assert.ok(city.sim.clock > c, 'the clock moves');
});

test("the range's today counts start again with a new game (RangeSim.newDay)", () => {
  const r = new RangeSim(1, 4);
  r.today.golfers = 12; r.today.lost = 3; r.today.coffees = 2; r.practiceToday.putting = 5;
  r.newDay();
  assert.deepEqual(r.today, { golfers: 0, lost: 0, queue: 0, playing: 0, coffees: 0, lessons: 0, kioskQueue: 0, upstairs: 0 });
  assert.deepEqual(r.practiceToday, { putting: 0, chipping: 0 });
});
