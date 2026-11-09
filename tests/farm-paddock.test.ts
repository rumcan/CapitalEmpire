// T402 (#1080; the owner, 2026-11-09, with a screenshot of a desert farm paddock with cows: "fences not correct, a house garage as a barn??").
// The paddock fence was laid in the parcel's own frame with the library's map-axes fence art (an X piece and a Y piece), so on a road that lies
// 45 degrees to the grid a side took an X or a Y piece by the luck of rounding and spaced the pieces along the diagonal: gaps between panels,
// panels stacked like boards facing the camera, corners that do not join; and a house kit's garage stood among the farm's buildings. Now the fence
// stands on the map's axes (paddock.ts: the pasture itself on a parcel that lies on them, the largest axes rectangle inside it on a turned one),
// four runs end to end from corner to corner with a gate on the side that faces the lane, and a farm's outbuildings come from the farm kit alone
// (a barn for cows, a stable for horses, a shed for sheep). Headless: the geometry, the composed farms, the herd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { ANIMALS } from '../src/game/animals-library';
import type { Pt } from '../src/game/network';
import type { Placed } from '../src/game/lots/compose';
import { composeFarm, farmAnimalFields, farmAnimals, animalAt, farmStandIns, type AnimalView, type FarmModel, type FarmParcel } from '../src/game/ext/farms';
import { farmPastureForTest } from '../src/game/ext/farms/farms';
import { hasSheep, herdPlan, shelterOf } from '../src/game/ext/farms/herd';
import { facingSide, inscribed, paddockOf, runPieces, worldOf } from '../src/game/ext/farms/paddock';

const byId = new Map(LIBRARY.map(i => [i.id, i]));
const SEED = 20261109;
const EPS = 1e-6;
const PANELS = new Set(['expansion:chainlink-x', 'expansion:chainlink-y']), GATES = new Set(['expansion:gate-chainlink-x', 'expansion:gate-chainlink-y']);
/** a parcel turned by deg degrees (u, n orthonormal, as farmParcels makes them) */
const parcel = (i: number, deg: number, w = 40 + (i * 13) % 41, d = 80 + (i * 29) % 71): FarmParcel => {
  const t = deg * Math.PI / 180, u = { x: Math.cos(t), y: Math.sin(t) }, n = { x: -u.y, y: u.x };
  return { key: `t402:${deg}:${i}`, o: { x: 600 + i * 11, y: 700 + i * 5 }, u, n, w, d, side: 1 };
};
/** the angles of the farm's frame: the four axes, the four diagonals (a screen-straight road: 45 degrees to the grid) and some others */
const ANGLES = [0, 90, 180, 270, 45, 135, 225, 315, 20, 100, 200, 333];
/** a placed piece's footprint on the map: x0, y0, x1, y1 (tiles) */
function foot(q: Placed): [number, number, number, number] {
  const it = byId.get(q.id)!, b = it.boxes[0]!, s = q.scale, hx = (q.flip ? b.hy : b.hx) * s / 2, hy = (q.flip ? b.hx : b.hy) * s / 2, dx = (q.flip ? b.dy : b.dx) * s / 2, dy = (q.flip ? b.dx : b.dy) * s / 2;
  return [q.x + dx - hx, q.y + dy - hy, q.x + dx + hx, q.y + dy + hy];
}
const centre = (f: readonly number[]): Pt => ({ x: (f[0]! + f[2]!) / 2, y: (f[1]! + f[3]!) / 2 });
/** a pasture's corners in world tiles */
const corners = (p: FarmParcel, q: { a0: number; b0: number; a1: number; b1: number }): Pt[] => [worldOf(p, q.a0, q.b0), worldOf(p, q.a1, q.b0), worldOf(p, q.a1, q.b1), worldOf(p, q.a0, q.b1)];
/** whether a point is inside a pasture's rectangle (parcel frame), within a tolerance */
const inPlot = (p: FarmParcel, q: { a0: number; b0: number; a1: number; b1: number }, x: Pt, tol = 1e-6) => { const dx = x.x - p.o.x, dy = x.y - p.o.y, a = dx * p.u.x + dy * p.u.y, b = dx * p.n.x + dy * p.n.y; return a >= q.a0 - tol && a <= q.a1 + tol && b >= q.b0 - tol && b <= q.b1 + tol; };
/** the paddock's fence pieces of a composition: the chain-link panels and gates (a farm's only fence is its paddock's) */
const fenceOf = (props: Placed[]) => props.filter(q => PANELS.has(q.id) || GATES.has(q.id));

