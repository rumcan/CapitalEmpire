// #1295 (the owner, 2026-11-14: "make sure people use walking paths if they are there and they can follow them"): the shared helper that walks people over the
// paths (golf/pathroute.ts). A route is straight to a path, along its legs (bends kept), and straight off it; used only when the trip is at most PATH_DETOUR times
// the way it replaces, the start is within reach of a path and the path carries the walker a fair way. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATH_DETOUR, PATH_MIN_ON, PATH_MIN_TRIP, PATH_PACE, PATH_REACH, PATH_SOFT, PATH_WORTH, PathNet, followPaths, polyLength, routeVia, type PathLeg } from '../src/game/golf/pathroute';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const P = (x: number, y: number) => ({ x, y });
/** legs through points: [[0,0],[15,0],[30,10]] is two legs */
const line = (...q: [number, number][]): PathLeg[] => q.slice(1).map((p, i) => ({ a: P(q[i]![0], q[i]![1]), b: P(p[0], p[1]) }));
const net = (...legs: PathLeg[][]): PathNet => { const n = PathNet.of(legs.flat()); assert.ok(n); return n!; };
/** the distance from a point to the nearest leg */
const offPath = (legs: PathLeg[], p: { x: number; y: number }): number => Math.min(...legs.map(l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, t = Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(l.a.x + dx * t - p.x, l.a.y + dy * t - p.y); }));
const near = (a: { x: number; y: number }, b: { x: number; y: number }, d = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) <= d;

test('on a path: both ends beside a straight path, the walker goes to it, along it and off it', () => {
  const legs = line([0, 10], [40, 10]), n = net(legs), t = routeVia(n, P(2, 12), P(38, 12))!;
  assert.ok(t, 'a path 2 tiles off both ends is used');
  assert.equal(t.pts.length, 4); assert.ok(near(t.pts[0]!, P(2, 12)) && near(t.pts[3]!, P(38, 12)), 'from the start to the goal');
  assert.ok(near(t.pts[1]!, P(2, 10)) && near(t.pts[2]!, P(38, 10)), 'straight to the nearest point of the path and straight off it');
  assert.deepEqual([t.on0, t.on1], [1, 2], 'the leg between is the one on the path');
  assert.ok(Math.abs(t.len - 40) < 1e-9 && Math.abs(t.onLen - 36) < 1e-9, `${t.len} tiles, ${t.onLen} on the path`);
  assert.ok(t.len <= PATH_DETOUR * 36, 'within the detour');
  // a walker timed by the straight way's 36 tiles goes this much faster over the 40: within the most a trip may be longer
  assert.ok(t.len / 36 > 1 && t.len / 36 <= PATH_PACE, `${(t.len / 36).toFixed(3)} times as fast`);
});

test('on the path already: a start or a goal on it is its own entry or exit', () => {
  const n = net(line([0, 0], [30, 0])), t = routeVia(n, P(0, 0), P(40, 5))!;
  assert.ok(t, 'the path leads most of the way: along it, then off to the goal (the goal is far from it)');
  assert.deepEqual(t.pts.map(p => [p.x, p.y]), [[0, 0], [30, 0], [40, 5]]); assert.deepEqual([t.on0, t.on1], [0, 1]);
  const both = routeVia(n, P(2, 0), P(28, 0))!; assert.deepEqual(both.pts.map(p => [p.x, p.y]), [[2, 0], [28, 0]], 'both ends on one leg: just the leg'); assert.deepEqual([both.on0, both.on1], [0, 1]); assert.ok(Math.abs(both.len - 26) < 1e-9, 'it is the straight way');
});

test('off a path: no path near the start, or none that leads there, is no route', () => {
  const n = net(line([0, 10], [40, 10]));
  assert.equal(routeVia(n, P(2, 40), P(38, 40)), null, 'both ends 30 tiles from the path');
  assert.ok(routeVia(n, P(2, 10 + PATH_REACH - 0.5), P(38, 10)), 'a start just within reach (the goal on the path)');
  assert.equal(routeVia(n, P(2, 10 + PATH_REACH + 0.5), P(38, 10)), null, 'a start just out of reach');
  assert.equal(routeVia(n, P(2, 12), P(38, 40)), null, 'near the start, but the path leaves him far from the goal: a long way round');
  assert.equal(routeVia(null, P(0, 0), P(20, 0)), null, 'no paths at all'); assert.equal(routeVia(undefined, P(0, 0), P(20, 0)), null);
  assert.equal(PathNet.of([]), null, 'no legs, no graph');
});

