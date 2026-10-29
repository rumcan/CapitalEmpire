// T259 (#759): the farms' model 2: crop states by the month (ext/farms/crops.ts), deterministic per field; the orchard's strict grid; the
// farmhouse set back 60-120 m on its lane with the windbreak; model 1 (T005's farm) unchanged; the stand-in rows' geometry. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { LIBRARY } from '../src/game/library';
import { TREE_MIRROR } from '../src/game/tree-sun';
import type { Placed } from '../src/game/lots/compose';
import {
  CORN_YEAR, CROP_SURFACE, LANE_SURFACE, ORCHARD_YEAR, ROW_LOOK, cornShift, cropState, cropSurface, monthOfYear, orchardStage, rowSegments, rowStep, ROW_MIN_PX,
} from '../src/game/ext/farms/crops';
import {
  FARM_SETBACK, FARM_SETBACK_SHORT, LANE_HALF, ORCHARD_ART, ORCHARD_PITCH, ORCHARD_MAX, POPLAR_ART, WIND_OFF, WIND_STEP, orchardTreeId,
  composeFarm, farmLayoutForTest, farmParcels, farmSeason, farmStandIns, farmTrack, farmsteadOf, seedForParcel, type FarmParcel,
} from '../src/game/ext/farms/farms';
import { SURFACES } from '../src/game/painted-surfaces';

const byId = new Map(LIBRARY.map(i => [i.id, i]));
const isFence = (id: string) => { const k = byId.get(id)?.kind; return k === 'fencex' || k === 'fencey' || id === 'world:hedge'; };
const isHouse = (id: string) => (byId.get(id)?.cat === 'Houses' && byId.get(id)?.kind === 'house') || id === 'expansion:ranch-rear';
const STREET = new Set(['world:mailbox', 'expansion:rural-mailboxes', 'town:utility_pole']);
const CLEAR = new Uint8Array(MAP * MAP);
const segE = { a: { x: 200, y: 1000 }, b: { x: 700, y: 1000 }, h: 3 };
const segN = { a: { x: 400, y: 300 }, b: { x: 400, y: 800 }, h: 1.625 };
const segD = { a: { x: 350, y: 1400 }, b: { x: 850, y: 900 }, h: 3 };
/** the 104 fixture farms of tests/ext-farms.test.ts: three roads, two world seeds */
const FARMS: { p: FarmParcel; seed: number }[] = [];
for (const ws of [11, 22]) for (const seg of [segE, segN, segD]) for (const p of farmParcels(seg, CLEAR, ws)) FARMS.push({ p, seed: seedForParcel(p, ws) });
/** a world point in a parcel's frame (a along u, b along n, tiles) */
const frame = (p: FarmParcel, x: number, y: number) => { const dx = x - p.o.x, dy = y - p.o.y; return { a: dx * p.u.x + dy * p.u.y, b: dx * p.n.x + dy * p.n.y }; };
/** a placed prop's footprint (world tiles), the engine's: its boxes at its scale (flip swaps the axes) */
function fpOf(q: Placed): [number, number, number, number] {
  const it = byId.get(q.id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (q.flip ? b.hy : b.hx) * q.scale / 2, hy = (q.flip ? b.hx : b.hy) * q.scale / 2, dx = (q.flip ? b.dy : b.dx) * q.scale / 2, dy = (q.flip ? b.dx : b.dy) * q.scale / 2;
    x0 = Math.min(x0, q.x + dx - hx); x1 = Math.max(x1, q.x + dx + hx); y0 = Math.min(y0, q.y + dy - hy); y1 = Math.max(y1, q.y + dy + hy);
  }
  return [x0, y0, x1, y1];
}
const centre = (q: Placed) => { const f = fpOf(q); return { x: (f[0] + f[2]) / 2, y: (f[1] + f[3]) / 2 }; };
function share(p: number[], q: number[]): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  if (ix <= 0.02 || iy <= 0.02) return 0;
  return ix * iy / Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
}
function fnv(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); }
const isOrchardTree = (id: string) => /^capital:tree-(oak|maple)-/.test(id);

