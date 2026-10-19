// Actuated against fixed-time signals at a four-arm signalised junction of two arterials (two lanes each way): 900 veh/h from the
// west (east-bound) and 150 veh/h from the north (south-bound), all straight on. Measured after a 5 min warm-up over 30 min: the
// vehicles through the junction (veh/h, all arms), and the mean wait at the line per north car. The fixed-time run is the reference
// cycle (Sim.fixedSignals: 18 s green, 3 s amber, 2 s all-red per phase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph, type SignalPlan } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';
import { fixedToRed, stepSignals } from '../src/game/sim/signals';

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

/** a two-phase plan for stepSignals: phase 0 on lane 0, phase 1 on lane 1, with the tier, the fixed-time greens, amber 3 s and all-red 2 s */
const plan2 = (mode: 0 | 1 | 2, greens = [18, 18]): SignalPlan => ({ node: null as unknown as SignalPlan['node'], mode, armPhase: [0, 1], phases: 2, green: 18, greens, amber: 3, allRed: 2, offset: 0, idx: 0, stage: 0, el: 0, phaseLanes: [[0], [1]] });
/** a three-phase plan: phase k on lane k */
const plan3 = (mode: 0 | 1 | 2): SignalPlan => ({ node: null as unknown as SignalPlan['node'], mode, armPhase: [0, 1, 2], phases: 3, green: 18, greens: [18, 18, 18], amber: 3, allRed: 2, offset: 0, idx: 0, stage: 0, el: 0, phaseLanes: [[0], [1], [2]] });
/** the time (s) at which plan p first leaves its green, stepped alone among the given cars (lLen 200 m: a car at s is 200 - s m from the line); Infinity past secs */
function greenEnd(p: SignalPlan, onLane: number[][], s: Float64Array, spd: Float64Array, secs: number): number {
  const lLen = new Float64Array([200, 200, 200]);
  for (let k = 1; k <= Math.round(secs / DT); k++) { stepSignals([p], onLane, s, spd, lLen, DT, false, 0); if (p.stage !== 0) return k * DT; }
  return Infinity;
}
/** true if the value is the given time (s) to within two sim steps */
const at = (x: number, t: number) => Math.abs(x - t) < 2 * DT;

test('fixed-time tier: phase 0 is green 10 s then amber and all-red, phase 1 green 30 s; fixedToRed matches the cycle; mode 0 steps as fixed with fixed off', () => {
  const p = plan2(0, [10, 30]), s = new Float64Array(2), spd = new Float64Array(2), lLen = new Float64Array([200, 200]);
  const stepAt = (t: number) => { stepSignals([p], [[], []], s, spd, lLen, DT, false, t); return [p.idx, p.stage]; };
  // the cycle: phase 0 green 0-10, amber 10-13, all-red 13-15; phase 1 green 15-45, amber 45-48, all-red 48-50
  assert.deepEqual([stepAt(0), stepAt(9.5), stepAt(10.5), stepAt(13.5), stepAt(15.5), stepAt(44.5), stepAt(45.5), stepAt(48.5), stepAt(50.5)], [[0, 0], [0, 0], [0, 1], [0, 2], [1, 0], [1, 0], [1, 1], [1, 2], [0, 0]]);
  // fixedToRed: 8 s from t 5 to the red of phase 0 (green 5 s + amber 3 s); 2.5 s from amber at 10.5 to red at 13; 28 s from t 20 to phase 1's red at 48
  assert.equal(fixedToRed(p, 5), 8); assert.equal(fixedToRed(p, 10.5), 2.5); assert.equal(fixedToRed(p, 20), 28);
  // with fixed = true the same cycle (the reference) gives the same states
  const q = plan2(0, [10, 30]), fixedAt = (t: number) => { stepSignals([q], [[], []], s, spd, lLen, DT, true, t); return [q.idx, q.stage]; };
  assert.deepEqual([fixedAt(10.5), fixedAt(15.5), fixedAt(45.5)], [[0, 1], [1, 0], [1, 1]]);
  // a fixed-time plan rests on its cycle whatever the cars do
  s[0] = 190;
  const r = plan2(0, [10, 30]); stepSignals([r], [[0], [1]], s, spd, lLen, DT, false, 5);
  assert.deepEqual([r.idx, r.stage], [0, 0]);
});