test('a detour refused: a path that leads the long way round is not taken, one a little off the line is', () => {
  const u = net(line([0, 2], [0, 12], [20, 12], [20, 2]));
  assert.equal(routeVia(u, P(0, 0), P(20, 0)), null, 'a U of path round a 20 tile trip: 44 tiles for 20');
  const near20 = net(line([0, 2], [20, 2])), t = routeVia(near20, P(0, 0), P(20, 0))!;
  assert.ok(t && t.len > 20 && t.len <= PATH_DETOUR * 20, `2 tiles off both ends: ${t?.len} tiles for 20, within ${PATH_DETOUR}`);
  const far = net(line([0, 5], [20, 5]));
  assert.equal(routeVia(far, P(0, 0), P(20, 0)), null, '5 tiles off both ends: 30 tiles for 20 is more than the detour');
  // a short hop onto a path is not a path that helps (a step or two on it for the walking it adds)
  const cross = net(line([2, -3], [2, 3]));
  assert.equal(routeVia(cross, P(0, 0), P(20, 0)), null, 'a path that only crosses the way: 3 tiles of it for 3 tiles more walking');
  const b = routeVia(near20, P(0, 0), P(20, 0), 40)!;
  assert.ok(b, 'the way it replaces (base) was 40 tiles: the same path is a shortcut there'); assert.ok(b.len < 40);
  assert.equal(routeVia(near20, P(0, 0), P(4, 0)), null, `a trip under ${PATH_MIN_TRIP} tiles is walked straight`);
});

test('a bend followed: the route goes round the path\'s bends, not across them', () => {
  const legs = line([0, 0], [15, 0], [30, 10], [45, 10]), n = net(legs), t = routeVia(n, P(1, 1), P(44, 9))!;
  assert.ok(t, 'a bent path along the way');
  const xy = t.pts.map(p => [p.x, p.y]); assert.ok(xy.some(p => near(P(p[0]!, p[1]!), P(15, 0))) && xy.some(p => near(P(p[0]!, p[1]!), P(30, 10))), 'both bends are points of the route');
  for (let i = t.on0; i <= t.on1; i++) assert.ok(offPath(legs, t.pts[i]!) < 1e-9, `point ${i} is on the path`);
  // every sample along the on-path legs lies on the path: the walker's feet are on it
  for (let i = t.on0; i < t.on1; i++) for (let k = 0; k <= 10; k++) { const a = t.pts[i]!, b = t.pts[i + 1]!; assert.ok(offPath(legs, P(a.x + (b.x - a.x) * k / 10, a.y + (b.y - a.y) * k / 10)) < 1e-9); }
  assert.ok(t.len <= PATH_DETOUR * Math.hypot(43, 8));
});

test('the shortest way over the graph: a junction picks the short side; legs that do not join make no way', () => {
  // two ways from the left end to the right end: over a short bump (B) and a long loop (C); a spur at the left
  const short = line([0, 0], [10, 3], [20, 0]), long = line([0, 0], [10, -14], [20, 0]), n = net(short, long);
  const t = routeVia(n, P(0, 1), P(20, 1))!; assert.ok(t);
  assert.ok(t.pts.some(p => near(p, P(10, 3))) && !t.pts.some(p => near(p, P(10, -14))), 'over the bump, not the loop');
  // two paths that never meet (no shared end point): he rides the first as far as it helps and walks the gap himself; the second is not reached along the first
  const apart = net(line([0, 0], [10, 0]), line([10.5, 0], [20, 0])), gap = routeVia(apart, P(0, 1), P(20, 1))!;
  assert.ok(gap && gap.pts.some(p => near(p, P(10, 0))) && !gap.pts.some(p => near(p, P(10.5, 0))), 'legs that only come near each other are not joined: off at the end of the first, across the gap');
  assert.ok(gap.on1 === gap.pts.findIndex(p => near(p, P(10, 0))), 'its last point on a path is the end of the first');
  const joined = net(line([0, 0], [10, 0], [20, 0])), j = routeVia(joined, P(0, 1), P(20, 1))!;
  assert.ok(j && j.pts.some(p => near(p, P(10, 0))) && j.pts.some(p => near(p, P(20, 0))), 'joined, he rides both to the far end');
  assert.ok(j.onLen > gap.onLen, 'and more of the way is on the path');
  // a thousandth of a tile apart is the same point (the network snaps its nodes to a thousandth)
  const snapped = net(line([0, 0], [10, 0]), line([10.0004, 0], [20, 0])); assert.ok(routeVia(snapped, P(0, 1), P(20, 1)), 'a hair apart is joined');
});

