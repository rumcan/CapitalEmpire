// Traffic incidents in the sim (T008), headless: a standing obstacle on a lane (Sim.addBlock) makes the cars behind it change lanes or queue,
// none drives past it on its lane, none is towed while it stands, no car starts just behind it; a slow zone (Sim.setSlow) slows the cars in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, checkGraph, type Lane } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** one straight road of class cls, 400 tiles (800 m) long, with dead ends: the lanes of its eastbound direction, innermost first */
function road(cls: RoadClass): { g: LaneGraph; lanes: Lane[] } {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(100, 300, 500, 300)], cls, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  assert.deepEqual(checkGraph(g), []);
  const d = g.dsegs.find(x => !!x && x.from.x < x.to.x)!;
  return { g, lanes: d.lanes.map(id => g.lanes[id]!).sort((a, b) => a.idx - b.idx) };
}

/** watches the cars of a sim pass the point at (m) on any lane: call step() after each sim step. crossed counts the passes per lane id;
 *  a pass on the lane `lane` is counted in through too (a car that drives past the obstacle there). A slot refilled by a spawn in the
 *  same step is not a pass: only a car that moved on less than 5 m in the step (a car does at most ~1.5 m a step) counts */
function watch(sim: Sim) {
  const pS = new Float64Array(sim.cap), pL = new Int32Array(sim.cap).fill(-1);
  const w = { at: 0, lane: -1, through: 0, crossed: new Map<number, number>(), step() {
    for (let i = 0; i < sim.cap; i++) {
      if (!sim.alive[i]) { pL[i] = -1; continue; }
      const L = sim.lane[i]!, s = sim.s[i]!;
      if (pL[i] === L && pS[i]! < w.at && s >= w.at && s - pS[i]! < 5) {
        w.crossed.set(L, (w.crossed.get(L) ?? 0) + 1);
        if (L === w.lane) w.through++;
      }
      pL[i] = L; pS[i] = s;
    }
  } };
  return w;
}

/** the cars on lane whose s is in [from, to] and that are slower than v m/s */
const count = (sim: Sim, lane: number, from: number, to: number, v: number) => {
  let n = 0;
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.lane[i] === lane && sim.s[i]! >= from && sim.s[i]! <= to && sim.v[i]! < v) n++;
  return n;
};

test('an obstacle on a spawn lane: no car starts within 50 m behind it, and one starts 80 m behind it', () => {
  const { g, lanes } = road(CLASS.street), l0 = lanes[0]!, at = l0.len / 2;
  const sim = new Sim(g, 10, 2);
  sim.addBlock(l0.id, at);
  assert.equal(sim.spawnAt(l0.id, at - 20, -1, 0), -1, 'a car 20 m behind the obstacle');
  assert.ok(sim.spawnAt(l0.id, at - 80, -1, 0) >= 0, 'a car 80 m behind the obstacle');
  sim.removeBlock(l0.id, at);
  assert.equal(sim.blocks.size, 0, 'lifted');
});

test('2-lane road: an obstacle on lane 0 mid-road: the cars behind it change to lane 1 and keep flowing, none drives past it on lane 0, none is towed; lifted, lane 0 is used again', () => {
  const { g, lanes } = road(CLASS.arterial), [l0, l1] = lanes as [Lane, Lane];
  const at = l0.len / 2, sim = new Sim(g, 120, 5);
  sim.setTarget(60);
  for (let k = 0; k < 1500; k++) sim.step();
  const w = watch(sim); w.at = at; w.lane = l0.id; w.step();
  sim.addBlock(l0.id, at);
  const towed0 = sim.stats.towed, lc0 = sim.stats.laneChanges, arr0 = sim.stats.arrived;
  for (let k = 0; k < 3000; k++) { sim.step(); w.step(); }
  assert.equal(w.through, 0, 'cars drove past the obstacle on lane 0');
  assert.ok((w.crossed.get(l1.id) ?? 0) > 20, `cars passing on lane 1: ${w.crossed.get(l1.id) ?? 0}`);
  assert.ok(sim.stats.laneChanges - lc0 > 0, 'cars changed lanes');
  assert.equal(sim.stats.towed, towed0, 'a car was towed');
  assert.ok(sim.stats.arrived - arr0 > 10, `arrivals while blocked: ${sim.stats.arrived - arr0}`);
  const before = w.crossed.get(l0.id) ?? 0;
  sim.removeBlock(l0.id, at);
  for (let k = 0; k < 1500; k++) { sim.step(); w.step(); }
  const after = (w.crossed.get(l0.id) ?? 0) - before;
  assert.ok(after > 0, 'no car used lane 0 past the lifted obstacle');
  console.log(`incidents 2-lane: ${sim.stats.laneChanges - lc0} lane changes and ${w.crossed.get(l1.id) ?? 0} passes on lane 1 while blocked; ` +
    `${after} passes on lane 0 after it was lifted; towed ${sim.stats.towed - towed0}`);
});