test('adaptive: gap-out ends the green as actuated does (no car within 30 m, a car waiting elsewhere: 7 s)', () => {
  // lane 0 (served): a stopped car 100 m out; lane 1: a stopped car 50 m out
  const s = new Float64Array([100, 150]), spd = new Float64Array(2), onLane = [[0], [1]];
  assert.ok(at(greenEnd(plan2(1), onLane, s, spd, 60), 7), 'actuated: 7 s');
  assert.ok(at(greenEnd(plan2(2), onLane, s, spd, 60), 7), 'adaptive: 7 s');
});

test('adaptive: a queue elsewhere of the served demand + PRESSURE (9 against 1) ends the green at 7 s; one car less (8) does not, and the green runs to GREEN_CAP', () => {
  // served: one stopped car 20 m out (within EXT_M, so the gap-out holds); the other phase: n stopped cars 50 m out
  const queue = (n: number) => {
    const s = new Float64Array(1 + n).fill(150); s[0] = 180;
    return { s, spd: new Float64Array(1 + n), onLane: [[0], Array.from({ length: n }, (_, i) => i + 1)] };
  };
  const nine = queue(9), eight = queue(8);
  assert.ok(at(greenEnd(plan2(2), nine.onLane, nine.s, nine.spd, 90), 7), 'nine waiting: handed over at 7 s');
  assert.ok(at(greenEnd(plan2(2), eight.onLane, eight.s, eight.spd, 90), 60), 'eight waiting: the green holds to GREEN_CAP');
  assert.ok(at(greenEnd(plan2(1), eight.onLane, eight.s, eight.spd, 90), 40), 'actuated: the same green ends at 40 s');
});

test('adaptive: a fast car 100 m out holds the green while nothing waits elsewhere, and not when one car waits', () => {
  // lane 0 (served): a fast car 100 m out; lane 1: a car 50 m out that is moving (calls, does not wait) or stopped (waits)
  const s = new Float64Array([100, 150]);
  const onLane = [[0], [1]];
  assert.ok(at(greenEnd(plan2(2), onLane, s, new Float64Array([10, 10]), 90), 60), 'nothing waits: the platoon holds to GREEN_CAP');
  assert.ok(at(greenEnd(plan2(2), onLane, s, new Float64Array([10, 0]), 90), 7), 'one car waits: no platoon hold, the green ends at 7 s');
  assert.ok(at(greenEnd(plan2(1), onLane, s, new Float64Array([10, 10]), 90), 7), 'actuated: a car 100 m out does not hold it');
});

test('adaptive: after all-red the busiest phase is served next (phase 2, three cars against phase 1\'s one); actuated takes the first called one (phase 1)', () => {
  // phase 1: one stopped car 50 m out; phase 2: three stopped cars 30-50 m out; the served phase 0 is empty and ends at 7 s
  const s = new Float64Array([150, 170, 160, 150]), spd = new Float64Array(4), lLen = new Float64Array([200, 200, 200]);
  const onLane = [[], [0], [1, 2, 3]];
  const nextServed = (p: SignalPlan) => { for (let k = 1; k <= 1000; k++) { stepSignals([p], onLane, s, spd, lLen, DT, false, 0); if (p.stage === 0 && p.idx !== 0) return p.idx; } return -1; };
  assert.equal(nextServed(plan3(2)), 2, 'adaptive: the busiest phase');
  assert.equal(nextServed(plan3(1)), 1, 'actuated: the first called phase');
});

test('adaptive: the fixed argument (Sim.fixedSignals, the A/B switch) forces the fixed-time reference on an adaptive plan', () => {
  const s = new Float64Array([180, 150, 150]), spd = new Float64Array(3), lLen = new Float64Array([200, 200]);
  const q = plan2(2); stepSignals([q], [[0, 1], [2]], s, spd, lLen, DT, true, 0);
  assert.deepEqual([q.idx, q.stage], [0, 0]);
  stepSignals([q], [[0, 1], [2]], s, spd, lLen, DT, true, 24);
  assert.deepEqual([q.idx, q.stage], [1, 0], 'the fixed cycle of 18 + 3 + 2 s: phase 1 green from 23 s');
});
