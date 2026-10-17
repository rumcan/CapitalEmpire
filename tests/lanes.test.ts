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
