// Zone next-hop routing tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Pt2 = [number, number];
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** commit the editor's edits and update the lane graph after them */
function update(e: NetEditor, g: LaneGraph) { e.commit(); g.update(e.net); }
/** an (n+1) x (n+1) grid of streets, step tiles apart */
function grid(e: NetEditor, n: number, step: number) {
  for (let k = 0; k <= n; k++) {
    e.addLegs([leg(100, 100 + k * step, 100 + n * step, 100 + k * step)], CLASS.street, 0);
    e.addLegs([leg(100 + k * step, 100, 100 + k * step, 100 + n * step)], CLASS.street, 0);
  }
}
/** the dseg that runs from point a to point b (its nodes are at those points) */
function dsegOf(g: LaneGraph, a: Pt2, b: Pt2): number {
  for (const d of g.dsegs) if (d && d.from.x === a[0] && d.from.y === a[1] && d.to.x === b[0] && d.to.y === b[1]) return d.id;
  throw new Error(`no dseg from ${a} to ${b}`);
}
/** a feeder W-A into a junction A, a direct road A-M-B of 200 tiles, a detour A-(100,200)-(300,200)-B of 400 tiles, and an exit B-E.
 *  Vehicles start on the feeder (origin) and head for the exit (destination). */
function shortcut(): { e: NetEditor; g: LaneGraph } {
  const e = new NetEditor(new RoadNetwork());
  const legs: [Pt2, Pt2][] = [[[20, 300], [100, 300]], [[100, 300], [200, 300]], [[200, 300], [300, 300]], [[300, 300], [380, 300]],
    [[100, 300], [100, 200]], [[100, 200], [300, 200]], [[300, 200], [300, 300]]];
  for (const [a, b] of legs) e.addLegs([leg(a[0], a[1], b[0], b[1])], CLASS.street, 0);
  const g = new LaneGraph(); update(e, g);
  return { e, g };
}
/** a feeder W-A into a junction A, and two equal detours A-(200,250)-B and A-(200,350)-B that meet at B, then an exit B-E */
function twin(): { e: NetEditor; g: LaneGraph } {
  const e = new NetEditor(new RoadNetwork());
  const legs: [Pt2, Pt2][] = [[[20, 300], [100, 300]], [[100, 300], [200, 250]], [[200, 250], [300, 300]], [[100, 300], [200, 350]],
    [[200, 350], [300, 300]], [[300, 300], [380, 300]]];
  for (const [a, b] of legs) e.addLegs([leg(a[0], a[1], b[0], b[1])], CLASS.street, 0);
  const g = new LaneGraph(); update(e, g);
  return { e, g };
}

test('shortest way: 100 vehicles from the feeder to the exit take the direct road (> 90%)', () => {
  const { g } = shortcut();
  assert.deepEqual(checkGraph(g), []);
  const feed = dsegOf(g, [20, 300], [100, 300]), direct = dsegOf(g, [100, 300], [200, 300]), exit = dsegOf(g, [300, 300], [380, 300]);
  const lane = g.dsegs[feed]!.lanes[0]!;
  const sim = new Sim(g, 200, 1);
  // the movement a vehicle takes at the junction A is chosen when it is spawned on the feeder (its first decision)
  let n = 0, viaDirect = 0;
  for (let k = 0; k < 4000 && n < 100; k++) {
    const i = sim.spawnAt(lane, 5, exit, 60);
    if (i >= 0) { n++; if (g.moves[sim.want[i]!]?.to === direct) viaDirect++; }
    sim.step();
  }
  assert.equal(n, 100, 'spawned 100 vehicles');
  assert.ok(viaDirect / n > 0.9, `${viaDirect} of ${n} took the direct road`);
  console.log(`routing shortest way: ${viaDirect} of ${n} vehicles chose the direct road, ${sim.stats.lost} lost`);
});

test('congestion spreads traffic: two equal routes both carry > 25% of 300 trips over 10 sim minutes', () => {
  const { g } = twin();
  assert.deepEqual(checkGraph(g), []);
  const feed = dsegOf(g, [20, 300], [100, 300]), up = dsegOf(g, [100, 300], [200, 250]), down = dsegOf(g, [100, 300], [200, 350]);
  const exit = dsegOf(g, [300, 300], [380, 300]), lane = g.dsegs[feed]!.lanes[0]!;
  const sim = new Sim(g, 400, 2);
  let nUp = 0, nDown = 0;
  for (let k = 0; k < 6000; k++) {
    // keep 300 vehicles on the network: spawn up to four per step (a spawn can find no room)
    for (let j = 0; j < 4 && sim.active < 300; j++) {
      const i = sim.spawnAt(lane, 5, exit, 60);
      if (i < 0) break;
      const to = g.moves[sim.want[i]!]?.to;
      if (to === up) nUp++; else if (to === down) nDown++;
    }
    sim.step();
  }
  const total = nUp + nDown;
  assert.ok(nUp / total > 0.25, `${nUp} of ${total} trips went up`);
  assert.ok(nDown / total > 0.25, `${nDown} of ${total} trips went down`);
  console.log(`routing congestion: ${nUp} trips up, ${nDown} down, ${sim.stats.arrived} arrived, ${sim.stats.lost} lost`);
});

