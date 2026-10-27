// The golf season on the City (G1; GOLF-PLAN 2-3): a clubhouse is the site when there is no stadium (the stadium wins, and both stay while a round
// runs); the catalogue keeps the clubhouse out of the Business tool's list; crowdFor takes an explicit total; in golf mode the season's end (the day's
// boundary) starts the tournament at once, with one tournament day's cars and the clock frozen at the boundary, and with golf off nothing starts.
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import type { BizDef } from '../src/game/business/state';
import { BUSINESS, BUSINESSES } from '../src/game/business/catalogue';
import { crowdFor, siteAt } from '../src/game/event/site';
import { L1_CARS, LEVEL_MUL, PARTY, STADIUM_H, STADIUM_W } from '../src/game/event/config';
import { dayShare, spectatorDemand, tierInfo } from '../src/game/golf/tour';
import { applyParkingFeeDemand } from '../src/game/golf/parkingfee';
import { GAME_DAY } from '../src/game/budget';
import { MAP } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
const STAD: BizDef = { id: 1, type: 'stadium', x: 1400, y: 1400, w: STADIUM_W, h: STADIUM_H };
const CLUB: BizDef = { id: 2, type: 'clubhouse', x: 1000, y: 1000, w: 40, h: 24 };

/** a City with autoStadium off on open ground, as the browser's worker has it */
function fresh(): City {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  return city;
}

/** the clock 30 s short of the day's boundary (the first game day's end), so 30 s of steps (10 steps each) cross it */
function nearBoundary(city: City): void { city.sim.shift = GAME_DAY - 30 - city.sim.t; }

test('the site: a clubhouse alone gives siteAt of its rect; with a stadium too the stadium wins', () => {
  const city = fresh();
  city.setBusinesses([CLUB]);
  assert.deepEqual(city.site, siteAt(CLUB.x, CLUB.y, CLUB.w, CLUB.h), 'the clubhouse is the site');
  city.setBusinesses([CLUB, STAD]);
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h), 'the stadium wins');
  city.setBusinesses([CLUB]);
  assert.deepEqual(city.site, siteAt(CLUB.x, CLUB.y, CLUB.w, CLUB.h), 'the clubhouse again without the stadium');
  city.setBusinesses([]);
  assert.equal(city.site, null, 'neither: no site');
});

test('while a round is under way the clubhouse stays: a list without it, or with another spot for it, leaves the site as it was', () => {
  const city = fresh();
  city.setBusinesses([CLUB]);
  assert.equal(city.startRound(), true);
  city.setBusinesses([]);
  assert.deepEqual(city.site, siteAt(CLUB.x, CLUB.y, CLUB.w, CLUB.h), 'the site stays');
  assert.equal(city.businesses.filter(b => b.type === 'clubhouse').length, 1, 'the clubhouse is kept');
  city.setBusinesses([{ ...CLUB, x: 1100 }]);
  assert.deepEqual(city.site, siteAt(CLUB.x, CLUB.y, CLUB.w, CLUB.h), 'the spot does not move');
});

test('the catalogue: BUSINESS.clubhouse is a visit with the golf course\'s hours and the green fee; BUSINESSES has no clubhouse', () => {
  const c = BUSINESS.clubhouse;
  assert.equal(c.kind, 'visit');
  assert.equal(c.name, 'Clubhouse');
  assert.deepEqual(c.footprint, { w: 20, h: 12 });
  assert.equal(c.buildCost, 0);
  assert.equal(c.upkeepPerDay, 300);
  assert.equal(c.pricePerVisitor, 22);
  assert.equal(c.party, 4);
  assert.deepEqual(c.hours, BUSINESS.golf.hours, 'the golf course\'s hours');
  assert.equal(BUSINESSES.some(b => b.id === 'clubhouse'), false, 'the Business tool does not list it');
});

test('golf on, a clubhouse, the clock across the day\'s boundary: the tournament starts at once (surge), the clock frozen at the boundary, with one tournament day\'s cars', () => {
  const city = fresh();
  city.setBusinesses([CLUB]);
  city.setGolf({ tier: 1, rep: 40 });
  nearBoundary(city);
  for (let k = 0; k < 100 && city.round.stage === 'free'; k++) city.step(10);
  assert.equal(city.round.stage, 'surge', 'the round is in its surge');
  assert.ok(city.surge, 'the surge is planned');
  assert.ok(city.sim.frozen, 'the clock is frozen');
  assert.ok(Math.abs(city.sim.clock - GAME_DAY) < 1e-6, `the clock is frozen at the boundary (${city.sim.clock})`);
  assert.equal(city.round.crowd.reduce((a, b) => a + b, 0), Math.round(applyParkingFeeDemand(Math.round(spectatorDemand(1, 40) * dayShare(0, tierInfo(1).days)), city.parkFee) / PARTY), 'the crowd is one tournament day\'s cars, trimmed by the parking fee');
  for (let k = 0; k < 5; k++) city.step(10);
  assert.equal(city.round.stage, 'surge', 'still in the surge a few seconds on');
  assert.ok(Math.abs(city.sim.clock - GAME_DAY) < 1e-6, 'the clock stands still through the surge');
});

test('golf off, the same clubhouse and clock: the day ends with no tournament, the round stays free', () => {
  const city = fresh();
  city.setBusinesses([CLUB]);
  nearBoundary(city);
  for (let k = 0; k < 60; k++) city.step(10);
  assert.ok(city.sim.clock > GAME_DAY, 'the clock crossed the boundary');
  assert.equal(city.round.stage, 'free', 'no tournament');
  assert.equal(city.round.crowd.length, 0, 'no crowd');
});

test('golf on with no site: the boundary passes and nothing starts (the season repeats)', () => {
  const city = fresh();
  city.setGolf({ tier: 1, rep: 40 });
  nearBoundary(city);
  for (let k = 0; k < 60; k++) city.step(10);
  assert.ok(city.sim.clock > GAME_DAY, 'the clock crossed the boundary');
  assert.equal(city.round.stage, 'free', 'no site, no tournament');
});

test('golf is kept by a new valley (terrain does not reset it) and set off with null', () => {
  const city = fresh();
  city.setGolf({ tier: 2, rep: 60 });
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 8, CENTRES, undefined, true); // a valley generated in golf mode keeps it (a classic one clears it: see City.terrain)
  assert.deepEqual(city.golf, { tier: 2, rep: 60 }, 'the new valley keeps the golf mode');
  city.setGolf(null);
  assert.equal(city.golf, null, 'off');
});

test('crowdFor with an explicit total splits exactly that total by population; the default is the level\'s cars', () => {
  const pops = [3, 1, 2];
  for (const total of [0, 1, 7, 101, 140]) assert.equal(crowdFor(1, pops, total).reduce((a, b) => a + b, 0), total, `total ${total}`);
  assert.deepEqual(crowdFor(1, pops, 60), [30, 10, 20], 'by population share');
  assert.equal(crowdFor(2, [1, 1]).reduce((a, b) => a + b, 0), Math.round(L1_CARS * LEVEL_MUL), 'the default: the level\'s cars');
});
