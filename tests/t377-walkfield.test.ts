// T377 (#1033): the walk field (golf/walkfield.ts) and its routes: a spectator walks on the rough, the paths and the galleries, crosses a fairway only where it
// must (the narrowest place) and never a tee, a green, a bunker or water; a cart takes the cart paths and never drives on a tee, a green, a bunker or water;
// the ground a course reads as (golf/walkground.ts); the routes are worked out once per pair of ends (RouteCache).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CART, G, NO_WAY, RouteCache, SPECTATOR, cellOf, dilate, findRoute, groundAt, lineCost, makeField, nearestPassable, nearestStand, passable, routeClear, routeCost, type Profile, type WalkField } from '../src/game/golf/walkfield';
import { buildWalkField } from '../src/game/golf/walkground';
import type { Pt } from '../src/game/network';

/** a field of w x h cells (one tile each) with rects of ground laid in it: [x0, y0, x1, y1, ground] */
function field(w: number, h: number, rects: readonly (readonly [number, number, number, number, number])[]): WalkField {
  const f = makeField(0, 0, w, h);
  for (const [x0, y0, x1, y1, g] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f.g[y * f.w + x] = g;
  return f;
}
const len = (pts: readonly Pt[]) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); return s; };
/** the share of a route's length (sampled every quarter tile) on a ground */
function shareOn(f: WalkField, a: Pt, pts: readonly Pt[], g: number): number {
  const all = [a, ...pts]; let on = 0, n = 0;
  for (let i = 1; i < all.length; i++) { const L = Math.hypot(all[i]!.x - all[i - 1]!.x, all[i]!.y - all[i - 1]!.y), k = Math.max(1, Math.ceil(L * 4)); for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; n++; if (groundAt(f, all[i - 1]!.x + (all[i]!.x - all[i - 1]!.x) * t, all[i - 1]!.y + (all[i]!.y - all[i - 1]!.y) * t) === g) on++; } }
  return n ? on / n : 0;
}

