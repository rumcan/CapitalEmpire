// T321 (#912; the owner, 2026-11-03: with the main road deleted the cars drove over the grass all the way to the course): a car keeps to the main
// roads as long as they bring it closer and leaves them only at their point nearest its destination (src/game/offroad.ts); the off-road leg goes
// round what it may not cross; with a road to the destination there is no off-road leg at all (golf/rangebiz.ts rangeCarLines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { APPROACH, gridPath, linesOnRoads, mainRoads, nearRoads, offRoadTo } from '../src/game/offroad';
import { rangeCarLines } from '../src/game/golf/rangebiz';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const lenOf = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);
const near = (p: Pt, x: number, y: number, tol = 1e-6) => Math.hypot(p.x - x, p.y - y) <= tol;

/** the town's roads: a county road along y 0 (0..300) and a side street up x 150 to a dead end at (150, 80); a street of its own, joined to
 *  nothing, at y 140 (the piece a deleted road cut off); a cart path from the dead end on (no car road) */
function town(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 0, 300, 0), leg(150, 0, 150, 80)], CLASS.street, 0);
  e.addLegs([leg(200, 140, 230, 140)], CLASS.street, 0);
  e.addLegs([leg(150, 80, 170, 120)], CLASS.cart!, 0);
  e.commit(true);
  return e.net;
}

test('the main roads: the connected car roads with the most length (no cut-off piece, no cart path)', () => {
  const net = town(), main = mainRoads(net);
  assert.ok(main.size > 0);
  for (const s of main) assert.ok(!s.cls.noCars, 'car roads only');
  assert.ok(![...main].some(s => s.a.y === 140 && s.b.y === 140), 'the cut-off street is not the way in');
});

test('no road to the destination: by road to the main roads\' point nearest it, then over the grass (the on-road share is maximal)', () => {
  const net = town(), main = mainRoads(net), e = { x: 160, y: 110 };
  const w = offRoadTo(net, main, e, () => 1)!;
  assert.ok(w, 'a way');
  const P = w.road[w.road.length - 1]!;
  // the brute-force nearest point of the main roads to e: the side street's dead end (150, 80), 31.6 tiles; any other road point is further
  let best = Infinity;
  for (const s of main) for (let k = 0; k <= 400; k++) { const t = k / 400, x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t; best = Math.min(best, Math.hypot(e.x - x, e.y - y)); }
  assert.ok(near(P, 150, 80, 1e-6), `it leaves the roads at the dead end: ${JSON.stringify(P)}`);
  assert.ok(Math.abs(Math.hypot(e.x - P.x, e.y - P.y) - best) < 0.1, 'at the road point nearest the destination');
  // the road part: APPROACH tiles back along the roads (up the side street from the county road), every point on a car road
  assert.ok(Math.abs(lenOf(w.road) - APPROACH) < 1e-6, `the drive along the roads is ${APPROACH} tiles: ${lenOf(w.road)}`);
  for (const p of w.road) assert.ok(nearRoads(net, main, p, 1e-6), `on the roads: ${JSON.stringify(p)}`);
  // the grass part ends at the destination and, with nothing in the way, is the straight line
  assert.ok(near(w.grass[w.grass.length - 1]!, e.x, e.y), 'it ends at the destination');
  assert.ok(Math.abs(lenOf([P, ...w.grass]) - Math.hypot(e.x - P.x, e.y - P.y)) < 0.5, 'straight over open grass');
});

test('the destination on a road: no grass at all past the road point', () => {
  const net = town(), main = mainRoads(net), w = offRoadTo(net, main, { x: 150, y: 60 }, () => 1)!;
  assert.equal(w.grass.length, 1); assert.ok(near(w.grass[0]!, 150, 60) && near(w.road[w.road.length - 1]!, 150, 60));
});

test('the off-road leg goes round what it may not cross and prefers the cheap ground', () => {
  // a building (a wall from y -20 to 20 at x 40..44) between a and b
  const wall = (x: number, y: number) => (x >= 40 && x <= 44 && y >= -20 && y <= 20 ? Infinity : 1);
  const a = { x: 10, y: 0 }, b = { x: 80, y: 0 }, p = gridPath(a, b, wall);
  assert.ok(near(p[0]!, 10, 0) && near(p[p.length - 1]!, 80, 0), 'from a to b');
  for (let i = 1; i < p.length; i++) for (let k = 0; k <= 50; k++) {
    const x = p[i - 1]!.x + (p[i]!.x - p[i - 1]!.x) * k / 50, y = p[i - 1]!.y + (p[i]!.y - p[i - 1]!.y) * k / 50;
    assert.ok(Number.isFinite(wall(x, y)), `never through the building: (${x.toFixed(1)}, ${y.toFixed(1)})`);
  }
  assert.ok(lenOf(p) < 70 * 1.6, `a sensible detour: ${lenOf(p).toFixed(1)}`);
  // a fairway (cost 3) straight across, the rough (1) round it within reach: the car takes the rough
  const fairway = (x: number, y: number) => (y > -6 && y < 6 && x > 25 && x < 65 ? 3 : 1);
  const q = gridPath(a, b, fairway);
  for (let i = 1; i < q.length; i++) for (let k = 0; k <= 50; k++) {
    const x = q[i - 1]!.x + (q[i]!.x - q[i - 1]!.x) * k / 50, y = q[i - 1]!.y + (q[i]!.y - q[i - 1]!.y) * k / 50;
    if (x > 30 && x < 60) assert.ok(Math.abs(y) >= 5, `round the fairway: (${x.toFixed(1)}, ${y.toFixed(1)}) on ${JSON.stringify(q)}`);
  }
});

test('a road to the destination: the range\'s own ways are on the roads (no off-road leg); the county road deleted: they are not', () => {
  // the county road along y 0, the range's drive from J (100, 0) up x 100 to (100, 30); the car park's entrance on the drive
  const sc = { J: { x: 100, y: 0 }, driveEnd: { x: 100, y: 30 }, roadDir: { x: 1, y: 0 } }, e = { x: 101, y: 24 };
  const ed = new NetEditor(new RoadNetwork());
  ed.addLegs([leg(0, 0, 300, 0)], CLASS.street, 0); ed.addLegs([leg(100, 0, 100, 30)], CLASS.street, 0); ed.commit(true);
  assert.equal(linesOnRoads(ed.net, rangeCarLines(sc, e)), true, 'the county road and the drive are there');
  const cut = new NetEditor(new RoadNetwork());
  cut.addLegs([leg(0, 0, 40, 0)], CLASS.street, 0); cut.addLegs([leg(100, 0, 100, 30)], CLASS.street, 0); cut.commit(true);
  assert.equal(linesOnRoads(cut.net, rangeCarLines(sc, e)), false, 'the county road by the range deleted');
  // and then: along what is left of the county road to its end nearest the entrance, then over the grass
  const main = mainRoads(cut.net), w = offRoadTo(cut.net, main, e, () => 1)!;
  const P = w.road[w.road.length - 1]!;
  assert.ok(near(P, 40, 0), `leaves the main roads (the longer piece left) at their end nearest the entrance: ${JSON.stringify(P)}`);
});
