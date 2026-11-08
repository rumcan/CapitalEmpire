// T355 (#997) Streets on the course land (the owner, 2026-11-08: "the cart paths and roads button has streets specifically for your golf course but
// it wont let me draw them on the course"). Supersedes T124 for the streets: the Small classes (Gravel, Lane, Street and the street's One-way,
// Trees and One-way + trees, what the Cart paths & roads panel offers first under Roads) are built on the course land; they may not cover a hole's
// playing surfaces (tee, fairway, green, bunker, water hazard: "Hole 4's fairway is in the way"); crossing the rough, the first cut, the long
// grass or the fescue is fine (the road replaces that ground); every bigger town class is still refused with the T124 message; the course's own
// cart paths and drives are judged as before. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, CLASSES, ROAD_TYPES, RoadNetwork, VARIANTS, isCourseClass, type Leg, type RoadClass } from '../src/game/network';
import { checkLegs, snapPoint, type Snap } from '../src/game/snap';
import { COURSE_LAND_MSG, COURSE_STREET_FAMILIES, STREET_REFUSED_SURFACES, legsOnPlay, playAt, playInWay, playWhy, startWhy, streetOnCourseOk } from '../src/game/golf/parcels';
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import type { Rect } from '../src/game/golf/mode';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the course land: the course (x 100..180, y 100..180) and a block bought on its east side (x 180..220) */
const COURSE: Rect = [100, 100, 80, 80], BLOCK: Rect = [180, 100, 40, 80], LAND: Rect[] = [COURSE, BLOCK];
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** a course grid over the land with a little of every kind: rough everywhere; hole 3's fairway (x 104..116, y 104..170); hole 4's fairway (x 130..150,
 *  y 110..150), tee (x 136..144, y 154..158) and green (x 134..146, y 101..108); hole 4's bunker (a disc of 3 tiles at 122, 135); a pond of no hole
 *  (x 160..172, y 116..128); and a strip of every ground a street may cross: long grass, fescue and waste (x 190..200, y 104..110 / 112..118 / 120..126) */
function course(): Grid {
  const g = makeGrid(90, 90, 280, 200); // x 90..230, y 90..190
  fillPolygon(g, rect(100, 100, 220, 180), SURF.rough, 0, 0);
  fillPolygon(g, rect(104, 104, 116, 170), SURF.fairway, 3, 0);
  fillPolygon(g, rect(130, 110, 150, 150), SURF.fairway, 4, 0);
  fillPolygon(g, rect(136, 154, 144, 158), SURF.tee, 4, 0);
  fillPolygon(g, rect(134, 101, 146, 108), SURF.green, 4, 0);
  paintDisc(g, 122, 135, 3, SURF.bunker, 4, 0);
  fillPolygon(g, rect(160, 116, 172, 128), SURF.water, 0, 0);
  fillPolygon(g, rect(190, 104, 200, 110), SURF.longGrass, 0, 0);
  fillPolygon(g, rect(190, 112, 200, 118), SURF.fescue, 0, 0);
  fillPolygon(g, rect(190, 120, 200, 126), SURF.waste, 0, 0);
  return g;
}
/** the road tool's snaps at the route's ends (radius 2 tiles, the town grid or the course half grid) */
const snaps = (net: RoadNetwork, legs: Leg[], step = 1): [Snap, Snap] => [snapPoint(net, legs[0]!.a, 2, step), snapPoint(net, legs[legs.length - 1]!.b, 2, step)];
/** the road tool's verdict on a route, as the engine judges it (routeBlock: checkLegs on the land, then playInWay on the course grid) */
function verdict(g: Grid | null, legs: Leg[], cls: RoadClass, land: readonly Rect[] = LAND): string {
  const net = new RoadNetwork(), [from, to] = snaps(net, legs, cls.noCars ? 0.5 : 1);
  return checkLegs(net, legs, from, to, cls, undefined, land) || (playInWay(g, cls, legs)?.why ?? '');
}
const street = CLASS.street!, hw = street.h + street.walk;