test('the largest rectangle inside a turned one: feasible, maximal, whole on the axes, the same rule both ways', () => {
  // on the axes: the whole outer
  assert.deepEqual(inscribed(10, 6, 1, 0), { p: 10, q: 6 });
  assert.deepEqual(inscribed(10, 6, 0, 1), { p: 6, q: 10 });
  // a quarter turn: a square of half-side min(P, Q) / sqrt 2
  const sq = inscribed(10, 10, Math.SQRT1_2, Math.SQRT1_2); assert.ok(Math.abs(sq.p - 10 / Math.SQRT2) < EPS && Math.abs(sq.q - 10 / Math.SQRT2) < EPS, JSON.stringify(sq));
  let n = 0;
  for (let deg = 1; deg < 90; deg += 4) for (const [P, Q] of [[10, 6], [6, 10], [20, 20], [15, 4], [4, 15], [31, 27]] as const) {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), { p, q } = inscribed(P, Q, c, s);
    assert.ok(c * p + s * q <= P + 1e-9 && s * p + c * q <= Q + 1e-9, `${deg}° ${P}x${Q}: inside`);
    // maximal: no bigger rectangle of the same shape fits, and neither side can grow alone
    const k = 1.001; assert.ok(c * p * k + s * q * k > P + 1e-12 || s * p * k + c * q * k > Q + 1e-12, `${deg}° ${P}x${Q}: the same shape, bigger, does not fit`);
    assert.ok(p > 0 && q > 0, `${deg}° ${P}x${Q}: something fits`);
    // no other shape on the two limits has a bigger area (a coarse sweep of p)
    for (let t = 0.05; t < 1; t += 0.05) { const pp = p * (0.5 + t), qq = Math.min((P - c * pp) / s, (Q - s * pp) / c); if (qq > 0) assert.ok(pp * qq <= p * q * (1 + 1e-9), `${deg}° ${P}x${Q}: a better shape at p ${pp.toFixed(2)}`); }
    n++;
  }
  assert.ok(n > 100);
});

test('the paddock of a field: the field itself on the axes; on a turned parcel the largest axes rectangle inside it, and the grazing rectangle inside that', () => {
  const q = { a0: 6, b0: 20, a1: 34, b1: 41 };
  for (const deg of [0, 90, 180, 270]) {
    const p = parcel(3, deg), pd = paddockOf(p, q), w = corners(p, q);
    assert.deepEqual(pd.fence, [Math.min(...w.map(c => c.x)), Math.min(...w.map(c => c.y)), Math.max(...w.map(c => c.x)), Math.max(...w.map(c => c.y))], `${deg}°: the fence is the field`);
    assert.deepEqual(pd.field, q, `${deg}°: and the animals' field`);
  }
  for (const deg of [45, 135, 225, 315, 20, 100, 200, 333, 7]) {
    const p = parcel(3, deg), pd = paddockOf(p, q), [x0, y0, x1, y1] = pd.fence;
    // the fence is an axes rectangle about the field's middle, inside the field
    const mid = worldOf(p, (q.a0 + q.a1) / 2, (q.b0 + q.b1) / 2);
    assert.ok(Math.abs((x0 + x1) / 2 - mid.x) < 1e-9 && Math.abs((y0 + y1) / 2 - mid.y) < 1e-9, `${deg}°: about the field's middle`);
    for (const c of [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]) assert.ok(inPlot(p, q, c, 1e-6), `${deg}°: a fence corner is inside the field`);
    // ...and the animals' field inside the fence
    for (const c of corners(p, pd.field)) assert.ok(c.x >= x0 - 1e-6 && c.x <= x1 + 1e-6 && c.y >= y0 - 1e-6 && c.y <= y1 + 1e-6, `${deg}°: a grazing corner is inside the fence`);
    assert.ok(x1 - x0 > 4 && y1 - y0 > 4, `${deg}°: a paddock of some size (${(x1 - x0).toFixed(1)} x ${(y1 - y0).toFixed(1)})`);
  }
});

