// Roundabouts with 1, 2 or 3 ring lanes: sizes, the painted rings, the lane graph (entries, exits, movements), the save entry, and a
// 10-minute traffic bench (no overlaps between cars on different lanes, nothing towed, two lanes cut the delay). npm test (headless).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RB_BASE, RB_LANE, RoadNetwork, type ClassId, type Leg, type Node } from '../src/game/network';
import { NetEditor, applyNodeEntry, applyOps, netToOps, nodeEntry } from '../src/game/netops';
import { LK, LaneGraph, laneAt, type DSeg, type Lane, type Movement } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const C = 300, ARM = 120;
type Arm = 'W' | 'E' | 'N' | 'S';
const ENDS: Record<Arm, [number, number]> = { W: [C - ARM, C], E: [C + ARM, C], N: [C, C - ARM], S: [C, C + ARM] };

/** a four-arm crossing (or a T) of one road class with its centre node a roundabout of rl ring lanes; its graph is built */
function roundabout(cls: ClassId, rl: 1 | 2 | 3, shape: '4' | 'T' = '4') {
  const e = new NetEditor(new RoadNetwork());
  const legs = shape === '4' ? [leg(C - ARM, C, C + ARM, C), leg(C, C - ARM, C, C + ARM)] : [leg(C - ARM, C, C + ARM, C), leg(C, C, C, C + ARM)];
  e.addLegs(legs, CLASS[cls], 0); e.commit();
  const n = e.net.nodeAt({ x: C, y: C })!;
  e.setNodeType(n, 'roundabout'); e.setNodeFlags(n, false, false, rl); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  return { e, n, g };
}
/** the ring lane a RING lane is: 0 the outer one (no suffix), 1 and 2 the ones inside it */
const ringOf = (l: Lane) => (l.key.endsWith(':1') ? 1 : l.key.endsWith(':2') ? 2 : 0);
const ringLanes = (g: LaneGraph, n: Node) => g.lanes.filter((l): l is Lane => !!l && l.kind === LK.RING && l.node === n);
const inboundD = (g: LaneGraph, n: Node) => g.dsegs.filter((d): d is DSeg => !!d && d.to === n);
const movesFrom = (g: LaneGraph, d: DSeg) => g.moves.filter((m): m is Movement => !!m && m.from === d.id);
/** the fill and the dashed line features a node paints (the network keeps them per node) */
const nodeFxOf = (e: NetEditor, n: Node) => (e.net as unknown as { nodeFx: Map<Node, { rbIslands: { r: number }[]; lines: { pts: { x: number; y: number }[]; closed: boolean }[] }> }).nodeFx.get(n)!;

test('roundabout sizes: the outer edge is 14, 22 or 30 m for 1, 2 or 3 ring lanes, or the widest arm plus 2 tiles and the ring lanes, if more', () => {
  for (const rl of [1, 2, 3] as const) assert.equal(roundabout('street', rl).n.rb, RB_BASE[rl], `street arms (h 1.6) at ${rl} lanes`);
  // the boulevard's arms (h 5) make a 1-lane ring 9.5 tiles; the arterial's (h 4) 8.5; with 2 or 3 lanes the base wins
  assert.equal(roundabout('boulevard', 1).n.rb, 5 + 2 + RB_LANE);
  assert.equal(roundabout('arterial', 1).n.rb, 4 + 2 + RB_LANE);
  assert.equal(roundabout('arterial', 2).n.rb, RB_BASE[2]);
  assert.equal(roundabout('arterial', 3).n.rb, RB_BASE[3]);
});

test('roundabout rings: the island is the outer edge less the ring lanes; each ring lane sits between the edge and the next lane in; 2 and 3 lanes paint dashed circles between them', () => {
  for (const rl of [1, 2, 3] as const) {
    const { e, n, g } = roundabout('arterial', rl), fx = nodeFxOf(e, n);
    assert.equal(fx.rbIslands[0]!.r, n.rb - rl * RB_LANE, `island radius at ${rl} lanes`);
    for (const l of ringLanes(g, n)) {
      const k = ringOf(l), want = n.rb - RB_LANE * (k + 0.5);
      for (let i = 0; i < l.pts.length; i += 2) assert.ok(Math.abs(Math.hypot(l.pts[i]! - n.x, l.pts[i + 1]! - n.y) - want) < 1e-6, `ring lane ${k} at ${rl} lanes sits at ${want}`);
    }
    const circles = fx.lines.filter(l => l.closed);
    assert.equal(circles.length, rl - 1, `dashed circles at ${rl} lanes`);
    circles.forEach((c, k) => { const r = Math.hypot(c.pts[0]!.x - n.x, c.pts[0]!.y - n.y); assert.ok(Math.abs(r - (n.rb - RB_LANE * (k + 1))) < 1e-6, `circle ${k + 1} radius ${r}`); });
  }
});

