// Natural disasters in the city, headless (the disasters wiring): off by default; a forced landslide closes its steep street both ways (a standing
// block at 1 m on each lane, and the router closes its dsegs), the cars drive round it on a ladder of streets (a control run without the closure
// drives through it), and the blocks go when it ends; a forced quake closes a bridge until it is repaired: the repair is paid, or refused with no money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, SK, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { HS } from '../src/game/terrain/types';
import type { DSeg } from '../src/game/sim/lanes';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** the heights: a ramp of 60 m over street A's stretch from x 400 to 500 (a slope of 0.3, steep), flat everywhere else */
function heights(): Float32Array {
  const h = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const x = i * 8 + 4, y = j * 8 + 4;
    h[j * HS + i] = y < 330 && x >= 400 && x <= 500 ? (x - 400) * 0.6 : 0;
  }
  return h;
}

/** the ladder: street A (y 300) from the feeder's end at x 200 to 800, with its middle stretch 400 to 500 (steep); street B (y 360) from 200 to 800;
 *  the connectors at x 200 and x 800 (the east one a bridge when bridge); the feeder from x 100 to 200 on street A's line is where the cars start */
function ladder(bridge = false): City {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 100, y: 300 }, 7, [], heights());
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(100, 300, 200, 300), leg(200, 300, 400, 300), leg(400, 300, 500, 300), leg(500, 300, 800, 300), leg(200, 300, 200, 360), leg(200, 360, 800, 360)], CLASS.street, 0);
  e.addLegs([leg(800, 300, 800, 360)], CLASS.street, 0, [bridge ? SK.BRIDGE : SK.GROUND]);
  city.netOps(e.commit(true));
  city.setIncidents(false);
  return city;
}

/** the directed dsegs of the seg between (ax, ay) and (bx, by): both ways (their lanes are the seg's) */
function dsegsBetween(city: City, ax: number, ay: number, bx: number, by: number): DSeg[] {
  return city.sim.g.dsegs.filter((d): d is DSeg => !!d && ((d.from.x === ax && d.from.y === ay && d.to.x === bx && d.to.y === by) || (d.from.x === bx && d.from.y === by && d.to.x === ax && d.to.y === ay)));
}
const laneIds = (ds: DSeg[]): number[] => ds.flatMap(d => d.lanes);

/** cars sent from the feeder once a second for secs s, toward the westbound dseg of street A's east part (its end at x 500); the lanes they were on, as a set */
function drive(city: City, secs: number): Set<number> {
  const sim = city.sim, src = dsegsBetween(city, 100, 300, 200, 300).find(d => d.from.x === 100)!;
  const dest = dsegsBetween(city, 800, 300, 500, 300).find(d => d.from.x === 800)!, seen = new Set<number>();
  for (let k = 0; k < secs; k++) {
    sim.spawnAt(src.lanes[0]!, 10, dest.id, dest.len - 5, 0, -1, -1);
    for (let s = 0; s < 10; s++) {
      city.step(1);
      for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) seen.add(sim.lane[i]!);
    }
  }
  return seen;
}

test('the disasters are off by default: a forced kind does nothing and nothing is blocked', () => {
  const city = ladder();
  assert.equal(city.disasters, false);
  assert.equal(city.forceDisaster('landslide'), false);
  assert.deepEqual(city.disasterFrame(), { active: [], notes: [] }, 'the new valley clears the main thread once');
  city.step(50);
  assert.equal(city.sim.blocks.size, 0);
  assert.equal(city.disasterFrame(), null, 'no change to report');
});

test('a landslide closes its steep street both ways: blocks at 1 m, the cars drive round it, and the blocks go when it ends', () => {
  const steep = laneIds(dsegsBetween(ladder(), 400, 300, 500, 300));
  assert.ok(steep.length >= 2, 'street A middle has lanes both ways');
  // the control: no disasters, the cars drive the street
  const free = drive(ladder(), 60);
  assert.ok(steep.some(l => free.has(l)), 'without the closure the cars use the street');
  const city = ladder();
  city.setDisasters(true);
  assert.equal(city.forceDisaster('landslide'), true);
  city.sim.t = 1439.9; city.step(3);
  for (const l of steep) assert.ok(city.sim.blocks.get(l)?.includes(1), `lane ${l} blocked at 1 m`);
  // the incidents switch clears every block on the sim; the closure goes back on
  city.setIncidents(true); city.setIncidents(false);
  for (const l of steep) assert.ok(city.sim.blocks.get(l)?.includes(1), `lane ${l} still blocked after the incidents switch`);
  const f = city.disasterFrame();
  assert.ok(f);
  assert.deepEqual(f.notes.map(n => n.k), ['started']);
  assert.equal(f.active[0]!.kind, 'landslide');
  assert.equal(f.active[0]!.closures.length, 1);
  assert.equal(f.active[0]!.closures[0]!.repair, false, 'a landslide closure is not paid for');
  const seen = drive(city, 60);
  assert.deepEqual(steep.filter(l => seen.has(l)), [], 'no car drove onto the closed street');
  assert.ok(laneIds(dsegsBetween(city, 200, 360, 800, 360)).some(l => seen.has(l)), 'the cars drove the street B way round');
  while (city.sim.t < 1745) city.step(10);
  for (const l of steep) assert.equal(city.sim.blocks.get(l), undefined, `lane ${l} lifted`);
  assert.equal(city.sim.blocks.size, 0);
  assert.deepEqual(city.disasterFrame()?.notes.map(n => n.k), ['ended']);
});

test('a quake closes its bridge until it is repaired: the repair is paid, refused with no money, and reopens the bridge', () => {
  const city = ladder(true);
  city.setDisasters(true);
  assert.equal(city.forceDisaster('quake'), true);
  city.sim.t = 1439.9; city.step(3);
  const f = city.disasterFrame();
  assert.ok(f);
  const d = f.active[0]!, c = d.closures[0]!;
  assert.equal(d.end, Infinity, 'a quake holds until its closures are repaired');
  assert.equal(d.closures.length, 1);
  assert.equal(c.repair, true);
  assert.equal(c.cost, 12000, 'a bridge costs 12000 $ to repair');
  assert.deepEqual([c.x, c.y], [800, 330], 'the midpoint of the bridge');
  const bridge = laneIds(dsegsBetween(city, 800, 300, 800, 360));
  for (const l of bridge) assert.ok(city.sim.blocks.get(l)?.includes(1), `bridge lane ${l} blocked`);
  city.budget.money = 100;
  assert.equal(city.repairDisaster(d.id, c.key), false, 'no money: refused');
  assert.equal(city.budget.money, 100);
  assert.deepEqual(city.disasterFrame()?.notes.map(n => n.k), ['unpaid']);
  city.budget.money = 50000;
  assert.equal(city.repairDisaster(d.id, c.key), true);
  assert.equal(city.budget.money, 38000, 'the cost is spent');
  city.step(10);
  for (const l of bridge) assert.equal(city.sim.blocks.get(l), undefined, `bridge lane ${l} reopened`);
  assert.deepEqual(city.disasterFrame()?.notes.map(n => n.k), ['repaired', 'ended']);
  assert.equal(city.repairDisaster(d.id, c.key), false, 'nothing left to repair');
});
