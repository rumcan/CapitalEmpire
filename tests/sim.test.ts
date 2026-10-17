// Headless traffic sim tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Node } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { CTL, LK, LaneGraph, checkGraph, laneAt, type Lane, type SignalPlan } from '../src/game/sim/lanes';
import { CAR, idm } from '../src/game/sim/idm';
import { SIG, phaseState } from '../src/game/sim/signals';
import { DT, Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** an (n+1) x (n+1) grid of streets, step tiles apart */
function grid(e: NetEditor, n: number, step: number) {
  for (let k = 0; k <= n; k++) {
    e.addLegs([leg(100, 100 + k * step, 100 + n * step, 100 + k * step)], CLASS.street, 0);
    e.addLegs([leg(100 + k * step, 100, 100 + k * step, 100 + n * step)], CLASS.street, 0);
  }
}
/** a closed square of four streets, 60 tiles a side: every corner is a two-arm bend */
function square(): LaneGraph {
  const e = new NetEditor(new RoadNetwork()), c = [[100, 100], [160, 100], [160, 160], [100, 160]];
  for (let k = 0; k < 4; k++) e.addLegs([leg(c[k][0], c[k][1], c[(k + 1) % 4][0], c[(k + 1) % 4][1])], CLASS.street, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net); return g;
}
/** commit the editor's edits and update the lane graph after them */
function update(e: NetEditor, g: LaneGraph) { e.commit(); g.update(e.net); }
function graphOf(e: NetEditor) { const g = new LaneGraph(); update(e, g); return g; }
/** the smallest front-to-rear gap over all consecutive pairs on every lane list (Infinity if none) */
function worstGap(sim: Sim): number {
  let worst = Infinity;
  for (const q of sim.onLane) for (let k = 1; k < q.length; k++) { const f = q[k - 1], b = q[k]; worst = Math.min(worst, sim.s[f] - sim.len[f] - sim.s[b]); }
  return worst;
}

test('idm: a free road reaches the desired speed, and a stopped leader 100 m ahead is followed to a stop at about s0', () => {
  const v0 = 15; let v = 0;
  for (let k = 0; k < 600; k++) v += idm(CAR, v, v0, Infinity, 0) * DT;
  assert.ok(Math.abs(v - v0) < 0.01 * v0, `free road ends at ${v.toFixed(3)} m/s`);
  // the leader's rear is at 100 m; the follower's front starts at 0
  let x = 0; v = v0;
  for (let k = 0; k < 6000; k++) { v = Math.max(0, v + idm(CAR, v, v0, 100 - x, v) * DT); x += v * DT; }
  const gap = 100 - x;
  assert.ok(v < 0.05, `follower still moving at ${v.toFixed(3)} m/s`);
  assert.ok(gap >= CAR.s0 - 0.1 && gap <= CAR.s0 + 1, `stopped gap ${gap.toFixed(3)} m`);
});

test('loop: 40 vehicles on a closed square never overlap, keep moving, and stay finite', () => {
  const g = square(), sim = new Sim(g, 40, 7);
  assert.deepEqual(checkGraph(g), []);
  sim.setTarget(40);
  let speed = 0, count = 0;
  for (let k = 1; k <= 6000; k++) {
    sim.step();
    if (k % 100 === 0) assert.ok(worstGap(sim) > -0.01, `overlap ${worstGap(sim).toFixed(3)} m at step ${k}`);
    if (k > 5000) for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { speed += sim.v[i]; count++; }
  }
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) assert.ok(sim.v[i] >= 0 && Number.isFinite(sim.v[i]) && Number.isFinite(sim.s[i]), `slot ${i}`);
  const mean = speed / count;
  assert.ok(mean > 5, `mean speed ${mean.toFixed(2)} m/s`);
  console.log(`sim loop: mean speed over the last 1000 steps ${mean.toFixed(2)} m/s, worst gap ${worstGap(sim).toFixed(3)} m`);
});

test('determinism: the same seed gives identical positions; another seed does not', () => {
  const g = square();
  const run = (seed: number) => { const sim = new Sim(g, 40, seed); sim.setTarget(40); for (let k = 0; k < 2000; k++) sim.step(); return Array.from(sim.s); };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
});

