// Headless network tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, KEY_CLASSES, RoadNetwork, WIDER, armDeg, slipIn, type ClassId, type Fx, type Leg, type Node, type Route, type Seg } from '../src/game/network';
import { NetEditor, applyNodeEntry, applyOps, netToOps, nodeEntry, straightChain } from '../src/game/netops';
import { CTL, LaneGraph, type Movement } from '../src/game/sim/lanes';
import { rle, unrle } from '../src/game/save';
import type { NetOp } from '../src/game/ground-protocol';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a canonical summary of everything the network derives */
function summary(n: RoadNetwork) {
  const segs = [...n.segs].map(s => { const [p, q] = [s.a, s.b].sort((u, v) => u.x - v.x || u.y - v.y); return `${p.x},${p.y}-${q.x},${q.y}:${s.cls.id}:${s.style}`; }).sort();
  const routes = [...n.routes].map(r => { const k = r.pts.map(p => `${p.x},${p.y}`); const f = k.join(' '), b = [...k].reverse().join(' '); return `${r.closed ? 'O' : '-'}${r.cls.id}:${f < b ? f : b}`; }).sort();
  const auto = n.autoProps.map(a => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`).sort();
  const nodes = [...n.nodes.values()].map(nd => `${nd.x},${nd.y}:${nd.type}:${nd.arms.map(a => `${a.xw.toFixed(2)}/${a.stop.toFixed(2)}/${a.lineInset.toFixed(2)}`).join(',')}`).sort();
  return { segs, routes, auto, nodes, fx: n.fxCount };
}
function grid(e: NetEditor, n: number, step: number) {
  for (let k = 0; k <= n; k++) {
    e.addLegs([leg(100, 100 + k * step, 100 + n * step, 100 + k * step)], k % 2 ? CLASS.street : CLASS.avenue, 0);
    e.addLegs([leg(100 + k * step, 100, 100 + k * step, 100 + n * step)], k % 3 ? CLASS.street : CLASS.boulevard, 0);
  }
}

test('crossing roads split into junctions', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(10, 20, 50, 20)], CLASS.street, 0); e.addLegs([leg(30, 5, 30, 40)], CLASS.street, 0); e.commit();
  assert.equal(e.net.segs.size, 4);
  assert.equal(e.net.nodeAt({ x: 30, y: 20 })?.segs.length, 4);
});

test('incremental rebuilds match a full rebuild after every kind of edit', () => {
  const e = new NetEditor(new RoadNetwork());
  grid(e, 6, 20); e.commit(true);
  const edits: (() => void)[] = [
    () => e.addLegs([leg(110, 90, 110, 230)], CLASS.street, 1),
    () => e.addLegs([leg(100, 100, 220, 100)], CLASS.road, 0), // class upgrade along an existing road
    () => { const n = e.net.nodeAt({ x: 140, y: 140 })!; e.setNodeType(n, 'roundabout'); },
    () => { const n = e.net.nodeAt({ x: 160, y: 120 })!; e.setNodeType(n, 'signal'); },
    () => { const n = e.net.nodeAt({ x: 180, y: 180 })!; e.setNodeType(n, 'slip'); },
    () => { const p = e.net.pieceNear({ x: 150, y: 160 })!; e.removePiece(p); },
    () => { const p = e.net.pieceNear({ x: 100, y: 130 })!; e.removePiece(p); },
    () => e.addLegs([leg(230, 230, 260, 260)], CLASS.lane, 0),
  ];
  for (const edit of edits) {
    edit(); e.commit();
    const inc = summary(e.net);
    e.net.rebuild(true);
    assert.deepEqual(summary(e.net), inc);
  }
});

test('replaying the recorded ops (what a ground worker does) reproduces the network', () => {
  const e = new NetEditor(new RoadNetwork()), mirror = new RoadNetwork(), log: NetOp[] = [];
  grid(e, 4, 20); log.push(...e.commit(true));
  e.addLegs([leg(90, 125, 200, 125)], CLASS.avenue, 0); log.push(...e.commit());
  const n = e.net.nodeAt({ x: 120, y: 120 })!; e.setNodeType(n, 'signal'); log.push(...e.commit());
  e.removePiece(e.net.pieceNear({ x: 150, y: 140 })!); log.push(...e.commit());
  applyOps(mirror, log);
  assert.deepEqual(summary(mirror), summary(e.net));
});

test('netToOps rebuilds the same network from nothing', () => {
  const e = new NetEditor(new RoadNetwork());
  grid(e, 4, 20); e.commit(true);
  e.setNodeType(e.net.nodeAt({ x: 120, y: 120 })!, 'roundabout'); e.setNodeType(e.net.nodeAt({ x: 160, y: 140 })!, 'signal'); e.commit();
  const copy = new RoadNetwork();
  applyOps(copy, netToOps(e.net));
  assert.deepEqual(summary(copy), summary(e.net));
});

test('a rebuild only touches the edited area', () => {
  const e = new NetEditor(new RoadNetwork());
  grid(e, 20, 40); e.commit(true);
  e.addLegs([leg(120, 110, 120, 130)], CLASS.street, 0); e.commit();
  const d = e.net.lastDirty!;
  assert.ok(d[2] - d[0] < 120 && d[3] - d[1] < 120, `dirty box ${d}`);
});

test('a 4 km street grid builds and edits quickly', () => {
  const e = new NetEditor(new RoadNetwork()), t0 = performance.now();
  for (let k = 0; k < 47; k++) { e.addLegs([leg(96, 96 + k * 40, 1936, 96 + k * 40)], CLASS.street, 0); e.addLegs([leg(96 + k * 40, 96, 96 + k * 40, 1936)], CLASS.street, 0); }
  e.commit(true);
  const tBuild = performance.now() - t0;
  const t1 = performance.now();
  e.addLegs([leg(116, 100, 116, 300)], CLASS.avenue, 0); e.commit();
  const tEdit = performance.now() - t1;
  console.log(`grid: ${e.net.segs.size} segs, full build ${tBuild.toFixed(0)} ms, one edit ${tEdit.toFixed(1)} ms`);
  assert.ok(e.net.segs.size > 4000);
  assert.ok(tEdit < 30, `edit took ${tEdit} ms`);
});

test('structure kinds are kept on every segment and route', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 0, 10, 0), leg(10, 0, 20, 0), leg(20, 0, 30, 0)], CLASS.street, 0, [0, 1, 0]); e.commit();
  assert.deepEqual([...e.net.segs].map(s => s.kind).sort(), [0, 0, 1]);
  assert.deepEqual([...e.net.routes].map(r => r.kind).sort(), [0, 0, 1]);
});

test('a street crossing a bridge splits it, and both halves keep the bridge kind', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(10, 0, 20, 0)], CLASS.street, 0, [1]); e.addLegs([leg(15, -5, 15, 5)], CLASS.street, 0, [0]); e.commit();
  assert.equal(e.net.segs.size, 4);
  const bridge = [...e.net.segs].filter(s => s.kind === 1);
  assert.equal(bridge.length, 2);
  assert.ok(bridge.every(s => s.a.y === 0 && s.b.y === 0));
});

test('terrain run-length encoding round-trips', () => {
  const a = new Uint8Array(5000); a.fill(3, 100, 900); a.fill(1, 4000);
  assert.deepEqual(unrle(rle(a), new Uint8Array(a.length)), a);
});

test('a gravel street crossing an avenue: the avenue is the major pair, the gravel arms wait at a priority', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.avenue, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.gravel, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  const n = e.net.nodeAt({ x: 50, y: 50 })!;
  const mv = g.moves.filter((m): m is Movement => !!m && m.node === n);
  assert.equal(n.arms.length, 4);
  assert.equal(mv.length, 12);
  // the avenue's movements run free; the gravel's wait (STOP, as the avenue is class 3) and never take priority
  for (const m of mv) {
    const c = g.lanes[m.paths[0][1]]!;
    if (g.dsegs[m.from]!.seg.cls.id === 'avenue') assert.equal(c.ctl, CTL.FREE, c.key);
    else { assert.equal(c.ctl, CTL.STOP, c.key); assert.ok(c.prio <= 1, c.key); }
  }
});

test('gravel routes get no decals, while a road of the same length does', () => {
  const decals = (id: ClassId) => {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(0, 0, 60, 0)], CLASS[id], 0); e.commit();
    const r = [...e.net.routes][0];
    return (e.net as unknown as { routeFeatures(r: Route): { decals: unknown[] } }).routeFeatures(r).decals.length;
  };
  assert.equal(decals('gravel'), 0);
  assert.ok(decals('road') > 0);
});

/** the seg between two points, either way round */
const segBetween = (n: RoadNetwork, ax: number, ay: number, bx: number, by: number): Seg => [...n.segs].find(s => (s.a.x === ax && s.a.y === ay && s.b.x === bx && s.b.y === by) || (s.a.x === bx && s.a.y === by && s.b.x === ax && s.b.y === ay))!;

test('the add-lane run: a straight run stops at a junction, a bend, a class change and a toll seg', () => {
  // a crossing at (50, 50): the two halves of the street stop there
  const cross = new NetEditor(new RoadNetwork());
  cross.addLegs([leg(0, 50, 50, 50), leg(50, 50, 100, 50)], CLASS.street, 0); cross.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0); cross.commit();
  assert.equal(straightChain(segBetween(cross.net, 0, 50, 50, 50)).length, 1);
  assert.equal(straightChain(segBetween(cross.net, 50, 50, 100, 50)).length, 1);
  // a straight line of two segs runs through their joint; a 90 degree bend after it stops the run
  const line = new NetEditor(new RoadNetwork());
  line.addLegs([leg(0, 50, 50, 50), leg(50, 50, 100, 50)], CLASS.street, 0); line.addLegs([leg(100, 50, 100, 100)], CLASS.street, 0); line.commit();
  const a = segBetween(line.net, 0, 50, 50, 50), b = segBetween(line.net, 50, 50, 100, 50);
  assert.deepEqual(straightChain(a).length, 2);
  assert.equal(straightChain(b).length, 2);
  assert.equal(straightChain(segBetween(line.net, 100, 50, 100, 100)).length, 1);
  // a class change ends the run; a toll seg (skip) is left out, and the run stops before it
  const mixed = new NetEditor(new RoadNetwork());
  mixed.addLegs([leg(0, 50, 50, 50)], CLASS.street, 0); mixed.addLegs([leg(50, 50, 100, 50)], CLASS.avenue, 0); mixed.commit();
  assert.equal(straightChain(segBetween(mixed.net, 0, 50, 50, 50)).length, 1);
  assert.deepEqual(straightChain(a, x => x === b), [a]);
  assert.deepEqual(straightChain(b, x => x === b), []);
});

test('the add-lane classes: gravel, lane, street and road widen to arterial, avenue to boulevard; the arterial and boulevard are the widest', () => {
  assert.equal(WIDER.gravel, 'arterial'); assert.equal(WIDER.lane, 'arterial'); assert.equal(WIDER.street, 'arterial'); assert.equal(WIDER.road, 'arterial');
  assert.equal(WIDER.avenue, 'boulevard');
  assert.equal(WIDER.arterial, undefined); assert.equal(WIDER.boulevard, undefined);
  assert.deepEqual(KEY_CLASSES, ['gravel', 'lane', 'street', 'road', 'avenue', 'boulevard']);
});

test('a flags op: netToOps carries a node\'s widened turns and turn lanes, and a replay sets them; unflagged nodes add no op', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0); e.commit();
  assert.ok(!netToOps(e.net).some(o => o.k === 'flags'));
  e.setNodeFlags(e.net.nodeAt({ x: 50, y: 50 })!, true, true);
  const ops = e.commit();
  assert.ok(ops.some(o => o.k === 'flags' && o.x === 50 && o.y === 50 && o.wide && o.tl));
  const log = netToOps(e.net);
  assert.ok(log.some(o => o.k === 'flags' && o.wide && o.tl));
  const fresh = new RoadNetwork(); applyOps(fresh, log);
  const nd = fresh.nodeAt({ x: 50, y: 50 });
  assert.ok(nd?.wide && nd?.tl);
});

test('saved nodes: an entry without flags loads as before (its type only); flags round trip through nodeEntry and applyNodeEntry', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0); e.commit();
  applyNodeEntry(e, [50, 50, 'signal']);
  const n = e.net.nodeAt({ x: 50, y: 50 })!;
  assert.equal(n.type, 'signal'); assert.ok(!n.wide && !n.tl);
  assert.deepEqual(nodeEntry(n), [50, 50, 'signal']);
  applyNodeEntry(e, [50, 50, 'plain', 2]);
  assert.equal(n.type, 'plain'); assert.ok(!n.wide && n.tl);
  assert.deepEqual(nodeEntry(n), [50, 50, 'plain', 2]);
  applyNodeEntry(e, [50, 50, 'plain', 1]);
  assert.deepEqual(nodeEntry(n), [50, 50, 'plain', 1]);
  applyNodeEntry(e, [5, 5, 'signal', 3]); // no node there: skipped
});

/** the in-arm degrees of a node's corners that have a right turn: the names setSlipOff takes */
const rightDegsOf = (n: Node): number[] => n.arms.flatMap((A, i) => { const j = slipIn(A, n.arms[(i + 1) % n.arms.length]!); return j ? [armDeg(j)] : []; });

test('slipways: off corners ride in the save entry as a 5th element, load back with the same lanes, and survive netToOps', () => {
  const build = () => { const e = new NetEditor(new RoadNetwork()); e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0); e.commit(); return e; };
  const laneSnap = (net: RoadNetwork) => { const g = new LaneGraph(); g.update(net); return g.lanes.filter((l): l is NonNullable<typeof l> => !!l).map(l => `${l.key} ${Array.from(l.pts, v => v.toFixed(2)).join(',')}`).sort(); };
  const e = build(), n = e.net.nodeAt({ x: 50, y: 50 })!;
  e.setNodeType(n, 'slip'); e.setSlipOff(n, []); e.commit();
  assert.deepEqual(nodeEntry(n), [50, 50, 'slip']);
  const degs = rightDegsOf(n);
  assert.equal(degs.length, 4);
  e.setSlipOff(n, [degs[0]!]); e.commit();
  assert.deepEqual(nodeEntry(n), [50, 50, 'slip', 0, [degs[0]!]]);
  const f = build(); applyNodeEntry(f, nodeEntry(n));
  const m = f.net.nodeAt({ x: 50, y: 50 })!;
  assert.equal(m.type, 'slip'); assert.deepEqual(m.slipOff, [degs[0]!]);
  f.commit();
  assert.deepEqual(laneSnap(f.net), laneSnap(e.net));
  const h = new RoadNetwork(); applyOps(h, netToOps(e.net));
  assert.deepEqual(h.nodeAt({ x: 50, y: 50 })!.slipOff, [degs[0]!]);
  assert.deepEqual(laneSnap(h), laneSnap(e.net));
});

test('turn arrows: a 4-arm arterial crossing with turn lanes paints 3 arrows (left, straight, right) on each of its 4 approaches, and none without', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.arterial, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.arterial, 0); e.commit();
  const n = e.net.nodeAt({ x: 50, y: 50 })!;
  const bars = () => (e.net as unknown as { nodeFx: Map<Node, Fx> }).nodeFx.get(n)!.bars;
  assert.equal(bars().length, 0);
  e.setNodeFlags(n, false, true); e.commit();
  assert.equal(bars().length, 12);
  // each arrow belongs to the arm its bbox centre lies furthest out along
  const along = (b: { bbox: number[] }, a: { dir: { x: number; y: number } }) => ((b.bbox[0] + b.bbox[2]) / 2 - n.x) * a.dir.x + ((b.bbox[1] + b.bbox[3]) / 2 - n.y) * a.dir.y;
  const owner = (b: { bbox: number[] }) => n.arms.reduce((p, q) => (along(b, q) > along(b, p) ? q : p));
  for (const a of n.arms) assert.equal(bars().filter(b => owner(b) === a && along(b, a) > 3).length, 3);
});

test('wide corners: a wide node rounds its corners at 2.2 times the class radius (the kerb arc follows), and a plain node keeps its own', () => {
  const corner = (wide: boolean) => {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(0, 50, 100, 50)], CLASS.arterial, 0); e.addLegs([leg(50, 0, 50, 100)], CLASS.arterial, 0); e.commit();
    const n = e.net.nodeAt({ x: 50, y: 50 })!;
    e.setNodeFlags(n, wide, false); e.commit();
    const arcs = (e.net as unknown as { nodeFx: Map<Node, Fx> }).nodeFx.get(n)!.slabRuns.flatMap(s => (s.kind === 'arc' ? [s.r1] : []));
    return Math.max(...arcs);
  };
  const plain = corner(false), wide = corner(true);
  assert.ok(Math.abs((plain - 0.02) - CLASS.arterial.rConcave) < 1e-9);
  assert.ok(Math.abs((wide - 0.02) / (plain - 0.02) - 2.2) < 1e-9);
});
