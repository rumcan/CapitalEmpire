// All-way stops and mini-roundabouts: the lane graph (every connector of a stop has the same STOP control and priority; a mini-roundabout is one ring
// lane on a small circle, whatever its ring-lane count), and 10-minute traffic benches (nothing lost or towed, cars from every arm get through,
// the mini-roundabout at 300 veh/h per arm is quicker than the all-way stop at 400). npm test (headless).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, MINI_ISLAND, RoadNetwork, type ClassId, type Leg, type Node, type NodeType } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { CTL, LK, LaneGraph, checkGraph, laneAt, type DSeg, type Lane, type Movement } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const C = 300, ARM = 120;
type Arm = 'W' | 'E' | 'N' | 'S';
const ENDS: Record<Arm, [number, number]> = { W: [C - ARM, C], E: [C + ARM, C], N: [C, C - ARM], S: [C, C + ARM] };
const A4 = Object.keys(ENDS) as Arm[];

/** a four-arm crossing of one road class with its centre node of type t (and rl ring lanes); its graph is built */
function crossing(cls: ClassId, t: NodeType, rl: 1 | 2 | 3 = 1) {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(C - ARM, C, C + ARM, C), leg(C, C - ARM, C, C + ARM)], CLASS[cls], 0); e.commit();
  const n = e.net.nodeAt({ x: C, y: C })!;
  e.setNodeType(n, t); e.setNodeFlags(n, false, false, rl); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  return { e, n, g };
}
const ringOf = (l: Lane) => (l.key.endsWith(':1') ? 1 : l.key.endsWith(':2') ? 2 : 0);
const ringLanes = (g: LaneGraph, n: Node) => g.lanes.filter((l): l is Lane => !!l && l.kind === LK.RING && l.node === n);
const connectors = (g: LaneGraph, n: Node) => g.lanes.filter((l): l is Lane => !!l && l.kind === LK.CONN && l.node === n);
const inboundD = (g: LaneGraph, n: Node) => g.dsegs.filter((d): d is DSeg => !!d && d.to === n);
const movesFrom = (g: LaneGraph, d: DSeg) => g.moves.filter((m): m is Movement => !!m && m.from === d.id);

/** the number of pairs of cars on different lanes closer than 2.5 m now (front points), as the bench counts them */
function overlapsNow(sim: Sim, g: LaneGraph): number {
  const P: { x: number; y: number; ln: number }[] = [], pt = { x: 0, y: 0, hx: 0, hy: 0 };
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { laneAt(g.lanes[sim.lane[i]!]!, sim.s[i]!, pt); P.push({ x: pt.x, y: pt.y, ln: sim.lane[i]! }); }
  let n = 0;
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
    const A = P[a]!, B = P[b]!;
    if (A.ln !== B.ln && Math.hypot(A.x - B.x, A.y - B.y) * 2 < 2.5) n++;
  }
  return n;
}
/** a seeded four-arm bench: rate vehicles an hour per arm, random exits, minutes long; the delay of a trip is its time less the time one car
 *  takes alone on the same movement (same graph, empty network). done[arm] counts the trips that finished from that arm; lateDone those that
 *  finished in the last two minutes (cars still getting through, not a deadlock) */
