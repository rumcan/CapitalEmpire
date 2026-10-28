// Headless tests for the Course tool's holes (golf/holeview.ts, C2): automatic pins and tee markers, tagging a course by hole, the per-hole views.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlan, autoPin, autoTees, holeViews, interiorPoint, markerPlan, tagByHole, type HoleArea } from '../src/game/golf/holeview';
import { insidePoly } from '../src/game/paint';

const box = (x: number, y: number, w: number, h: number) => [x, y, x + w, y, x + w, y + h, x, y + h];
/** hole n: a tee box at x0, a fairway, and a green d tiles further along +X */
const hole = (n: number, x0: number, y0: number, d: number): HoleArea[] => [
  { hole: n, tex: 'golfTee', pts: box(x0, y0 - 3, 8, 6) },
  { hole: n, tex: 'golfFairway', pts: box(x0 + 12, y0 - 10, d - 30, 20) },
  { hole: n, tex: 'golfGreen', pts: box(x0 + d - 10, y0 - 8, 16, 16) },
];

test('interiorPoint is inside a U-shaped outline whose centroid is not', () => {
  const U = [0, 0, 30, 0, 30, 30, 20, 30, 20, 10, 10, 10, 10, 30, 0, 30];
  const p = interiorPoint(U); assert.ok(insidePoly(U, p.x, p.y));
  const c = interiorPoint(box(5, 5, 10, 10)); assert.deepEqual([c.x, c.y], [10, 10]);
});

test('autoPin uses the hint on the green, else the largest green; autoTees lines the markers up toward the green', () => {
  const g = [box(0, 0, 4, 4), box(100, 0, 20, 20)];
  assert.deepEqual(autoPin(g, { x: 2, y: 2 }), { x: 2, y: 2 });
  assert.deepEqual(autoPin(g, { x: 50, y: 50 }), { x: 110, y: 10 });
  const t = autoTees([box(0, -3, 10, 6)], { x: 200, y: 0 });
  assert.ok(t.back.x < t.middle.x && t.middle.x < t.forward.x);
  for (const p of [t.back, t.middle, t.forward]) assert.ok(insidePoly(box(0, -3, 10, 6), p.x, p.y));
});

test('markerPlan places a pin on each painted green and the white tee set on each tee (T254: New hole lays a white tee), and keeps markers already on them', () => {
  const areas = [...hole(1, 100, 100, 180), ...hole(2, 100, 300, 120)];
  const ops = markerPlan(areas, [], []);
  assert.equal(ops.filter(o => o.kind === 'pin').length, 2); assert.deepEqual(ops.filter(o => o.kind !== 'pin').map(o => o.kind), ['middle', 'middle']);
  const m = applyPlan([], [], ops);
  assert.ok(m.pins.every(p => p.auto)); assert.deepEqual(markerPlan(areas, m.pins, m.tees), []);
});

test('markerPlan moves a pin off its green back on, follows a preset flag, and removes auto markers whose green and tee are gone', () => {
  const areas = hole(3, 0, 0, 200), green = areas[2]!.pts;
  const off = markerPlan(areas, [{ hole: 3, x: 50, y: 0 }], []).find(o => o.kind === 'pin')!;
  assert.equal(off.op, 'set'); assert.ok(off.op === 'set' && insidePoly(green, off.x, off.y));
  const hinted = markerPlan(areas, [{ hole: 3, x: 198, y: 0 }], [], new Map([[3, { x: 193, y: 5 }]])).find(o => o.kind === 'pin');
  assert.deepEqual(hinted, { op: 'set', hole: 3, kind: 'pin', x: 193, y: 5 });
  const gone = markerPlan([], [{ hole: 3, x: 198, y: 0, auto: true }, { hole: 4, x: 5, y: 5 }], [{ hole: 3, kind: 'back', x: 1, y: 0, auto: true }]);
  assert.deepEqual(gone, [{ op: 'remove', hole: 3, kind: 'pin' }, { op: 'remove', hole: 3, kind: 'back' }]);
});

test('tagByHole: a green takes its pin\'s hole, a tee its marker\'s hole, a fairway the nearest playing line; far or tagged areas none', () => {
  const areas: HoleArea[] = hole(0, 0, 0, 200).map(a => ({ tex: a.tex, pts: a.pts })).concat(hole(0, 0, 100, 200).map(a => ({ tex: a.tex, pts: a.pts })));
  areas.push({ tex: 'golfRough', pts: box(1000, 1000, 10, 10) }, { tex: 'pad', pts: box(50, 50, 5, 5) }, { hole: 7, tex: 'golfGreen', pts: box(190, -8, 16, 16) });
  const pins = [{ hole: 1, x: 198, y: 0 }, { hole: 2, x: 198, y: 100 }];
  const tees = [{ hole: 1, kind: 'back' as const, x: 2, y: 0 }, { hole: 2, kind: 'back' as const, x: 2, y: 100 }];
  assert.deepEqual(tagByHole(areas, pins, tees, []), [1, 1, 1, 2, 2, 2, 0, 0, 0]);
});

test('holeViews: par and length from the markers, the checklist, and a classic game\'s worked-out markers', () => {
  const areas = [...hole(1, 100, 100, 180), ...hole(2, 100, 300, 75)];
  const v = holeViews(areas, null);
  assert.equal(v.length, 18); assert.equal(v[0]!.virtual, true);
  assert.equal(v[0]!.started, true); assert.equal(v[0]!.par, 4); assert.ok(v[0]!.lengthM > 300 && v[0]!.lengthM < 400);
  assert.ok(v[0]!.checks.every(c => c.ok));
  assert.equal(v[1]!.par, 3); assert.ok(v[1]!.checks.find(c => c.label.startsWith('Fairway'))!.ok);
  assert.equal(v[2]!.started, false); assert.equal(v[2]!.par, 0);
  const golf = holeViews(areas, { pins: [], tees: [], aims: [] });
  assert.equal(golf[0]!.par, 0); assert.equal(golf[0]!.ok, false);
  assert.deepEqual(golf[0]!.checks.filter(c => !c.ok).map(c => c.label), ['Pin on the green', 'Tee markers on the tee']);
});
