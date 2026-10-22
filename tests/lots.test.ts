// Headless parcel tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type PieceSel, type Pt, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { benchLayout, benchNetwork } from '../src/game/bench-net';
import { LotMap, ringClear, type Lot } from '../src/game/lots/lots';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the 3x3 grid: 4 lines each way, 40 tiles apart, from O (a multiple of 8, so the lot lattice lines up with the blocks) */
const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1);
function gridStreets(e: NetEditor, cls = CLASS.street) {
  for (let k = 0; k < LINES; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], cls, 0);
    e.addLegs([leg(at(k), O, at(k), last)], cls, 0);
  }
  e.commit();
}
/** the seg of the network that joins two points (in either direction) */
function segBetween(e: NetEditor, ax: number, ay: number, bx: number, by: number): Seg {
  const s = [...e.net.segs].find(q => Math.min(q.a.x, q.b.x) === Math.min(ax, bx) && Math.max(q.a.x, q.b.x) === Math.max(ax, bx) && Math.min(q.a.y, q.b.y) === Math.min(ay, by) && Math.max(q.a.y, q.b.y) === Math.max(ay, by));
  assert.ok(s, `no seg ${ax},${ay} ${bx},${by}`); return s!;
}
/** a lot's sample points: a 1-tile grid over its rectangle, corners included */
function samples(l: Lot): Pt[] {
  const out: Pt[] = [];
  for (let j = 0; j <= l.d; j++) for (let i = 0; i <= l.w; i++) out.push({ x: l.o.x + l.u.x * i + l.n.x * j, y: l.o.y + l.u.y * i + l.n.y * j });
  return out;
}
function distToSeg(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(s.a.x + dx * t - p.x, s.a.y + dy * t - p.y);
}
/** the separating-axis overlap test, with the same 0.25-tile tolerance as the rules */
function overlapT(p: Lot, q: Lot): boolean {
  const dx = q.c.x - p.c.x, dy = q.c.y - p.c.y;
  for (const ax of [p.u, p.n, q.u, q.n]) {
    const r = (l: Lot) => Math.abs(l.u.x * ax.x + l.u.y * ax.y) * l.w / 2 + Math.abs(l.n.x * ax.x + l.n.y * ax.y) * l.d / 2;
    if (Math.abs(dx * ax.x + dy * ax.y) >= r(p) + r(q) - 0.25) return false;
  }
  return true;
}
function assertNoOverlaps(lots: Lot[]) {
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) assert.ok(!overlapT(lots[i], lots[j]), `${lots[i].key} overlaps ${lots[j].key}`);
}
/** the map's contents as sorted strings: keys and rounded corners (the incremental check compares these) */
function fingerprint(lm: LotMap): string[] {
  return [...lm.lots.values()].map(l => {
    const v = [l.o.x, l.o.y, l.o.x + l.u.x * l.w, l.o.y + l.u.y * l.w, l.o.x + l.n.x * l.d, l.o.y + l.n.y * l.d];
    return `${l.key}|${v.map(x => Math.round(x * 100)).join(',')}`;
  }).sort();
}

test('a 3x3 grid of streets: lots lie along the roads, never overlap, every block has 4+ lots and two opposite sides with 2+ (the lots 25% wider since 2026-10-22), corner lots exist', () => {
  const e = new NetEditor(new RoadNetwork()); gridStreets(e);
  const lm = new LotMap(); const r = lm.update(e.net, null);
  const lots = [...lm.lots.values()];
  assert.equal(r.added.length, lots.length);
  assert.ok(lots.length > 0);
  // no sample sits within a road's verge
  for (const l of lots) for (const p of samples(l)) for (const s of e.net.segs) assert.ok(distToSeg(p, s) >= s.cls.h + s.cls.walk - 1e-6, `${l.key} in a verge`);
  assertNoOverlaps(lots);
  // each of the 9 blocks: the lots whose centre is inside it, sorted by the block edge their frontage lies on
  for (let bi = 0; bi < 3; bi++) for (let bj = 0; bj < 3; bj++) {
    const x0 = at(bi), x1 = at(bi + 1), y0 = at(bj), y1 = at(bj + 1);
    const inside = lots.filter(l => l.c.x > x0 && l.c.x < x1 && l.c.y > y0 && l.c.y < y1);
    const edge = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const l of inside) {
      const dist = { top: Math.abs(l.front.y - y0), bottom: Math.abs(y1 - l.front.y), left: Math.abs(l.front.x - x0), right: Math.abs(x1 - l.front.x) };
      const near = (Object.keys(dist) as (keyof typeof dist)[]).reduce((a, b) => (dist[b] < dist[a] ? b : a));
      edge[near]++;
    }
    const block = `block ${bi},${bj}`;
    assert.ok(inside.length >= 4, `${block} has ${inside.length} lots`);
    assert.ok((edge.top >= 2 && edge.bottom >= 2) || (edge.left >= 2 && edge.right >= 2), `${block} edges ${JSON.stringify(edge)}`);
  }
  assert.ok(lots.some(l => l.corner), 'corner lots');
});

