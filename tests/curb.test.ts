// The on-street parking's headless tests (PARKING.md section 2): a curb's run, kerb and bays on a straight arterial (two lanes each way) between two
// cross streets; curbCheck's reasons (a street has one lane each way, a short run, an overlap, a bogus run, one-way traffic, a toll); and the lane graph
// with the kerb lane dropped (setCurbs: the parked dseg has one lane, the other way keeps two, the graph checks clean, and the lane comes back).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, keyOf, type Leg, type RoadClass, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, checkGraph, type DSeg } from '../src/game/sim/lanes';
import { curbCheck, curbFrom, resolveCurb, type CurbDef } from '../src/game/event/curb';
import { CURB_BAY, CURB_END, CURB_MIN_BAYS } from '../src/game/event/config';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the main road's centre line (tiles): y = ROAD_Y, from x 200 to 800 */
const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a network: the main road of class cls from x 200 to 800, and a street across it at each x in xs (junctions where they meet), committed */
function roadNet(cls: RoadClass = CLASS.arterial, xs: number[] = [400, 600]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], cls, 0);
  e.addLegs(xs.map(x => leg(x, ROAD_Y - 100, x, ROAD_Y + 100)), CLASS.street, 0);
  e.commit();
  return e.net;
}
/** the directed seg key from (ax, ay) to (bx, by), as lanes.ts keys it */
const dk = (ax: number, ay: number, bx: number, by: number) => `${keyOf({ x: ax, y: ay })}>${keyOf({ x: bx, y: by })}`;
/** the directed seg with key k */
const dseg = (g: LaneGraph, k: string): DSeg => g.dsegs.find((d): d is DSeg => !!d && d.key === k)!;
/** the main road's seg holding x */
const segAt = (n: RoadNetwork, x: number): Seg => [...n.segs].find(s => s.a.y === ROAD_Y && s.b.y === ROAD_Y && Math.min(s.a.x, s.b.x) <= x && x <= Math.max(s.a.x, s.b.x))!;
/** the run from the cross street at x 400 to the one at x 600 (east, traffic from a to b) */
const RUN: CurbDef = { id: 1, ax: 400, ay: ROAD_Y, bx: 600, by: ROAD_Y };
/** the kerb lane's offset of the arterial's class (its outermost lane centre, tiles) */
const KERB = CLASS.arterial.laneCentres[CLASS.arterial.laneCentres.length - 1]!;

test('curb: on the right of a to b the traffic runs a to b, on the left b to a; the bays sit on the kerb lane, 3 tiles apart, 4 clear at each end', () => {
  const n = roadNet(), seg = segAt(n, 500);
  const right = curbFrom(n, seg, { x: 500, y: ROAD_Y + 1 }), left = curbFrom(n, seg, { x: 500, y: ROAD_Y - 1 });
  assert.ok(right && left, 'both sides give a run');
  assert.deepEqual([right.ax, right.ay, right.bx, right.by], [400, ROAD_Y, 600, ROAD_Y], 'right of a to b: east, from the 400 street to the 600 one');
  assert.deepEqual([left.ax, left.ay, left.bx, left.by], [600, ROAD_Y, 400, ROAD_Y], 'left: west');
  const c = resolveCurb(n, { ...right, id: 1 });
  assert.ok(c, 'a resolved curb');
  assert.equal(c.segs.length, 1, 'one seg between the two streets');
  assert.deepEqual(c.keys, [dk(400, ROAD_Y, 600, ROAD_Y)], 'the key of every seg of the run, a to b');
  assert.equal(c.seg, seg, 'the entrance is on that seg');
  assert.ok(Math.abs(c.entrance.x - 500) < 1e-9 && Math.abs(c.entrance.y - ROAD_Y) < 1e-9, 'the entrance is the middle of the run, on the centre line');
  assert.ok(Math.abs(c.pv.x) < 1e-9 && Math.abs(c.pv.y - 1) < 1e-9, 'pv points to the kerb (+y, the right of east)');
  assert.ok(c.bays.length >= CURB_MIN_BAYS, `${c.bays.length} bays`);
  assert.ok(Math.abs(c.bays[0]!.x - (400 + CURB_END + CURB_BAY / 2)) < 1e-9, 'the first bay 4 + 1.5 tiles from the 400 street');
  assert.ok(c.bays[c.bays.length - 1]!.x <= 600 - CURB_END - CURB_BAY / 2 + 1e-9, 'the last bay clears the 600 street by CURB_END');
  for (let k = 0; k + 1 < c.bays.length; k++) assert.ok(Math.abs(c.bays[k + 1]!.x - c.bays[k]!.x - CURB_BAY) < 1e-9, `bays ${k} and ${k + 1} ${CURB_BAY} tiles apart`);
  for (const b of c.bays) {
    assert.ok(Math.abs(b.y - (ROAD_Y + KERB)) < 1e-9, `bay at (${b.x}, ${b.y}) on the kerb lane (${KERB} tiles from the centre line)`);
    assert.equal(b.dir, 0, 'facing east, along the traffic');
    assert.ok(Math.abs(b.hx - 1) < 1e-9 && Math.abs(b.hy) < 1e-9 && Math.abs(b.tx - 1) < 1e-9 && Math.abs(b.ty) < 1e-9, 'heading and row along the traffic');
  }
});

