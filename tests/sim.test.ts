// Headless traffic sim tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph, laneAt, type Lane } from '../src/game/sim/lanes';
import { CAR, idm } from '../src/game/sim/idm';
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
  console.log(`sim timing: ${sim.active} vehicles, ${g.lanes.filter(Boolean).length} lanes: mean ${(sum / 50).toFixed(2)} ms, max ${max.toFixed(2)} ms per step (50 steps)`);
  assert.ok(Number.isFinite(sum));
});