test('the network\'s own legs: crossing walking paths join where they cross, and the route turns at the crossing', () => {
  const e = new NetEditor(new RoadNetwork()), L = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: P(ax, ay), b: P(bx, by) });
  e.addLegs([L(100, 100, 140, 100)], CLASS['cart-walk']!, 0); e.addLegs([L(120, 90, 120, 110)], CLASS['cart-slab']!, 0); e.addLegs([L(100, 120, 140, 120)], CLASS.street!, 0);
  e.commit(true);
  const legs: PathLeg[] = []; for (const s of e.net.segs) if (s.cls.family === 'cart') legs.push({ a: s.a, b: s.b });
  assert.equal(legs.length, 4, 'the cross is four legs (the street is not a path)');
  const n = PathNet.of(legs)!, t = routeVia(n, P(102, 101), P(138, 99))!;
  assert.ok(t, 'along the walking path, over the crossing');
  assert.ok(t.pts.some(p => near(p, P(120, 100), 1e-3)), 'the route passes the node the network made where the paths cross');
  assert.equal(routeVia(n, P(102, 121), P(138, 121)), null, 'the street is not a path: nothing leads along it');
  const v = routeVia(n, P(121, 91), P(119, 109))!; assert.ok(v, 'and down the other path, the slab one'); assert.ok(v.pts.some(p => near(p, P(120, 100), 1e-3)));
});

test('followPaths: a stretch of a way goes by the path as one trip, the longest from the earliest point it works from', () => {
  const legs = line([0, 10], [40, 10]), n = net(legs);
  // a way of four points, 2 tiles off the path: the whole of it is one stretch (the way's own points inside it go: the route steers by the path)
  const way = [P(2, 12), P(4, 12), P(36, 12), P(37, 12)], w = followPaths(n, way)!; assert.ok(w);
  assert.deepEqual(w.map(q => [q.x, q.y]), [[2, 12], [2, 10], [37, 10], [37, 12]], 'to the path, along it, off it');
  assert.ok(polyLength(w) / polyLength(way) <= PATH_PACE, 'no more than the most a trip may be longer than the way it replaces');
  // a start too far from the path to join it: the stretch begins at the first point that is near enough
  const late = followPaths(n, [P(2, 30), P(4, 12), P(36, 12), P(37, 12)])!; assert.ok(late);
  assert.deepEqual(late.map(q => [q.x, q.y]), [[2, 30], [4, 12], [4, 10], [37, 10], [37, 12]], 'from the second point on; the first leg as it was');
  // none helps: exactly the way he had (null: the caller keeps its own)
  assert.equal(followPaths(n, [P(0, 40), P(20, 40), P(40, 40)]), null, 'no path near: the way is his own');
  assert.equal(followPaths(null, way), null, 'no paths at all'); assert.equal(followPaths(undefined, way), null);
  assert.equal(followPaths(n, [P(2, 12)]), null, 'a way of one point'); assert.equal(followPaths(n, []), null, 'a way of none');
  // from and to: only the points between them are the stretches' to replace (the lot's aisles, the way round a building are kept)
  const kept = followPaths(n, way, null, 1, 3)!; assert.ok(kept && near(kept[0]!, P(2, 12)) && near(kept[1]!, P(4, 12)), 'the first point and leg are kept when the stretches begin at the second');
  const mid = followPaths(n, way, null, 1, 2)!; assert.deepEqual(mid.map(q => [q.x, q.y]), [[2, 12], [4, 12], [4, 10], [36, 10], [36, 12], [37, 12]], 'with the stretches between the second and third points only: the middle leg goes by the path, the others are as they were');
  // the goal: after the way's last point, as far as the paths carry him; the walk ends where they leave him
  const g = followPaths(n, [P(0, 12), P(1, 12)], P(60, 12))!; assert.ok(g, 'from the last point on to the goal, over the path');
  assert.ok(near(g.at(-1)!, P(40, 10)), 'it ends where the path leaves him (the rest is his own)'); assert.ok(g.length >= 3);
  assert.equal(followPaths(n, [P(0, 12), P(1, 12)], P(30, 80)), null, 'a goal the path does not lead to');
});

