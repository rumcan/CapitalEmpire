// Headless lane graph tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Node } from '../src/game/network';
import { NetEditor, applyOps } from '../src/game/netops';
import type { NetOp } from '../src/game/ground-protocol';
import { CTL, LK, LaneGraph, checkGraph, laneAt, type Lane, type Movement } from '../src/game/sim/lanes';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function grid(e: NetEditor, n: number, step: number) {
  for (let k = 0; k <= n; k++) {
    e.addLegs([leg(100, 100 + k * step, 100 + n * step, 100 + k * step)], k % 2 ? CLASS.street : CLASS.avenue, 0);
    e.addLegs([leg(100 + k * step, 100, 100 + k * step, 100 + n * step)], k % 3 ? CLASS.street : CLASS.boulevard, 0);
  }
}
/** commit the editor's edits and update the lane graph after them */
function update(e: NetEditor, g: LaneGraph) { e.commit(); g.update(e.net); }
function graphOf(e: NetEditor) { const g = new LaneGraph(); update(e, g); return g; }
const at = (e: NetEditor, x: number, y: number): Node => e.net.nodeAt({ x, y })!;
const liveLanes = (g: LaneGraph): Lane[] => g.lanes.filter((l): l is Lane => !!l);
const movesAt = (g: LaneGraph, n: Node): Movement[] => g.moves.filter((m): m is Movement => !!m && m.node === n);
/** a canonical summary of the lane graph: lane keys with rounded geometry, and movement keys */
function snapshot(g: LaneGraph) {
  const lanes = liveLanes(g).map(l => `${l.key} ${Array.from(l.pts, v => v.toFixed(2)).join(',')}`).sort();
  const moves = g.moves.filter((m): m is Movement => !!m).map(m => m.key).sort();
  return { lanes, moves };
}
/** a graph built once from the recorded ops, as a worker or a fresh session would have it */
function freshFrom(log: NetOp[]) { const m = new RoadNetwork(); applyOps(m, log); const h = new LaneGraph(); h.update(m); return h; }

test('a plain 4-arm crossing: 12 movements, no U-turns, crossings on the left turns, the avenue has priority', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.avenue, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  const g = graphOf(e), n = at(e, 50, 50), mv = movesAt(g, n);
  assert.equal(n.arms.length, 4);
  assert.equal(new Set(mv.map(m => m.from)).size, 4);
  assert.equal(mv.length, 12);
  assert.ok(mv.every(m => m.turn !== 'U' && m.paths.length === 1));
  assert.deepEqual(checkGraph(g), []);
  for (const m of mv.filter(m => m.turn === 'L')) { const c = g.lanes[m.paths[0][1]]!; assert.ok(c.conflicts.some(x => !x.merge), c.key); }
  // the avenue's arms are the major pair (free); the street's arms wait (STOP, as the avenue is class 3)
  for (const m of mv) { const c = g.lanes[m.paths[0][1]]!; assert.equal(c.ctl, g.dsegs[m.from]!.seg.cls.id === 'avenue' ? CTL.FREE : CTL.STOP, c.key); }
  const lk = liveLanes(g).find(l => l.kind === LK.LINK)!, o = { x: 0, y: 0, hx: 0, hy: 0 };
  laneAt(lk, lk.len, o);
  assert.ok(Math.abs(o.x - lk.pts[lk.pts.length - 2]) < 1e-9 && Math.abs(o.y - lk.pts[lk.pts.length - 1]) < 1e-9);
});

test('a boulevard crossing: left turns start on the inner lane, right turns on the outer, straights on both', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.boulevard, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.boulevard, 0);
  const g = graphOf(e), mv = movesAt(g, at(e, 50, 50));
  assert.equal(mv.length, 12);
  const idxs = (m: Movement) => m.paths.map(p => g.lanes[p[0]]!.idx);
  for (const m of mv.filter(m => m.turn === 'L')) assert.deepEqual(idxs(m), [0], m.key);
  for (const m of mv.filter(m => m.turn === 'R')) assert.deepEqual(idxs(m), [1], m.key);
  for (const m of mv.filter(m => m.turn === 'S')) assert.deepEqual(idxs(m), [0, 1], m.key);
  assert.deepEqual(checkGraph(g), []);
});

