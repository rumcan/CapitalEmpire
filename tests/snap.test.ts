// Road-tool snapping: npm test (headless; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { checkLegs, snapPoint, MIN_SEP, MIN_ANGLE } from '../src/game/snap';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
/** a network with the given legs laid down (no rebuild: the graph is all the snapping reads) */
function net(...legs: Leg[]) { const n = new RoadNetwork(); n.addLegs(legs, CLASS.street, 0, false); return n; }

test('constants', () => {
  assert.equal(MIN_SEP, 8);
  assert.equal(MIN_ANGLE, 30);
});

test('snapping to a dead end within the radius gives its exact point', () => {
  const n = net(leg(10.3, 10.2, 30.3, 10.2));
  const s = snapPoint(n, { x: 30.9, y: 10.6 }, 2);
  assert.equal(s.kind, 'end');
  near(s.p.x, 30.3); near(s.p.y, 10.2);
  assert.ok(s.node);
});

test('snapping near a junction gives the node', () => {
  const n = net(leg(40, 50, 60, 50), leg(50, 50, 50, 70)); // a T: the node sits at (50, 50)
  const s = snapPoint(n, { x: 51, y: 50.5 }, 2);
  assert.equal(s.kind, 'node');
  near(s.p.x, 50); near(s.p.y, 50);
});

test('snapping on a road away from nodes gives the projection', () => {
  const n = net(leg(10, 100, 90, 100));
  const s = snapPoint(n, { x: 50.3, y: 101.2 }, 2);
  assert.equal(s.kind, 'road');
  near(s.p.x, 50.3); near(s.p.y, 100);
  assert.equal(s.seg, [...n.segs][0]);
});

test('a road point within 8 tiles of an end snaps to that end', () => {
  const n = net(leg(10, 100, 90, 100));
  const s = snapPoint(n, { x: 14, y: 101 }, 2);
  assert.equal(s.kind, 'end');
  near(s.p.x, 10); near(s.p.y, 100);
});

test('a point away from roads and nodes snaps to the tile grid', () => {
  const n = net(leg(10, 100, 90, 100));
  const s = snapPoint(n, { x: 30.4, y: 40.6 }, 2);
  assert.equal(s.kind, 'grid');
  near(s.p.x, 30); near(s.p.y, 41);
});

test('a leg crossing a road 5 tiles from a junction is refused; 12 tiles away is fine', () => {
  const n = net(leg(0, 100, 200, 100), leg(100, 100, 100, 200)); // a T at (100, 100); a gravel leg clears the arms' corridors
  assert.match(checkLegs(n, [leg(105, 90, 105, 110)], null, null, CLASS.gravel), /Too close to a junction/);
  assert.equal(checkLegs(n, [leg(112, 90, 112, 110)], null, null, CLASS.gravel), '');
});

test('a 20 degree join with an existing road is refused; 90 degrees is fine', () => {
  const n = net(leg(0, 100, 100, 100)); // a dead end at (100, 100)
  const r = (deg: number) => { const t = deg * Math.PI / 180; return leg(100, 100, 100 - 60 * Math.cos(t), 100 + 60 * Math.sin(t)); };
  assert.match(checkLegs(n, [r(20)], null, null), /Too sharp a join/);
  assert.equal(checkLegs(n, [r(90)], null, null), '');
});

test('a leg running along an existing road is refused (bulldoze it first)', () => {
  const n = net(leg(0, 100, 100, 100));
  assert.equal(checkLegs(n, [leg(100, 100, 20, 100)], null, null), 'A road is already there: bulldoze it first');
  assert.equal(checkLegs(n, [leg(20, 100, 80, 100)], null, null), 'A road is already there: bulldoze it first');
  assert.equal(checkLegs(n, [leg(0, 100, 100, 100)], null, null), 'A road is already there: bulldoze it first');
});

test('a run along a road of under 0.5 tiles is not a road already there (its end is a junction, too close to the node)', () => {
  const n = net(leg(0, 100, 100, 100));
  assert.doesNotMatch(checkLegs(n, [leg(100, 100, 99.8, 100)], null, null), /already there/);
  assert.equal(checkLegs(n, [leg(60, 100, 60.3, 100)], null, null), '');
});

test('a leg beside a road within the two corridors is refused; 8 tiles off is fine', () => {
  const n = net(leg(0, 100, 100, 100));
  assert.equal(checkLegs(n, [leg(20, 102, 80, 102)], null, null), 'Too close to another road');
  assert.equal(checkLegs(n, [leg(20, 108, 80, 108)], null, null), '');
});

test('a leg joining a road at a point at 30 degrees or more is fine; a shallow join is refused', () => {
  const n = net(leg(0, 100, 100, 100));
  assert.equal(checkLegs(n, [leg(50, 100, 50, 150)], null, null), '');
  assert.equal(checkLegs(n, [leg(50, 90, 50, 110)], null, null), ''); // a 90 degree crossing
  const a = 20 * Math.PI / 180;
  assert.equal(checkLegs(n, [leg(50, 100, 50 + 60 * Math.cos(a), 100 - 60 * Math.sin(a))], null, null), 'Too close to another road');
  assert.equal(checkLegs(n, [leg(50, 90, 50 + 60 * Math.cos(a), 90 + 60 * Math.sin(a))], null, null), 'Too close to another road');
});

test('a click on an arterial kerb (4 tiles off its centre line) snaps to the centre line: a T meets the road, not its edge', () => {
  const n = new RoadNetwork(); n.addLegs([leg(0, 100, 200, 100)], CLASS.arterial, 0, false);
  const s = snapPoint(n, { x: 100, y: 104.4 }, 2);
  assert.equal(s.kind, 'road');
  near(s.p.x, 100); near(s.p.y, 100);
  // beyond the verge plus the pointer radius it is the grid
  assert.equal(snapPoint(n, { x: 100, y: 108 }, 2).kind, 'grid');
});
