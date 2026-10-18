// Farm lots and dirt tracks (Arena task T005): parcels along roads, farm compositions, farm tracks. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { LIBRARY } from '../src/game/library';
import type { Pt } from '../src/game/network';
import type { Placed } from '../src/game/lots/compose';
import {
  composeFarm, farmParcels, farmTrack, farmsteadOf, parcelCorners, seedForParcel,
  FARM_DEPTH_MAX, FARM_DEPTH_MIN, FARM_FRONT_MAX, FARM_FRONT_MIN, FARM_MIN_DEPTH, FARM_VERGE,
  type FarmParcel,
} from '../src/game/ext/farms/farms';

const byId = new Map(LIBRARY.map(i => [i.id, i]));
const isBad = (c: number) => c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK;
const isFence = (id: string) => { const k = byId.get(id)?.kind; return k === 'fencex' || k === 'fencey' || id === 'world:hedge'; };
const isHouse = (id: string) => (byId.get(id)?.cat === 'Houses' && byId.get(id)?.kind === 'house') || id === 'expansion:ranch-rear';
const STREET = new Set(['world:mailbox', 'expansion:rural-mailboxes', 'town:utility_pole']);

/** a flat all-GROUND map, with rectangles of terrain class painted in ([x0, y0, x1, y1, cls], tiles) */
function flatMap(paint: [number, number, number, number, number][] = []): Uint8Array {
  const cls = new Uint8Array(MAP * MAP);
  for (const [x0, y0, x1, y1, c] of paint) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cls[y * MAP + x] = c;
  return cls;
}
const CLEAR = flatMap();
/** a parcel's sample points: a 1-tile grid over its rectangle, corners included (the town lots' sampling) */
function samples(p: FarmParcel): Pt[] {
  const out: Pt[] = [];
  for (let j = 0; j <= p.d; j++) for (let i = 0; i <= p.w; i++) out.push({ x: p.o.x + p.u.x * i + p.n.x * j, y: p.o.y + p.u.y * i + p.n.y * j });
  return out;
}
/** the signed distance from a point to a seg's line and the distance to the seg itself, tiles (left of a -> b positive) */
function segDist(q: Pt, a: Pt, b: Pt): { signed: number; dist: number } {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const L = Math.sqrt(L2) || 1;
  return { signed: ((q.x - a.x) * -dy + (q.y - a.y) * dx) / L, dist: Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y) };
}
/** the separating-axis overlap test, with the town lots' 0.25-tile tolerance (independent of parcelsOverlap) */
function overlapT(p: FarmParcel, q: FarmParcel): boolean {
  const c = (l: FarmParcel): Pt => ({ x: l.o.x + l.u.x * l.w / 2 + l.n.x * l.d / 2, y: l.o.y + l.u.y * l.w / 2 + l.n.y * l.d / 2 });
  const pc = c(p), qc = c(q), dx = qc.x - pc.x, dy = qc.y - pc.y;
  for (const ax of [p.u, p.n, q.u, q.n]) {
    const r = (l: FarmParcel) => Math.abs(l.u.x * ax.x + l.u.y * ax.y) * l.w / 2 + Math.abs(l.n.x * ax.x + l.n.y * ax.y) * l.d / 2;
    if (Math.abs(dx * ax.x + dy * ax.y) >= r(p) + r(q) - 0.25) return false;
  }
  return true;
}
/** every parcel of a call: seeded ranges, clean samples, on its own side and clear of the road, no overlaps, unique keys */
function assertParcels(ps: FarmParcel[], seg: { a: Pt; b: Pt; h: number }, cls: Uint8Array, clear: boolean) {
  const keys = new Set<string>();
  for (const p of ps) {
    assert.ok(!keys.has(p.key), `duplicate key ${p.key}`); keys.add(p.key);
    assert.ok(p.w >= FARM_FRONT_MIN && p.w <= FARM_FRONT_MAX, `${p.key}: frontage ${p.w}`);
    assert.ok(p.d >= FARM_MIN_DEPTH && p.d <= FARM_DEPTH_MAX, `${p.key}: depth ${p.d}`);
    if (clear) assert.ok(p.d >= FARM_DEPTH_MIN, `${p.key}: untrimmed depth ${p.d} on clear ground`);
    for (const q of samples(p)) {
      const x = Math.floor(q.x), y = Math.floor(q.y);
      assert.ok(x >= 0 && y >= 0 && x < MAP && y < MAP && !isBad(cls[y * MAP + x]), `${p.key}: sample on bad terrain or off the map`);
      const { signed, dist } = segDist(q, seg.a, seg.b);
      assert.ok(dist >= seg.h + FARM_VERGE - 1e-6, `${p.key}: sample ${dist.toFixed(2)} tiles from the road`);
      assert.ok(Math.sign(signed) === p.side, `${p.key}: sample on the wrong side`);
    }
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(!overlapT(ps[i], ps[j]), `${ps[i].key} overlaps ${ps[j].key}`);
}
/** the footprint of a placed prop in world tiles (the union of its boxes, as the engine draws it) */
function fpOf(q: Placed): [number, number, number, number] {
  const it = byId.get(q.id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const k = q.scale, hx = (q.flip ? b.hy : b.hx) * k / 2, hy = (q.flip ? b.hx : b.hy) * k / 2, dx = (q.flip ? b.dy : b.dx) * k / 2, dy = (q.flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, q.x + dx - hx); x1 = Math.max(x1, q.x + dx + hx); y0 = Math.min(y0, q.y + dy - hy); y1 = Math.max(y1, q.y + dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a world point in the parcel frame (a along u, b along n, tiles) */
const frame = (p: FarmParcel, x: number, y: number) => { const dx = x - p.o.x, dy = y - p.o.y; return { a: dx * p.u.x + dy * p.u.y, b: dx * p.n.x + dy * p.n.y }; };
/** the share of the smaller footprint two footprints share */
function share(p: number[], q: number[]): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  return ix <= 0 || iy <= 0 ? 0 : ix * iy / Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
}
const segE = { a: { x: 200, y: 1000 }, b: { x: 700, y: 1000 }, h: 3 };          // 500 tiles = 1 km of 'road'
const segN = { a: { x: 400, y: 300 }, b: { x: 400, y: 800 }, h: 1.625 };       // 1 km of 'street'
const segD = { a: { x: 350, y: 1400 }, b: { x: 850, y: 900 }, h: 3 };          // a 45-degree country road

test('1 km of straight road on clear ground: parcels both sides in the spec ranges, clean, clear of the road, no overlaps', () => {
  const t0 = Date.now(), ps = farmParcels(segE, CLEAR, 42), ms = Date.now() - t0;
  assert.ok(ps.some(p => p.side === 1) && ps.some(p => p.side === -1), 'parcels on both sides');
  assertParcels(ps, segE, CLEAR, true);
  const mean = (f: (p: FarmParcel) => number) => ps.reduce((s, p) => s + f(p), 0) / ps.length;
  console.log(`[farms] 1 km road: ${ps.length} parcels/km (${ps.filter(p => p.side === 1).length} left + ${ps.filter(p => p.side === -1).length} right), mean frontage ${(mean(p => p.w) * 2).toFixed(0)} m, mean depth ${(mean(p => p.d) * 2).toFixed(0)} m, farmParcels ${ms} ms`);
});

test('a 45-degree road and a north-south street: the same guarantees at any heading', () => {
  const pd = farmParcels(segD, CLEAR, 7), pn = farmParcels(segN, CLEAR, 7);
  assert.ok(pd.length >= 10 && pn.length >= 10, `diagonal ${pd.length}, north-south ${pn.length}`);
  assertParcels(pd, segD, CLEAR, true);
  assertParcels(pn, segN, CLEAR, true);
});

test('splitting a seg along its line keeps its parcels: every parcel of the two halves is a parcel of the whole', () => {
  const whole = new Map(farmParcels(segE, CLEAR, 99).map(p => [p.key, p]));
  const halves = [farmParcels({ a: segE.a, b: { x: 460, y: 1000 }, h: 3 }, CLEAR, 99), farmParcels({ a: { x: 460, y: 1000 }, b: segE.b, h: 3 }, CLEAR, 99)].flat();
  assert.ok(halves.length >= 8, `only ${halves.length} parcels from the halves`);
  for (const p of halves) {
    const q = whole.get(p.key);
    assert.ok(q, `${p.key} from a half is not a parcel of the whole seg`);
    assert.deepEqual([p.w, p.d, p.side], [q!.w, q!.d, q!.side], `${p.key} changed size across the split`);
    assert.ok(Math.hypot(p.o.x - q!.o.x, p.o.y - q!.o.y) < 1e-9, `${p.key} moved across the split`);
  }
});

test('bad terrain is skipped: a hill band trims depths on its side, a water strip along the frontage drops that side', () => {
  const hills = flatMap([[200, 1060, 700, 1250, TC.HILL]]);   // side +1 is +y here
  const ps = farmParcels(segE, hills, 42);
  assertParcels(ps, segE, hills, false);
  const plus = ps.filter(p => p.side === 1), minus = ps.filter(p => p.side === -1);
  assert.ok(plus.length > 0 && plus.every(p => p.d <= 57), `hill side depths ${plus.map(p => p.d)}`);
  assert.ok(minus.some(p => p.d > 57), 'the clear side keeps its full depths');
  const water = flatMap([[200, 940, 700, 999, TC.WATER]]);
  const pw = farmParcels(segE, water, 42);
  assertParcels(pw, segE, water, false);
  assert.equal(pw.filter(p => p.side === -1).length, 0, 'no parcels fronting water');
  assert.ok(pw.some(p => p.side === 1), 'the dry side still has farms');
  const edge = farmParcels({ a: { x: 200, y: 30 }, b: { x: 700, y: 30 }, h: 3 }, CLEAR, 42);
  assertParcels(edge, { a: { x: 200, y: 30 }, b: { x: 700, y: 30 }, h: 3 }, CLEAR, false);
  assert.ok(edge.every(p => p.side === 1), 'near the map edge only the inward side can farm');
});

test('degenerate segs give nothing, and parcels are deterministic in the seed', () => {
  assert.deepEqual(farmParcels({ a: { x: 10, y: 10 }, b: { x: 10, y: 10 }, h: 3 }, CLEAR, 1), []);
  assert.deepEqual(farmParcels({ a: { x: 500, y: 500 }, b: { x: 520, y: 500 }, h: 3 }, CLEAR, 1), []);
  assert.deepEqual(farmParcels(segE, CLEAR, 5), farmParcels(segE, CLEAR, 5));
  assert.notDeepEqual(farmParcels(segE, CLEAR, 5).map(p => [p.key, p.w]), farmParcels(segE, CLEAR, 6).map(p => [p.key, p.w]));
});

/** 100 seeded farms over three roads and two world seeds (each with its per-farm seed) */
const FARMS: { p: FarmParcel; seed: number }[] = (() => {
  const out: { p: FarmParcel; seed: number }[] = [];
  for (const ws of [11, 22]) for (const seg of [segE, segN, segD]) for (const p of farmParcels(seg, CLEAR, ws)) out.push({ p, seed: seedForParcel(p, ws) });
  return out.slice(0, 100);
})();

test('the fixture roads give 100 farms', () => assert.equal(FARMS.length, 100));

test('100 seeded farms: a farmhouse and barn by the road, fields with crop rows, fences, nothing overlapping or in the road', () => {
  const t0 = Date.now();
  let silos = 0, propsSum = 0, fenceSum = 0, patchesSum = 0;
  for (const { p, seed } of FARMS) {
    const c = composeFarm(p, seed);
    propsSum += c.props.length; patchesSum += c.ground.length;
    fenceSum += c.props.filter(q => isFence(q.id)).length;
    assert.ok(c.props.length >= 20 && c.props.length <= 260, `${p.key}: ${c.props.length} props`);
    for (const q of c.props) assert.ok(byId.has(q.id), `${p.key}: unknown prop ${q.id}`);
    assert.equal(c.props.filter(q => isHouse(q.id)).length, 1, `${p.key}: farmhouses ${c.props.filter(q => isHouse(q.id)).map(q => q.id)}`);
    assert.equal(c.props.filter(q => q.id === 'world:barn').length, 1, `${p.key}: barns`);
    if (c.props.some(q => q.id === 'ref:landmark-silo')) silos++;
    assert.ok(c.props.filter(q => isFence(q.id)).length >= 5, `${p.key}: fences`);
    assert.ok(c.props.some(q => byId.get(q.id)?.kind === 'tree'), `${p.key}: a tree`);
    assert.ok(c.ground.some(g => g.tex === 'field' && !!g.lines && g.lines.length >= 8), `${p.key}: a crop field with rows`);
    assert.ok(c.ground.some(g => g.tex === 'gravel'), `${p.key}: a drive or yard`);
    assert.ok(c.ground.some(g => g.tex === 'dirt'), `${p.key}: the dirt track`);
    for (const g of c.ground) {
      assert.equal(g.pts.length, 8, `${p.key}: patch corners`);
      assert.ok(['paving', 'pad', 'asphalt', 'dirt', 'gravel', 'field'].includes(g.tex), `${p.key}: tex ${g.tex}`);
      for (let k = 0; k < 8; k += 2) { const f = frame(p, g.pts[k], g.pts[k + 1]); assert.ok(f.a >= -0.01 && f.a <= p.w + 0.01 && f.b >= -0.01 && f.b <= p.d + 0.01, `${p.key}: patch outside the parcel`); }
    }
    const ups: { id: string; fp: [number, number, number, number] }[] = [];
    for (const q of c.props) {
      const fp = fpOf(q), minB = STREET.has(q.id) ? -0.66 : -0.31;
      for (const [x, y] of [[fp[0], fp[1]], [fp[2], fp[1]], [fp[2], fp[3]], [fp[0], fp[3]]]) {
        const f = frame(p, x, y);
        assert.ok(f.a >= -0.31 && f.a <= p.w + 0.31 && f.b >= minB && f.b <= p.d + 0.31, `${p.key}: ${q.id} outside the parcel (a ${f.a.toFixed(1)}, b ${f.b.toFixed(1)})`);
      }
      if (!isFence(q.id)) ups.push({ id: q.id, fp });
    }
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++)
      assert.ok(share(ups[i].fp, ups[j].fp) <= 0.35 + 1e-9, `${p.key}: ${ups[i].id} overlaps ${ups[j].id} by ${Math.round(100 * share(ups[i].fp, ups[j].fp))}%`);
    // the composed farmhouse stands where farmsteadOf says (to a fraction of a tile)
    const st = farmsteadOf(p, seed), hq = c.props.find(q => isHouse(q.id))!, hfp = fpOf(hq);
    assert.ok(Math.hypot((hfp[0] + hfp[2]) / 2 - st.house.x, (hfp[1] + hfp[3]) / 2 - st.house.y) < 0.6, `${p.key}: farmhouse off the farmstead`);
    const gate = frame(p, st.gate.x, st.gate.y);
    assert.ok(Math.abs(gate.b) < 1e-9 && gate.a > 0 && gate.a < p.w, `${p.key}: gate on the front edge`);
  }
  assert.ok(silos >= 30 && silos <= 75, `${silos} silos on 100 farms`);
  console.log(`[farms] 100 farms: mean ${(propsSum / 100).toFixed(1)} props/farm (${(fenceSum / 100).toFixed(1)} of them fence segments), ${(patchesSum / 100).toFixed(1)} ground patches/farm, ${silos} silos, compose ${((Date.now() - t0) / 100).toFixed(2)} ms/farm`);
});

test('farm compositions are deterministic, and the seed changes them', () => {
  let changed = 0;
  for (const { p, seed } of FARMS) {
    assert.equal(JSON.stringify(composeFarm(p, seed)), JSON.stringify(composeFarm(p, seed)), `${p.key}: not deterministic`);
    if (JSON.stringify(composeFarm(p, seed)) !== JSON.stringify(composeFarm(p, (seed + 1) >>> 0))) changed++;
  }
  assert.ok(changed >= 90, `only ${changed} of 100 farms changed with the seed`);
});

test('farm tracks: from the gate past the yard deep into the fields, inside the parcel and chained', () => {
  let branches = 0, lenSum = 0;
  for (const { p, seed } of FARMS) {
    const legs = farmTrack(p, seed);
    assert.ok(legs.length >= 1, `${p.key}: no track`);
    assert.deepEqual(farmTrack(p, seed), legs, `${p.key}: track not deterministic`);
    const st = farmsteadOf(p, seed);
    assert.ok(Math.hypot(legs[0].a.x - st.gate.x, legs[0].a.y - st.gate.y) < 1e-9, `${p.key}: track starts at the gate`);
    let maxB = 0, len = 0;
    const joints = legs.map(l => l.a);
    for (const l of legs) {
      len += Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      for (const q of [l.a, l.b]) { const f = frame(p, q.x, q.y); assert.ok(f.a >= -1e-9 && f.a <= p.w + 1e-9 && f.b >= -1e-9 && f.b <= p.d + 1e-9, `${p.key}: track leaves the parcel`); maxB = Math.max(maxB, f.b); }
    }
    for (let i = 1; i < legs.length; i++) assert.ok(joints.slice(0, i + 1).some(q => Math.hypot(q.x - legs[i].a.x, q.y - legs[i].a.y) < 1e-9) || legs.slice(0, i).some(l => Math.hypot(l.b.x - legs[i].a.x, l.b.y - legs[i].a.y) < 1e-9), `${p.key}: leg ${i} is disconnected`);
    assert.ok(maxB >= 0.55 * p.d, `${p.key}: track reaches b=${maxB.toFixed(0)} of d=${p.d}`);
    if (legs.some(l => Math.abs(frame(p, l.b.x, l.b.y).a - frame(p, l.a.x, l.a.y).a) > 1)) branches++;
    lenSum += len;
  }
  console.log(`[farms] tracks: mean length ${(lenSum / 100 * 2).toFixed(0)} m/farm, ${branches} of 100 with a branch`);
});

test('the smallest parcels still compose: a 30x40-tile farm, axis-aligned and diagonal', () => {
  const sq = Math.SQRT1_2;
  const minis: FarmParcel[] = [
    { key: 'test|min-axis', o: { x: 500, y: 500 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 30, d: 40, side: 1 },
    { key: 'test|min-diag', o: { x: 600, y: 600 }, u: { x: sq, y: sq }, n: { x: -sq, y: sq }, w: 30, d: 40, side: 1 },
    { key: 'test|min-rear', o: { x: 700, y: 500 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, w: 30, d: 40, side: -1 },
  ];
  for (const p of minis) for (let seed = 1; seed <= 6; seed++) {
    const c = composeFarm(p, seed);
    assert.equal(c.props.filter(q => isHouse(q.id)).length, 1, `${p.key} seed ${seed}: farmhouse`);
    assert.equal(c.props.filter(q => q.id === 'world:barn').length, 1, `${p.key} seed ${seed}: barn`);
    const ups = c.props.filter(q => !isFence(q.id)).map(fpOf);
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++) assert.ok(share(ups[i], ups[j]) <= 0.35 + 1e-9, `${p.key} seed ${seed}: overlap`);
    assert.ok(farmTrack(p, seed).length >= 1, `${p.key} seed ${seed}: track`);
  }
});

test('parcel helpers: corners frame the parcel, and seedForParcel separates farms', () => {
  const ps = farmParcels(segE, CLEAR, 42);
  assert.ok(ps.length >= 2);
  const [p, q] = ps;
  const cs = parcelCorners(p).map(c => frame(p, c.x, c.y));
  assert.deepEqual(cs.map(c => [Math.round(c.a * 1e6) / 1e6, Math.round(c.b * 1e6) / 1e6]), [[0, 0], [p.w, 0], [p.w, p.d], [0, p.d]]);
  assert.notEqual(seedForParcel(p, 1), seedForParcel(q, 1));
  assert.equal(seedForParcel(p, 1), seedForParcel(p, 1));
});