test('reacts to an edit: a vehicle on the direct road loses the road ahead, still arrives by the detour, nothing lost', () => {
  const { e, g } = shortcut();
  const sim = new Sim(g, 20, 3);
  const direct1 = dsegOf(g, [100, 300], [200, 300]), exit = dsegOf(g, [300, 300], [380, 300]);
  const detour = [dsegOf(g, [100, 300], [100, 200]), dsegOf(g, [100, 200], [300, 200]), dsegOf(g, [300, 200], [300, 300])];
  const i = sim.spawnAt(g.dsegs[direct1]!.lanes[0]!, 10, exit, 60);
  assert.ok(i >= 0, 'spawned on the direct road');
  for (let k = 0; k < 30; k++) sim.step();
  assert.equal(sim.alive[i], 1, 'still driving on the direct road');
  assert.equal(g.lanes[sim.lane[i]!]!.dseg, direct1, 'still on the first half of the direct road');
  // the second half of the direct road (M to B) goes: the vehicle's own dseg stays
  const sel = e.net.pieceNear({ x: 250, y: 300 });
  assert.ok(sel, 'a piece of the direct road near (250, 300)');
  e.removePiece(sel);
  update(e, g); sim.onGraph();
  assert.deepEqual(checkGraph(g), []);
  let usedDetour = false;
  for (let k = 0; k < 3000 && sim.stats.arrived === 0; k++) {
    sim.step();
    if (sim.alive[i] && g.lanes[sim.lane[i]!]?.kind === LK.LINK && detour.includes(g.lanes[sim.lane[i]!]!.dseg)) usedDetour = true;
  }
  assert.equal(sim.stats.arrived, 1, 'the vehicle arrived');
  assert.equal(sim.stats.lost, 0, 'nothing lost');
  assert.ok(usedDetour, 'the vehicle went round by the detour');
});

test('arrival: 300 vehicles on a 6 x 6 grid over 10 sim minutes: more than 300 arrive, lost under 2% of arrivals', () => {
  const e = new NetEditor(new RoadNetwork()); grid(e, 6, 40);
  const g = new LaneGraph(); update(e, g);
  assert.deepEqual(checkGraph(g), []);
  const sim = new Sim(g, 300, 4);
  sim.setTarget(300);
  for (let k = 0; k < 6000; k++) sim.step();
  const st = sim.stats;
  console.log(`routing grid: ${st.arrived} arrived, ${st.lost} lost, ${st.towed} towed, ${sim.active} active, ${st.tables} zone tables`);
  assert.ok(st.arrived > 300, `${st.arrived} arrived`);
  assert.ok(st.lost / st.arrived < 0.02, `${st.lost} lost of ${st.arrived} arrived`);
});

test('timing (log only): 10000 vehicles with destinations on a 40 x 40 grid: ms per step and per zone table rebuild', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph();
  for (let k = 0; k <= 40; k++) {
    const cls = k % 2 ? CLASS.street : CLASS.avenue;
    e.addLegs([leg(100, 100 + k * 40, 1700, 100 + k * 40)], cls, 0);
    e.addLegs([leg(100 + k * 40, 100, 100 + k * 40, 1700)], cls, 0);
  }
  e.commit(true); g.update(e.net);
  const sim = new Sim(g, 10000, 5);
  sim.setTarget(10000);
  for (let k = 0; k < 100; k++) sim.step();
  let sum = 0, max = 0, tSum = 0, tMax = 0, tN = 0;
  for (let k = 0; k < 100; k++) {
    sim.step(); sum += sim.stats.stepMs; max = Math.max(max, sim.stats.stepMs);
    if (sim.stats.tables) { tSum += sim.stats.tableMs; tMax = Math.max(tMax, sim.stats.tableMs); tN++; }
  }
  console.log(`routing timing: ${sim.active} vehicles: ${(sum / 100).toFixed(2)} ms mean, ${max.toFixed(2)} ms max per step (100 steps); ` +
    `${sim.stats.tables} zone tables, rebuild ${(tN ? tSum / tN : 0).toFixed(2)} ms mean, ${tMax.toFixed(2)} ms max; ` +
    `arrived ${sim.stats.arrived}, lost ${sim.stats.lost}, towed ${sim.stats.towed}`);
  assert.ok(Number.isFinite(sum));
});