test('a street that cuts a block: far lots keep keys and ids, the cut block gets lots on the new street, no overlaps', () => {
  const e = new NetEditor(new RoadNetwork()); gridStreets(e);
  const lm = new LotMap(); lm.update(e.net, null);
  const before = new Map(lm.lots);
  e.addLegs([leg(at(0), 60, at(1), 60)], CLASS.street, 0); e.commit();
  lm.update(e.net, null);
  const dist = (p: Pt) => distToSeg(p, { a: { x: at(0), y: 60 }, b: { x: at(1), y: 60 }, cls: CLASS.street } as Seg);
  let far = 0;
  for (const [key, l] of before) {
    if (dist(l.c) <= 45) continue;
    far++;
    assert.equal(lm.lots.get(key)?.id, l.id, `${key} kept its id`);
  }
  assert.ok(far > 0);
  const onNew = [...lm.lots.values()].filter(l => l.seg.a.y === 60 && l.seg.b.y === 60);
  assert.ok(onNew.some(l => l.side === 1) && onNew.some(l => l.side === -1), 'lots on both sides of the new street');
  assertNoOverlaps([...lm.lots.values()]);
});

test('removing a piece of road removes the lots along it and nothing far away changes', () => {
  const e = new NetEditor(new RoadNetwork()); gridStreets(e);
  const lm = new LotMap(); lm.update(e.net, null);
  const before = new Map(lm.lots);
  const sel: PieceSel = { seg: segBetween(e, 80, 80, 120, 80), p0: { x: 90, y: 80 }, p1: { x: 110, y: 80 } };
  e.removePiece(sel); e.commit(); lm.update(e.net, null);
  for (const l of lm.lots.values()) {
    const s = l.seg, lo = Math.min(s.a.x, s.b.x), hi = Math.max(s.a.x, s.b.x);
    assert.ok(!(s.a.y === 80 && s.b.y === 80 && lo < 110 && hi > 90), `${l.key} lies along the removed piece`);
  }
  let far = 0;
  for (const [key, l] of before) {
    if (Math.hypot(l.c.x - 100, l.c.y - 80) <= 45) continue;
    far++;
    assert.equal(lm.lots.get(key)?.id, l.id, `${key} kept its id`);
  }
  assert.ok(far > 0);
  assertNoOverlaps([...lm.lots.values()]);
});

test('terrain: with water over half of a block, no lot there has more than 10% water', () => {
  const e = new NetEditor(new RoadNetwork()); gridStreets(e);
  const terr = new Uint8Array(MAP * MAP);
  for (let y = O; y < O + STEP; y++) for (let x = O; x < O + STEP / 2; x++) terr[y * MAP + x] = TC.WATER;
  const lm = new LotMap(); lm.update(e.net, terr);
  const lots = [...lm.lots.values()];
  for (const l of lots) {
    const ps = samples(l);
    const wet = ps.filter(p => terr[Math.floor(p.y) * MAP + Math.floor(p.x)] === TC.WATER).length;
    assert.ok(wet / ps.length <= 0.1, `${l.key} is ${wet}/${ps.length} water`);
  }
  assert.ok(lots.some(l => l.c.x > O + STEP / 2 && l.c.x < O + STEP && l.c.y > O && l.c.y < O + STEP), 'the dry half keeps lots');
  assertNoOverlaps(lots);
});

