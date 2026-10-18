// Gap acceptance at an unsignalled T: a boulevard west to east at a steady 600 veh/h (the major flow), and a street from the south
// whose cars turn right onto the boulevard eastbound. The minor approach is kept queued (1200 veh/h asked; a car is refused when its
// lane has no room). Measured after a 5 min warm-up over 25 min: the minor throughput (veh/h, cars that leave the approach for the
// junction) and the mean wait at the line per minor car. A second run at 150 veh/h minor shows the wait at low volume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Pt2 = [number, number];
const leg = (a: Pt2, b: Pt2): Leg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });

/** the T: a boulevard from (100, 300) to (700, 300) through a node at (400, 300), and a street from (400, 500) into it */
function tJunction(): LaneGraph {
  const e = new NetEditor(new RoadNetwork());
  const legs: [Pt2, Pt2, RoadClass][] = [[[100, 300], [400, 300], CLASS.boulevard], [[400, 300], [700, 300], CLASS.boulevard], [[400, 500], [400, 300], CLASS.street]];
  for (const [a, b, c] of legs) e.addLegs([leg(a, b)], c, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  return g;
}
/** the dseg that runs from point a to point b */
function dsegOf(g: LaneGraph, a: Pt2, b: Pt2): number {
  for (const d of g.dsegs) if (d && d.from.x === a[0] && d.from.y === a[1] && d.to.x === b[0] && d.to.y === b[1]) return d.id;
  throw new Error(`no dseg from ${a} to ${b}`);
}

/** one run: major veh/h west to east, minor veh/h from the south (right turn east); returns the minor throughput and waits */
function run(major: number, minor: number, seed: number) {
  const g = tJunction();
  assert.deepEqual(checkGraph(g), []);
  const west = dsegOf(g, [100, 300], [400, 300]), east = dsegOf(g, [400, 300], [700, 300]), south = dsegOf(g, [400, 500], [400, 300]);
  const westLane = g.dsegs[west]!.lanes[0]!, southLane = g.dsegs[south]!.lanes[0]!;
  const destS = g.lanes[g.dsegs[east]!.lanes[0]!]!.len - 5;
  const sim = new Sim(g, 400, seed);
  const prevAlive = new Uint8Array(sim.cap), prevLane = new Int32Array(sim.cap), prevWait = new Float32Array(sim.cap);
  const warm = 300, end = 1800;
  let accMaj = 0, accMin = 0, majorIn = 0, minorIn = 0, entries = 0, waitSum = 0;
  for (let k = 1; k <= Math.round(end / DT); k++) {
    accMaj += major * DT / 3600; while (accMaj >= 1) { accMaj -= 1; if (sim.spawnAt(westLane, 2, east, destS) >= 0 && k * DT >= warm) majorIn++; }
    accMin += minor * DT / 3600; while (accMin >= 1) { accMin -= 1; if (sim.spawnAt(southLane, 2, east, destS) >= 0 && k * DT >= warm) minorIn++; }
    for (let i = 0; i < sim.cap; i++) { prevAlive[i] = sim.alive[i]!; prevLane[i] = sim.lane[i]!; prevWait[i] = sim.wait[i]!; }
    sim.step();
    if (k * DT < warm) continue;
    for (let i = 0; i < sim.cap; i++) {
      if (!prevAlive[i] || !sim.alive[i] || prevLane[i] !== southLane || sim.lane[i] === southLane) continue;
      if (g.lanes[sim.lane[i]!]!.kind === LK.LINK) continue;
      entries++; waitSum += prevWait[i]!;
    }
  }
  const hours = (end - warm) / 3600;
  return { major: majorIn / hours, minorAsked: minorIn / hours, thru: entries / hours, meanWait: entries ? waitSum / entries : 0, n: entries, towed: sim.stats.towed };
}

test('gap acceptance: a T with a steady 600 veh/h major flow and a queued minor right turn passes at least 400 veh/h, with the wait per car reported', () => {
  const q = run(600, 1200, 71);
  console.log(`gaps queued: major ${q.major.toFixed(0)} veh/h; minor asked 1200 veh/h, let in ${q.minorAsked.toFixed(0)} veh/h; ` +
    `minor through ${q.thru.toFixed(0)} veh/h (${q.n} cars), mean wait ${q.meanWait.toFixed(1)} s per car; towed ${q.towed}`);
  assert.ok(q.thru >= 400, `minor throughput ${q.thru.toFixed(0)} veh/h at 600 veh/h major (need 400)`);
  assert.equal(q.towed, 0, 'nothing towed');
});

test('gap acceptance: a T with a 600 veh/h major flow and 150 veh/h minor: the wait per car at low volume is reported', () => {
  const l = run(600, 150, 72);
  console.log(`gaps low: major ${l.major.toFixed(0)} veh/h; minor ${l.thru.toFixed(0)} veh/h through (${l.n} cars), mean wait ${l.meanWait.toFixed(2)} s per car; towed ${l.towed}`);
  assert.equal(l.towed, 0, 'nothing towed');
});
