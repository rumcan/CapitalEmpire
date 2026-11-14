// #1276, and the owner's "make sure people use walking paths if they are there and they can follow them" (a ticket of its own): what the road tool's drag and its 45 degree
// default give the people who walk. A dragged walking path is made of segs of class cart-walk like a clicked one; two things read them: the range's walkway (golf/rangebiz.ts
// walkwayOf: the paths' legs joined where they share an end point, the golfers' way from the car park to the shop and the tee) and the course's walk field (golf/walkground.ts
// buildWalkField: every seg a way, a walking path laid as ground `walk`, which a spectator takes at half the cost of the rough). These tests play dragged runs through routeLegs
// (the second run starting where the first ended, as a press on a path's end node does) and give the legs to both. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeLegs } from '../src/game/route-legs';
import { CLASS, type Leg, type Pt } from '../src/game/network';
import { defaultRangeBiz, rangeScene, walkwayOf, walkwayReach } from '../src/game/golf/rangebiz';
import { plotPoint } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';
import { buildWalkField, type Way } from '../src/game/golf/walkground';
import { CART, G, SPECTATOR, findRoute, groundAt, makeField, type WalkField } from '../src/game/golf/walkfield';

const PLOT: Rect = [200, 200, 70, 150], F = 2 as const, P = (u: number, v: number): Pt => plotPoint(PLOT, F, u, v);
/** a drag from `a` to `b` as the road tool builds it (the course's half grid, 45 degree bends by default) */
const drag = (a: Pt, b: Pt, bend: 45 | 90 = 45): Leg[] => routeLegs(a, b, bend, false, 0.5);
const ptsOf = (legs: Leg[]): Pt[] => [legs[0]!.a, ...legs.map(l => l.b)];

test('a dragged walking path is the range golfers\' walkway: two runs, the second from the first\'s end, join the car park, the shop and the tee', () => {
  const sc = rangeScene(PLOT, F, defaultRangeBiz());
  // run 1: from the car park's edge to the shop's counter; run 2 on from the counter to the back of the mats (the guide's walking path step)
  const a1 = P(50, 12), b1 = P(34, 13.5), b2 = P(28, 17.5);
  const run1 = drag(a1, b1), run2 = drag(b1, b2);
  assert.equal(run1.length, 2, 'a diagonal run and a straight one: one 45 degree bend'); assert.equal(run2.length, 2);
  assert.deepEqual(walkwayReach(sc, run1), { lot: true, shop: true, tee: false }, 'the first run alone leaves the tee out');
  assert.equal(walkwayOf(sc, run1), null, 'so it is no walkway yet');
  assert.deepEqual(walkwayReach(sc, [...run1, ...run2]), { lot: true, shop: true, tee: true });
  const w = walkwayOf(sc, [...run1, ...run2]);
  assert.ok(w, 'the two dragged runs are the walkway: the walkers\' graph has all three anchors, joined where the runs share their end point');
  // a run that does not start on the first's end (half a tile off: no press snapped to its node) is a separate path: not a walkway
  const apart = drag(P(34, 14), b2);
  assert.equal(walkwayOf(sc, [...run1, ...apart]), null, 'half a tile off the end is no join');
  // the right-angle bend the Q toggle gives joins the same way
  assert.ok(walkwayOf(sc, [...drag(a1, b1, 90), ...drag(b1, b2, 90)]), 'with 90 degree bends too');
});