function bench(cls: ClassId, t: NodeType, rate: number, minutes: number, seed = 5) {
  const { n, g } = crossing(cls, t), A = A4;
  const inD = (a: Arm) => g.dsegs.find(d => d && d.from.x === ENDS[a][0] && d.from.y === ENDS[a][1])!;
  const outD = (a: Arm) => g.dsegs.find(d => d && d.to.x === ENDS[a][0] && d.to.y === ENDS[a][1])!;
  const sim = new Sim(g, 3000, seed);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const next = new Map<Arm, number>(); for (const a of A) next.set(a, (rnd() * 3600) / rate);
  const live = new Map<number, { t0: number; from: Arm; to: Arm }>(), trips: { from: Arm; to: Arm; dt: number; t: number }[] = [];
  let overlaps = 0;
  for (let k = 0; k < minutes * 600; k++) {
    for (const a of A) while (sim.t >= next.get(a)!) {
      const others = A.filter(b => b !== a), to = others[Math.floor(rnd() * others.length)]!, d = inD(a), o = outD(to);
      const i = sim.spawnAt(d.lanes[d.lanes.length - 1]!, 2, o.id, Math.min(30, o.len - 2));
      if (i >= 0) live.set(i, { t0: sim.t, from: a, to });
      next.set(a, next.get(a)! + (-Math.log(1 - rnd()) * 3600) / rate);
    }
    sim.step();
    if (k % 100 === 0) overlaps += overlapsNow(sim, g);
    for (const [i, v] of live) if (!sim.alive[i]) { trips.push({ from: v.from, to: v.to, dt: sim.t - v.t0, t: sim.t }); live.delete(i); }
  }
  const freeTime = (from: Arm, to: Arm) => {
    const s = new Sim(g, 10, 1), i = s.spawnAt(inD(from).lanes[inD(from).lanes.length - 1]!, 2, outD(to).id, Math.min(30, outD(to).len - 2));
    let tt = 0; while (s.alive[i] && tt < 6000) { s.step(); tt++; }
    return tt / 10;
  };
  const delays = trips.map(x => x.dt - freeTime(x.from, x.to));
  const mean = delays.reduce((s, x) => s + x, 0) / Math.max(1, delays.length);
  const done: Record<Arm, number> = { W: 0, E: 0, N: 0, S: 0 };
  for (const x of trips) done[x.from]++;
  const lateDone = trips.filter(x => x.t >= (minutes - 2) * 60).length;
  return { cars: trips.length, mean, overlaps, lost: sim.stats.lost, towed: sim.stats.towed, still: live.size, done, lateDone, n, g };
}

test('all-way stop: the crossing builds clean; every connector stops with the same priority (no signals, no major arm)', () => {
  const { g, n } = crossing('street', 'stop');
  assert.deepEqual(checkGraph(g), []);
  const cs = connectors(g, n);
  assert.ok(cs.length > 0, 'the stop has connectors');
  for (const c of cs) { assert.equal(c.ctl, CTL.STOP, `${c.key} stops`); assert.equal(c.prio, 1, `${c.key} has priority 1`); }
});

test('all-way stop, 4-way street crossing at 300 veh/h per arm for 10 min: nothing lost or towed, cars from every arm, cars still arriving in the last 2 min', () => {
  const r = bench('street', 'stop', 300, 10);
  console.log(`minijx stop 4-way street 300 veh/h per arm, 10 min: ${r.cars} trips, mean delay ${r.mean.toFixed(1)} s, lost ${r.lost}, towed ${r.towed}, still on ${r.still}, last 2 min ${r.lateDone}; from W ${r.done.W}, E ${r.done.E}, N ${r.done.N}, S ${r.done.S}`);
  assert.equal(r.lost, 0, 'nothing lost');
  assert.equal(r.towed, 0, 'nothing towed');
  for (const a of A4) assert.ok(r.done[a] > 0, `cars from ${a} get through`);
  assert.ok(r.lateDone > 0, 'cars still arrive in the last two minutes (no deadlock)');
});

test('mini-roundabout, 4-way street crossing: the island is the 1.2-tile disc, the ring is one lane on a small circle whatever the ring-lane count, and the crossing is clean', () => {
  for (const rl of [1, 3] as const) {
    const { n, g } = crossing('street', 'mini', rl);
    assert.ok(n.rb >= 4 && n.rb <= 6, `outer radius ${n.rb} tiles for streets`);
    assert.deepEqual(checkGraph(g), [], `checkGraph clean with ${rl} ring lanes set`);
    const rings = ringLanes(g, n);
    assert.ok(rings.length > 0, 'the mini-roundabout has ring lanes');
    assert.deepEqual([...new Set(rings.map(ringOf))], [0], 'one ring lane');
    for (const l of rings) for (let i = 0; i < l.pts.length; i += 2) assert.ok(Math.abs(Math.hypot(l.pts[i]! - n.x, l.pts[i + 1]! - n.y) - (MINI_ISLAND + 1.4)) < 1e-6, 'the ring sits at the island radius plus 1.4 tiles');
  }
});

