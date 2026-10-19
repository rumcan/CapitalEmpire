// One-way roads: a one-way seg runs seg.a to seg.b (its b to a dseg has no lanes), redrawing it the other way reverses it, cars on a one-way
// loop only drive the way it runs, and a signalled junction with a one-way arm running out of it gives no phase to that arm.
// Headless: NetEditor + LaneGraph + Sim, the same setup as flare.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, perp, type Leg, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LK, LaneGraph, checkGraph, type DSeg } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const TWO_WAY = CLASS.street!, ONE_WAY = CLASS['street.ow']!;

/** the dseg running from (fx, fy) to (tx, ty), tiles; null if there is none */
function dsegFromTo(g: LaneGraph, fx: number, fy: number, tx: number, ty: number): DSeg | null {
  return g.dsegs.find(d => !!d && d.from.x === fx && d.from.y === fy && d.to.x === tx && d.to.y === ty) ?? null;
}
test('a one-way street has two lanes on its a-to-b dseg (either side of the centre line) and none the other way; the graph is clean', () => {
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  e.addLegs([leg(0, 0, 60, 0)], ONE_WAY, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  const ds = g.dsegs.filter((d): d is DSeg => !!d);
  assert.equal(ds.length, 2, 'a seg has a pair of dsegs');
  const fwd = dsegFromTo(g, 0, 0, 60, 0)!, back = dsegFromTo(g, 60, 0, 0, 0)!;
  assert.equal(fwd.lanes.length, 2, 'the forward dseg has two lanes');
  assert.equal(back.lanes.length, 0, 'the back dseg has no lanes');
  const l0 = g.lanes[fwd.lanes[0]!]!, l1 = g.lanes[fwd.lanes[1]!]!;
  // lane 0 is the leftmost: the offsets are -0.8 and +0.8 tiles along perp(u), and perp((1, 0)) = (0, 1) is the heading's right
  assert.ok(Math.abs(l0.pts[1]! + 0.8) < 1e-9 && Math.abs(l1.pts[1]! - 0.8) < 1e-9, `lanes at y ${l0.pts[1]} and ${l1.pts[1]}`);
  assert.ok(perp({ x: 1, y: 0 }).y > 0 && l1.pts[1]! > 0 && l0.pts[1]! < 0, 'lane 0 is on the left of the heading, lane 1 on the right');
  assert.deepEqual(checkGraph(g), [], 'no graph errors');
});

test('redrawing a one-way seg the other way reverses it (one seg, now running from (60, 0))', () => {
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  e.addLegs([leg(0, 0, 60, 0)], ONE_WAY, 0); e.commit();
  e.addLegs([leg(60, 0, 0, 0)], ONE_WAY, 0); e.commit();
  assert.equal(e.net.segs.size, 1, 'one seg');
  const s: Seg = [...e.net.segs][0]!;
  assert.equal(s.a.x, 60, 'seg.a is now at (60, 0)');
  assert.equal(s.b.x, 0, 'seg.b is now at (0, 0)');
  const g = new LaneGraph(); g.update(e.net);
  assert.equal(dsegFromTo(g, 60, 0, 0, 0)!.lanes.length, 2, 'the reversed seg has its two lanes going (60, 0) to (0, 0)');
  assert.equal(dsegFromTo(g, 0, 0, 60, 0)!.lanes.length, 0, 'and none the other way');
  assert.deepEqual(checkGraph(g), [], 'no graph errors');
});

test('cars on a one-way loop with two-way spurs at two corners: all delivered from A to B and back, none lost or towed, all on the loop a-to-b', () => {
  // the loop NW (200, 200) to NE (400, 200) to SE (400, 400) to SW (200, 400) and back to NW, each side drawn clockwise and one-way;
  // spur A from NE east to (480, 200), spur B from SW west to (120, 400), both two-way
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  e.addLegs([leg(200, 200, 400, 200), leg(400, 200, 400, 400), leg(400, 400, 200, 400), leg(200, 400, 200, 200)], ONE_WAY, 0);
  e.addLegs([leg(400, 200, 480, 200), leg(200, 400, 120, 400)], TWO_WAY, 0);
  e.commit();
  const g = new LaneGraph(); g.update(e.net);
  assert.deepEqual(checkGraph(g), [], 'no graph errors');
  const A_in = dsegFromTo(g, 480, 200, 400, 200)!, A_out = dsegFromTo(g, 400, 200, 480, 200)!;
  const B_in = dsegFromTo(g, 120, 400, 200, 400)!, B_out = dsegFromTo(g, 200, 400, 120, 400)!;
  assert.ok(A_in.lanes.length && A_out.lanes.length && B_in.lanes.length && B_out.lanes.length, 'the spurs have lanes both ways');
  const sim = new Sim(g, 3000, 7);
  // cars from A to B, and from B to A, every 20 s for 30 cars each
  const live = new Set<number>();
  let spawned = 0, delivered = 0, onLoop = 0, wrongWay = 0;
  const pairs: [DSeg, DSeg][] = [[A_in, B_out], [B_in, A_out]];
  const perStop = 30;
  let next = 0, sent = 0;
  for (let step = 0; step < 600 * 60; step++) {
    while (sent < 2 * perStop && sim.t >= next) {
      const [from, to] = pairs[sent % 2]!;
      const i = sim.spawnAt(from.lanes[from.lanes.length - 1]!, 2, to.id, Math.min(30, to.len - 2));
      if (i >= 0) { live.add(i); spawned++; }
      sent++; next = sim.t + 20;
    }
    sim.step();
    // each live car: on a one-way seg's lanes, it must be on the seg's a-to-b dseg (the only one with lanes)
    for (const i of live) {
      if (!sim.alive[i]) { live.delete(i); delivered++; continue; }
      const ln = g.lanes[sim.lane[i]!]!;
      if (ln.kind !== LK.LINK) continue; // a junction connector has no dseg
      const d = g.dsegs[ln.dseg]!;
      if (d.seg.cls.oneway) { onLoop++; if (d.from !== d.seg.a) wrongWay++; }
    }
    if (sent >= 2 * perStop && !live.size) break;
  }
  assert.equal(spawned, 2 * perStop, 'every car was spawned');
  assert.equal(delivered, spawned, 'every car arrived at its destination');
  assert.equal(sim.stats.lost, 0, 'nothing lost');
  assert.equal(sim.stats.towed, 0, 'nothing towed');
  assert.ok(onLoop > 0, 'cars drove on the loop');
  assert.equal(wrongWay, 0, 'every car on the loop drove in its one-way seg a-to-b direction');
});

test('a signalled crossing with a one-way arm running out: clean graph, a phase for each arm with inbound lanes only, and cars turn into the one-way', () => {
  // a crossing at (300, 300): W and E and S two-way, N a one-way running out of the centre (300, 300) to (300, 180)
  const C = 300, L = 120;
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  e.addLegs([leg(C, C, C - L, C), leg(C, C, C + L, C), leg(C, C, C, C + L)], TWO_WAY, 0);
  e.addLegs([leg(C, C, C, C - L)], ONE_WAY, 0);
  e.commit();
  const node = e.net.nodeAt({ x: C, y: C })!;
  e.setNodeType(node, 'signal'); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  assert.deepEqual(checkGraph(g), [], 'no graph errors');
  const sp = g.signals.get(node);
  assert.ok(sp, 'the signalled node has a plan');
  assert.ok(sp.phases >= 1, 'at least one phase');
  node.arms.forEach((arm, i) => {
    const inbound = g.dsegs.some(d => !!d && d.seg === arm.seg && d.to === node && d.lanes.length > 0);
    if (inbound) assert.ok(sp.armPhase[i]! >= 0, `arm ${i} has inbound lanes and a phase`);
    else assert.equal(sp.armPhase[i], -1, `arm ${i} has no inbound lanes and no phase`);
  });
  assert.equal(new Set(sp.armPhase.filter(p => p >= 0)).size, sp.phases, 'every phase is given to an arm');
  // cars from the W and S arms turn into the one-way (N): from each, 10 cars, every 15 s
  const out = dsegFromTo(g, C, C, C, C - L)!;
  assert.ok(out.lanes.length === 2, 'the one-way out has its two lanes');
  const W = dsegFromTo(g, C - L, C, C, C)!, S = dsegFromTo(g, C, C + L, C, C)!;
  const sim = new Sim(g, 3000, 11);
  let spawned = 0, next = 0, sent = 0, delivered = 0;
  const live = new Set<number>();
  const from = [W, S];
  for (let step = 0; step < 600 * 60; step++) {
    while (sent < 20 && sim.t >= next) {
      const f = from[sent % 2]!;
      const i = sim.spawnAt(f.lanes[f.lanes.length - 1]!, 2, out.id, Math.min(30, out.len - 2));
      if (i >= 0) { live.add(i); spawned++; }
      sent++; next = sim.t + 15;
    }
    sim.step();
    for (const i of live) if (!sim.alive[i]) { live.delete(i); delivered++; }
    if (sent >= 20 && !live.size) break;
  }
  assert.equal(spawned, 20, 'every car was spawned');
  assert.equal(delivered, spawned, 'every car from the W and S arms reached the one-way');
  assert.equal(sim.stats.lost, 0, 'nothing lost');
  assert.equal(sim.stats.towed, 0, 'nothing towed');
});