test('curbCheck: a two-lane arterial run is valid; a street (one lane each way) needs 2 lanes; a short run is too short', () => {
  assert.equal(curbCheck(roadNet(), RUN), '', 'a valid run on the arterial');
  assert.equal(curbCheck(roadNet(CLASS.street), RUN), 'too narrow: needs 2 lanes this way or a wide shoulder', 'a street has one lane each way');
  // a road (one lane each way, a 2.4 m shoulder) parks on its shoulder and keeps its lane
  assert.equal(curbCheck(roadNet(CLASS.road), RUN), '', 'a road parks on its shoulder');
  const c = resolveCurb(roadNet(CLASS.road), RUN)!;
  assert.equal(c.drop, false); assert.ok(c.bays.every(b => Math.abs(Math.abs(b.y - ROAD_Y) - (CLASS.road.h - 0.6)) < 1e-9), 'the bays stand 0.6 tiles inside the road edge');
  assert.equal(resolveCurb(roadNet(), RUN)!.drop, true, 'the arterial drops its kerb lane');
  // 16 tiles between the streets at 300 and 316: (16 - 2 * CURB_END - CURB_BAY) / CURB_BAY + 1 = 2 bays
  assert.equal(curbCheck(roadNet(CLASS.arterial, [300, 316]), { id: 1, ax: 300, ay: ROAD_Y, bx: 316, by: ROAD_Y }), `too short for ${CURB_MIN_BAYS} bays`);
});

test('curbCheck: a run that is not straight between two junctions is bogus; an overlapping run has parking already; the other way and the same def do not', () => {
  const n = roadNet();
  assert.equal(curbCheck(n, { id: 1, ax: 1, ay: 1, bx: 2, by: 2 }), 'pick a straight stretch of road between two junctions', 'no nodes');
  assert.equal(curbCheck(n, { id: 1, ax: 400, ay: ROAD_Y, bx: 800, by: ROAD_Y }), 'pick a straight stretch of road between two junctions', 'past a junction');
  assert.equal(curbCheck(n, { ...RUN, id: 2 }, new Set(), [RUN]), 'it already has parking', 'the same run, another id');
  assert.equal(curbCheck(n, RUN, new Set(), [RUN]), '', 'the same id is not another run');
  assert.equal(curbCheck(n, { id: 3, ax: 600, ay: ROAD_Y, bx: 400, by: ROAD_Y }, new Set(), [RUN]), '', 'the other way has its own kerb');
  assert.equal(curbCheck(n, RUN, new Set([dk(400, ROAD_Y, 600, ROAD_Y)])), 'a toll plaza is on it', 'a toll key on the run');
});

test('curbCheck: a one-way street takes parking only with its traffic', () => {
  const n = roadNet(CLASS['street.ow']!, [400, 600]);
  assert.equal(curbCheck(n, RUN), '', 'east, with the one-way traffic');
  assert.equal(curbCheck(n, { id: 4, ax: 600, ay: ROAD_Y, bx: 400, by: ROAD_Y }), 'that way is against the one-way traffic', 'west, against it');
});

test('lane graph: setCurbs drops the kerb lane of the parked dseg (2 lanes to 1), not the other way; the graph checks clean; the same keys change nothing; [] brings it back', () => {
  const n = roadNet(), g = new LaneGraph();
  g.update(n);
  const c = resolveCurb(n, RUN)!, key = c.keys[0]!, opp = key.split('>').reverse().join('>');
  assert.equal(dseg(g, key).lanes.length, 2, 'two lanes east before the curb');
  assert.equal(g.setCurbs(c.keys, n), true, 'the kerb changed');
  assert.equal(dseg(g, key).lanes.length, 1, 'one lane east: the kerb lane is parking');
  assert.equal(dseg(g, opp).lanes.length, 2, 'the west way keeps both lanes');
  assert.deepEqual(checkGraph(g), [], 'the graph checks clean');
  const e = new NetEditor(n);
  e.addLegs([leg(100, 100, 150, 100)], CLASS.street, 0); e.commit(); g.update(n);
  assert.equal(dseg(g, key).lanes.length, 1, 'an unrelated network batch keeps the curb');
  assert.equal(g.setCurbs(c.keys, n), false, 'the same keys change nothing');
  assert.equal(g.setCurbs([], n), true, 'no curbs: the kerb lane comes back');
  assert.equal(dseg(g, key).lanes.length, 2, 'two lanes east again');
  assert.deepEqual(checkGraph(g), [], 'the graph checks clean');
});