test('approach lanes end outside the outer edge of the ring: every inbound lane end is past rb + 0.5 tiles', () => {
  for (const [cls, rl] of [['street', 1], ['arterial', 1], ['arterial', 2], ['arterial', 3], ['boulevard', 3]] as const) {
    const { n, g } = roundabout(cls, rl);
    for (const d of inboundD(g, n)) for (const id of d.lanes) {
      const l = g.lanes[id]!, k = l.pts.length;
      const r = Math.hypot(l.pts[k - 2]! - n.x, l.pts[k - 1]! - n.y);
      assert.ok(r > n.rb + 0.5, `${cls} at ${rl} lanes: an inbound lane ends at ${r.toFixed(2)} tiles, the edge is ${n.rb}`);
    }
  }
});

test('a two-lane ring on arterials: a right turn from the right approach lane uses the outer ring lane, a left (or U) turn from the left lane the inner one', () => {
  const { n, g } = roundabout('arterial', 2);
  assert.equal(ringLanes(g, n).length, 16, '8 arcs per ring lane');
  let right = 0, left = 0;
  for (const d of inboundD(g, n)) {
    const L = d.lanes.length, leftmost = d.lanes[0]!, rightmost = d.lanes[L - 1]!;
    assert.equal(L, 2, 'an arterial approach has two lanes');
    for (const mv of movesFrom(g, d)) {
      for (const p of mv.paths) {
        assert.equal(g.lanes[p[2]!]!.kind, LK.RING, `${mv.key}: the lane after the entry is a ring arc`);
        if (mv.turn === 'R') { assert.equal(p[0], rightmost, `${mv.key}: a right turn starts in the right lane`); assert.equal(ringOf(g.lanes[p[2]!]!), 0, `${mv.key}: a right turn is on the outer ring lane`); right++; }
        if (mv.turn === 'L' || mv.turn === 'U') { assert.equal(p[0], leftmost, `${mv.key}: a left turn starts in the left lane`); assert.equal(ringOf(g.lanes[p[2]!]!), 1, `${mv.key}: a left turn is on the inner ring lane`); left++; }
      }
    }
  }
  assert.ok(right > 0 && left > 0, 'right and left turns exist');
});

test('a one-lane approach into a two-lane ring: its lane enters the outer ring lane, and also the inner one for the left and U turns', () => {
  const { n, g } = roundabout('street', 2);
  assert.equal(inboundD(g, n).length, 4);
  for (const d of inboundD(g, n)) {
    const entries = g.lanes.filter((l): l is Lane => !!l && l.kind === LK.CONN && l.key.startsWith('E' + g.lanes[d.lanes[0]!]!.key) && l.node === n);
    assert.deepEqual(entries.map(ringOf).sort(), [0, 1], 'an entry to each ring lane');
    for (const mv of movesFrom(g, d)) for (const p of mv.paths) {
      if (mv.turn === 'R') assert.equal(ringOf(g.lanes[p[2]!]!), 0, `${mv.key}: right turns on the outer lane`);
      if (mv.turn === 'L' || mv.turn === 'U') assert.equal(ringOf(g.lanes[p[2]!]!), 1, `${mv.key}: left and U turns on the inner lane`);
    }
  }
});

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
 *  takes alone on the same movement (same graph, empty network) */
function bench(rl: 1 | 2 | 3, rate: number, minutes: number, cls: ClassId = 'arterial', seed = 5) {
  const { n, g } = roundabout(cls, rl), A = Object.keys(ENDS) as Arm[];
  const inD = (a: Arm) => g.dsegs.find(d => d && d.from.x === ENDS[a][0] && d.from.y === ENDS[a][1])!;
  const outD = (a: Arm) => g.dsegs.find(d => d && d.to.x === ENDS[a][0] && d.to.y === ENDS[a][1])!;
  const sim = new Sim(g, 3000, seed);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const next = new Map<Arm, number>(); for (const a of A) next.set(a, (rnd() * 3600) / rate);
  const live = new Map<number, { t0: number; from: Arm; to: Arm }>(), trips: { from: Arm; to: Arm; dt: number }[] = [];
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
    for (const [i, v] of live) if (!sim.alive[i]) { trips.push({ from: v.from, to: v.to, dt: sim.t - v.t0 }); live.delete(i); }
  }
  const freeTime = (from: Arm, to: Arm) => {
    const s = new Sim(g, 10, 1), i = s.spawnAt(inD(from).lanes[inD(from).lanes.length - 1]!, 2, outD(to).id, Math.min(30, outD(to).len - 2));
    let t = 0; while (s.alive[i] && t < 6000) { s.step(); t++; }
    return t / 10;
  };
  const delays = trips.map(x => x.dt - freeTime(x.from, x.to));
  const mean = delays.reduce((s, x) => s + x, 0) / Math.max(1, delays.length);
  return { cars: trips.length, mean, overlaps, towed: sim.stats.towed, still: live.size, n };
}