test('grid: 400 vehicles on a 6 x 6 street grid stay at 400 with valid plans', () => {
  const e = new NetEditor(new RoadNetwork()); grid(e, 6, 40);
  const g = graphOf(e), sim = new Sim(g, 400, 1);
  assert.deepEqual(checkGraph(g), []);
  sim.setTarget(400);
  // the fill ramps up over the first steps (a spawn try can find no room); from step 50 it stays at 400
  for (let k = 1; k <= 3000; k++) {
    sim.step();
    if (k >= 50) assert.equal(sim.active, 400, `active at step ${k}`);
  }
  for (let i = 0; i < sim.cap; i++) {
    if (!sim.alive[i]) continue;
    const ln = g.lanes[sim.lane[i]];
    assert.ok(ln, `slot ${i} on a missing lane`);
    assert.equal(sim.plan[i]![sim.pi[i]], sim.lane[i], `slot ${i} plan`);
    assert.ok(Number.isFinite(sim.s[i]) && Number.isFinite(sim.v[i]), `slot ${i} not finite`);
  }
});

test('edit while driving: removing a busy piece of road respawns the vehicles on it and the graph stays valid', () => {
  const e = new NetEditor(new RoadNetwork()); grid(e, 6, 40);
  const g = graphOf(e), sim = new Sim(g, 400, 3);
  sim.setTarget(400);
  for (let k = 0; k < 500; k++) sim.step();
  // the link lane with the most vehicles, and a point on its middle
  const count = new Array<number>(g.lanes.length).fill(0);
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) count[sim.lane[i]]++;
  let busy = -1;
  for (const ln of g.lanes) if (ln && ln.kind === LK.LINK && (busy < 0 || count[ln.id] > count[busy])) busy = ln.id;
  const o = { x: 0, y: 0, hx: 0, hy: 0 };
  laneAt(g.lanes[busy] as Lane, (g.lanes[busy] as Lane).len / 2, o);
  const sel = e.net.pieceNear({ x: o.x, y: o.y });
  assert.ok(sel, 'no piece near the busy lane');
  e.removePiece(sel);
  update(e, g); sim.onGraph();
  assert.deepEqual(checkGraph(g), []);
  for (let k = 0; k < 500; k++) sim.step();
  assert.equal(sim.active, 400);
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) assert.ok(g.lanes[sim.lane[i]], `slot ${i} on a missing lane`);
  console.log(`sim edit: ${sim.stats.respawned} respawned, ${sim.stats.spawned} spawned in total`);
});

/** the smallest front-to-rear gap between consecutive vehicles on the lanes of one kind (Infinity if none) */
function worstGapKind(sim: Sim, g: LaneGraph, kind: number): number {
  let worst = Infinity;
  for (let id = 0; id < sim.onLane.length; id++) {
    if (g.lanes[id]?.kind !== kind) continue;
    const q = sim.onLane[id];
    for (let k = 1; k < q.length; k++) worst = Math.min(worst, sim.s[q[k - 1]] - sim.len[q[k - 1]] - sim.s[q[k]]);
  }
  return worst;
}
/** a plain four-arm crossing of two streets, each arm `len` tiles long, centred on (300, 300) */
function crossing(len: number): { e: NetEditor; g: LaneGraph } {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(300 - len, 300, 300 + len, 300), leg(300, 300 - len, 300, 300 + len)], CLASS.street, 0);
  return { e, g: graphOf(e) };
}
const centre = (e: NetEditor): Node => e.net.nodeAt({ x: 300, y: 300 })!;

test('signal phases: green, then amber, then red; the phases take turns', () => {
  const p = { node: null as unknown as Node, armPhase: [0, 1], phases: 2, green: 18, amber: 3, allRed: 2, offset: 0 } as SignalPlan;
  // a cycle is 46 s: phase 0 green 0-18, amber 18-21, red to 23; phase 1 green 23-41, amber 41-44, red to 46
  assert.equal(phaseState(p, 0, 0), SIG.GREEN);
  assert.equal(phaseState(p, 0, 17.9), SIG.GREEN);
  assert.equal(phaseState(p, 0, 18.5), SIG.AMBER);
  assert.equal(phaseState(p, 0, 21.5), SIG.RED);
  assert.equal(phaseState(p, 1, 21.5), SIG.RED);
  assert.equal(phaseState(p, 1, 23.5), SIG.GREEN);
  assert.equal(phaseState(p, 1, 41.5), SIG.AMBER);
  assert.equal(phaseState(p, 0, 46.5), SIG.GREEN, 'the cycle repeats');
  // the sampled sequence of phase 0 over a cycle is green, amber, red (each run once)
  const runs: number[] = [];
  for (let t = 0; t < 46; t += 0.1) { const st = phaseState(p, 0, t); if (!runs.length || runs[runs.length - 1] !== st) runs.push(st); }
  assert.deepEqual(runs, [SIG.GREEN, SIG.AMBER, SIG.RED]);
});

