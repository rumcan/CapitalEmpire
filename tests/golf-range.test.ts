// The driving range (golf/range.ts and the range business type, plan P22 2.2, T086): its demand, its pass-by draw and its layout's facings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS, BUSINESSES, START_SAT, dailyDemand } from '../src/game/business/catalogue';
import { RANGE_BAYS, RANGE_FRONT, RANGE_PASS_POP, RANGE_PLOT, RANGE_TARGETS, plotPoint, rangeLayout, type RangeLayout } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';
import type { Pt } from '../src/game/network';

/** a plot for each facing (north and south: 70 wide, 150 deep; east and west: 150 wide, 70 deep) */
const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const inRect = (p: Pt, r: Rect, pad = 0) => p.x >= r[0] + pad - 1e-9 && p.y >= r[1] + pad - 1e-9 && p.x <= r[0] + r[2] - pad + 1e-9 && p.y <= r[1] + r[3] - pad + 1e-9;
const rectIn = (a: Rect, b: Rect) => inRect({ x: a[0], y: a[1] }, b) && inRect({ x: a[0] + a[2], y: a[1] + a[3] }, b);
/** a world point back in the plot's own frame (u along the road, v away from it), by the inverse of plotPoint */
function frameOf(plot: Rect, f: 0 | 1 | 2 | 3, p: Pt): { u: number; v: number } {
  const [px, py] = plot, [W, D] = RANGE_PLOT;
  return f === 2 ? { u: p.x - px, v: p.y - py } : f === 0 ? { u: px + W - p.x, v: py + D - p.y } : f === 1 ? { u: py + W - p.y, v: p.x - px } : { u: p.y - py, v: px + D - p.x };
}
/** every point of a layout, in order */
const pointsOf = (l: RangeLayout): Pt[] => [l.hut.door, l.mats.a, l.mats.b, ...l.bays, ...l.targets, ...l.flags, ...l.boards, ...l.lights];

test('the range type: in BUSINESS, not in BUSINESSES; 1,500 residents at 3 minutes draw 80/1000 x 1500 x e^(-3/8) x 0.9 cars a day', () => {
  const r = BUSINESS.range;
  assert.ok(r); assert.equal(r.id, 'range'); assert.equal(r.kind, 'visit'); assert.equal(r.max, 1); assert.equal(r.townMin, 0);
  assert.deepEqual(r.footprint, { w: RANGE_PLOT[0], h: RANGE_FRONT });
  assert.deepEqual([r.pricePerVisitor, r.party, r.rate, r.tau, r.upkeepPerDay, r.buildCost], [60, 2, 80, 8, 2000, 0]);
  assert.deepEqual(r.hours, [7, 22]);
  assert.ok(!BUSINESSES.some(b => b.id === 'range'));
  const want = 80 / 1000 * 1500 * Math.exp(-3 / 8) * 0.9, got = dailyDemand(r, 1, [{ pop: 1500, tripMin: 3 }], START_SAT);
  assert.ok(Math.abs(got - want) <= 0.01 * want, `${got} vs ${want}`);
});

test('everything in the layout lies inside the plot; the targets go out in order with greens of 3-6 tiles; 12 bays', () => {
  for (const f of FACINGS) {
    const plot = plots[f], l = rangeLayout(plot, f);
    for (const r of [l.hut.rect, l.mats.rect, l.carpark]) assert.ok(rectIn(r, plot), `facing ${f}: ${r}`);
    for (const p of pointsOf(l)) assert.ok(inRect(p, plot), `facing ${f}: ${p.x},${p.y}`);
    for (const t of l.targets) assert.ok(inRect({ x: t.x - t.r, y: t.y - t.r }, plot) && inRect({ x: t.x + t.r, y: t.y + t.r }, plot), `facing ${f}: green inside`);
    assert.equal(l.bays.length, RANGE_BAYS);
    assert.deepEqual(l.targets.map(t => t.dist), RANGE_TARGETS);
    const out = l.targets.map(t => frameOf(plot, f, t).v);
    for (let i = 1; i < out.length; i++) assert.ok(out[i]! > out[i - 1]!, `facing ${f}: ordered`);
    for (const t of l.targets) assert.ok(t.r >= 3 && t.r <= 6);
    assert.equal(l.flags.length, l.targets.length); assert.equal(l.boards.length, l.targets.length);
    // the hut, the mats and the car park sit in the front (the first 24 tiles from the road) and do not overlap
    for (const r of [l.hut.rect, l.mats.rect, l.carpark]) for (const p of [{ x: r[0], y: r[1] }, { x: r[0] + r[2], y: r[1] + r[3] }]) assert.ok(frameOf(plot, f, p).v <= RANGE_FRONT + 1e-9);
    const apart = (a: Rect, b: Rect) => a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
    assert.ok(apart(l.hut.rect, l.carpark) && apart(l.hut.rect, l.mats.rect) && apart(l.mats.rect, l.carpark), `facing ${f}: apart`);
  }
});

test('the four facings turn the layout (the same in the plot frame), give the hut views 0-3 facing the road, and mirror nothing', () => {
  const base = rangeLayout(plots[2], 2), canon = pointsOf(base).map(p => frameOf(plots[2], 2, p));
  const views = new Set<number>();
  for (const f of FACINGS) {
    const l = rangeLayout(plots[f], f);
    assert.equal(l.facing, f);
    pointsOf(l).forEach((p, i) => { const q = frameOf(plots[f], f, p); assert.ok(Math.abs(q.u - canon[i]!.u) < 1e-9 && Math.abs(q.v - canon[i]!.v) < 1e-9, `facing ${f}: point ${i}`); });
    // the frame is turned, not mirrored: u x v has the identity's sign (a positive cross product)
    const o = plotPoint(plots[f], f, 0, 0), a = plotPoint(plots[f], f, 1, 0), b = plotPoint(plots[f], f, 0, 1);
    assert.ok((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) > 0, `facing ${f}: a rotation`);
    // the hut's front (its door) faces the road: the view's front direction (+y, +x, -y, -x) points from the hut's centre to its door
    const c = { x: l.hut.rect[0] + l.hut.rect[2] / 2, y: l.hut.rect[1] + l.hut.rect[3] / 2 }, d = { x: l.hut.door.x - c.x, y: l.hut.door.y - c.y };
    const front = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }][l.hut.view]!;
    assert.ok(front.x * d.x + front.y * d.y > 0, `facing ${f}: the hut faces its door`);
    for (const b2 of l.boards) assert.equal(b2.view, l.hut.view);
    views.add(l.hut.view);
    assert.ok(!JSON.stringify(l).includes('flip'), 'nothing carries a flip');
  }
  assert.deepEqual([...views].sort(), [0, 1, 2, 3]);
});

test('RANGE_PASS_POP rises by tier from 1,500; the layout is deterministic', () => {
  const p = [1, 2, 3, 4, 5].map(RANGE_PASS_POP);
  assert.deepEqual(p, [1500, 1950, 2400, 3000, 3600]);
  for (let i = 1; i < p.length; i++) assert.ok(p[i]! > p[i - 1]!);
  assert.equal(RANGE_PASS_POP(0), 1500); assert.equal(RANGE_PASS_POP(9), 3600);
  for (const f of FACINGS) assert.deepEqual(rangeLayout(plots[f], f), rangeLayout(plots[f], f));
});