test('incremental equals full: lots built edit by edit match a fresh map on the finished network', () => {
  const e = new NetEditor(new RoadNetwork());
  const inc = new LotMap();
  const step = (name: string, f: () => void) => {
    f(); e.commit(); inc.update(e.net, null);
    const fresh = new LotMap(); fresh.update(e.net, null);
    assert.deepEqual(fingerprint(inc), fingerprint(fresh), name);
  };
  // the 8 lines of the grid, one per edit, in mixed classes (so the priority rules meet back-to-back and corner overlaps)
  const classes = [CLASS.boulevard, CLASS.street, CLASS.avenue, CLASS.road, CLASS.street];
  const lines: Leg[] = [];
  for (let k = 0; k < LINES; k++) lines.push(leg(O, at(k), last, at(k)), leg(at(k), O, at(k), last));
  lines.forEach((l, i) => step(`line ${i}`, () => e.addLegs([l], classes[i % classes.length], 0)));
  step('cut street', () => e.addLegs([leg(at(0), 60, at(1), 60)], CLASS.street, 0));
  step('remove piece', () => e.removePiece({ seg: segBetween(e, 80, 80, 120, 80), p0: { x: 90, y: 80 }, p1: { x: 110, y: 80 } }));
  step('roundabout', () => e.setNodeType(e.net.nodeAt({ x: at(2), y: at(2) })!, 'roundabout'));
  step('signals', () => e.setNodeType(e.net.nodeAt({ x: at(1), y: at(1) })!, 'signal'));
  step('dead end', () => e.addLegs([leg(last, 100, last + 40, 100)], CLASS.lane, 0));
  step('remove a piece of the dead end', () => e.removePiece({ seg: segBetween(e, last, 100, last + 40, 100), p0: { x: last + 10, y: 100 }, p1: { x: last + 20, y: 100 } }));
  assert.ok(inc.lots.size > 0);
});

test('timing (log): the 40x40 bench grid, full update and one edit', () => {
  const size = (40 / 47) ** 2, { lines, at: bat } = benchLayout(size);
  assert.equal(lines, 40);
  const e = new NetEditor(new RoadNetwork());
  benchNetwork(e, size);
  const lm = new LotMap();
  let t = performance.now();
  lm.update(e.net, null);
  const full = performance.now() - t;
  console.log(`[lots] bench ${lines}x${lines} lines: full update ${full.toFixed(1)} ms, ${lm.lots.size} lots`);
  // one edit: a 40-tile street between two bench lines (two T junctions)
  e.addLegs([leg(bat(3), bat(0) + 20, bat(4), bat(0) + 20)], CLASS.street, 0); e.commit();
  t = performance.now();
  const r = lm.update(e.net, null);
  const one = performance.now() - t;
  console.log(`[lots] one edit (a 40-tile street): update ${one.toFixed(1)} ms, ${r.added.length} added, ${r.removed.length} removed, ${lm.lots.size} lots`);
  const fresh = new LotMap(); fresh.update(e.net, null);
  assert.deepEqual(fingerprint(lm), fingerprint(fresh));
});

test('a roundabout grown to 3 ring lanes: no lot reaches into its circle (its edge, the walk and the clearance), with a bend in each arm near it', () => {
  // a plus of streets whose arms bend 12 tiles out: a bend is no junction, so the lots of the outer piece start there, inside a big ring
  const e = new NetEditor(new RoadNetwork()), C = { x: 200, y: 200 };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) e.addLegs([leg(C.x, C.y, C.x + dx * 12 - dy * 2, C.y + dy * 12 + dx * 2), leg(C.x + dx * 12 - dy * 2, C.y + dy * 12 + dx * 2, C.x + dx * 60, C.y + dy * 60)], CLASS.street, 0);
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  for (const rl of [1, 2, 3] as const) {
    const n = e.net.nodeAt(C)!;
    if (rl === 1) e.setNodeType(n, 'roundabout'); e.setNodeFlags(n, false, false, rl); e.commit(); lm.update(e.net, null);
    const m = e.net.nodeAt(C)!, R = ringClear(m);
    assert.ok(R > m.rb && lm.lots.size > 0, `ring ${rl}: a clearance, and lots`);
    for (const l of lm.lots.values()) for (const p of samples(l)) assert.ok(Math.hypot(p.x - C.x, p.y - C.y) > R - 1e-6, `ring ${rl}: lot ${l.key} reaches into the circle (r ${R.toFixed(1)})`);
    // incremental equals full
    const fresh = new LotMap(); fresh.update(e.net, null);
    assert.deepEqual(fingerprint(lm), fingerprint(fresh), `ring ${rl}: incremental equals full`);
  }
});