test('crop states by the month: ploughed in winter and spring, young corn in early summer, ripe in late summer and autumn, stubble after the harvest', () => {
  const want = ['plough', 'plough', 'plough', 'plough', 'plough', 'young', 'young', 'ripe', 'ripe', 'ripe', 'stubble', 'plough'];
  assert.deepEqual([...CORN_YEAR], want);
  for (let m = 0; m < 12; m++) {
    assert.equal(cropState('corn', m, 0), want[m]);
    // a late field shows last month's state, an early one next month's
    assert.equal(cropState('corn', m, 1), want[(m + 11) % 12]);
    assert.equal(cropState('corn', m, -1), want[(m + 1) % 12]);
    assert.equal(cropState('plough', m, 0), 'plough');
    assert.equal(cropState('fallow', m, 0), null);
    // the month wraps: 12 is January again, -1 December
    assert.equal(cropState('corn', m + 12, 0), want[m]); assert.equal(cropState('corn', m - 12, 0), want[m]);
  }
  assert.equal(monthOfYear(-1), 11); assert.equal(monthOfYear(25), 1);
  // winter (Dec-Feb) and spring (Mar-May) are ploughed on a field on time; the harvest's stubble follows the last ripe month
  for (const m of [11, 0, 1, 2, 3, 4]) assert.equal(cropState('corn', m), 'plough');
  assert.deepEqual([cornShift(0.1), cornShift(0.5), cornShift(0.9)], [-1, 0, 1]);
  // the orchard's leaves: bare in winter, full in summer
  assert.equal(orchardStage(0), 'near-bare'); assert.equal(orchardStage(6), 'open'); assert.equal(orchardStage(9), 'moderate'); assert.equal(ORCHARD_YEAR.length, 12);
});

test('every field state has its art slot in the studio (painted-surfaces SURFACES), rows along x and along y', () => {
  const keys = new Set(SURFACES.flatMap(s => s.tex));
  for (const st of ['plough', 'young', 'ripe', 'stubble'] as const) {
    assert.ok(keys.has(CROP_SURFACE[st].x) && keys.has(CROP_SURFACE[st].y), st);
    assert.equal(cropSurface(st, 1, 0), CROP_SURFACE[st].x); assert.equal(cropSurface(st, 0, -1), CROP_SURFACE[st].y);
    assert.ok(ROW_LOOK[st].pitch > 0 && ROW_LOOK[st].width > 0 && ROW_LOOK[st].width < ROW_LOOK[st].pitch);
  }
  // the lane's slot (189), and the sprite slots (187, 188): empty until their art lands, so the stand-ins draw (library trees, never mirrored)
  assert.ok(keys.has(LANE_SURFACE) && SURFACES.find(s => s.key === LANE_SURFACE)?.slot);
  for (const v of [...Object.values(ORCHARD_ART), ...Object.values(POPLAR_ART)]) assert.equal(v, null);
  for (let m = 0; m < 12; m++) for (const sp of ['oak', 'maple']) { const id = orchardTreeId(sp, m); assert.ok(byId.get(id)?.kind === 'tree' && !TREE_MIRROR.has(id), id); }
});

