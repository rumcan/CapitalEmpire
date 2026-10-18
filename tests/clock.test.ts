// The game clock (Phase 5 step 2a), headless: a frozen clock stands still while the sim runs on, and the lot trips keep their
// evening kind; with no freeze the clock is the sim time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';
import { DAY } from '../src/game/sim/trips';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { LU, builtLots } from '../src/game/lots/town';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a 3 x 3 grid of streets, 40 tiles apart, with a dead-end street (as in city.test.ts) */
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

test('a frozen clock: frozen at 18:00 for 600 sim s, the clock stays at 1080 while t runs on; unfrozen, it runs again from 1080', () => {
  const sim = new Sim(new LaneGraph(), 10, 1);
  sim.freezeAt(1080);
  for (let k = 0; k < 6000; k++) sim.step();
  assert.equal(sim.t, 600, 'the sim time ran 600 s');
  assert.ok(Math.abs(sim.clock - 1080) < 1e-6, `the clock stands at 1080 (${sim.clock})`);
  sim.unfreeze();
  for (let k = 0; k < 100; k++) sim.step();
  assert.ok(Math.abs(sim.clock - 1090) < 1e-6, `the clock runs again from 1080 (${sim.clock})`);
});

test('no freeze: the clock is the sim time, step for step (shift 0)', () => {
  const sim = new Sim(new LaneGraph(), 10, 1);
  for (let k = 0; k < 1234; k++) { sim.step(); assert.equal(sim.clock, sim.t); }
  assert.equal(sim.shift, 0);
});

test('a frozen clock at 18:00 in a built town: the lot trips keep spawning, while the town and the hour sync stand still', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7);
  city.netOps(gridEditor().commit(true));
  for (let s = 0; s < 3 * 1440; s++) city.step(10);
  const homes = builtLots(city.town, city.lots).filter(b => b.use === LU.RES && b.pop > 0).length;
  assert.ok(homes > 0, `built homes after 3 game days (${homes})`);
  // frozen at the next 18:00 (ahead of the clock, so it moves forward): the first step takes the jump and the hour sync
  const next18 = (Math.floor(city.sim.clock / DAY) + 1) * DAY + 18 * 60;
  city.freeze(next18);
  city.step(10);
  const spawned = city.sim.stats.spawned, townT = city.town.t, hours = city.hours.length;
  for (let s = 0; s < 300; s++) city.step(10);
  assert.ok(city.sim.stats.spawned > spawned, `trips spawned while frozen (${city.sim.stats.spawned - spawned})`);
  assert.equal(city.town.t, townT, 'the town does not advance');
  assert.equal(city.hours.length, hours, 'no game hour starts');
  assert.ok(Math.abs(city.sim.clock - next18) < 1e-6, 'the clock stands at 18:00');
  city.unfreeze();
  for (let s = 0; s < 100; s++) city.step(10);
  assert.ok(city.town.t > townT, 'the town advances once the clock runs again');
});