test('a signal node: two phases, every connector signalled', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  const g = graphOf(e), n = at(e, 50, 50);
  e.setNodeType(n, 'signal'); update(e, g);
  assert.equal(g.signals.get(n)?.phases, 2);
  const cons = liveLanes(g).filter(l => l.kind === LK.CONN && l.node === n);
  assert.ok(cons.length > 0);
  assert.ok(cons.every(c => c.ctl === CTL.SIGNAL));
  assert.deepEqual(checkGraph(g), []);
});

test('a four-arm roundabout: 8 ring arcs, 16 movements (4 U-turns), yielding entries', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  const g = graphOf(e), n = at(e, 50, 50);
  e.setNodeType(n, 'roundabout'); update(e, g);
  assert.ok(n.rb > 0);
  assert.equal(liveLanes(g).filter(l => l.kind === LK.RING && l.node === n).length, 8);
  const mv = movesAt(g, n);
  assert.equal(mv.length, 16);
  assert.equal(mv.filter(m => m.turn === 'U').length, 4);
  assert.deepEqual(checkGraph(g), []);
  const entries = liveLanes(g).filter(l => l.kind === LK.CONN && l.key.startsWith('E'));
  assert.equal(entries.length, 4);
  assert.ok(entries.every(l => l.ctl === CTL.YIELD));
});

test('a dead end has one U-turn movement', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 0, 50, 0)], CLASS.street, 0);
  const g = graphOf(e);
  for (const n of [at(e, 0, 0), at(e, 50, 0)]) { const mv = movesAt(g, n); assert.equal(mv.length, 1); assert.equal(mv[0].turn, 'U'); }
  assert.deepEqual(checkGraph(g), []);
});

test('incremental updates match a fresh build after every kind of edit', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph(), log: NetOp[] = [];
  const commit = (full = false) => { log.push(...e.commit(full)); g.update(e.net); };
  for (let k = 0; k <= 4; k++) {
    e.addLegs([leg(100, 100 + k * 20, 180, 100 + k * 20)], k % 2 ? CLASS.street : CLASS.avenue, 0); commit();
    e.addLegs([leg(100 + k * 20, 100, 100 + k * 20, 180)], k % 3 ? CLASS.street : CLASS.boulevard, 0); commit();
  }
  const check = () => {
    assert.deepEqual(checkGraph(g), []);
    const h = freshFrom(log);
    assert.deepEqual(checkGraph(h), []);
    assert.deepEqual(snapshot(g), snapshot(h));
  };
  check();
  e.removePiece(e.net.pieceNear({ x: 150, y: 160 })!); commit();
  check();
  e.setNodeType(at(e, 140, 140), 'roundabout'); commit();
  check();
  e.setNodeType(at(e, 160, 120), 'signal'); commit();
  check();
});

test('adding a road far from the others keeps every existing lane id and geometry', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph();
  grid(e, 6, 20); update(e, g);
  const before = new Map<number, { key: string; pts: number[] }>();
  for (const l of liveLanes(g)) before.set(l.id, { key: l.key, pts: Array.from(l.pts) });
  assert.ok(before.size > 0);
  e.addLegs([leg(900, 900, 960, 900)], CLASS.street, 0); update(e, g);
  for (const [id, b] of before) {
    const l = g.lanes[id];
    assert.ok(l && l.key === b.key, `lane ${id} ${b.key} changed`);
    assert.deepEqual(Array.from(l.pts), b.pts, `lane ${id} ${b.key} moved`);
  }
  assert.deepEqual(g.removed, []);
  assert.deepEqual(checkGraph(g), []);
});

test('timing: a 40 x 40 grid of streets and avenues at 40 tiles, full update and one edit', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph();
  for (let k = 0; k <= 40; k++) {
    const cls = k % 2 ? CLASS.street : CLASS.avenue;
    e.addLegs([leg(100, 100 + k * 40, 1700, 100 + k * 40)], cls, 0);
    e.addLegs([leg(100 + k * 40, 100, 100 + k * 40, 1700)], cls, 0);
  }
  e.commit(true);
  const t0 = performance.now(); g.update(e.net); const tFull = performance.now() - t0;
  const t1 = performance.now(); e.addLegs([leg(116, 100, 116, 300)], CLASS.avenue, 0); update(e, g); const tEdit = performance.now() - t1;
  console.log(`lane graph: ${e.net.segs.size} segs, ${liveLanes(g).length} lanes, ${g.moves.filter(Boolean).length} movements`);
  console.log(`lane graph full update ${tFull.toFixed(0)} ms; one edit (network rebuild + lane update) ${tEdit.toFixed(1)} ms`);
  assert.deepEqual(checkGraph(g), []);
});