test('stand-in rows: parallel to the field, a pitch apart, inside it and cut to a box', () => {
  const quad = [10, 10, 30, 10, 30, 18, 10, 18];
  const segs = rowSegments(quad, 1, 0, 0.5, 0.25, 0.2);
  assert.equal(segs.length / 4, 16);   // y = 10.125 .. 17.625 every 0.5
  for (let i = 0; i < segs.length; i += 4) {
    assert.ok(Math.abs(segs[i + 1] - segs[i + 3]) < 1e-9, 'a row along x');
    assert.ok(Math.abs(segs[i] - 10.2) < 1e-9 && Math.abs(segs[i + 2] - 29.8) < 1e-9, 'inset at both ends');
    if (i) assert.ok(Math.abs(Math.abs(segs[i + 1] - segs[i - 3]) - 0.5) < 1e-9, 'a pitch apart');
  }
  // a diagonal field: every row end on the quad's edge (inside it), rows along the direction given
  const sq = Math.SQRT1_2, dq = [100, 100, 100 + 20 * sq, 100 + 20 * sq, 100 + 20 * sq - 10 * sq, 100 + 20 * sq + 10 * sq, 100 - 10 * sq, 100 + 10 * sq];
  const ds = rowSegments(dq, sq, sq, 0.38, 0, 0);
  assert.ok(ds.length / 4 > 20);
  for (let i = 0; i < ds.length; i += 4) {
    const dx = ds[i + 2] - ds[i], dy = ds[i + 3] - ds[i + 1];
    assert.ok(Math.abs(dx - dy) < 1e-6, 'along (1, 1)');
    for (const [x, y] of [[ds[i], ds[i + 1]], [ds[i + 2], ds[i + 3]]]) { const a = (x - 100) * sq + (y - 100) * sq, b = -(x - 100) * sq + (y - 100) * sq; assert.ok(a > -1e-6 && a < 20 + 1e-6 && b > -1e-6 && b < 10 + 1e-6, 'inside'); }
  }
  // cut to a box: every end inside it
  const cut = rowSegments(quad, 1, 0, 0.5, 0, 0, [12, 11, 15, 13]);
  assert.ok(cut.length > 0);
  for (let i = 0; i < cut.length; i += 2) assert.ok(cut[i] >= 12 - 1e-9 && cut[i] <= 15 + 1e-9 && cut[i + 1] >= 11 - 1e-9 && cut[i + 1] <= 13 + 1e-9);
  assert.deepEqual(rowSegments(quad, 1, 0, 0.5, 0, 0, [40, 40, 50, 50]), []);
  // far out the rows are drawn every second, fourth ... one: never under ROW_MIN_PX apart
  for (const px of [3, 6, 10, 21]) assert.ok(0.38 * rowStep(0.38, px) * px >= ROW_MIN_PX);
});

test('model 1 (T005\'s farm, the saves made with it) composes exactly as before T259', () => {
  // the digest pinned from main before T259 (output/t259-pin/pin.ts): compositions, tracks and farmsteads of the first 100 fixture farms
  const out = FARMS.slice(0, 100).map(({ p, seed }) => JSON.stringify(composeFarm(p, seed, { model: 1 })) + JSON.stringify(farmTrack(p, seed, 1)) + JSON.stringify(farmsteadOf(p, seed, 1)));
  assert.equal(fnv(out.join('|')), 'd5ebd258');
  assert.equal(farmSeason(FARMS[0].p, FARMS[0].seed, 1, 3), farmSeason(FARMS[0].p, FARMS[0].seed, 1, 9));
});

test('model 2: deterministic; the month moves only the crop states and the orchard\'s trees; fields differ between neighbours', () => {
  let orchards = 0, cornFields = 0, states = new Set<string>(), mixed = 0;
  for (const { p, seed } of FARMS) {
    const a = composeFarm(p, seed, { model: 2, month: 6 });
    assert.equal(JSON.stringify(a), JSON.stringify(composeFarm(p, seed, { model: 2, month: 6 })), `${p.key}: not deterministic`);
    for (const m of [0, 3, 9, 10]) {
      const b = composeFarm(p, seed, { model: 2, month: m });
      assert.equal(b.props.length, a.props.length, `${p.key}: props in month ${m}`);
      // (an orchard tree turns to its stage's picture, at that picture's owner size: the same spot on its grid)
      a.props.forEach((q, i) => {
        const r = b.props[i];
        if (q.id !== r.id) { assert.ok(isOrchardTree(q.id) && isOrchardTree(r.id), `${p.key}: ${q.id} became ${r.id}`); const cq = centre(q), cr = centre(r); assert.ok(Math.hypot(cq.x - cr.x, cq.y - cr.y) < 1e-6, `${p.key}: an orchard tree moved`); return; }
        assert.ok(q.x === r.x && q.y === r.y && q.scale === r.scale && q.flip === r.flip, `${p.key}: ${q.id} moved in month ${m}`);
      });
      assert.equal(b.ground.length, a.ground.length);
      a.ground.forEach((g, i) => { const h = b.ground[i]; assert.deepEqual(h.pts, g.pts); assert.equal(h.tex, g.tex); assert.equal(!!h.crop, !!g.crop); if (g.crop) assert.deepEqual(h.crop!.d, g.crop.d); });
    }
    const L = farmLayoutForTest(p, seed);
    if (L.orchard) orchards++;
    const crops = a.ground.filter(g => g.crop);
    cornFields += L.plots.filter(q => q.kind === 'corn').length;
    // each crop field's rows run along its long side (the parcel's u or n)
    for (const g of crops) { const d = g.crop!.d, okU = Math.abs(d[0] - p.u.x) < 1e-3 && Math.abs(d[1] - p.u.y) < 1e-3, okN = Math.abs(d[0] - p.n.x) < 1e-3 && Math.abs(d[1] - p.n.y) < 1e-3; assert.ok(okU || okN, `${p.key}: rows along the field`); }
    const sts = new Set(composeFarm(p, seed, { model: 2, month: 7 }).ground.filter(g => g.crop).map(g => g.crop!.st));
    for (const s of sts) states.add(s);
    if (sts.size > 1) mixed++;
    // a farm composes again only when its look changes: its season differs in a month whose states differ
    assert.notEqual(farmSeason(p, seed, 2, 1), farmSeason(p, seed, 2, 8), `${p.key}: winter and late summer look alike`);
  }
  assert.ok(orchards >= 25 && orchards <= 70, `${orchards} orchards on ${FARMS.length} farms`);
  assert.ok(cornFields >= FARMS.length, `${cornFields} corn fields`);
  // August: neighbouring fields differ (ripe, young on a late field, ploughed), many farms show more than one state
  assert.ok(states.has('ripe') && states.has('plough') && states.has('young'), [...states].join());
  assert.ok(mixed >= FARMS.length / 2, `${mixed} farms with mixed fields`);
});