test('four-arm arterial roundabouts at 600 veh/h per arm for 10 min, with 1, 2 and 3 ring lanes: no overlaps between cars on different lanes, nothing towed, and two lanes cut the mean delay', () => {
  const res = [1, 2, 3].map(rl => bench(rl as 1 | 2 | 3, 600, 10));
  res.forEach((r, k) => console.log(`roundabout ${k + 1} ring lane(s), arterial 600 veh/h per arm, 10 min: ${r.cars} trips, mean delay ${r.mean.toFixed(1)} s, overlaps ${r.overlaps}, towed ${r.towed}, still on ${r.still}`));
  res.forEach((r, k) => {
    assert.equal(r.overlaps, 0, `${k + 1} ring lane(s): overlaps between cars on different lanes`);
    assert.equal(r.towed, 0, `${k + 1} ring lane(s): nothing towed`);
  });
  assert.ok(res[1]!.mean < res[0]!.mean, `two lanes (${res[1]!.mean.toFixed(1)} s) below one (${res[0]!.mean.toFixed(1)} s)`);
});

test('ring lanes round trip: the save entry keeps them (bits 4 and 8 of the flags, rl = 1 + (flags >> 2 & 3)), a one-lane node saves as before, and the flags op replays them', () => {
  const { e, n } = roundabout('arterial', 3);
  assert.deepEqual(nodeEntry(n), [n.x, n.y, 'roundabout', 8]);
  const single = roundabout('arterial', 1).n;
  assert.deepEqual(nodeEntry(single), [single.x, single.y, 'roundabout']);
  const e2 = new NetEditor(new RoadNetwork());
  e2.addLegs([leg(C - ARM, C, C + ARM, C), leg(C, C - ARM, C, C + ARM)], CLASS.arterial, 0); e2.commit();
  const m = e2.net.nodeAt({ x: C, y: C })!;
  applyNodeEntry(e2, [C, C, 'roundabout', 4]);
  assert.equal(m.rl, 2);
  applyNodeEntry(e2, [C, C, 'roundabout', 12]); // 3 + 1 would be 4: clamped to 3
  assert.equal(m.rl, 3);
  assert.ok(netToOps(e.net).some(o => o.k === 'flags' && o.rl === 3));
  const fresh = new RoadNetwork();
  applyOps(fresh, netToOps(e.net));
  assert.equal(fresh.nodeAt({ x: C, y: C })?.rl, 3);
});

test('a short last piece of arterial before a 2-lane ring: a car starting in the left lane for the first exit changes lanes before it and enters the ring once', () => {
  // streets W, E and S and an arterial in at 45 degrees that bends 14 tiles out (its last piece is too short to change lanes on): the
  // arterial's first exit is W, from its right lane only. Without the early choice the car kept the left lane, went round the inner ring and came back
  const e = new NetEditor(new RoadNetwork()), A = { x: C + 60, y: C - 62 };
  e.addLegs([leg(C - 80, C, C + 80, C), leg(C, C, C, C + 80)], CLASS.street, 0);
  e.addLegs([leg(C, C, C + 14, C - 14), leg(C + 14, C - 14, A.x, A.y)], CLASS.arterial, 0); e.commit();
  const n = e.net.nodeAt({ x: C, y: C })!; e.setNodeType(n, 'roundabout'); e.setNodeFlags(n, false, false, 2); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  const from = g.dsegs.find(d => d && d.from.x === A.x && d.from.y === A.y)!, to = g.dsegs.find(d => d && d.to.x === C - 80 && d.to.y === C)!;
  const sim = new Sim(g, 10, 1), i = sim.spawnAt(from.lanes[0]!, 2, to.id, Math.min(30, to.len - 2));
  assert.ok(i >= 0);
  const entries: string[] = [];
  for (let k = 0; k < 3000 && sim.alive[i]; k++) { sim.step(); const l = g.lanes[sim.lane[i]!]!; if (l.kind === LK.CONN && l.key.startsWith('E') && entries[entries.length - 1] !== l.key) entries.push(l.key); }
  assert.ok(!sim.alive[i], 'the car arrived');
  assert.equal(entries.length, 1, `ring entries: ${entries.join(', ')}`);
  assert.ok(!entries[0]!.endsWith(':1'), `entered the outer ring lane (${entries[0]})`);
});