test('a run: pieces end to end from 0 to L, every piece meets the next, the gate at the middle, the scale a little off one', () => {
  for (const L of [8, 8.7, 11.3, 14, 20, 27.5, 33, 61, 120]) for (const gate of [undefined, 1.02, 1.15]) {
    const { pieces, scale } = runPieces(L, 1.68, gate);
    assert.ok(pieces.length >= 2, `${L}: pieces`); assert.ok(Math.abs(pieces[0]!.t0) < EPS && Math.abs(pieces[pieces.length - 1]!.t1 - L) < 1e-9, `${L}: from 0 to L`);
    for (let i = 1; i < pieces.length; i++) assert.ok(Math.abs(pieces[i]!.t0 - pieces[i - 1]!.t1) < 1e-9, `${L}: piece ${i} meets the one before`);
    assert.ok(scale > 0.8 && scale < 1.25, `${L} gate ${gate}: scale ${scale.toFixed(3)}`);
    const gates = pieces.filter(p => p.gate);
    if (gate) { assert.equal(gates.length, 1); const g = gates[0]!, i = pieces.indexOf(g); assert.equal(i, pieces.length >> 1, 'in the middle'); assert.ok(Math.abs(g.t0 - (L - g.t1)) < 1e-9, 'centred'); } else assert.equal(gates.length, 0);
  }
  assert.deepEqual(runPieces(0, 1.68).pieces, []);
});

/** the farms of every turn, both models: a paddock or not */
function farms(model: FarmModel) {
  const out: { p: FarmParcel; seed: number; c: ReturnType<typeof composeFarm>; fields: ReturnType<typeof farmAnimalFields> }[] = [];
  ANGLES.forEach((deg, ai) => { for (let i = 0; i < 24; i++) { const p = parcel(ai * 100 + i, deg), seed = SEED + i; out.push({ p, seed, c: composeFarm(p, seed, { model, month: 9 }), fields: farmAnimalFields(p, seed, model) }); } });
  return out;
}

for (const model of [1, 2] as const) test(`model ${model}: the paddock fence is four straight runs on the map's axes, end to end, closed at the corners, with one gate facing the lane`, () => {
  let paddocks = 0, turned = 0;
  for (const { p, seed, c, fields } of farms(model)) {
    const pad = fields.find(f => f.kind === 'paddock'), fence = fenceOf(c.props);
    if (!pad) { assert.equal(fence.length, 0, `${p.key}: a fence but no paddock`); continue; }
    assert.ok(fence.length >= 8, `${p.key}: ${fence.length} fence pieces`);
    paddocks++; if (Math.min(Math.abs(p.u.x), Math.abs(p.u.y)) > 0.01) turned++;
    // the angle matches the side's direction: an X piece lies longer along x, a Y piece along y (no piece is turned to a diagonal side)
    for (const q of fence) { const f = foot(q), kind = byId.get(q.id)!.kind; assert.equal(kind === 'fencex', f[2] - f[0] > f[3] - f[1], `${p.key}: ${q.id} lies across its run`); }
    // the four sides: pieces of one line, in order, each meeting the next
    const xs = fence.filter(q => byId.get(q.id)!.kind === 'fencex'), ys = fence.filter(q => byId.get(q.id)!.kind === 'fencey');
    const lineOf = (qs: Placed[], by: (c: Pt) => number) => { const m = new Map<string, Placed[]>(); for (const q of qs) { const k = by(centre(foot(q))).toFixed(4); (m.get(k) ?? m.set(k, []).get(k)!).push(q); } return [...m.values()]; };
    const rows = lineOf(xs, c => c.y), cols = lineOf(ys, c => c.x);
    assert.equal(rows.length, 2, `${p.key}: two x sides`); assert.equal(cols.length, 2, `${p.key}: two y sides`);
    const spans: { a: number; b: number; at: number; x: boolean }[] = [];
    for (const [qs, isX] of [[rows, true], [cols, false]] as const) for (const line of qs) {
      const fs = line.map(q => foot(q)).sort((u, v) => (isX ? u[0] - v[0] : u[1] - v[1]));
      for (let i = 1; i < fs.length; i++) { const gap = isX ? fs[i]![0] - fs[i - 1]![2] : fs[i]![1] - fs[i - 1]![3]; assert.ok(Math.abs(gap) < 1e-6, `${p.key}: a ${gap > 0 ? 'gap' : 'overlap'} of ${gap.toFixed(4)} between two panels`); }
      const a = isX ? fs[0]![0] : fs[0]![1], b = isX ? fs[fs.length - 1]![2] : fs[fs.length - 1]![3], q = centre(fs[0]!);
      spans.push({ a, b, at: isX ? q.y : q.x, x: isX });
    }
    // the corners close: both x sides run from the same x to the same x, both y sides between the same y, and each side's ends are on the other sides' lines
    const xs0 = spans.filter(s => s.x), ys0 = spans.filter(s => !s.x);
    assert.ok(Math.abs(xs0[0]!.a - xs0[1]!.a) < 1e-6 && Math.abs(xs0[0]!.b - xs0[1]!.b) < 1e-6, `${p.key}: the x sides span the same x`);
    assert.ok(Math.abs(ys0[0]!.a - ys0[1]!.a) < 1e-6 && Math.abs(ys0[0]!.b - ys0[1]!.b) < 1e-6, `${p.key}: the y sides span the same y`);
    const [yl, yh] = [Math.min(xs0[0]!.at, xs0[1]!.at), Math.max(xs0[0]!.at, xs0[1]!.at)], [xl, xh] = [Math.min(ys0[0]!.at, ys0[1]!.at), Math.max(ys0[0]!.at, ys0[1]!.at)];
    const tol = 0.2; // (a side's line is its footprint's middle: a panel is a tenth of a tile thick)
    assert.ok(Math.abs(ys0[0]!.a - yl) < tol && Math.abs(ys0[0]!.b - yh) < tol, `${p.key}: the y sides run from one x side to the other`);
    assert.ok(Math.abs(xs0[0]!.a - xl) < tol && Math.abs(xs0[0]!.b - xh) < tol, `${p.key}: the x sides run from one y side to the other`);
    // one gate, in the middle of its side, on the side that faces the lane
    const gates = fence.filter(q => GATES.has(q.id)); assert.equal(gates.length, 1, `${p.key}: one gate`);
    const rect: [number, number, number, number] = [xl, yl, xh, yh], g = centre(foot(gates[0]!));
    assert.ok(facingSide(rect, g), `${p.key}: the gate is on a side of the fence`);
    // the fence lies inside the pasture, its corners on the pasture's edge on the axes and inside it when turned
    const plot = farmPastureForTest(p, seed, model)!;
    for (const c of [{ x: xl, y: yl }, { x: xh, y: yl }, { x: xh, y: yh }, { x: xl, y: yh }]) assert.ok(inPlot(p, plot, c, 0.2), `${p.key}: a fence corner is inside the pasture`);
  }
  assert.ok(paddocks >= 30 && turned >= 10, `${paddocks} paddocks, ${turned} on turned parcels`);
});

