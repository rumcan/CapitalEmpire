// Headless road planner tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, norm, sub, type Leg, type Node, type Pt, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LV, Town, type TownCtx } from '../src/game/lots/town';
import { needsLand, planExtension, reachableSegs, seededRnd, type RoadPlanCtx } from '../src/game/lots/roads';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const HOUR = 60;
const ENTRY: Pt = { x: 100, y: 100 };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const isBad = (c: number) => c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK;
/** a seg's verge radius: h + walk */
const radius = (s: Seg) => s.cls.h + s.cls.walk;

/** a valley of ground (TC 0) with the painted terrain */
function valley(paint: (cls: Uint8Array) => void): Uint8Array { const cls = new Uint8Array(MAP * MAP); paint(cls); return cls; }
/** paints the tiles of a box (x0..x1, y0..y1 exclusive) with terrain class v */
function box(cls: Uint8Array, x0: number, y0: number, x1: number, y1: number, v: number) { for (let y = y0; y < y1; y++) cls.fill(v, y * MAP + x0, y * MAP + x1); }

/** the distance from p to a seg's centre line */
function segDist(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(s.a.x + dx * t - p.x, s.a.y + dy * t - p.y);
}
/** do two centre lines cross */
function crosses(s: Seg, q: Seg): boolean {
  const d1 = sub(s.b, s.a), d2 = sub(q.b, q.a), den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-12) return false;
  const w = sub(q.a, s.a), t = (w.x * d2.y - w.y * d2.x) / den, u = (w.x * d1.y - w.y * d1.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
/** the gap between two centre lines (0 if they cross) */
function gap(s: Seg, q: Seg): number { return crosses(s, q) ? 0 : Math.min(segDist(s.a, q), segDist(s.b, q), segDist(q.a, s), segDist(q.b, s)); }
/** points every half tile along a seg */
function samplesOf(s: Seg): Pt[] {
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), out: Pt[] = [];
  for (let i = 0; i <= 2 * L; i++) { const t = Math.min(i / 2, L) / L; out.push({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }); }
  return out;
}
/** a lot's points on a half-tile grid over its rectangle */
function lotSamples(l: Lot): Pt[] {
  const out: Pt[] = [];
  for (let j = 0; j <= 2 * l.d; j++) for (let i = 0; i <= 2 * l.w; i++) out.push({ x: l.o.x + l.u.x * i / 2 + l.n.x * j / 2, y: l.o.y + l.u.y * i / 2 + l.n.y * j / 2 });
  return out;
}

interface Run { net: RoadNetwork; lm: LotMap; town: Town; built: number[] /* the built lots at the end of each game day */; cls: Uint8Array }
/** a town on a street from the entry, run for days: each game hour the town ticks, and when it needs land the planned
 *  extension is laid and the lots follow (as the city worker and the engine do) */
function run(cls: Uint8Array, days: number, seed: number): Run {
  const e = new NetEditor(new RoadNetwork()), lm = new LotMap(), town = new Town(seed), rnd = seededRnd(seed);
  e.addLegs([leg(ENTRY.x, ENTRY.y, 220, ENTRY.y)], CLASS.street, 0);
  e.commit();
  let r = lm.update(e.net, cls); town.onLots(r.added, r.removed);
  let reach = reachableSegs(e.net, ENTRY);
  const built: number[] = [];
  for (let h = 1; h <= days * 24; h++) {
    const ctx: TownCtx = { lots: lm, entry: ENTRY, reachable: (l: Lot) => reach.has(l.seg), water: () => 200 };
    town.tick(h * HOUR, ctx);
    const c: RoadPlanCtx = { net: e.net, lots: lm, town, cls, entry: ENTRY, rnd };
    if (needsLand(c)) {
      const legs = planExtension(c);
      if (legs) {
        e.addLegs(legs, CLASS.gravel, 2);
        e.commit();
        r = lm.update(e.net, cls); town.onLots(r.added, r.removed);
        reach = reachableSegs(e.net, ENTRY);
      }
    }
    if (h % 24 === 0) built.push(town.built);
  }
  return { net: e.net, lm, town, built, cls };
}