test('an arterial: two lanes each way, 1 and 3 tiles off the centre line, no median', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.arterial, 0);
  const g = graphOf(e), links = liveLanes(g).filter(l => l.kind === LK.LINK);
  assert.equal(CLASS.arterial.median, 0);
  assert.equal(links.length, 4);
  for (const d of g.dsegs) if (d) assert.equal(d.lanes.length, 2);
  assert.deepEqual(links.map(l => Math.abs(l.pts[1]! - 50)).sort((p, q) => p - q), [1, 1, 3, 3]);
});

test('turn lanes: at a flagged junction, from a two-lane approach lane 0 takes only the left turns; the other lanes still go straight', () => {
  const build = (tl: boolean) => {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(0, 50, 100, 50)], CLASS.arterial, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
    if (tl) e.setNodeFlags(at(e, 50, 50), false, true);
    const g = graphOf(e);
    return { g, arterial: movesAt(g, at(e, 50, 50)).filter(m => g.dsegs[m.from]!.seg.cls.id === 'arterial') };
  };
  const { g, arterial } = build(true);
  const straight = arterial.filter(m => m.turn === 'S'), left = arterial.filter(m => m.turn === 'L');
  assert.ok(straight.length > 0 && left.length > 0);
  for (const m of straight) for (const p of m.paths) assert.notEqual(g.lanes[p[0]!]!.idx, 0, `straight from lane 0 in ${m.key}`);
  for (const m of left) for (const p of m.paths) assert.equal(g.lanes[p[0]!]!.idx, 0);
  assert.ok(straight.some(m => m.paths.some(p => g.lanes[p[0]!]!.idx === 1)));
  // without the flag the same approach does go straight from lane 0
  const plain = build(false);
  assert.ok(plain.arterial.some(m => m.turn === 'S' && m.paths.some(p => plain.g.lanes[p[0]!]!.idx === 0)));
});

test('widened turns: every connector at a flagged node is at least as fast as without the flag, and some are faster', () => {
  const build = (wide: boolean) => {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(0, 50, 100, 50)], CLASS.avenue, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
    if (wide) e.setNodeFlags(at(e, 50, 50), true, false);
    return new Map(liveLanes(graphOf(e)).filter(l => l.kind === LK.CONN).map(l => [l.key, l.vmax] as const));
  };
  const plain = build(false), wide = build(true);
  assert.ok(plain.size > 0);
  assert.equal(wide.size, plain.size);
  let faster = 0;
  for (const [k, v] of plain) { const w = wide.get(k)!; assert.ok(w >= v - 1e-9, k); if (w > v + 1e-9) faster++; }
  assert.ok(faster > 0);
});

