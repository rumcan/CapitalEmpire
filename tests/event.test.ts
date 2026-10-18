// The event's headless tests (Phase 5 step 2b): the stadium site on seeds 1-3, the crowd split, the round's stages, and a City's round
// (the clock frozen at 18:00, the upkeep paid as the sim runs, kick-off to eval, the close). npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain } from '../src/game/terrain';
import { townCentres } from '../src/game/lots/seedtowns';
import { crowdFor, insideSite, placeStadium } from '../src/game/event/site';
import { SITE_MAX, SITE_MIN, EVENT_CLOCK, BUILD_S, SURGE_S } from '../src/game/event/config';
import { Round } from '../src/game/event/round';
import { City } from '../src/game/city';
import { GAME_DAY } from '../src/game/budget';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('placeStadium on seeds 1-3: a site, fully buildable, each town centre SITE_MIN..SITE_MAX away (or the relaxed bound), deterministic', () => {
  for (const seed of [1, 2, 3]) {
    const t = generateTerrain(seed), centres = townCentres(t);
    const s = placeStadium(t.cls, centres);
    assert.ok(s, `seed ${seed}: a site`);
    const ds = centres.map(c => Math.hypot(c.x - s.c.x, c.y - s.c.y));
    const far = Math.max(...ds), near = Math.min(...ds);
    console.log(`seed ${seed}: stadium centre (${s.c.x}, ${s.c.y}), footprint (${s.x}, ${s.y}) ${s.w} x ${s.h}; town distances ${ds.map(d => d.toFixed(0)).join(', ')} tiles (bound ${SITE_MIN}-${SITE_MAX})`);
    assert.ok(near >= SITE_MIN && far <= SITE_MAX, `seed ${seed}: the distances ${near.toFixed(0)}-${far.toFixed(0)} within the bound`);
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const c = t.cls[y * MAP + x];
      assert.ok(c === TC.GROUND || c === TC.PATCH, `seed ${seed}: tile (${x}, ${y}) buildable`);
    }
    assert.equal(s.doors.length, 4, 'four doors');
    for (const d of s.doors) assert.ok(!insideSite(s, d.x, d.y), 'each door outside the footprint');
    assert.deepEqual(placeStadium(t.cls, centres), s, `seed ${seed}: deterministic`);
  }
});

test('placeStadium with no centres is null; on an all-GROUND map the site is found and the search is deterministic', () => {
  const cls = new Uint8Array(MAP * MAP);
  assert.equal(placeStadium(cls, []), null);
  const centres = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
  const s = placeStadium(cls, centres);
  assert.ok(s, 'a site on open ground');
  assert.deepEqual(placeStadium(cls, centres), s);
  assert.equal(s.c.x % 16, 0, 'the centre is on the 16-tile lattice');
});

