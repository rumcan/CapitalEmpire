// The junction rules (T184, issue #464; the owner's call after #443's diagnosis): an equal crossing is first come, first served; the router
// sees a jammed approach; a car stuck past BREAK_WAIT at a line goes when the box is clear; a slow ring car no longer holds every entry.
// npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { CTL, LK, LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { BREAK_WAIT, Sim, ringReach } from '../src/game/sim/sim';
import { CAR } from '../src/game/sim/idm';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Pt2 = [number, number];
const leg = (a: Pt2, b: Pt2): Leg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
/** a crossing at (300, 300): arms W and E of class ew, N and S of class ns, each 100 tiles long */
function crossing(ew: RoadClass, ns: RoadClass): LaneGraph {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg([200, 300], [300, 300]), leg([300, 300], [400, 300])], ew, 0);
  e.addLegs([leg([300, 200], [300, 300]), leg([300, 300], [300, 400])], ns, 0);
  e.commit();
  const g = new LaneGraph(); g.update(e.net);
  return g;
}
/** the connectors of the node at (300, 300) */
const conns = (g: LaneGraph) => g.lanes.filter(l => l && l.kind === LK.CONN && l.node && l.node.x === 300 && l.node.y === 300) as NonNullable<LaneGraph['lanes'][number]>[];
/** the dseg from a to b */
function dseg(g: LaneGraph, a: Pt2, b: Pt2) {
  const d = g.dsegs.find(d => d && d.from.x === a[0] && d.from.y === a[1] && d.to.x === b[0] && d.to.y === b[1]);
  if (!d) throw new Error(`no dseg ${a} -> ${b}`);
  return d;
}

test('an equal crossing (four arms of one class) has no major road: every connector yields at one priority, never STOP, at gravel and at road class', () => {
  for (const cls of [CLASS.gravel!, CLASS.street!, CLASS.road!]) {
    const g = crossing(cls, cls), C = conns(g);
    assert.deepEqual(checkGraph(g), []);
    assert.ok(C.length >= 12, `${cls.id}: ${C.length} connectors`);
    assert.ok(C.every(c => c.ctl === CTL.YIELD), `${cls.id}: every connector yields`);
    assert.equal(new Set(C.map(c => c.prio)).size, 1, `${cls.id}: one priority`);
  }
});

test('a crossing of two classes keeps its major road: the road pair is free, the street arms STOP (unchanged)', () => {
  const g = crossing(CLASS.road!, CLASS.street!), C = conns(g);
  assert.ok(C.some(c => c.ctl === CTL.FREE), 'the major road is free');
  assert.ok(C.some(c => c.ctl === CTL.STOP), 'the minor arms stop');
});

test('an equal crossing serves every arm: 4 x 300 veh/h for 5 sim minutes on a gravel crossing, each arm gets 20% or more of the trips and nothing is towed', () => {
  const g = crossing(CLASS.gravel!, CLASS.gravel!), sim = new Sim(g, 400, 3);
  const arms: [Pt2, Pt2][] = [[[200, 300], [400, 300]], [[400, 300], [200, 300]], [[300, 200], [300, 400]], [[300, 400], [300, 200]]];
  const ins = arms.map(([a]) => dseg(g, a, [300, 300])), outs = arms.map(([, b]) => dseg(g, [300, 300], b));
  const done = [0, 0, 0, 0], live = new Map<number, number>();
  for (let k = 0; k < 3000; k++) {
    if (k % 120 === 0) for (let a = 0; a < 4; a++) { const i = sim.spawnAt(ins[a]!.lanes[0]!, 5, outs[a]!.id, 60); if (i >= 0) live.set(i, a); }
    sim.step();
    for (const [i, a] of live) if (!sim.alive[i]) { done[a]!++; live.delete(i); }
  }
  const total = done.reduce((s, x) => s + x, 0);
  assert.ok(total > 80, `${total} trips done`);
  for (let a = 0; a < 4; a++) assert.ok(done[a]! / total >= 0.2, `arm ${a}: ${done[a]} of ${total}`);
  assert.equal(sim.stats.towed, 0);
});