/** the valley of test 1: a hill block off the street */
const hillValley = () => valley(c => box(c, 300, 200, 330, 230, TC.HILL));
let day15: Run | null = null;
/** the run of test 1, shared by tests 1 and 3 */
function hillRun(): Run { return day15 ??= run(hillValley(), 15, 7); }

/** the verges of two roads that share no node are apart by at least their two radii */
function assertVerges(net: RoadNetwork) {
  const segs = [...net.segs];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j];
    if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
    assert.ok(gap(p, q) >= radius(p) + radius(q) - 1e-6, `verges touch: gap ${gap(p, q).toFixed(2)} between ${p.cls.id} and ${q.cls.id}`);
  }
}
/** the unit direction of an arm at node n */
const armDir = (n: Node, s: Seg): Pt => norm(sub(s.a === n ? s.b : s.a, n));
/** the junctions (3+ arms): at least half have two arms at right angles, and at least half have 3 or 4 arms */
function assertJunctions(net: RoadNetwork) {
  const js = [...net.nodes.values()].filter(n => n.segs.length >= 3);
  assert.ok(js.length > 0, 'no junctions were made');
  const right = js.filter(n => { const d = n.segs.map(s => armDir(n, s)); return d.some((u, i) => d.some((v, j) => j > i && Math.abs(u.x * v.x + u.y * v.y) < 0.2)); });
  const small = js.filter(n => n.segs.length <= 4);
  assert.ok(right.length * 2 >= js.length, `${right.length} of ${js.length} junctions have right-angle arms`);
  assert.ok(small.length * 2 >= js.length, `${small.length} of ${js.length} junctions have 3 or 4 arms`);
}
test('the town lays gravel where it needs land: over 10 gravel segs in 15 days, built lots keep growing, buildable terrain, verges clear, right-angle crossings', () => {
  const r = hillRun();
  const gravel = [...r.net.segs].filter(s => s.cls.id === 'gravel');
  assert.ok(gravel.length > 10, `${gravel.length} gravel segs`);
  console.log(`roads: ${gravel.length} gravel segs, built lots day 5 ${r.built[4]}, day 15 ${r.built[14]}`);
  assert.ok(r.built[14] > 2 * r.built[4], `built lots: day 5 ${r.built[4]}, day 15 ${r.built[14]}`);
  for (const s of gravel) for (const p of samplesOf(s)) assert.ok(!isBad(r.cls[Math.floor(p.y) * MAP + Math.floor(p.x)]), `gravel on bad terrain at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  assertVerges(r.net);
  assertJunctions(r.net);
});

test('terrain: a WATER band stops the growth (no gravel seg crosses WATER)', () => {
  const cls = valley(c => box(c, 0, 150, MAP, 170, TC.WATER));
  const r = run(cls, 15, 7);
  const gravel = [...r.net.segs].filter(s => s.cls.id === 'gravel');
  assert.ok(gravel.length > 0, 'no gravel was laid');
  for (const s of gravel) for (const p of samplesOf(s)) assert.notEqual(cls[Math.floor(p.y) * MAP + Math.floor(p.x)], TC.WATER, `gravel on water at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
});

test('no legs through built lots: no BUILDING or BUILT lot is cut by a road verge', () => {
  const r = hillRun();
  let checked = 0;
  for (const l of r.lm.lots.values()) {
    const lv = r.town.states.get(l.key)?.level ?? LV.EMPTY;
    if (lv < LV.BUILDING) continue;
    checked++;
    const near = [...r.net.segsNear(l.c, 30)];
    for (const p of lotSamples(l)) for (const s of near) assert.ok(segDist(p, s) >= radius(s) - 0.01, `lot ${l.key} cut by a ${s.cls.id} verge`);
  }
  assert.ok(checked > 0, 'no built lots to check');
});

test('determinism: the same seed lays the same network', () => {
  const sig = (r: Run) => [...r.net.segs].map(s => `${s.a.x},${s.a.y}-${s.b.x},${s.b.y}:${s.cls.id}`).sort().join('|');
  const a = sig(run(hillValley(), 15, 7)), b = sig(run(hillValley(), 15, 7));
  assert.ok(a.length > 0);
  assert.equal(a, b);
});