describe('T377: a route over the walk field', () => {
  it('open ground: the straight line (one waypoint, the end)', () => {
    const f = field(60, 60, []), a = { x: 5.5, y: 5.5 }, b = { x: 50.5, y: 40.5 }, r = findRoute(f, SPECTATOR, a, b)!;
    assert.ok(r && r.length >= 1 && r.length <= 2, `${r.length} waypoints`); assert.deepEqual(r[r.length - 1], b);
    assert.ok(Math.abs(len([a, ...r]) - Math.hypot(b.x - a.x, b.y - a.y)) < 0.5, 'as long as the straight line');
  });
  it('round a green (a disc nobody enters): never on it, a short way round, few waypoints', () => {
    const rects: [number, number, number, number, number][] = [];
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (Math.hypot(x + 0.5 - 40, y + 0.5 - 40) < 12) rects.push([x, y, x + 1, y + 1, G.green]);
    const f = field(80, 80, rects), a = { x: 6.5, y: 40.5 }, b = { x: 73.5, y: 40.5 };
    for (const p of [SPECTATOR, CART]) {
      const r = findRoute(f, p, a, b)!; assert.ok(r, p.name);
      assert.ok(routeClear(f, p, [a, ...r]), `${p.name}: no point of the way is on the green`);
      assert.ok(len([a, ...r]) < 67 * 1.45, `${p.name}: ${len([a, ...r]).toFixed(1)} tiles for 67 straight`); assert.ok(r.length <= 8, `${p.name}: ${r.length} waypoints`);
      assert.ok(Math.abs(lineCost(f, p, a, b)) === Infinity, 'the straight line crosses the green');
    }
  });
  it('a lake across the map with one gap: the way goes through the gap, never in the water', () => {
    const f = field(100, 60, [[48, 0, 52, 24, G.water], [48, 28, 52, 60, G.water]]), a = { x: 10.5, y: 50.5 }, b = { x: 90.5, y: 50.5 };
    const r = findRoute(f, SPECTATOR, a, b)!; assert.ok(r && routeClear(f, SPECTATOR, [a, ...r]));
    const pass = [a, ...r].some((p, i, all) => i > 0 && p.x > 48 && all[i - 1]!.x < 52 && p.y > 24 && p.y < 28) || [a, ...r].some(p => p.x >= 47 && p.x <= 53 && p.y >= 24 && p.y <= 28);
    assert.ok(pass, 'through the gap');
  });
  it('boxed in or cut off: no route (null), an end outside the field: null', () => {
    const f = field(40, 40, [[0, 20, 40, 22, G.water]]);
    assert.equal(findRoute(f, SPECTATOR, { x: 5.5, y: 5.5 }, { x: 5.5, y: 35.5 }), null, 'a river across the whole field');
    assert.equal(findRoute(f, SPECTATOR, { x: -5, y: 5 }, { x: 5.5, y: 5.5 }), null);
  });
  it('an end on a tee or a green is moved to the nearest ground that may be stood on; the route still ends at the end it was given', () => {
    const f = field(60, 30, [[28, 10, 34, 16, G.green]]), b = { x: 31, y: 13 }, a = { x: 5.5, y: 13.5 };
    const r = findRoute(f, SPECTATOR, a, b)!; assert.ok(r); assert.deepEqual(r[r.length - 1], b);
    const s = nearestStand(f, SPECTATOR, 31, 13)!; assert.ok(s && passable(f, SPECTATOR, s.x, s.y), 'a stand off the green'); assert.ok(nearestPassable(f, SPECTATOR, 31, 13) >= 0);
    assert.equal(nearestStand(f, SPECTATOR, 31, 13, 1), null, 'none within a tile of the middle of the green');
  });
  it('a spectator crosses a fairway at its narrowest place; a way that is the fairway\'s width everywhere crosses it straight', () => {
    // a fairway band that is 12 tiles wide in the middle of the map and 3 wide at a neck 30 tiles up it
    const rects: [number, number, number, number, number][] = [[0, 30, 200, 42, G.fairway]];
    const neck: [number, number, number, number, number][] = [[0, 30, 80, 42, G.fairway], [80, 30, 100, 33, G.fairway], [100, 30, 200, 42, G.fairway]];
    void rects;
    const f = makeField(0, 0, 200, 80); for (const [x0, y0, x1, y1, g] of neck) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f.g[y * f.w + x] = g;
    // blank the part of the band either side of the neck so that the only place across is the neck, a 3-tile crossing 15 tiles off the straight line
    for (let y = 33; y < 42; y++) for (let x = 80; x < 100; x++) f.g[y * f.w + x] = G.open;
    const a = { x: 60.5, y: 5.5 }, b = { x: 60.5, y: 70.5 }, r = findRoute(f, SPECTATOR, a, b)!;
    assert.ok(r && routeClear(f, SPECTATOR, [a, ...r]));
    const fair = shareOn(f, a, r, G.fairway) * len([a, ...r]); assert.ok(fair <= 13, `${fair.toFixed(1)} tiles on the fairway`);
    assert.ok(len([a, ...r]) > 65 + 5, 'it walked off its line to the neck');
  });
  it('a cart follows a cart path while it leads there, and leaves it over the rough', () => {
    // a path along the way 8 tiles off the straight line, from beside the start to beside the end
    const f = field(100, 40, [[8, 28, 92, 30, G.path]]), a = { x: 6.5, y: 20.5 }, b = { x: 94.5, y: 20.5 };
    const r = findRoute(f, CART, a, b)!; assert.ok(r);
    assert.ok(shareOn(f, a, r, G.path) >= 0.7, `${(shareOn(f, a, r, G.path) * 100).toFixed(0)}% on the path`);
    const s = findRoute(f, SPECTATOR, a, b)!; assert.ok(shareOn(f, a, s, G.path) >= 0.5, 'a walker uses it too');
    // no path: across the open ground
    const g = field(100, 40, []); assert.ok(shareOn(g, a, findRoute(g, CART, a, b)!, G.path) === 0);
    // a way for people only (a walking path, a street) is open ground to a cart (it does not go out of its way to take it) and a way to a spectator
    const w = field(100, 40, [[8, 28, 92, 30, G.walk]]);
    assert.ok(shareOn(w, a, findRoute(w, CART, a, b)!, G.walk) < 0.05, 'a cart keeps off a footpath'); assert.ok(shareOn(w, a, findRoute(w, SPECTATOR, a, b)!, G.walk) >= 0.5, 'a spectator takes it');
  });
  it('a cart never enters a tee, a green, a bunker or water, whatever the ground in its way; a spectator never a tee, green, bunker or water either', () => {
    // a ring of every blocked ground, with a path and a fairway through it
    const f = field(120, 120, [[40, 40, 80, 80, G.green], [20, 20, 50, 30, G.tee], [70, 20, 100, 30, G.bunker], [20, 90, 100, 100, G.water], [0, 58, 120, 62, G.fairway], [0, 60, 120, 61, G.path]]);
    const ends: Pt[] = [{ x: 5.5, y: 5.5 }, { x: 115.5, y: 5.5 }, { x: 5.5, y: 115.5 }, { x: 115.5, y: 115.5 }, { x: 60.5, y: 5.5 }, { x: 60.5, y: 115.5 }];
    let n = 0;
    for (const p of [CART, SPECTATOR]) for (const a of ends) for (const b of ends) {
      if (a === b) continue; const r = findRoute(f, p, a, b); if (!r) continue; n++;
      assert.ok(routeClear(f, p, [a, ...r]), `${p.name}: ${a.x},${a.y} to ${b.x},${b.y}`);
    }
    assert.ok(n >= 40, `${n} routes found`);
  });
  it('A* finds the cheapest way: its cost matches a plain Dijkstra over the same cells on random fields (within the pulling of corners)', () => {
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let trial = 0; trial < 12; trial++) {
      const W = 36, H = 36, f = makeField(0, 0, W, H);
      for (let i = 0; i < W * H; i++) { const u = rnd(); f.g[i] = u < 0.14 ? G.water : u < 0.3 ? G.fairway : u < 0.38 ? G.path : G.open; }
      const a = { x: 1.5, y: 1.5 }, b = { x: 34.5, y: 34.5 }; f.g[cellOf(f, a.x, a.y)] = G.open; f.g[cellOf(f, b.x, b.y)] = G.open;
      const r = findRoute(f, SPECTATOR, a, b, { pad: 60 }), best = dijkstra(f, SPECTATOR, a, b);
      if (best === Infinity) { assert.equal(r, null, `trial ${trial}: no way`); continue; }
      assert.ok(r, `trial ${trial}`); const c = routeCost(f, SPECTATOR, [a, ...r]);
      assert.ok(c <= best * 1.03 + 0.5, `trial ${trial}: ${c.toFixed(1)} against the cells' ${best.toFixed(1)}`);
    }
  });
  it('RouteCache: the same ends the same route, once; ends in other cells are other routes; outside the field none', () => {
    const f = field(80, 80, [[30, 30, 50, 50, G.green]]), c = new RouteCache(f, SPECTATOR), a = { x: 5.5, y: 40.5 }, b = { x: 75.5, y: 40.5 };
    const r1 = c.route(a, b), r2 = c.route({ x: 5.7, y: 40.2 }, { x: 75.2, y: 40.9 });
    assert.ok(r1 && r1 === r2, 'one route for the same two cells'); assert.equal(c.size, 1); assert.equal(c.stats.miss, 1); assert.equal(c.stats.hits, 1);
    assert.notEqual(c.route(a, { x: 75.5, y: 10.5 }), r1); assert.equal(c.route({ x: -3, y: 4 }, { x: -9, y: 9 }), null, 'both ends off the field: none'); assert.ok(Array.isArray(c.route({ x: -3, y: 4 }, b)), 'one end off it: the way from its rim');
  });
});

