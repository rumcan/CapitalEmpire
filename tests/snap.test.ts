// Road-tool snapping: npm test (headless; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type PieceSel } from '../src/game/network';
import { checkLegs, replaceCuts, snapPoint, MIN_SEP, MIN_ANGLE } from '../src/game/snap';

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

test('Replace: an arterial along a street is refused, but with the street skipped it is clear, and the cut spans the route', () => {
  const n = net(leg(100, 100, 200, 100)), seg = [...n.segs][0]!, r = [leg(120, 100, 180, 100)];
  assert.notEqual(checkLegs(n, r, null, null, CLASS.arterial), '');
  const cuts: PieceSel[] = replaceCuts(n, r, CLASS.arterial);
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]!.seg, seg);
  assert.ok(cuts[0]!.p0.x <= 120 && cuts[0]!.p1.x >= 180);
  assert.equal(checkLegs(n, r, null, null, CLASS.arterial, new Set([seg])), '');
});

test('Replace: a route crossing a street at right angles keeps it (the crossing is a junction)', () => {
  const n = net(leg(100, 100, 200, 100));
  assert.deepEqual(replaceCuts(n, [leg(150, 60, 150, 140)], CLASS.street), []);
});

test('Replace: a route parallel 2 tiles off a street (inside its corridor) cuts the street', () => {
  const n = net(leg(100, 100, 200, 100)), seg = [...n.segs][0]!;
  const cuts = replaceCuts(n, [leg(100, 102, 200, 102)], CLASS.street);
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]!.seg, seg);
});

test('Replace: a route that starts at a street end node and turns 90 degrees keeps that street', () => {
  const n = net(leg(100, 100, 100, 200));
  assert.deepEqual(replaceCuts(n, [leg(100, 100, 180, 100)], CLASS.street), []);
});

test('Replace: an arterial over the middle of a street joins the street at both ends (the cut stops at the route ends)', () => {
  const n = net(leg(100, 100, 200, 100)), r = [leg(130, 100, 170, 100)];
  const cuts = replaceCuts(n, r, CLASS.arterial);
  assert.equal(cuts.length, 1);
  assert.deepEqual([cuts[0]!.p0, cuts[0]!.p1], [{ x: 130, y: 100 }, { x: 170, y: 100 }]);
  for (const c of cuts) n.removePiece(c, false);
  n.addLegs(r, CLASS.arterial, 0);
  for (const x of [130, 170]) assert.equal(n.nodeAt({ x, y: 100 })?.segs.length, 2, `street and arterial meet at x ${x}`);
  assert.deepEqual([...n.segs].map(s => s.cls.id).sort(), ['arterial', 'street', 'street']);
});

test('Replace: a route through an existing crossing keeps the crossing road (it joins the junction)', () => {
  // a W-E street with a N-S street crossing it at (150,100); the new road runs N-S over the old N-S street, through the crossing
  const n = net(leg(100, 100, 200, 100), leg(150, 40, 150, 160));
  const cuts = replaceCuts(n, [leg(150, 40, 150, 160)], CLASS.arterial);
  assert.ok(cuts.length >= 1 && cuts.every(c => c.seg.a.x === 150 && c.seg.b.x === 150), `only the N-S pieces are cut: ${cuts.map(c => `${c.seg.a.x},${c.seg.a.y}-${c.seg.b.x},${c.seg.b.y}`).join(' ')}`);
});

test('a leg over an existing junction at right angles joins it (no click needed there); with Replace the old road along it is cut and the route is clear', () => {
  const n = net(leg(100, 100, 200, 100), leg(150, 40, 150, 160));
  assert.equal(checkLegs(n, [leg(150, 60, 150, 140)], null, null, CLASS.street), 'A road is already there: bulldoze it first');
  const r = [leg(100, 104, 200, 104)];
  // a road 4 tiles off the W-E street, over nothing: beside it inside the corridor, refused; Replace cuts the W-E pieces and keeps the N-S street
  const cuts = replaceCuts(n, [leg(100, 100, 200, 100)], CLASS.six);
  assert.ok(cuts.length === 2 && cuts.every(c => c.seg.a.y === 100 && c.seg.b.y === 100));
  assert.equal(checkLegs(n, [leg(100, 100, 200, 100)], null, null, CLASS.six, new Set(cuts.map(c => c.seg))), '');
  assert.notEqual(checkLegs(n, r, null, null, CLASS.street), '');
});

/** a four-arm street crossing at (150,100), arms 50 tiles, made a 3-lane roundabout (rb 15) */
function ringNet() {
  const n = net(leg(100, 100, 200, 100), leg(150, 50, 150, 150));
  const c = n.nodeAt({ x: 150, y: 100 })!; n.setNodeType(c, 'roundabout', false); n.setNodeFlags(c, false, false, 3);
  return { n, c };
}

test('a roundabout: any point in its circle snaps to its node (a road joins a ring at its centre only)', () => {
  const { n, c } = ringNet();
  for (const p of [{ x: 150, y: 90 }, { x: 160, y: 108 }, { x: 140, y: 100 }]) { const s = snapPoint(n, p, 2); assert.equal(s.node, c, `${p.x},${p.y}`); near(s.p.x, 150); near(s.p.y, 100); }
  // outside the circle and its walk: the arm, as before
  assert.equal(snapPoint(n, { x: 150, y: 125 }, 2).kind, 'road');
});

test('a roundabout: a leg into its circle that does not end on its node is refused; one ending on it is judged as any join', () => {
  const { n } = ringNet();
  assert.equal(checkLegs(n, [leg(185, 60, 160, 92)], null, null, CLASS.street), 'Roads join a roundabout at its centre');
  assert.equal(checkLegs(n, [leg(110, 160, 190, 160)], null, null, CLASS.street), '');
  assert.notEqual(checkLegs(n, [leg(150, 100, 190, 60)], null, null, CLASS.street), 'Roads join a roundabout at its centre');
});

test('Replace: a route ending 1 tile short of a junction cuts the old road exactly to the route end (no gap)', () => {
  const n = net(leg(100, 100, 200, 100), leg(200, 60, 200, 140)), r = [leg(130, 100, 199, 100)];
  const cuts = replaceCuts(n, r, CLASS.arterial), c = cuts.find(x => x.seg.a.y === 100 && x.seg.b.y === 100)!;
  assert.deepEqual([c.p0, c.p1].map(p => p.x).sort((a, b) => a - b), [130, 199]);
});

test('Replace: an arterial over a ring arm into the ring centre cuts that arm only (the arm straight on beyond the ring is kept)', () => {
  const { n, c } = ringNet();
  const cuts = replaceCuts(n, [leg(150, 50, 150, 100)], CLASS.arterial);
  assert.equal(cuts.length, 1, cuts.map(x => `${x.seg.a.x},${x.seg.a.y}-${x.seg.b.x},${x.seg.b.y}`).join(' '));
  assert.ok([cuts[0]!.seg.a, cuts[0]!.seg.b].some(p => p.y === 50) && [cuts[0]!.seg.a, cuts[0]!.seg.b].includes(c));
});