test('the deadlock breaker: at an equal crossing the west queue, first to wait but stuck (its exit full behind an obstacle), no longer holds a north car for good: it goes soon after BREAK_WAIT, not at the tow', () => {
  const g = crossing(CLASS.gravel!, CLASS.gravel!), sim = new Sim(g, 50, 4);
  const w = dseg(g, [200, 300], [300, 300]), toE = dseg(g, [300, 300], [400, 300]), n = dseg(g, [300, 200], [300, 300]), toS = dseg(g, [300, 300], [300, 400]);
  // the east exit is blocked 40 m along: the west cars fill it, and the next one waits at its line with no room beyond
  sim.addBlock(toE.lanes[0]!, 40);
  let b = -1, through = -1;
  for (let k = 0; k < 4000 && through < 0; k++) {
    if (k < 400 && k % 30 === 0) sim.spawnAt(w.lanes[0]!, 5, toE.id, 60);
    if (k === 600) b = sim.spawnAt(n.lanes[0]!, 150, toS.id, 60);
    sim.step();
    if (b >= 0 && (!sim.alive[b] || sim.lane[b] !== n.lanes[0])) through = sim.t;
  }
  const head = sim.onLane[w.lanes[0]!]![0];
  assert.ok(b >= 0 && head !== undefined, 'a west car still waits at its line');
  assert.ok(through > 0, 'the north car got through');
  assert.ok(through - 60 < BREAK_WAIT + 25, `it went ${(through - 60).toFixed(1)} s after it started (the tow is at 300 s)`);
});

test('a slow ring car no longer holds every entry: ringReach is its 4 s at its speed plus what it can gain, capped at the lane limit', () => {
  assert.equal(ringReach(0, 8), 8 * CAR.a, 'a standing ring car reaches 8 x CAR.a m (12 m) in 4 s, not 4 x the limit (32 m)');
  assert.equal(ringReach(8, 8), 32, 'at the limit, the limit (as before)');
  assert.ok(ringReach(3, 8) < 32 && ringReach(3, 8) > 12);
});

test('the router sees a jammed approach: with the up route blocked, more than 70% of the new trips take the down route', () => {
  // a feeder W-A, two equal routes A-(200,250)-B and A-(200,350)-B, an exit B-E (routing.test.ts twin)
  const e = new NetEditor(new RoadNetwork());
  const legs: [Pt2, Pt2][] = [[[20, 300], [100, 300]], [[100, 300], [200, 250]], [[200, 250], [300, 300]], [[100, 300], [200, 350]], [[200, 350], [300, 300]], [[300, 300], [380, 300]]];
  for (const [a, b] of legs) e.addLegs([leg(a, b)], CLASS.street!, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  const feed = dseg(g, [20, 300], [100, 300]), up2 = dseg(g, [200, 250], [300, 300]), up = dseg(g, [100, 300], [200, 250]), down = dseg(g, [100, 300], [200, 350]), exit = dseg(g, [300, 300], [380, 300]);
  const sim = new Sim(g, 400, 2);
  // the up route's second piece is blocked near its end: its cars queue, their head stands at the obstacle
  sim.addBlock(up2.lanes[0]!, up2.len - 8);
  let nUp = 0, nDown = 0;
  for (let k = 0; k < 4000; k++) {
    if (k % 30 === 0) { const i = sim.spawnAt(feed.lanes[0]!, 5, exit.id, 60); if (i >= 0 && k > 1500) { const to = g.moves[sim.want[i]!]?.to; if (to === up.id) nUp++; else if (to === down.id) nDown++; } }
    sim.step();
  }
  assert.ok(nUp + nDown > 20, `${nUp + nDown} trips chose`);
  assert.ok(nDown / (nUp + nDown) > 0.7, `${nDown} of ${nUp + nDown} went down`);
});