describe('T377: the ground of a course (golf/walkground.ts)', () => {
  it('the surfaces, the water, the tee boxes, the ground in front of a tee and the ways make the field; a way over a fairway is where it is crossed, never over a green', () => {
    const S = { rough: 1, water: 3, fairway: 4, tee: 5, bunker: 6, green: 8 };
    const surf = (x: number, y: number) => y >= 40 && y < 50 ? S.fairway : x >= 80 && x < 90 && y >= 10 && y < 20 ? S.green : x >= 20 && x < 26 && y >= 10 && y < 14 ? S.tee : x >= 60 && x < 64 && y >= 60 && y < 64 ? S.bunker : x >= 10 && x < 20 && y >= 70 && y < 80 ? S.water : S.rough;
    const f = buildWalkField(0, 0, 120, 100, {
      surf, wet: (x, y) => x >= 100 && x < 110 && y >= 60 && y < 70, ways: [{ ax: 50, ay: 0, bx: 50, by: 100, hw: 1.5, cart: true }, { ax: 82, ay: 5, bx: 88, by: 25, hw: 1, cart: false }],
      teeBoxes: [{ x: 40, y: 12, r: 3 }], holes: [{ tee: { x: 23, y: 12 }, aim: { x: 85, y: 15 } }],
    });
    assert.equal(groundAt(f, 85.5, 15.5), G.green); assert.equal(groundAt(f, 22.5, 11.5), G.tee); assert.equal(groundAt(f, 61.5, 61.5), G.bunker);
    assert.equal(groundAt(f, 15.5, 75.5), G.water, 'a course pond'); assert.equal(groundAt(f, 105.5, 65.5), G.water, 'the map\'s own water');
    assert.equal(groundAt(f, 40.5, 12.5), G.tee, 'a tee marker\'s box'); assert.equal(groundAt(f, 50.5, 20.5), G.path, 'a way over the rough'); assert.equal(groundAt(f, 50.5, 45.5), G.path, 'a way across a fairway');
    assert.equal(groundAt(f, 5.5, 45.5), G.fairway); assert.equal(groundAt(f, 5.5, 5.5), G.open); assert.equal(groundAt(f, 50.5, 5.5), G.path);
    assert.equal(groundAt(f, 85.5, 16.5), G.green, 'a way never lays over a green');
    assert.equal(groundAt(f, 35.5, 12.5), G.front, 'in front of the tee in the line of play');
    assert.equal(groundAt(f, 5.5, 12.5), G.open, 'behind the tee is not in front of it');
  });
  it('a way for carts is path, a way for people only (a walking path, a street) is walk, and a path stays a path where a walk crosses it, laid first or last', () => {
    for (const order of [0, 1]) {
      const ways = [{ ax: 10, ay: 30, bx: 90, by: 30, hw: 1, cart: false }, { ax: 50, ay: 10, bx: 50, by: 50, hw: 1, cart: true }];
      const f = buildWalkField(0, 0, 100, 60, { surf: () => 1, wet: () => false, ways: order ? ways.slice().reverse() : ways, teeBoxes: [], holes: [] });
      assert.equal(groundAt(f, 20.5, 30.5), G.walk, 'a walking path'); assert.equal(groundAt(f, 50.5, 20.5), G.path, 'a cart path'); assert.equal(groundAt(f, 50.5, 30.5), G.path, 'the crossing is path');
      assert.equal(groundAt(f, 20.5, 40.5), G.open);
    }
  });
});