test('model 2: the farmhouse and yard set back 60-120 m on a dirt lane lined by its windbreak; nothing overlapping, inside the parcel, never mirrored', () => {
  let deep = 0, both = 0;
  for (const { p, seed } of FARMS) {
    const L = farmLayoutForTest(p, seed), c = composeFarm(p, seed, { model: 2, month: 9 });
    // the setback: 30-60 tiles (60-120 m) from the road edge to the house's front, or (a parcel the terrain cut short) as deep as its yard allows
    if (L.front >= FARM_SETBACK[0] - 1e-9) { deep++; assert.ok(L.front <= FARM_SETBACK[1] + 1e-9, `${p.key}: setback ${L.front}`); }
    else { assert.ok(L.front >= FARM_SETBACK_SHORT - 1e-9 && L.yardB1 >= p.d - 2.5, `${p.key}: a short setback ${L.front} on a parcel ${p.d} deep with room`); }
    const house = c.props.filter(q => isHouse(q.id));
    assert.equal(house.length, 1, `${p.key}: one farmhouse`);
    const hf = fpOf(house[0]), near = Math.min(...[[hf[0], hf[1]], [hf[2], hf[1]], [hf[2], hf[3]], [hf[0], hf[3]]].map(([x, y]) => frame(p, x, y).b));
    assert.ok(Math.abs(near - L.front) < 0.7, `${p.key}: the house's front at ${near.toFixed(1)}, the setback ${L.front.toFixed(1)}`);
    assert.equal(c.props.filter(q => q.id === 'world:barn').length, 1, `${p.key}: one barn`);
    const st = farmsteadOf(p, seed, 2), hc = centre(house[0]);
    assert.ok(Math.hypot(hc.x - st.house.x, hc.y - st.house.y) < 0.6, `${p.key}: farmhouse off the farmstead`);
    // the lane: a hard-edged dirt strip from the road (b = 0) to the yard, LANE_HALF either side of the gate
    const lane = c.ground.find(g => g.tex === 'dirt' && g.hard && g.pts.some((_, k) => k % 2 === 0 && Math.abs(frame(p, g.pts[k], g.pts[k + 1]).b) < 1e-6));
    assert.ok(lane, `${p.key}: no lane from the road`);
    const lb = lane!.pts.filter((_, k) => k % 2 === 0).map((x, k) => frame(p, x, lane!.pts[2 * k + 1]));
    assert.ok(Math.max(...lb.map(f => f.b)) >= L.yardB0, `${p.key}: the lane reaches the yard`);
    assert.ok(Math.abs(Math.max(...lb.map(f => f.a)) - Math.min(...lb.map(f => f.a)) - 2 * LANE_HALF) < 1e-6, `${p.key}: lane width`);
    assert.ok(lane!.lines && lane!.lines.length === 8, `${p.key}: the lane's two ruts`);
    const gate = frame(p, st.gate.x, st.gate.y); assert.ok(Math.abs(gate.b) < 1e-9 && Math.abs(gate.a - L.laneA) < 1e-9);
    // the windbreak: on each of its sides a straight row along the lane, WIND_STEP apart, from the road to the yard
    assert.ok(L.wind, `${p.key}: no windbreak`);
    if (L.wind!.sides.length === 2) both++;
    for (const s of L.wind!.sides) {
      const row = c.props.filter(q => q.id === L.wind!.id).map(q => frame(p, centre(q).x, centre(q).y)).filter(f => Math.abs(f.a - (L.laneA + s * WIND_OFF)) < 1e-6).sort((x, y) => x.b - y.b);
      assert.ok(row.length >= 2, `${p.key}: a windbreak row of ${row.length}`);
      for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].b - row[i - 1].b - WIND_STEP) < 1e-6 || row[i].b - row[i - 1].b > WIND_STEP, `${p.key}: windbreak spacing`);
      assert.ok(row[row.length - 1].b < L.yardB0, `${p.key}: the windbreak stops at the yard`);
    }
    // every prop inside the parcel (street furniture just in front of it), no two uprights sharing more than 35% of the smaller footprint
    const ups: number[][] = [];
    for (const q of c.props) {
      assert.ok(byId.has(q.id), `${p.key}: unknown ${q.id}`);
      if (byId.get(q.id)!.kind === 'tree') { assert.equal(q.flip, false, `${p.key}: ${q.id} mirrored`); assert.ok(!TREE_MIRROR.has(q.id) || !/birch-gold|spruce|oak|maple/.test(q.id)); }
      const f = fpOf(q), minB = STREET.has(q.id) ? -0.66 : -0.31;
      for (const [x, y] of [[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]]]) { const r = frame(p, x, y); assert.ok(r.a >= -0.31 && r.a <= p.w + 0.31 && r.b >= minB && r.b <= p.d + 0.31, `${p.key}: ${q.id} outside the parcel`); }
      if (!isFence(q.id)) ups.push(f);
    }
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++) assert.ok(share(ups[i], ups[j]) <= 0.35 + 1e-9, `${p.key}: uprights overlap`);
    for (const g of c.ground) for (let k = 0; k < g.pts.length; k += 2) { const r = frame(p, g.pts[k], g.pts[k + 1]); assert.ok(r.a >= -0.01 && r.a <= p.w + 0.01 && r.b >= -0.01 && r.b <= p.d + 0.01, `${p.key}: patch outside`); }
    // the stand-in labels: the windbreak's, the lane's, at least one crop field's
    const labels = farmStandIns(p, seed, 9).map(l => l.text);
    assert.ok(labels.includes('Stand In for windbreak poplars') && labels.includes('Stand In for farm lane') && labels.some(t => /corn field|ploughed/.test(t)), `${p.key}: labels ${labels}`);
  }
  assert.ok(deep >= FARMS.length * 0.8, `${deep} of ${FARMS.length} farms 60-120 m deep`);
  assert.ok(both >= FARMS.length * 0.35 && both <= FARMS.length * 0.75, `${both} windbreaks on both sides`);
});