for (const model of [1, 2] as const) test(`model ${model}: the gate faces the lane (the side of the fence nearest it), on every turn`, () => {
  let n = 0;
  for (const { p, c, fields } of farms(model)) {
    const pad = fields.find(f => f.kind === 'paddock'); if (!pad) continue;
    const fence = fenceOf(c.props), gates = fence.filter(q => GATES.has(q.id)), g = centre(foot(gates[0]!));
    const pf = fence.map(q => foot(q)), x0 = Math.min(...pf.map(f => f[0])), x1 = Math.max(...pf.map(f => f[2])), y0 = Math.min(...pf.map(f => f[1])), y1 = Math.max(...pf.map(f => f[3]));
    // the gate is on the middle of a side: it stands on the fence's rectangle's edge and about the middle of that edge
    const onX = Math.abs(g.x - x0) < 0.2 || Math.abs(g.x - x1) < 0.2, onY = Math.abs(g.y - y0) < 0.2 || Math.abs(g.y - y1) < 0.2;
    assert.ok(onX !== onY, `${p.key}: the gate stands on one side`);
    if (onX) assert.ok(Math.abs(g.y - (y0 + y1) / 2) < 1e-6, `${p.key}: in the middle of its x side`); else assert.ok(Math.abs(g.x - (x0 + x1) / 2) < 1e-6, `${p.key}: in the middle of its y side`);
    n++;
  }
  assert.ok(n >= 30);
});

for (const model of [1, 2] as const) test(`model ${model}: the animals of the paddock stay inside its fence at every moment, on every turn`, () => {
  const arts = ANIMALS.map(a => ({ id: a.id })), v: AnimalView = { x: 0, y: 0, art: 0, row: 0, frame: 0, moving: false };
  let checked = 0;
  ANGLES.forEach((deg, ai) => { for (let i = 0; i < 24; i++) {
    const p = parcel(ai * 100 + i, deg), seed = SEED + i, c = composeFarm(p, seed, { model, month: 9 }), fields = farmAnimalFields(p, seed, model), pad = fields.find(f => f.kind === 'paddock'); if (!pad) continue;
    const pf = fenceOf(c.props).map(q => foot(q)), x0 = Math.min(...pf.map(f => f[0])), x1 = Math.max(...pf.map(f => f[2])), y0 = Math.min(...pf.map(f => f[1])), y1 = Math.max(...pf.map(f => f[3]));
    for (const a of farmAnimals(p, seed, arts, model)) {
      if (Math.abs(a.f[0] - (pad.a0 + 1.6)) > 1e-9 || Math.abs(a.f[1] - (pad.b0 + 1.6)) > 1e-9) continue; // (an animal of the paddock)
      for (let t = 0; t < 900; t += 7.3) { animalAt(a, t, v); assert.ok(v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1, `${p.key} at ${t.toFixed(1)}s: (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) is outside the fence`); checked++; }
    }
  } });
  assert.ok(checked > 300, `${checked} positions checked`);
});