/** the cheapest cost (under a profile) of a walk over the cells, eight neighbours, by Dijkstra; Infinity when there is none */
function dijkstra(f: WalkField, p: Profile, a: Pt, b: Pt): number {
  const n = f.w * f.h, d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), s = cellOf(f, a.x, a.y), t = cellOf(f, b.x, b.y);
  d[s] = 0;
  for (;;) {
    let u = -1, du = Infinity; for (let i = 0; i < n; i++) if (!done[i] && d[i]! < du) { du = d[i]!; u = i; }
    if (u < 0 || u === t) break; done[u] = 1;
    const ui = u % f.w, uj = Math.floor(u / f.w), cu = p.cost[f.g[u]!]!;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const vi = ui + di, vj = uj + dj; if (vi < 0 || vj < 0 || vi >= f.w || vj >= f.h) continue;
      const v = vj * f.w + vi, cv = p.cost[f.g[v]!]!; if (cv <= 0) continue;
      if (di && dj && (p.cost[f.g[uj * f.w + vi]!]! <= 0 || p.cost[f.g[vj * f.w + ui]!]! <= 0)) continue;
      const nd = d[u]! + (cu + cv) / 2 * (di && dj ? Math.SQRT2 : 1); if (nd < d[v]!) d[v] = nd;
    }
  }
  return d[t]!;
}