test('model 2: the orchard is a strict grid of straight rows ORCHARD_PITCH (6 m) apart, inside its field, the same tree throughout', () => {
  let n = 0;
  for (const { p, seed } of FARMS) {
    const L = farmLayoutForTest(p, seed), o = L.orchard; if (!o) continue;
    n++;
    for (const m of [0, 6, 9]) {
      const c = composeFarm(p, seed, { model: 2, month: m });
      // (the orchard's trees: the capital oaks or maples standing in its field; the farm's other trees stand outside every field)
      const inPlot = (q: Placed): boolean => { const f = frame(p, centre(q).x, centre(q).y); return f.a > o.plot.a0 && f.a < o.plot.a1 && f.b > o.plot.b0 && f.b < o.plot.b1; };
      const trees: Placed[] = c.props.filter(q => isOrchardTree(q.id) && inPlot(q));
      assert.equal(trees.length, o.na * o.nb, `${p.key}: ${trees.length} of ${o.na} x ${o.nb} orchard trees`);
      assert.ok(!c.props.some(q => !isOrchardTree(q.id) && byId.get(q.id)?.kind === 'tree' && inPlot(q)), `${p.key}: another tree in the orchard`);
      assert.ok(o.na <= ORCHARD_MAX && o.nb <= ORCHARD_MAX && o.na >= 4 && o.nb >= 4, `${p.key}: grid ${o.na} x ${o.nb}`);
      assert.equal(new Set(trees.map(q => q.id)).size, 1, `${p.key}: one tree an orchard`);
      assert.ok(trees[0].id.endsWith(orchardStage(m)), `${p.key}: the leaves of month ${m}`);
      for (const q of trees) {
        const f = frame(p, centre(q).x, centre(q).y), i = (f.a - o.a0) / ORCHARD_PITCH, j = (f.b - o.b0) / ORCHARD_PITCH;
        assert.ok(Math.abs(i - Math.round(i)) < 1e-6 && Math.abs(j - Math.round(j)) < 1e-6, `${p.key}: off the grid (${i}, ${j})`);
        assert.ok(f.a > o.plot.a0 && f.a < o.plot.a1 && f.b > o.plot.b0 && f.b < o.plot.b1, `${p.key}: outside its field`);
        assert.equal(q.flip, false);
      }
      // the orchard's field grows no crop under it
      assert.ok(!c.ground.some(g => g.crop && g.pts.some((_, k) => k % 2 === 0 && (() => { const r = frame(p, g.pts[k], g.pts[k + 1]); return r.a > o.plot.a0 + 0.5 && r.a < o.plot.a1 - 0.5 && r.b > o.plot.b0 + 0.5 && r.b < o.plot.b1 - 0.5; })())), `${p.key}: a crop under the orchard`);
    }
  }
  assert.ok(n >= 20, `${n} orchards`);
});