test('mini-roundabout, 4-way street crossing at 300 veh/h per arm for 10 min: nothing lost or towed, cars from every arm, and quicker than the all-way stop at 400', () => {
  const m = bench('street', 'mini', 300, 10), s = bench('street', 'stop', 400, 10), s3 = bench('street', 'stop', 300, 10), m4 = bench('street', 'mini', 400, 10);
  console.log(`minijx mini 4-way street 300 veh/h per arm, 10 min: ${m.cars} trips, mean delay ${m.mean.toFixed(1)} s, lost ${m.lost}, towed ${m.towed}, overlaps ${m.overlaps}, still on ${m.still}, last 2 min ${m.lateDone}; from W ${m.done.W}, E ${m.done.E}, N ${m.done.N}, S ${m.done.S}`);
  console.log(`minijx stop 4-way street 400 veh/h per arm, 10 min: ${s.cars} trips, mean delay ${s.mean.toFixed(1)} s, lost ${s.lost}, towed ${s.towed}, still on ${s.still}`);
  console.log(`minijx (for reference) stop 300 veh/h: mean delay ${s3.mean.toFixed(1)} s; mini 400 veh/h: mean delay ${m4.mean.toFixed(1)} s, lost ${m4.lost}, towed ${m4.towed}`);
  assert.equal(m.lost, 0, 'nothing lost');
  assert.equal(m.towed, 0, 'nothing towed');
  assert.equal(m.overlaps, 0, 'no overlaps between cars on different lanes');
  for (const a of A4) assert.ok(m.done[a] > 0, `cars from ${a} get through`);
  assert.ok(m.mean < s.mean, `mini at 300 (${m.mean.toFixed(1)} s) below the all-way stop at 400 (${s.mean.toFixed(1)} s)`);
});

test('mini-roundabout on an arterial crossing (arterial x arterial): builds clean and runs at 300 veh/h per arm for 10 min with nothing lost or towed', () => {
  const r = bench('arterial', 'mini', 300, 10);
  const { n, g } = crossing('arterial', 'mini');
  assert.deepEqual(checkGraph(g), []);
  console.log(`minijx mini 4-way arterial 300 veh/h per arm, 10 min: radius ${n.rb} tiles, ${r.cars} trips, mean delay ${r.mean.toFixed(1)} s, lost ${r.lost}, towed ${r.towed}, overlaps ${r.overlaps}, still on ${r.still}`);
  assert.ok(n.rb >= 4, 'the ring is at least 4 tiles out');
  assert.equal(r.lost, 0, 'nothing lost');
  assert.equal(r.towed, 0, 'nothing towed');
  for (const a of A4) assert.ok(r.done[a] > 0, `cars from ${a} get through`);
});

test('mini-roundabout paints a white island and a yellow rim, and a dashed give-way line across each approach (no kerb, no tree)', () => {
  const { e, n } = crossing('street', 'mini');
  const fx = (e.net as unknown as { nodeFx: Map<Node, { rbIslands: unknown[]; autoProps: { kind: string }[]; lines: { closed: boolean; color: string; width: number }[] }> }).nodeFx.get(n)!;
  assert.equal(fx.rbIslands.length, 0, 'no planted island');
  assert.equal(fx.autoProps.filter(a => a.kind === 'rbtree').length, 0, 'no roundabout tree');
  const closed = fx.lines.filter(l => l.closed);
  assert.ok(closed.some(l => l.width === MINI_ISLAND && l.color.startsWith('rgba(238')), 'a white island fill');
  assert.ok(closed.some(l => l.color === '#d6b23b'), 'a yellow rim');
  assert.equal(fx.lines.filter(l => !l.closed && l.color.startsWith('rgba(238')).length, 4, 'a dashed give-way line on each of the four approaches');
});

test('sanity: the mini-roundabout type is a junction the graph reads as a ring (inbound dsegs all reach the ring)', () => {
  const { g, n } = crossing('street', 'mini');
  assert.equal(inboundD(g, n).length, 4);
  for (const d of inboundD(g, n)) assert.ok(movesFrom(g, d).length > 0, 'every approach has movements');
});