test('1-lane road: an obstacle mid-road: the cars queue behind it, none drives past it, none is towed while it stands (400 s); lifted, the queue drains', () => {
  const { g, lanes } = road(CLASS.street), l0 = lanes[0]!;
  const at = l0.len / 2, sim = new Sim(g, 60, 9);
  sim.setTarget(30);
  for (let k = 0; k < 1500; k++) sim.step();
  const w = watch(sim); w.at = at; w.lane = l0.id; w.step();
  sim.addBlock(l0.id, at);
  const towed0 = sim.stats.towed;
  for (let k = 0; k < 4000; k++) { sim.step(); w.step(); }
  assert.equal(w.through, 0, 'cars drove past the obstacle');
  assert.equal(sim.stats.towed, towed0, 'a car was towed while the obstacle stood');
  const queued = count(sim, l0.id, at - 100, at, 0.5);
  assert.ok(queued >= 5, `cars queued behind the obstacle: ${queued}`);
  const before = w.crossed.get(l0.id) ?? 0;
  sim.removeBlock(l0.id, at);
  for (let k = 0; k < 1500; k++) { sim.step(); w.step(); }
  const passed = (w.crossed.get(l0.id) ?? 0) - before;
  assert.ok(passed >= 5, `cars past the lifted obstacle: ${passed}`);
  assert.equal(sim.stats.towed, towed0, 'a car was towed as the queue drained');
  console.log(`incidents 1-lane: ${queued} cars queued within 100 m of the obstacle; ${passed} passes after it was lifted; towed ${sim.stats.towed - towed0}`);
});

test('a slow zone: the cars in it drive at the zone factor of their speed (their mean speed under 0.8 of the same road without it)', () => {
  // a 1-lane road: on a 2-lane one the cars move out of the zone (MOBIL: a free neighbour is worth a change), so the test would measure the rest
  const { g, lanes } = road(CLASS.street), l0 = lanes[0]!, from = 200, to = 600;
  const meanInside = (zone: boolean) => {
    const sim = new Sim(g, 60, 4);
    sim.setTarget(30);
    if (zone) sim.setSlow(l0.id, [{ from, to, factor: 0.5 }]);
    let sum = 0, n = 0;
    for (let k = 1; k <= 3000; k++) {
      sim.step();
      if (k < 1000 || k % 10 !== 0) continue;
      for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.lane[i] === l0.id && sim.s[i]! >= from && sim.s[i]! <= to) { sum += sim.v[i]!; n++; }
    }
    return { mean: sum / n, n };
  };
  const free = meanInside(false), slow = meanInside(true);
  assert.ok(free.n > 50 && slow.n > 50, `samples ${free.n} and ${slow.n}`);
  assert.ok(slow.mean < 0.8 * free.mean, `mean speed in the zone ${slow.mean.toFixed(2)} m/s against ${free.mean.toFixed(2)} m/s free`);
  console.log(`incidents slow zone: ${slow.mean.toFixed(2)} m/s inside a 0.5 zone against ${free.mean.toFixed(2)} m/s free (${(slow.mean / free.mean).toFixed(2)}x)`);
});