/** the link lanes that end at node n */
const inboundLinks = (g: LaneGraph, n: Node) => g.dsegs.filter((d): d is NonNullable<typeof d> => !!d && d.to === n).flatMap(d => d.lanes.map(id => g.lanes[id]!));
test('a slip crossing: right turns through a slip body and a yielding mouth, the other movements through approach and departure lanes', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  const g = graphOf(e), n = at(e, 50, 50);
  e.setNodeType(n, 'slip'); update(e, g);
  assert.deepEqual(checkGraph(g), []);
  const mv = movesAt(g, n), own = (l: Lane) => l.node === n;
  assert.equal(mv.length, 12);
  const apr = liveLanes(g).filter(l => own(l) && l.flare === 1 && l.kind === LK.CONN && l.key.startsWith('A'));
  const dep = liveLanes(g).filter(l => own(l) && l.flare === 2);
  assert.equal(apr.length, 4); assert.equal(dep.length, 4);
  assert.ok(apr.every(l => l.ctl === CTL.FREE));
  // the inbound link lanes end well short of the node: 9 tiles or more where the slip body begins
  for (const l of inboundLinks(g, n)) assert.ok(Math.hypot(l.pts[l.pts.length - 2]! - n.x, l.pts[l.pts.length - 1]! - n.y) >= 9, l.key);
  for (const m of mv.filter(m => m.turn === 'R')) {
    assert.equal(m.paths.length, 1, m.key);
    const [a, b, c, d] = m.paths[0]!.map(id => g.lanes[id]!);
    assert.equal(m.paths[0]!.length, 4, m.key);
    assert.equal(a!.kind, LK.LINK); assert.ok(b!.key.startsWith('S') && b!.flare === 1, b!.key);
    assert.ok(c!.key.startsWith('M') && c!.ctl === CTL.YIELD && c!.prio === 1 && c!.phase === -1, c!.key);
    assert.equal(d!.kind, LK.LINK);
  }
  for (const m of mv.filter(m => m.turn !== 'R')) {
    for (const p of m.paths) {
      assert.equal(p.length, 5, m.key);
      const [, ap, c, dp] = p.map(id => g.lanes[id]!);
      assert.ok(ap!.key.startsWith('A') && ap!.flare === 1, m.key);
      assert.equal(c!.kind, LK.CONN); assert.equal(c!.ctl, CTL.SIGNAL, m.key);
      assert.equal(dp!.flare, 2, m.key);
    }
  }
  // every mouth merges with the departure lane of its out arm (the outermost lane of that arm, here the only one)
  for (const x of liveLanes(g).filter(l => own(l) && l.key.startsWith('M'))) {
    assert.ok(x.conflicts.some(c => c.merge && g.lanes[c.lane]!.flare === 2), x.key);
  }
  const sp = g.signals.get(n)!;
  for (const pl of sp.phaseLanes) for (const id of pl) assert.equal(g.lanes[id]!.flare, 1);
});

test('a slip avenue of two lanes each way crossing a street: right turns only from the rightmost lane, through the slip body', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.arterial, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  const g = graphOf(e), n = at(e, 50, 50);
  e.setNodeType(n, 'slip'); update(e, g);
  assert.deepEqual(checkGraph(g), []);
  const mv = movesAt(g, n), right = mv.filter(m => m.turn === 'R');
  assert.equal(right.length, 4);
  for (const m of right) {
    const inLanes = g.dsegs[m.from]!.lanes;
    assert.equal(m.paths.length, 1, m.key);
    assert.equal(m.paths[0]![0], inLanes[inLanes.length - 1], `${m.key} starts at its rightmost lane`);
    assert.ok(g.lanes[m.paths[0]![1]!]!.key.startsWith('S'), m.key);
    assert.ok(g.lanes[m.paths[0]![2]!]!.key.startsWith('M'), m.key);
  }
  // the avenue's two lanes both go straight on, lane 0 included; the left turns start at lane 0
  const arterialStraight = mv.filter(m => g.dsegs[m.from]!.seg.cls.id === 'arterial' && m.turn === 'S');
  assert.ok(arterialStraight.some(m => m.paths.some(p => g.lanes[p[0]!]!.idx === 0)));
  assert.ok(arterialStraight.some(m => m.paths.some(p => g.lanes[p[0]!]!.idx === 1)));
  assert.equal(liveLanes(g).filter(l => l.node === n && l.flare === 1 && l.key.startsWith('A')).length, 6);
});

test('a slip node: incremental updates match a fresh build, and turning it back to a signal leaves no flare lanes', () => {
  const e = new NetEditor(new RoadNetwork()), g = new LaneGraph(), log: NetOp[] = [];
  const commit = () => { log.push(...e.commit()); g.update(e.net); };
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0); commit();
  const n = at(e, 50, 50);
  e.setNodeType(n, 'signal'); commit();
  const before = snapshot(g);
  e.setNodeType(n, 'slip'); commit();
  assert.deepEqual(checkGraph(g), []);
  assert.ok(liveLanes(g).some(l => l.flare !== undefined));
  assert.deepEqual(snapshot(g), snapshot(freshFrom(log)));
  e.setNodeType(n, 'signal'); commit();
  assert.deepEqual(checkGraph(g), []);
  assert.ok(liveLanes(g).every(l => l.flare === undefined));
  assert.deepEqual(snapshot(g), before);
  assert.deepEqual(snapshot(g), snapshot(freshFrom(log)));
});