for (const model of [1, 2] as const) test(`model ${model}: no farm composes a house kit's building: the farm's buildings are its farmhouse and the farm kit's (barn, silo, shed, windmill)`, () => {
  const HOUSES = new Set(['gen:house-farmhouse-wrap', 'gen:house-l-ranch', 'gen:house-ranch-long', 'expansion:ranch-rear']);
  const KIT = new Set(['world:barn', 'ref:landmark-silo', 'ref:landmark-windmill', 'variation:ref-building-farm-shed-0280794d-plain:1']);
  let farmsN = 0, sheds = 0;
  for (const { p, c } of farms(model)) {
    farmsN++;
    for (const q of c.props) {
      const it = byId.get(q.id)!; assert.ok(it, `${q.id} is in the library`);
      assert.ok(!/garage/i.test(q.id) && !/garage/i.test(it.name), `${p.key}: a garage (${q.id})`);
      const house = it.cat === 'Houses' && it.kind !== 'house', big = it.kind === 'building' || it.kind === 'venue' || it.kind === 'house';
      assert.ok(!house, `${p.key}: a house kit's building (${q.id}, ${it.cat})`);
      if (big) assert.ok(HOUSES.has(q.id) || KIT.has(q.id), `${p.key}: ${q.id} is no farm kit building`);
      if (q.id.includes('farm-shed')) sheds++;
    }
    assert.equal(c.props.filter(q => q.id === 'world:barn').length, 1, `${p.key}: the barn`);
  }
  assert.ok(farmsN > 200 && sheds > 10, `${farmsN} farms, ${sheds} sheds`);
});

test('model 2: a farm keeps what its herd needs: sheep a shed, horses a stable (the shed\'s picture, labelled), cows the barn; the buildings and the animals read one herd', () => {
  const arts = ANIMALS.map(a => ({ id: a.id })); let sheepFarms = 0, horseFarms = 0, cowFarms = 0, stables = 0;
  for (const { p, seed, c, fields } of farms(2)) {
    const plan = herdPlan(fields, seed), herd = farmAnimals(p, seed, arts, 2, fields);
    // the plan is the one farmAnimals places by: the kinds it places are the plan's
    const placed = new Set(herd.map(a => a.kind)), planned = new Set(plan.map(g => g.kind));
    for (const k of placed) assert.ok(planned.has(k), `${p.key}: ${k}s placed that the plan does not graze`);
    const sheds = c.props.filter(q => q.id.includes('farm-shed')), labels = farmStandIns(p, seed, 9).filter(l => l.text === 'Stand In for stable');
    const horses = plan.some(g => g.kind === 'horse'), sheep = hasSheep(plan);
    assert.equal(labels.length <= 1, true, `${p.key}: at most one stable`);
    if (!horses) assert.equal(labels.length, 0, `${p.key}: no horses, no stable label`);
    if (!sheep && !horses) assert.equal(sheds.length, 0, `${p.key}: cows only: no shed`);
    if (sheep) sheepFarms++; if (horses) horseFarms++; if (!sheep && !horses && plan.length) cowFarms++;
    // (a building that does not fit its parcel is left out by the composer, as any prop is: most do fit)
    if (horses) stables += labels.length;
    if (labels.length) assert.ok(c.props.some(q => q.id === labels[0]!.id), `${p.key}: the stable label sits on a prop of the composition`);
    assert.equal(shelterOf(plan) === 'stable', plan.find(g => g.q.kind === 'paddock')?.kind === 'horse');
  }
  assert.ok(sheepFarms > 20 && horseFarms > 10 && cowFarms > 5, `${sheepFarms} sheep farms, ${horseFarms} horse farms, ${cowFarms} cow-only farms`);
  assert.ok(stables >= horseFarms * 0.7, `${stables} stables on ${horseFarms} horse farms`);
});
