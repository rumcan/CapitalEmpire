// Headless network tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor, applyOps } from '../src/game/netops';
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

test('terrain run-length encoding round-trips', () => {
  const a = new Uint8Array(5000); a.fill(3, 100, 900); a.fill(1, 4000);
  assert.deepEqual(unrle(rle(a), new Uint8Array(a.length)), a);
});