test('the Small classes are the streets: what the Roads panel offers first, and only them', () => {
  assert.deepEqual([...COURSE_STREET_FAMILIES], ['small']);
  // every class by family: the Small ones are the streets; the course's own families are not judged by the predicate (isCourseClass)
  for (const c of CLASSES) assert.equal(streetOnCourseOk(c), c.family === 'small', c.id);
  const offered = ROAD_TYPES.filter(t => streetOnCourseOk(CLASS[t.id]!)).flatMap(t => VARIANTS[t.id]);
  assert.deepEqual([...new Set(offered)].sort(), ['gravel', 'lane', 'street', 'street.ow', 'street.ow.tr', 'street.tr'], 'Street, One-way, Trees, One-way + trees, with the gravel road and the lane');
  for (const id of ['road', 'avenue', 'avenue.gr', 'arterial', 'arterial.ow', 'arterial.tl', 'arterial.tr', 'boulevard', 'six', 'six.ow', 'grand', 'divided']) assert.equal(streetOnCourseOk(CLASS[id]!), false, id);
  for (const c of CLASSES) if (isCourseClass(c.id)) assert.equal(c.family === 'small', false, `${c.id} is a course family`);
});

test('a street on the rough, long grass, fescue, waste or bare ground inside the land is allowed, across the course and the bought block', () => {
  const g = course();
  for (const id of ['gravel', 'lane', 'street', 'street.ow', 'street.tr', 'street.ow.tr']) {
    const cls = CLASS[id]!;
    // along y 175: rough only (hole 3's fairway ends at y 170, the tee is at y 154..158); the land's whole width, the county road side to the block
    assert.equal(verdict(g, [leg(60, 175, 240, 175)], cls), '', `${id}: across the rough`);
    // down the block, past the strips of long grass, fescue and waste (x 190..200: the street at x 195 is on them)
    assert.equal(verdict(g, [leg(195, 60, 195, 160)], cls), '', `${id}: over the long grass, the fescue and the waste`);
    assert.equal(verdict(g, [leg(60, 125, 100, 125)], cls), '', `${id}: off the land`);
  }
  // the first click on the rough, or on ground with no surface at all, starts a street
  assert.equal(startWhy(LAND, g, street, 125, 175), '');
  assert.equal(startWhy(LAND, g, street, 95, 95), '');
  assert.equal(startWhy(LAND, null, street, 125, 175), '', 'a classic game has no course grid');
});

test('a street across a hole\'s playing surface is refused, and the refusal names the hole', () => {
  const g = course();
  // west to east along y 140 (corridor 137.35..142.65): hole 3's fairway first, then hole 4's bunker (its disc reaches y 138), then hole 4's fairway
  const east = [leg(60, 140, 240, 140)];
  assert.equal(verdict(g, east, street), "Hole 3's fairway is in the way");
  // east to west the first it meets is hole 4's fairway (the pond is above, y 116..128)
  assert.equal(verdict(g, [leg(240, 140, 60, 140)], street), "Hole 4's fairway is in the way");
  // the other kinds, each alone
  assert.equal(verdict(g, [leg(125, 60, 125, 120)], street), '', 'the rough between hole 3 and hole 4, above the bunker');
  assert.equal(verdict(g, [leg(122, 60, 122, 140)], street), "Hole 4's bunker is in the way");
  assert.equal(verdict(g, [leg(140, 154, 140, 170)], street), "Hole 4's tee is in the way");
  assert.equal(verdict(g, [leg(140, 60, 140, 104)], street), "Hole 4's green is in the way");
  assert.equal(verdict(g, [leg(150, 122, 190, 122)], street), 'A water hazard is in the way', 'a pond of no hole: no number');
  // the road tool's other classes of street, the same
  for (const id of ['gravel', 'lane', 'street.ow', 'street.tr', 'street.ow.tr']) assert.equal(verdict(g, east, CLASS[id]!), "Hole 3's fairway is in the way", id);
  // a bend: the first leg is clear (down the rough between the two holes), the second reaches hole 4's fairway
  assert.equal(verdict(g, [leg(125, 60, 125, 125), leg(125, 125, 140, 125)], street), "Hole 4's fairway is in the way");
  assert.equal(verdict(g, [leg(125, 60, 125, 125), leg(125, 125, 128, 125)], street), '', 'a bend that stops short of it');
});

