// The bottleneck report (src/game/sim/bottlenecks.ts): the level of service bounds, and the report of a sim on a street grid. npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';
import { bottlenecks, los } from '../src/game/sim/bottlenecks';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** the sim of cars random cars on the 10 x 10 street grid of the access calibration, run for sec game seconds; the mean step time, ms */
function run(cars: number, sec: number) {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k <= 10; k++) { e.addLegs([leg(100, 100 + k * 40, 500, 100 + k * 40)], CLASS.street, 0); e.addLegs([leg(100 + k * 40, 100, 100 + k * 40, 500)], CLASS.street, 0); }
  e.commit(true); const g = new LaneGraph(); g.update(e.net);
  const sim = new Sim(g, cars, 3); sim.setTarget(cars);
  const steps = Math.round(sec / DT); let ms = 0;
  for (let k = 0; k < steps; k++) { sim.step(); ms += sim.stats.stepMs; }
  return { sim, g, ms: ms / steps };
}
/** one run per car count (the 600 car run is shared by the two report tests) */
const cache = new Map<number, ReturnType<typeof run>>();
const runOnce = (cars: number) => { let r = cache.get(cars); if (!r) { r = run(cars, 600); cache.set(cars, r); } return r; };

test('los: A at or below the first bound, F above the last, signals with their own bounds', () => {
  assert.equal(los(0, false), 'A');
  assert.equal(los(10, false), 'A'); assert.equal(los(10, true), 'A');
  assert.equal(los(10.1, false), 'B'); assert.equal(los(10.1, true), 'B');
  assert.equal(los(15, false), 'B'); assert.equal(los(15.1, false), 'C');
  assert.equal(los(50, false), 'E'); assert.equal(los(50.1, false), 'F');
  assert.equal(los(80, true), 'E'); assert.equal(los(81, true), 'F');
});

test('report: 600 cars for 10 game minutes: junctions carry traffic, top is sorted by loss and at most 10 long, levels are A..F, flow comes in sixes', () => {
  const { sim, g, ms } = runOnce(600);
  console.log(`bottlenecks: 600 cars, mean stepMs ${ms.toFixed(3)} over ${Math.round(600 / DT)} steps`);
  const r = bottlenecks(g, sim, 10);
  assert.ok(r.junctions.some(j => j.through > 0), 'some junction carries vehicles');
  assert.ok(r.top.length > 0 && r.top.length <= 10, `top has ${r.top.length} entries`);
  for (let k = 1; k < r.top.length; k++) assert.ok(r.top[k - 1]!.loss >= r.top[k]!.loss, `top sorted at ${k}`);
  for (const j of r.junctions) assert.match(j.los, /^[A-F]$/);
  for (const t of r.top) if (t.kind === 'junction') assert.match(t.los, /^[A-F]$/);
  assert.equal(r.flow.length % 6, 0, `flow has ${r.flow.length} floats`);
});

test('report: the top loss with 600 cars is larger than with 50 cars (same grid, same steps)', () => {
  const top = (cars: number) => { const { sim, g } = runOnce(cars); return bottlenecks(g, sim).top[0]?.loss ?? 0; };
  const a = top(50), b = top(600);
  console.log(`bottlenecks: top loss 50 cars ${a.toFixed(0)} veh-s/h, 600 cars ${b.toFixed(0)} veh-s/h`);
  assert.ok(b > a, `600 cars ${b.toFixed(0)} vs 50 cars ${a.toFixed(0)}`);
});
