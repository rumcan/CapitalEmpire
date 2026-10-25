// T124 Roads stay off the course (the owner, 2026-10-25: "you should not be allowed to paint normal roads on the course only paths and
// drives"): the road tool's checkLegs refuses a town road whose corridor reaches into the course land, with the reason; the course's cart
// paths and drives stay allowed there; a town road may end on the land's edge where a drive meets it; the roads already on the land stay but
// are not extended onto it; the bulldozer still takes them up. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { checkLegs, snapPoint, type Snap } from '../src/game/snap';
import { COURSE_LAND_MSG, legsOnLand, pointInLand } from '../src/game/golf/parcels';
import type { Rect } from '../src/game/golf/mode';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the course land: the course (x 100..180, y 100..180) and a block bought on its east side (x 180..220) */
const COURSE: Rect = [100, 100, 80, 80], BLOCK: Rect = [180, 100, 40, 80], LAND: Rect[] = [COURSE, BLOCK];
const TOWN: RoadClass[] = [CLASS.gravel!, CLASS.lane!, CLASS.street!, CLASS.road!, CLASS.avenue!, CLASS.boulevard!];
const COURSE_ROADS: RoadClass[] = [CLASS['cart-walk']!, CLASS['cart-dirt']!, CLASS['cart-slab']!, CLASS.cart!, CLASS['drive-gravel']!, CLASS.drive!, CLASS['drive-avenue']!];
/** a committed network of the given legs per class */
function netOf(...parts: [RoadClass, Leg[]][]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  for (const [cls, legs] of parts) e.addLegs(legs, cls, 0);
  e.commit(true);
  return e.net;
}
/** the road tool's snaps at the route's ends (radius 2 tiles, the town grid or the course half grid) */
const snaps = (net: RoadNetwork, legs: Leg[], step = 1): [Snap, Snap] => [snapPoint(net, legs[0]!.a, 2, step), snapPoint(net, legs[legs.length - 1]!.b, 2, step)];
/** checkLegs as the road tool calls it on the course land */
function why(net: RoadNetwork, legs: Leg[], cls: RoadClass, land: readonly Rect[] = LAND): string {
  const [from, to] = snaps(net, legs, cls.noCars ? 0.5 : 1);
  return checkLegs(net, legs, from, to, cls, undefined, land);
}

test('a town road in the course land, or across it, is refused with the reason (every town class, the course and a bought block)', () => {
  const empty = new RoadNetwork();
  assert.equal(COURSE_LAND_MSG, 'Course land: build cart paths and drives with Course › Paths & drives');
  for (const cls of TOWN) {
    assert.equal(why(empty, [leg(120, 140, 160, 140)], cls), COURSE_LAND_MSG, `${cls.id}: inside the course`);
    assert.equal(why(empty, [leg(60, 140, 240, 140)], cls), COURSE_LAND_MSG, `${cls.id}: across the course and the block`);
    assert.equal(why(empty, [leg(190, 120, 210, 120)], cls), COURSE_LAND_MSG, `${cls.id}: inside the bought block`);
    assert.equal(why(empty, [leg(60, 60, 140, 60), leg(140, 60, 140, 120)], cls), COURSE_LAND_MSG, `${cls.id}: a bend into the land`);
  }
  // the seam between the course and the block is land too (a road along it lies on both)
  assert.equal(why(empty, [leg(180, 60, 180, 220)], CLASS.street!), COURSE_LAND_MSG);
  // the same routes without course land (no golf game): the rule is off
  assert.equal(why(empty, [leg(120, 140, 160, 140)], CLASS.street!, []), '');
  assert.equal(why(empty, [leg(60, 140, 240, 140)], CLASS.street!, []), '');
});

test('a town road beside the land keeps its corridor outside: touching the edge is fine, reaching over it is refused', () => {
  const empty = new RoadNetwork(), s = CLASS.street!, hw = s.h + s.walk;
  // along the course's north edge (y 100): the corridor's edge on the boundary is off the land, a hair closer is on it
  assert.equal(why(empty, [leg(60, 100 - hw, 240, 100 - hw)], s), '');
  assert.equal(why(empty, [leg(60, 100 - hw + 0.5, 240, 100 - hw + 0.5)], s), COURSE_LAND_MSG);
  // the corridor just past a corner, diagonally: off; through the corner: on
  assert.equal(why(empty, [leg(60, 60, 100 - hw, 100 - hw)], s), '');
  assert.equal(legsOnLand(LAND, [leg(60, 60, 100, 100)], hw), false, 'square on the corner: its end face only touches it');
  assert.equal(legsOnLand(LAND, [leg(60, 60, 104, 104)], hw), true);
});

test('course drives and cart paths are allowed on the same land, the cart paths on the half grid', () => {
  const empty = new RoadNetwork();
  for (const cls of COURSE_ROADS) {
    assert.equal(why(empty, [leg(120, 140, 160, 140)], cls), '', `${cls.id}: inside the course`);
    assert.equal(why(empty, [leg(60, 140, 240, 140)], cls), '', `${cls.id}: across the course and the block`);
  }
  assert.equal(why(empty, [leg(120.5, 130.5, 150.5, 130.5), leg(150.5, 130.5, 150.5, 160)], CLASS['cart-dirt']!), '');
});