test('model 2 on the smallest parcels and a terrain-trimmed one: still a farmhouse, a barn, a lane, set back as deep as it can', () => {
  const sq = Math.SQRT1_2;
  const minis: FarmParcel[] = [
    { key: 'test|min-axis', o: { x: 500, y: 500 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 30, d: 40, side: 1 },
    { key: 'test|min-diag', o: { x: 600, y: 600 }, u: { x: sq, y: sq }, n: { x: -sq, y: sq }, w: 30, d: 40, side: 1 },
    { key: 'test|min-rear', o: { x: 700, y: 500 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, w: 30, d: 40, side: -1 },
    { key: 'test|deep', o: { x: 900, y: 500 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 80, d: 150, side: 1 },
  ];
  for (const p of minis) for (let seed = 1; seed <= 6; seed++) {
    const c = composeFarm(p, seed, { model: 2, month: 6 }), L = farmLayoutForTest(p, seed);
    assert.equal(c.props.filter(q => isHouse(q.id)).length, 1, `${p.key} seed ${seed}: farmhouse`);
    assert.equal(c.props.filter(q => q.id === 'world:barn').length, 1, `${p.key} seed ${seed}: barn`);
    assert.ok(c.ground.some(g => g.tex === 'dirt' && g.hard), `${p.key} seed ${seed}: lane`);
    assert.ok(L.front >= FARM_SETBACK_SHORT && L.front <= FARM_SETBACK[1] && L.yardB1 <= p.d, `${p.key} seed ${seed}: setback ${L.front}`);
    if (p.d >= 150) assert.ok(L.front >= FARM_SETBACK[0], `${p.key} seed ${seed}: a deep parcel sets back 60 m at least`);
    const ups = c.props.filter(q => !isFence(q.id)).map(fpOf);
    for (let i = 0; i < ups.length; i++) for (let j = i + 1; j < ups.length; j++) assert.ok(share(ups[i], ups[j]) <= 0.35 + 1e-9, `${p.key} seed ${seed}: overlap`);
  }
});
