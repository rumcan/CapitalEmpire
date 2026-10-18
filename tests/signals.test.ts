// Actuated against fixed-time signals at a four-arm signalised junction of two arterials (two lanes each way): 900 veh/h from the
// west (east-bound) and 150 veh/h from the north (south-bound), all straight on. Measured after a 5 min warm-up over 30 min: the
// vehicles through the junction (veh/h, all arms), and the mean wait at the line per north car. The fixed-time run is the reference
// cycle (Sim.fixedSignals: 18 s green, 3 s amber, 2 s all-red per phase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Pt2 = [number, number];
const leg = (a: Pt2, b: Pt2): Leg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });

/** a four-arm crossing of two arterials through (300, 300), 200 m arms, its node a traffic light */
function crossing(): LaneGraph {
  const e = new NetEditor(new RoadNetwork());
  const legs: [Pt2, Pt2][] = [[[100, 300], [300, 300]], [[300, 300], [500, 300]], [[300, 100], [300, 300]], [[300, 300], [300, 500]]];
  for (const [a, b] of legs) e.addLegs([leg(a, b)], CLASS.arterial, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  e.setNodeType(e.net.nodeAt({ x: 300, y: 300 })!, 'signal'); e.commit(); g.update(e.net);
  return g;
}
/** the dseg that runs from point a to point b */
function dsegOf(g: LaneGraph, a: Pt2, b: Pt2): number {
  for (const d of g.dsegs) if (d && d.from.x === a[0] && d.from.y === a[1] && d.to.x === b[0] && d.to.y === b[1]) return d.id;
  throw new Error(`no dseg from ${a} to ${b}`);
}

/** one run: fixed or actuated signals; returns the junction's throughput (veh/h, all arms) and the north approach's wait at the line */
function run(fixed: boolean, seed: number) {
  const g = crossing();
  assert.deepEqual(checkGraph(g), []);
  assert.equal(g.signals.size, 1, 'one signal plan at the crossing');
  const west = dsegOf(g, [100, 300], [300, 300]), east = dsegOf(g, [300, 300], [500, 300]);
  const north = dsegOf(g, [300, 100], [300, 300]), south = dsegOf(g, [300, 300], [300, 500]);
  const wLanes = g.dsegs[west]!.lanes, nLanes = g.dsegs[north]!.lanes, northSet = new Set(nLanes);
  const eDest = g.lanes[g.dsegs[east]!.lanes[0]!]!.len - 5, sDest = g.lanes[g.dsegs[south]!.lanes[0]!]!.len - 5;
  const sim = new Sim(g, 600, seed);
  sim.fixedSignals = fixed;
  const prevAlive = new Uint8Array(sim.cap), prevLane = new Int32Array(sim.cap), prevWait = new Float32Array(sim.cap);
  const warm = 300, end = 2100;
  let accW = 0, accN = 0, nw = 0, nn = 0, through = 0, northIn = 0, waitSum = 0;
  for (let k = 1; k <= Math.round(end / DT); k++) {
    accW += 900 * DT / 3600; while (accW >= 1) { accW -= 1; sim.spawnAt(wLanes[nw++ % wLanes.length]!, 2, east, eDest); }
    accN += 150 * DT / 3600; while (accN >= 1) { accN -= 1; sim.spawnAt(nLanes[nn++ % nLanes.length]!, 2, south, sDest); }
    for (let i = 0; i < sim.cap; i++) { prevAlive[i] = sim.alive[i]!; prevLane[i] = sim.lane[i]!; prevWait[i] = sim.wait[i]!; }
    sim.step();
    if (k * DT < warm) continue;
    // a car that leaves a link lane for a node lane has been through the junction; its wait at the line is what it had before this step
    for (let i = 0; i < sim.cap; i++) {
      if (!prevAlive[i] || !sim.alive[i]) continue;
      if (g.lanes[prevLane[i]!]!.kind !== LK.LINK || g.lanes[sim.lane[i]!]!.kind === LK.LINK) continue;
      through++;
      if (northSet.has(prevLane[i]!)) { northIn++; waitSum += prevWait[i]!; }
    }
  }
  const hours = (end - warm) / 3600;
  return { through: through / hours, north: northIn / hours, meanWait: northIn ? waitSum / northIn : 0, towed: sim.stats.towed };
}

test('signals: actuated plans put more vehicles through a 900 + 150 veh/h crossing than fixed time, and the north approach waits less', () => {
  const f = run(true, 81), a = run(false, 81);
  console.log(`signals fixed: ${f.through.toFixed(0)} veh/h through (north ${f.north.toFixed(0)}), north mean wait ${f.meanWait.toFixed(1)} s, towed ${f.towed}`);
  console.log(`signals actuated: ${a.through.toFixed(0)} veh/h through (north ${a.north.toFixed(0)}), north mean wait ${a.meanWait.toFixed(1)} s, towed ${a.towed}`);
  assert.ok(a.through > f.through, `actuated ${a.through.toFixed(0)} veh/h through against fixed ${f.through.toFixed(0)}`);
  assert.ok(a.meanWait < f.meanWait, `north wait ${a.meanWait.toFixed(1)} s actuated against ${f.meanWait.toFixed(1)} s fixed`);
});