test('followPaths: a waypoint beside where the route joins or leaves the path is dropped, one farther off is kept', () => {
  const n = net(line([0, 10], [40, 10]));
  // the ends are too far from the path to join it; the way steers by a point 0.6 tiles from the path at each end: the route would step back to them, so they go
  const w = followPaths(n, [P(0, 30), P(2, 10.6), P(38, 10.6), P(38, 30)])!; assert.ok(w);
  assert.deepEqual(w.map(q => [q.x, q.y]), [[0, 30], [2, 10], [38, 10], [38, 30]], 'by the entry and by the exit: gone');
  // a waypoint 2.5 tiles from the path where the route joins it is kept (he steps from it to the path); the one beyond the stretch's exit is passed by, the stretch running on to the last point
  const k = followPaths(n, [P(0, 30), P(2, 12.5), P(38, 12.5), P(38, 30)])!; assert.ok(k);
  assert.deepEqual(k.map(q => [q.x, q.y]), [[0, 30], [2, 12.5], [2, 10], [38, 10], [38, 30]], 'kept at the entry (2.5 tiles off); the stretch runs on to the end, leaving the path where it comes nearest');
  // with the stretch ending at the third point (to = 2) the exit's waypoint is a boundary: 2.5 tiles off it is kept, 0.6 off it goes
  const m = followPaths(n, [P(0, 30), P(2, 12.5), P(38, 12.5), P(38, 30)], null, 0, 2)!; assert.ok(m);
  assert.deepEqual(m.map(q => [q.x, q.y]), [[0, 30], [2, 12.5], [2, 10], [38, 10], [38, 12.5], [38, 30]], 'both waypoints kept (a stretch from the second to the third)');
  assert.ok(PATH_SOFT > 0.6 && PATH_SOFT < 2.5);
  // the first and the last point of a way are never dropped, even beside the path
  const e = followPaths(n, [P(2, 10.4), P(38, 10.4)])!; assert.ok(e && near(e[0]!, P(2, 10.4)) && near(e.at(-1)!, P(38, 10.4)), 'the ends stay');
  assert.equal(polyLength([P(0, 0), P(3, 4), P(3, 10)]), 11);
});

test('the search is pure: the same answer every time, whichever came before; the net and the points are not changed', () => {
  const legs = line([0, 0], [15, 0], [30, 10], [45, 10], [60, 0]), n = net(legs), m = net(legs);
  const a = P(1, 1), b = P(44, 9), snapshot = JSON.stringify([a, b, [...n.nx], [...n.ny], [...n.len]]);
  const first = JSON.stringify(routeVia(n, a, b));
  routeVia(n, P(59, 1), P(2, 2)); routeVia(n, P(0, 40), P(0, 60)); routeVia(n, P(30, 11), P(3, 1));
  assert.equal(JSON.stringify(routeVia(n, a, b)), first, 'unaffected by the searches between'); assert.equal(JSON.stringify(routeVia(m, a, b)), first, 'and the same as a fresh graph\'s');
  assert.equal(JSON.stringify([a, b, [...n.nx], [...n.ny], [...n.len]]), snapshot, 'nothing it was given changed');
  // the way back is the way there reversed
  const back = routeVia(n, b, a)!, there = routeVia(n, a, b)!; assert.ok(Math.abs(back.len - there.len) < 1e-9, 'the same length either way');
  assert.deepEqual(back.pts.map(p => [p.x, p.y]), there.pts.map(p => [p.x, p.y]).reverse());
});

test('bad input is no route, never a crash or a NaN point: non-finite ends, legs of no length, an empty graph', () => {
  const n = net(line([0, 10], [40, 10]));
  assert.equal(routeVia(n, P(NaN, 0), P(20, 0)), null); assert.equal(routeVia(n, P(0, 0), P(Infinity, 0)), null);
  assert.ok(PathNet.of([{ a: P(0, 0), b: P(0, 0) }, { a: P(NaN, 0), b: P(1, 1) }]) === null, 'a leg of no length, a leg with a NaN end');
  const ok = PathNet.of([{ a: P(0, 0), b: P(0, 0) }, { a: P(0, 10), b: P(30, 10) }])!; assert.equal(ok.legs, 1);
  const t = routeVia(n, P(2, 12), P(38, 12), NaN); assert.ok(t, 'a NaN base is the straight line'); for (const p of t!.pts) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.ok(PATH_MIN_ON > 0 && PATH_WORTH > 0 && PATH_REACH > 0 && PATH_DETOUR > 1);
});

test('speed: a route is worked out in well under a millisecond on a network of a thousand legs', () => {
  // a grid of paths 40 x 12: each node joins its neighbours
  const legs: PathLeg[] = []; for (let i = 0; i < 40; i++) for (let j = 0; j < 12; j++) { if (i < 39) legs.push({ a: P(i * 6, j * 6), b: P((i + 1) * 6, j * 6) }); if (j < 11) legs.push({ a: P(i * 6, j * 6), b: P(i * 6, (j + 1) * 6) }); }
  const n = PathNet.of(legs)!; assert.ok(n.legs > 900, `${n.legs} legs`);
  const t0 = performance.now(); let used = 0; const N = 400;
  for (let k = 0; k < N; k++) { const r = routeVia(n, P(1 + (k % 37) * 5.9, 2 + (k % 11) * 5.7), P(230 - (k % 41) * 5.3, 62 - (k % 13) * 4.4)); if (r) used++; }
  const per = (performance.now() - t0) / N; assert.ok(per < 1, `${per.toFixed(3)} ms a route`); assert.ok(used > 50, `${used} of ${N} used a path`);
});