test('crowdFor: level 1 sends 1200 cars and level 2 sends 1680, split by population share; zeros split evenly; the parts sum to the total', () => {
  assert.deepEqual(crowdFor(1, [1000, 900, 1100]), [400, 360, 440]);
  assert.equal(sum(crowdFor(1, [1000, 900, 1100])), 1200);
  assert.equal(sum(crowdFor(2, [1000, 900, 1100])), 1680);
  assert.deepEqual(crowdFor(1, [0, 0, 0]), [400, 400, 400]);
  assert.deepEqual(crowdFor(2, [0, 0, 0]), [560, 560, 560]);
  const seven = crowdFor(1, [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(sum(seven), 1200);
  assert.ok(Math.max(...seven) - Math.min(...seven) <= 1, 'largest remainder: the parts differ by at most one');
  assert.deepEqual(crowdFor(1, []), []);
});

test('Round: start, wall(600) into surge, sim(600) into eval, close into free with one run; a mid-surge save restores as free', () => {
  const r = new Round();
  assert.equal(r.start([3, 4]), true);
  assert.equal(r.stage, 'build'); assert.equal(r.buildLeft, BUILD_S);
  assert.equal(r.start([1]), false, 'a second start is refused');
  assert.equal(r.wall(BUILD_S), true, 'the build is done');
  assert.equal(r.stage, 'surge'); assert.equal(r.surgeLeft, SURGE_S);
  assert.equal(r.sim(SURGE_S / 2), false);
  assert.equal(r.sim(SURGE_S / 2), true, 'kick-off');
  assert.equal(r.stage, 'eval');
  assert.deepEqual(r.last, { level: 1, run: 1, sent: 7, arrived: 0, rate: 0, upkeep: 0, byTown: [] });
  assert.equal(r.close(), true);
  assert.equal(r.stage, 'free'); assert.equal(r.runs, 1);

  const m = new Round();
  m.start([5]); m.wall(BUILD_S);
  const mid = Round.from(JSON.parse(JSON.stringify(m.view())));
  assert.equal(mid.stage, 'free', 'a mid-surge save restores as free');
  assert.equal(mid.level, 1); assert.equal(mid.runs, 0); assert.equal(mid.last, null);
  const done = Round.from(JSON.parse(JSON.stringify(r.view())));
  assert.equal(done.stage, 'free'); assert.equal(done.runs, 1); assert.deepEqual(done.last, r.last, 'the last result is kept');
});

/** a 3 x 3 grid of streets, 40 tiles apart, with a dead-end street (as in clock.test.ts) */
const O = 40, STEP = 40, N = 3, at = (k: number) => O + k * STEP, last = at(N - 1);
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function gridEditor(): NetEditor {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.addLegs([leg(last, last, last + 120, last)], CLASS.street, 0);
  return e;
}
/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];

test('City: no site without towns, and startRound is refused with no site or a round under way', () => {
  const bare = new City(1);
  assert.equal(bare.startRound(), false);
  assert.equal(bare.round.stage, 'free');
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  city.netOps(gridEditor().commit(true));
  assert.ok(city.site, 'the towns give a site');
  assert.equal(city.startRound(), true);
  assert.equal(city.startRound(), false, 'a second round is refused');
});

test('City round: the clock freezes at 18:00; money falls with the upkeep over build and surge; kick-off ends in eval; closeRound unfreezes', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  city.netOps(gridEditor().commit(true));
  const rate = city.upkeepRate();
  assert.ok(rate > 0, `the roads cost upkeep (${rate.toFixed(2)} $ a day)`);
  assert.equal(city.startRound(), true);
  assert.equal(city.round.stage, 'build');
  assert.equal(sum(city.round.crowd), 1200, 'the crowd of level 1');
  assert.equal(city.sim.frozen, true);
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands at 18:00');

  const m0 = city.budget.money, t0 = city.sim.t;
  for (let k = 0; k < 50; k++) city.step(100); // 500 sim s of build
  assert.equal(city.round.stage, 'build', 'the build waits for its wall-clock time');
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands through the build');
  city.wall(BUILD_S / 2); assert.equal(city.round.stage, 'build');
  city.wall(BUILD_S / 2); assert.equal(city.round.stage, 'surge', 'the build is done: the surge');

  let steps = 0;
  while (city.round.stage === 'surge' && steps++ < 200) city.step(100);
  assert.equal(city.round.stage, 'eval', 'kick-off ends in eval');
  assert.ok(city.round.last, 'a result');
  assert.equal(city.round.last.sent, 1200);
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands through the surge');

  const paid = m0 - city.budget.money, expect = rate * (city.sim.t - t0) / GAME_DAY;
  assert.ok(paid > 0, 'money fell');
  assert.ok(Math.abs(paid - expect) <= 0.01 * expect, `paid ${paid.toFixed(2)} $ about rate x time / 1440 = ${expect.toFixed(2)} $`);
  assert.ok(Math.abs(city.round.last.upkeep - paid) <= 0.01 * paid, 'the result carries the upkeep paid');

  assert.equal(city.closeRound(), true);
  assert.equal(city.round.stage, 'free'); assert.equal(city.round.runs, 1);
  assert.equal(city.sim.frozen, false, 'closeRound unfreezes the clock');
});