/** the field of a bare 90 x 60 tile course with the legs laid as ways of class cart (a cart path) or cart-walk (a walking path) */
function fieldOf(legs: Leg[], base: 'cart-walk' | 'cart-dirt'): WalkField {
  const cls = CLASS[base]!, ways: Way[] = legs.map(l => ({ ax: l.a.x, ay: l.a.y, bx: l.b.x, by: l.b.y, hw: cls.h + cls.walk, cart: cls.family === 'cart' && cls.base !== 'cart-walk' }));
  return buildWalkField(0, 0, 90, 60, { surf: () => 0, wet: () => false, ways, teeBoxes: [], holes: [] });
}
/** the share of a route's length (sampled every quarter tile) on ground g */
function shareOn(f: WalkField, from: Pt, route: readonly Pt[], g: number): number {
  const all = [from, ...route]; let on = 0, n = 0;
  for (let i = 1; i < all.length; i++) {
    const L = Math.hypot(all[i]!.x - all[i - 1]!.x, all[i]!.y - all[i - 1]!.y), k = Math.max(1, Math.ceil(L * 4));
    for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; n++; if (groundAt(f, all[i - 1]!.x + (all[i]!.x - all[i - 1]!.x) * t, all[i - 1]!.y + (all[i]!.y - all[i - 1]!.y) * t) === g) on++; }
  }
  return n ? on / n : 0;
}
const length = (from: Pt, route: readonly Pt[]) => { let s = 0, p = from; for (const q of route) { s += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return s; };

test('the walk field lays a dragged walking path whole: its diagonal run is a chain of cells with no gap, as is its straight run', () => {
  const legs = drag({ x: 10, y: 10 }, { x: 36, y: 19 }), f = fieldOf(legs, 'cart-walk'); // 9 tiles on the diagonal, then 17 along x
  assert.equal(legs.length, 2);
  // every cell the centre line passes through is a walking path (sampled every tenth of a tile along the legs; not at a cell's corner, where four cells meet and a float's last digit picks one)
  for (const l of legs) {
    const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
    for (let i = 0; i <= L * 10; i++) {
      const t = i / (L * 10), x = l.a.x + (l.b.x - l.a.x) * t, y = l.a.y + (l.b.y - l.a.y) * t;
      if (Math.abs(x - Math.round(x)) < 1e-3 && Math.abs(y - Math.round(y)) < 1e-3) continue;
      assert.equal(groundAt(f, x, y), G.walk, `(${x.toFixed(2)}, ${y.toFixed(2)}) is path`);
    }
  }
  // 8-connected from the first cell to the last, so the walkers' search (diagonal steps need both sides open: they are) can follow it
  const cells = new Set<number>(); for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (f.g[j * f.w + i] === G.walk) cells.add(j * f.w + i);
  const start = Math.floor(10) + Math.floor(10) * f.w, seen = new Set<number>([start]), todo = [start];
  while (todo.length) { const c = todo.pop()!, ci = c % f.w, cj = Math.floor(c / f.w); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = (cj + dj) * f.w + ci + di; if (cells.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); } } }
  assert.equal(seen.size, cells.size, `one connected path of ${cells.size} cells`);
});

test('walkers follow a dragged walking path: a spectator takes it while it is under twice the way across the rough (the paths cost 1 a tile, the rough 2), a cart does not go out of its way for it', () => {
  const a = { x: 10, y: 10 }, b = { x: 36, y: 19 };
  for (const bend of [45, 90] as const) {
    const legs = drag(a, b, bend), f = fieldOf(legs, 'cart-walk'), pathLen = length(a, ptsOf(legs).slice(1)), direct = Math.hypot(b.x - a.x, b.y - a.y);
    // end to end: the route is the path (share on it, length no longer than the path)
    const r = findRoute(f, SPECTATOR, { x: a.x + 0.25, y: a.y + 0.25 }, { x: b.x - 0.25, y: b.y - 0.25 })!;
    assert.ok(r, `${bend}: a route`); assert.ok(shareOn(f, { x: a.x + 0.25, y: a.y + 0.25 }, r, G.walk) > 0.9, `${bend}: ${(shareOn(f, { x: a.x + 0.25, y: a.y + 0.25 }, r, G.walk) * 100).toFixed(0)}% of the spectator's way is on the path (it is ${pathLen.toFixed(1)} tiles for ${direct.toFixed(1)} straight)`);
    assert.ok(length({ x: a.x + 0.25, y: a.y + 0.25 }, r) <= pathLen * 1.02, `${bend}: no longer than the path`);
    // a cart takes a walking path for open ground: it goes straight across, not along it
    const c = findRoute(f, CART, { x: a.x + 0.25, y: a.y + 0.25 }, { x: b.x - 0.25, y: b.y - 0.25 })!;
    assert.ok(c && length({ x: a.x + 0.25, y: a.y + 0.25 }, c) <= direct * 1.02, `${bend}: a cart cuts across (${length({ x: a.x + 0.25, y: a.y + 0.25 }, c).toFixed(1)} tiles)`);
  }
  // from beside the path's two ends the spectators come on to it and go along it
  const legs = drag(a, b), f = fieldOf(legs, 'cart-walk'), from = { x: 6.5, y: 14.5 }, to = { x: 40.5, y: 15.5 }, r = findRoute(f, SPECTATOR, from, to)!;
  assert.ok(r && shareOn(f, from, r, G.walk) > 0.6, `from beside its ends: ${(shareOn(f, from, r, G.walk) * 100).toFixed(0)}% on the path`);
  // the rough is dear enough that a path twice as long as the way across is not taken: the line a spectator cuts when the path wanders far round
  const far = [...drag({ x: 10, y: 10 }, { x: 10, y: 50 }), ...drag({ x: 10, y: 50 }, { x: 70, y: 50 }), ...drag({ x: 70, y: 50 }, { x: 70, y: 12 })], g = fieldOf(far, 'cart-walk');
  const cut = findRoute(g, SPECTATOR, { x: 10.5, y: 10.5 }, { x: 70.5, y: 12.5 })!;
  assert.ok(shareOn(g, { x: 10.5, y: 10.5 }, cut, G.walk) < 0.2, `a path 138 tiles round for a 60 tile way across is not taken (${(shareOn(g, { x: 10.5, y: 10.5 }, cut, G.walk) * 100).toFixed(0)}% on it)`);
  void makeField;
});