test('crossing: vehicles on conflicting connectors never both sit on their conflict point', () => {
  const { e, g } = crossing(120);
  assert.equal(centre(e).arms.length, 4);
  const sim = new Sim(g, 60, 11);
  sim.setTarget(60);
  let events = 0, onNode = 0;
  for (let k = 1; k <= 3000; k++) {
    sim.step();
    for (let i = 0; i < sim.cap; i++) {
      if (!sim.alive[i]) continue;
      const A = g.lanes[sim.lane[i]]!;
      if (A.kind !== LK.CONN) continue;
      onNode++;
      for (const cf of A.conflicts) {
        if (cf.merge || Math.abs(sim.s[i] - cf.s) >= 2) continue;
        for (const w of sim.onLane[cf.lane]) if (Math.abs(sim.s[w] - cf.os) < 2) events++;
      }
    }
  }
  assert.ok(onNode > 0, 'vehicles crossed the junction');
  assert.equal(events, 0, `${events} crossing collisions`);
  console.log(`sim crossing: ${onNode} vehicle-steps in the box, ${sim.stats.spawned} spawned, ${sim.stats.towed} towed`);
});

test('signal crossing: no vehicle enters a connector while its phase is red', () => {
  const { e, g } = crossing(120);
  e.setNodeType(centre(e), 'signal'); update(e, g);
  const sp = g.signals.get(centre(e));
  assert.ok(sp, 'a signal plan at the crossing');
  const sim = new Sim(g, 60, 12);
  sim.setTarget(60);
  const prev = new Int32Array(sim.cap).fill(-1);
  let entries = 0, red = 0;
  for (let k = 1; k <= 3000; k++) {
    const t = sim.t;
    sim.step();
    for (let i = 0; i < sim.cap; i++) {
      if (!sim.alive[i]) { prev[i] = -1; continue; }
      const L = sim.lane[i], A = g.lanes[L]!;
      if (A.kind === LK.CONN && A.ctl === CTL.SIGNAL && prev[i] !== L) { entries++; if (phaseState(sp!, A.phase, t) === SIG.RED) red++; }
      prev[i] = L;
    }
  }
  assert.ok(entries > 0, 'vehicles entered the signalled connectors');
  assert.equal(red, 0, `${red} entries on red`);
  console.log(`sim signals: ${entries} entries into the box, none on red; ${sim.stats.towed} towed`);
});

test('roundabout: 80 vehicles on a four-arm roundabout: no ring overlaps, traffic flows, nothing towed', () => {
  const { e, g } = crossing(120);
  e.setNodeType(centre(e), 'roundabout'); update(e, g);
  assert.deepEqual(checkGraph(g), []);
  const sim = new Sim(g, 80, 13);
  sim.setTarget(80);
  for (let k = 1; k <= 4000; k++) {
    sim.step();
    if (k % 100 === 0) assert.ok(worstGapKind(sim, g, LK.RING) > -0.01, `ring overlap ${worstGapKind(sim, g, LK.RING).toFixed(3)} m at step ${k}`);
  }
  assert.ok(sim.stats.throughput > 0, 'vehicles left the roundabout');
  assert.equal(sim.stats.towed, 0, 'nothing towed');
  console.log(`sim roundabout: ${sim.stats.throughput} exits, ${sim.stats.towed} towed, ${sim.active} active`);
});