describe('T377: the finer points of the walk field', () => {
  it('lineCost is exact: the cost is the length over each ground, and a line that only grazes the corner of a blocked cell is blocked too', () => {
    const f = field(20, 20, [[5, 5, 6, 6, G.green], [10, 12, 20, 20, G.fairway]]);
    assert.ok(Math.abs(lineCost(f, SPECTATOR, { x: 1, y: 1.5 }, { x: 9, y: 1.5 }) - 16) < 1e-9, 'open ground: 2 a tile for a spectator, 8 tiles');
    assert.ok(Math.abs(lineCost(f, SPECTATOR, { x: 5, y: 15.5 }, { x: 15, y: 15.5 }) - (5 * 2 + 5 * 12)) < 1e-9, 'five tiles of open ground, five of fairway');
    assert.ok(Math.abs(lineCost(f, CART, { x: 5, y: 15.5 }, { x: 15, y: 15.5 }) - (5 * 3 + 5 * 7)) < 1e-9, 'the costs of a cart are its own');
    assert.equal(lineCost(f, SPECTATOR, { x: 3, y: 5.5 }, { x: 9, y: 5.5 }), Infinity, 'through the green');
    assert.equal(lineCost(f, SPECTATOR, { x: 4, y: 8 }, { x: 8, y: 4 }), Infinity, 'x + y = 12 touches the corner (6, 6) of the green and nothing more: blocked');
    assert.ok(Number.isFinite(lineCost(f, SPECTATOR, { x: 4, y: 8.5 }, { x: 8, y: 4.5 })), 'x + y = 12.5 clears it');
    assert.equal(lineCost(f, SPECTATOR, { x: 2, y: 6 }, { x: 9, y: 6 }), Infinity, 'along the edge of the green (y = 6): touching');
    assert.equal(lineCost(f, SPECTATOR, { x: 2, y: 3 }, { x: 2, y: 3 }), 0, 'no length, no cost');
  });
  it('a way round a wall that is longer than the box of the ends: found over the whole field; not with whole: false', () => {
    const f = field(300, 200, [[148, 0, 152, 180, G.water]]), a = { x: 10.5, y: 10.5 }, b = { x: 290.5, y: 10.5 };
    assert.equal(findRoute(f, SPECTATOR, a, b, { pad: 12, whole: false }), null, 'not within the grown box');
    const r = findRoute(f, SPECTATOR, a, b, { pad: 12 })!; assert.ok(r && routeClear(f, SPECTATOR, [a, ...r]), 'over the whole field');
    assert.ok(r.some(p => p.y > 178), 'through the gap at the foot of the wall'); assert.deepEqual(r[r.length - 1], b);
  });
  it('RouteCache with a budget: a known route is given at once, a new one only while the budget lasts (undefined: ask again), and a hit costs no budget', () => {
    const f = field(60, 60, []), rc = new RouteCache(f, SPECTATOR), a = { x: 5.5, y: 5.5 }, b = { x: 50.5, y: 50.5 }, c = { x: 50.5, y: 10.5 };
    rc.budget = 1;
    assert.ok(Array.isArray(rc.route(a, b)), 'the first is worked out');
    assert.equal(rc.route(a, c), undefined, 'the budget is spent: not now'); assert.equal(rc.size, 1);
    assert.ok(Array.isArray(rc.route(a, b)), 'a known one is still given'); assert.equal(rc.budget, 0); assert.deepEqual(rc.stats, { hits: 1, miss: 1 });
    rc.budget = 2; assert.ok(Array.isArray(rc.route(a, c)), 'next step it is worked out'); assert.equal(rc.size, 2); assert.equal(rc.budget, 1);
    assert.ok(Array.isArray(new RouteCache(f, SPECTATOR).route(a, b)), 'no budget set: no limit');
  });
  it('dilate: tees, greens and bunkers grow by the margin, water by its own, other ground stays; the field it is made from is not changed', () => {
    const f = field(40, 40, [[10, 10, 12, 12, G.green], [20, 20, 22, 21, G.bunker], [30, 30, 31, 31, G.water], [10, 25, 14, 28, G.fairway]]), d = dilate(f, 2, 1);
    for (const [x, y, g, why] of [[8.5, 10.5, G.green, 'two cells left of the green'], [13.5, 11.5, G.green, 'two cells right'], [10.5, 13.5, G.green, 'two below'], [7.5, 10.5, G.open, 'three left: open'],
      [18.5, 20.5, G.bunker, 'a bunker grows too'], [29.5, 30.5, G.water, 'water by one'], [28.5, 30.5, G.open, 'two from the water: open'], [11.5, 26.5, G.fairway, 'a fairway does not grow']] as const) assert.equal(groundAt(d, x, y), g, why);
    assert.equal(groundAt(f, 8.5, 10.5), G.open, 'the original is as it was'); assert.equal(groundAt(f, 29.5, 30.5), G.open);
    assert.equal(dilate(f, 0).g.join(), f.g.join(), 'a margin of none changes nothing');
  });
  it('NO_WAY: a cache answers the empty route for ends with no way between them (a river across the field) and null when both ends are off the field', () => {
    const f = field(40, 40, [[0, 20, 40, 22, G.water]]), rc = new RouteCache(f, SPECTATOR);
    assert.equal(rc.route({ x: 5.5, y: 5.5 }, { x: 5.5, y: 35.5 }), NO_WAY); assert.equal(NO_WAY.length, 0);
    assert.equal(rc.route({ x: -5, y: 5 }, { x: 100, y: 5 }), null);
    assert.ok(rc.route({ x: 5.5, y: 5.5 }, { x: 30.5, y: 8.5 })!.length >= 1, 'a way on the same side');
  });
  it('an end outside the field is brought to its rim: straight outside, routed inside (the lots and the gates are not always inside the box of the course)', () => {
    const f = field(100, 60, [[48, 0, 52, 40, G.water]]), rc = new RouteCache(f, SPECTATOR), a = { x: -30, y: 10 }, b = { x: 90.5, y: 10.5 }, r = rc.route(a, b)!;
    assert.ok(r.length >= 3, `a way round the wall (${r.length} points)`); assert.deepEqual(r[0], { x: 0.5, y: 10 }, 'first to the rim'); assert.deepEqual(r[r.length - 1], b);
    assert.ok(routeClear(f, SPECTATOR, r), 'inside the field it never enters the water');
    const out = { x: 150, y: 59 }, r2 = rc.route(b, out)!;
    assert.deepEqual(r2[r2.length - 1], out, 'to an end outside: the way to its rim, then straight out'); assert.deepEqual(r2[r2.length - 2], { x: 99.5, y: 59 }); assert.ok(routeClear(f, SPECTATOR, [b, ...r2.slice(0, -1)]));
    assert.equal(rc.route({ x: -5, y: 5 }, { x: 150, y: 5 }), null, 'both outside: a straight line');
  });
});