test('a closed 40-tile street square: the lots inside it are block lots (key blk:), and no two lots overlap', () => {
  const sq = [leg(0, 0, 40, 0), leg(40, 0, 40, 40), leg(40, 40, 0, 40), leg(0, 40, 0, 0)];
  const e = new NetEditor(new RoadNetwork()); e.addLegs(sq, CLASS.street, 0); e.commit(true);
  const lm = new LotMap(); lm.update(e.net, null);
  const lots = [...lm.lots.values()], inside = lots.filter(l => l.c.x > 0 && l.c.x < 40 && l.c.y > 0 && l.c.y < 40);
  console.log(`square: ${inside.length} block lots inside, ${lots.length - inside.length} frontage lots outside`);
  assert.ok(inside.length >= 4, `lots inside ${inside.length}`);
  for (const l of inside) assert.ok(l.key.startsWith('blk:'), `not a block lot: ${l.key}`);
  assertNoOverlaps(lots);
});

test('a 6x6 street grid: a street that splits a corner block gives the same lots as a full rebuild of the edited network', () => {
  // 6 lines each way at 40 tiles from 40 to 240 (a 5 x 5 grid of blocks); the new leg cuts the corner block at x = 60
  const sixGrid = (e: NetEditor) => { for (let k = 0; k < 6; k++) { const v = 40 + 40 * k; e.addLegs([leg(40, v, 240, v)], CLASS.street, 0); e.addLegs([leg(v, 40, v, 240)], CLASS.street, 0); } e.commit(); };
  const inc = new NetEditor(new RoadNetwork()); sixGrid(inc);
  const lm = new LotMap(); lm.update(inc.net, null);
  inc.addLegs([leg(60, 40, 60, 80)], CLASS.street, 0); inc.commit(); lm.update(inc.net, null);
  const full = new NetEditor(new RoadNetwork()); sixGrid(full); full.addLegs([leg(60, 40, 60, 80)], CLASS.street, 0); full.commit();
  const fm = new LotMap(); fm.update(full.net, null);
  assert.ok(fm.lots.size > 0, 'lots');
  assert.deepEqual(fingerprint(lm), fingerprint(fm));
});

test('a grid crossing made a 3-lane roundabout: no lot of any road around it (the corner lots of the side streets too) stays in its circle', () => {
  // the owner's case: an intersection of a town grid turned into a roundabout left corner buildings standing in the ring
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < LINES; k++) e.addLegs([leg(O, at(k), last, at(k)), leg(at(k), O, at(k), last)], CLASS.street, 0);
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  const C = { x: at(2), y: at(2) }, n = e.net.nodeAt(C)!;
  e.setNodeType(n, 'roundabout'); e.commit(); lm.update(e.net, null);
  e.setNodeFlags(e.net.nodeAt(C)!, false, false, 3); e.commit(); lm.update(e.net, null);
  const m = e.net.nodeAt(C)!, R = ringClear(m);
  for (const l of lm.lots.values()) for (const p of samples(l)) assert.ok(Math.hypot(p.x - C.x, p.y - C.y) > R - 1e-6, `lot ${l.key} (on ${l.cls}) reaches into the circle (r ${R.toFixed(1)})`);
  const fresh = new LotMap(); fresh.update(e.net, null);
  assert.deepEqual(fingerprint(lm), fingerprint(fresh), 'incremental equals full');
});