test('the refusal is the surface met first along the route, and its outline is the stretch of the street over it', () => {
  const g = course();
  const w = legsOnPlay(g, [leg(60, 140, 240, 140)], hw)!, e = legsOnPlay(g, [leg(240, 140, 60, 140)], hw)!;
  assert.deepEqual([w.surf, w.hole, w.why], [SURF.fairway, 3, "Hole 3's fairway is in the way"]);
  assert.deepEqual([e.surf, e.hole, e.why], [SURF.fairway, 4, "Hole 4's fairway is in the way"]);
  // the outline is a corridor: x from the fairway's edge to its other edge, y the street's width either side of its centre line
  const xs = w.outline.filter((_, i) => i % 2 === 0), ys = w.outline.filter((_, i) => i % 2 === 1);
  assert.ok(Math.min(...xs) >= 103.4 && Math.max(...xs) <= 116.6, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
  assert.ok(Math.abs(Math.min(...ys) - (140 - hw)) < 1e-9 && Math.abs(Math.max(...ys) - (140 + hw)) < 1e-9);
  // no leg of any length: nothing
  assert.equal(legsOnPlay(g, [leg(140, 130, 140, 130)], hw), null);
  assert.equal(legsOnPlay(g, [], hw), null);
});

test('a street beside a playing surface keeps its corridor outside: touching the edge is fine, reaching over it is refused', () => {
  const g = course();
  // along hole 4's fairway (x 130..150, y 110..150) on its west side, above the bunker (y 132..138) and below hole 3's: the corridor's edge on x 130
  assert.equal(legsOnPlay(g, [leg(130 - hw, 112, 130 - hw, 128)], hw), null, 'the corridor\'s edge on the fairway\'s: off it');
  assert.equal(legsOnPlay(g, [leg(130 - hw + 0.25, 112, 130 - hw + 0.25, 128)], hw)?.why, "Hole 4's fairway is in the way");
  // ending square on the fairway's edge (a street ends where the fairway starts: no cap past its end), or a half tile on
  assert.equal(legsOnPlay(g, [leg(118, 120, 130, 120)], hw), null, 'ends on the fairway edge');
  assert.equal(legsOnPlay(g, [leg(118, 120, 130.5, 120)], hw)?.why, "Hole 4's fairway is in the way");
  // a diagonal street through the fairway
  assert.equal(legsOnPlay(g, [leg(120, 100, 160, 140)], hw)?.hole, 4);
  // a street away from the grid altogether
  assert.equal(legsOnPlay(g, [leg(10, 10, 60, 10)], hw), null);
  assert.equal(legsOnPlay(g, [leg(300, 10, 300, 60)], hw), null);
});

test('the first click: a street may not start on a hole\'s playing surface, a bigger road not inside the land', () => {
  const g = course();
  assert.equal(startWhy(LAND, g, street, 140, 130), "Hole 4's fairway is in the way");
  assert.equal(startWhy(LAND, g, street, 140, 156), "Hole 4's tee is in the way");
  assert.equal(startWhy(LAND, g, street, 166, 122), 'A water hazard is in the way');
  assert.equal(startWhy(LAND, g, CLASS.avenue!, 140, 130), COURSE_LAND_MSG, 'a bigger road is refused on the land first');
  assert.equal(startWhy(LAND, g, CLASS.avenue!, 125, 175), COURSE_LAND_MSG);
  assert.equal(startWhy(LAND, g, CLASS.avenue!, 100, 125), '', 'a point on the land\'s edge: a town road may meet a course drive there');
  assert.equal(startWhy(LAND, g, CLASS.road!, 60, 60), '');
  // the course's own paths and drives start anywhere
  for (const id of ['cart-walk', 'cart-dirt', 'cart-slab', 'cart', 'drive-gravel', 'drive', 'drive-avenue']) assert.equal(startWhy(LAND, g, CLASS[id]!, 140, 130), '', id);
  assert.equal(playAt(g, 125, 125), null);
  assert.equal(playAt(g, 10, 10), null, 'outside the grid');
  assert.equal(playAt(g, 140, 130)?.hole, 4);
});

test('a bigger town class is still refused on the land with the T124 message, a street is not', () => {
  const g = course();
  for (const c of CLASSES) {
    if (isCourseClass(c.id)) continue;
    // a route along the rough (y 175): across the course and the block
    const v = verdict(g, [leg(60, 175, 240, 175)], c);
    assert.equal(v, streetOnCourseOk(c) ? '' : COURSE_LAND_MSG, c.id);
  }
  for (const id of ['road', 'avenue', 'avenue.gr', 'arterial', 'arterial.tl.tr', 'boulevard', 'six.ow', 'grand', 'divided']) assert.equal(verdict(g, [leg(125, 60, 125, 120)], CLASS[id]!), COURSE_LAND_MSG, id);
  // without a golf game (no land, no grid) nothing is refused
  assert.equal(verdict(null, [leg(60, 140, 240, 140)], CLASS.avenue!, []), '');
  assert.equal(verdict(null, [leg(60, 140, 240, 140)], street, []), '');
});

test('the course\'s cart paths and drives are judged as before: across fairways and greens, on the land', () => {
  const g = course();
  for (const id of ['cart-walk', 'cart-dirt', 'cart-slab', 'cart', 'drive-gravel', 'drive', 'drive-avenue']) {
    const cls = CLASS[id]!;
    assert.equal(playInWay(g, cls, [leg(60, 140, 240, 140)]), null, `${id}: over hole 3's fairway, the bunker and hole 4's fairway`);
    assert.equal(verdict(g, [leg(60, 140, 240, 140)], cls), '', id);
    assert.equal(verdict(g, [leg(140, 60, 140, 170)], cls), '', `${id}: the length of hole 4`);
  }
});

test('the surfaces a street is refused on are the owner\'s five, by name', () => {
  assert.deepEqual(Object.keys(STREET_REFUSED_SURFACES).map(Number).sort((a, b) => a - b), [SURF.water, SURF.fairway, SURF.tee, SURF.bunker, SURF.green].sort((a, b) => a - b));
  assert.equal(playWhy(SURF.tee, 7), "Hole 7's tee is in the way");
  assert.equal(playWhy(SURF.fairway, 18), "Hole 18's fairway is in the way");
  assert.equal(playWhy(SURF.green, 1), "Hole 1's green is in the way");
  assert.equal(playWhy(SURF.bunker, 9), "Hole 9's bunker is in the way");
  assert.equal(playWhy(SURF.water, 2), "Hole 2's water hazard is in the way");
  assert.equal(playWhy(SURF.fairway, 0), 'A fairway is in the way');
  // a strip of each ground a street may cross, across a street at y 100..: none refuses
  for (const s of [SURF.none, SURF.rough, SURF.longGrass, SURF.fescue, SURF.waste]) {
    const g = makeGrid(100, 100, 40, 40);
    fillPolygon(g, rect(100, 100, 120, 120), s, 5, 0);
    assert.equal(legsOnPlay(g, [leg(95, 110, 125, 110)], hw), null, `surface ${s}`);
  }
  for (const s of [SURF.tee, SURF.fairway, SURF.green, SURF.bunker, SURF.water]) {
    const g = makeGrid(100, 100, 40, 40);
    fillPolygon(g, rect(100, 100, 120, 120), s, 5, 0);
    assert.equal(legsOnPlay(g, [leg(95, 110, 125, 110)], hw)?.surf, s, `surface ${s}`);
  }
});

test('a cell of playing surface at the corridor edge counts, a hair of overlap does not', () => {
  const g = makeGrid(100, 100, 40, 40);
  fillPolygon(g, rect(110, 100, 110.5, 120), SURF.fairway, 6, 0); // one cell wide (0.5 tile), y 100..120
  const x = 110 - hw; // the corridor's east edge on the strip's west edge
  assert.equal(legsOnPlay(g, [leg(x, 100, x, 120)], hw), null);
  assert.equal(legsOnPlay(g, [leg(x + CELL_T / 2, 100, x + CELL_T / 2, 120)], hw)?.why, "Hole 6's fairway is in the way");
  assert.equal(legsOnPlay(g, [leg(x + 0.005, 100, x + 0.005, 120)], hw), null, 'a hair (under the 0.01 tile the land rule also lets by)');
});