test('a town road ending on the land\'s edge joins a course drive there, and is built', () => {
  // a drive from the middle of the course out to its west edge (x 100); a street from the town meets its end square on the boundary
  const e = new NetEditor(netOf([CLASS['drive-gravel']!, [leg(140, 140, 100, 140)]]));
  const street = [leg(60, 140, 100, 140)], [from, to] = snaps(e.net, street);
  assert.equal(to.kind, 'end'); assert.ok(to.node);
  assert.equal(checkLegs(e.net, street, from, to, CLASS.street!, undefined, LAND), '');
  e.addLegs(street, CLASS.street!, 0); e.commit(true);
  const n = e.net.nodeAt({ x: 100, y: 140 });
  assert.ok(n, 'a node on the boundary');
  assert.deepEqual(n.segs.map(q => q.cls.id).sort(), ['drive-gravel', 'street']);
  // the street did not go on past the edge: it ends at the drive
  assert.ok([...e.net.segs].every(q => q.cls.id !== 'street' || Math.max(q.a.x, q.b.x) <= 100));
  // the junction's corner seen from the town: an L that runs along the edge to the drive is refused (its corridor lies half on the land)
  const along = [leg(100, 60, 100, 140)];
  assert.equal(checkLegs(e.net, along, ...snaps(e.net, along), CLASS.street!, undefined, LAND), COURSE_LAND_MSG);
  // a start on the edge is fine, inside the land it is not (the road tool refuses that first click)
  assert.equal(pointInLand(LAND, 100, 140), false);
  assert.equal(pointInLand(LAND, 100.5, 140), true);
  assert.equal(pointInLand(LAND, 180, 140), true, 'the seam between the course and a bought block is inside the land');
});

test('a town road beside the land joins a drive at the edge from the drive\'s end; from the road side a sliver jog keeps its own reason', () => {
  // the town's gravel road runs beside the course (x 92); the drive ends on the edge (100, 140)
  const net = netOf([CLASS.gravel!, [leg(92, 100, 92, 180)]], [CLASS['drive-gravel']!, [leg(130, 140, 100, 140)]]);
  // from the drive's end to the road: the snap meets the road square, the street is built
  const out = [leg(100, 140, 92, 140)], [from, to] = snaps(net, out);
  assert.equal(from.kind, 'end'); assert.equal(to.kind, 'road');
  assert.equal(checkLegs(net, out, from, to, CLASS.street!, undefined, LAND), '');
  // from a point on the road a little off the drive's line: the route's jog at the edge (a few hundredths or tenths of a tile) is refused by
  // the rules as before T124 (not "Course land": a leg under 2 tiles is the split rule's)
  for (const y of [140.03, 140.4]) {
    const jog = [leg(92, y, 100, y), leg(100, y, 100, 140)];
    const r = checkLegs(net, jog, snapPoint(net, jog[0]!.a, 2), snapPoint(net, { x: 100, y: 140 }, 2), CLASS.street!, undefined, LAND);
    assert.notEqual(r, '', `jog to y ${y}`); assert.notEqual(r, COURSE_LAND_MSG, `jog to y ${y}: ${r}`);
  }
});

test('a road already crossing the land stays, but is not extended further onto it', () => {
  // an old save: a street from the town (x 60) into the course, a dead end at (140, 140); the county road across the block
  const e = new NetEditor(netOf([CLASS.street!, [leg(60, 140, 140, 140)]], [CLASS.road!, [leg(200, 60, 200, 240)]]));
  const before = [...e.net.segs].length;
  // on from its dead end inside the land, or a branch off it there: refused
  assert.equal(why(e.net, [leg(140, 140, 170, 140)], CLASS.street!), COURSE_LAND_MSG);
  assert.equal(why(e.net, [leg(120, 140, 120, 170)], CLASS.street!), COURSE_LAND_MSG);
  // the county road neither goes on nor gets a side road on the land
  assert.equal(why(e.net, [leg(200, 160, 160, 160)], CLASS.street!), COURSE_LAND_MSG);
  assert.equal(why(e.net, [leg(200, 240, 200, 280)], CLASS.road!), ''); // off the land, outside: fine
  // a branch off the old street outside the land is fine; a course drive off it on the land too
  assert.equal(why(e.net, [leg(70, 140, 70, 180)], CLASS.street!), '');
  assert.equal(why(e.net, [leg(130, 140, 130, 170)], CLASS['drive-gravel']!), '');
  // nothing was taken away: the roads on the land stay as they are
  assert.equal([...e.net.segs].length, before);
  assert.ok([...e.net.segs].some(q => q.cls.id === 'street' && Math.max(q.a.x, q.b.x) === 140));
});

test('the bulldozer still takes up a town road on the land', () => {
  const e = new NetEditor(netOf([CLASS.street!, [leg(60, 140, 160, 140)]]));
  const p = e.net.pieceNear({ x: 150, y: 140 });
  assert.ok(p, 'a piece of the street on the course');
  e.removePiece(p); e.commit(true);
  assert.ok(![...e.net.segs].some(q => Math.min(q.a.x, q.b.x) < 150 && Math.max(q.a.x, q.b.x) > 150), 'the piece on the land is gone');
  assert.ok([...e.net.segs].some(q => q.cls.id === 'street' && Math.min(q.a.x, q.b.x) === 60), 'the part off the land stays');
});