test('lane changes: a boulevard into a junction: vehicles wanting the left turn end up in the left lane', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(100, 300, 300, 300)], CLASS.boulevard, 0);
  e.addLegs([leg(300, 300, 500, 300)], CLASS.street, 0);
  e.addLegs([leg(300, 100, 300, 300)], CLASS.street, 0);
  e.addLegs([leg(300, 300, 300, 500)], CLASS.street, 0);
  const g = graphOf(e);
  assert.equal(centre(e).arms.length, 4);
  const sim = new Sim(g, 60, 14);
  sim.setTarget(60);
  let total = 0, rightLane = 0;
  for (let k = 1; k <= 3000; k++) {
    sim.step();
    if (k < 500) continue;
    for (let i = 0; i < sim.cap; i++) {
      if (!sim.alive[i]) continue;
      const ln = g.lanes[sim.lane[i]]!;
      if (ln.kind !== LK.LINK || ln.len - sim.s[i] >= 5 || g.moves[sim.want[i]]?.turn !== 'L') continue;
      total++; if (ln.idx === 1) rightLane++;
    }
  }
  assert.ok(sim.stats.laneChanges > 0, 'vehicles changed lanes');
  assert.ok(total > 0, 'left-turn vehicles reached the stop line');
  assert.ok(rightLane / total <= 0.1, `${rightLane} of ${total} left-turn samples in the right lane`);
  console.log(`sim lanes: ${sim.stats.laneChanges} lane changes; left-turners at the stop line in the right lane ${(100 * rightLane / total).toFixed(1)}% of ${total} samples`);
});

test('grid gridlock smoke: 8 x 8 blocks of plain, signal and roundabout nodes, 400 vehicles (600 is at capacity for single-lane streets under random routing, 1000+ gridlocks), 20000 steps', () => {
  const e = new NetEditor(new RoadNetwork()); grid(e, 8, 40);
  const g = graphOf(e);
  // every 5th node a roundabout, else every 3rd a signal (corners have two arms and stay plain)
  let signals = 0, roundabouts = 0;
  for (let j = 0; j <= 8; j++) for (let k = 0; k <= 8; k++) {
    const n = e.net.nodeAt({ x: 100 + k * 40, y: 100 + j * 40 }), idx = j * 9 + k;
    if (!n || n.arms.length < 3) continue;
    if (idx % 5 === 0) { e.setNodeType(n, 'roundabout'); roundabouts++; } else if (idx % 3 === 0) { e.setNodeType(n, 'signal'); signals++; }
  }
  update(e, g);
  assert.deepEqual(checkGraph(g), []);
  const sim = new Sim(g, 400, 21);
  sim.setTarget(400);
  // the spawns ramp up (room on the streets limits them): the count is checked from step 300 on, when it has reached 400
  let speed = 0, count = 0, minActive = Infinity;
  for (let k = 1; k <= 20000; k++) {
    sim.step();
    if (k >= 300) minActive = Math.min(minActive, sim.active);
    if (k > 18000) for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { speed += sim.v[i]; count++; }
  }
  const mean = speed / count, st = sim.stats;
  console.log(`sim grid: ${signals} signals, ${roundabouts} roundabouts; ${sim.active} active (least after step 300: ${minActive}), spawned ${st.spawned}, respawned ${st.respawned}, towed ${st.towed}, throughput ${st.throughput}, lane changes ${st.laneChanges}; mean speed over the last 2000 steps ${mean.toFixed(2)} m/s`);
  assert.equal(minActive, 400, 'active count after step 300');
  assert.ok(st.towed / st.throughput < 0.01, `towed ${st.towed} of ${st.throughput} exits`);
  assert.ok(mean > 2, `mean speed ${mean.toFixed(2)} m/s`);
});

test('timing: 10000 vehicles on a 40 x 40 grid of streets and avenues, ms per step', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph();
  for (let k = 0; k <= 40; k++) {
    const cls = k % 2 ? CLASS.street : CLASS.avenue;
    e.addLegs([leg(100, 100 + k * 40, 1700, 100 + k * 40)], cls, 0);
    e.addLegs([leg(100 + k * 40, 100, 100 + k * 40, 1700)], cls, 0);
  }
  e.commit(true); g.update(e.net);
  const sim = new Sim(g, 10000, 5);
  sim.setTarget(10000);
  for (let k = 0; k < 50; k++) sim.step();
  let sum = 0, max = 0;
  for (let k = 0; k < 50; k++) { sim.step(); sum += sim.stats.stepMs; max = Math.max(max, sim.stats.stepMs); }
  console.log(`sim timing: ${sim.active} vehicles, ${g.lanes.filter(Boolean).length} lanes: mean ${(sum / 50).toFixed(2)} ms, max ${max.toFixed(2)} ms per step (50 steps); towed ${sim.stats.towed}, lane changes ${sim.stats.laneChanges}`);
  assert.ok(Number.isFinite(sum));
});
