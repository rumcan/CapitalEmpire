// T228 (#661): the concept's streets. Zebra crossings only on the town junctions' arms that have pavements; white edge lines on the town's kerbed
// roads, broken at junctions (past the corners and the zebras), at driveways and at bus stops; the car parks' cars (bays filled to the count, in
// a fixed order, only the car parks on screen looked at) and their paints (deterministic, packed and read back as the shader does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, CLASSES, EDGE_IN, RoadNetwork, edgeLines, type Fx, type Leg, type Node, type Route } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { DRIVE_CUT_REACH, STOP_CUT_HALF, driveCuts, stopCut } from '../src/game/street-marks';
import { CAR_PAINT, PAINTS, bodyOf, hash3, packAlpha, paintAt, paintCode, paintOf, unpackAlpha } from '../src/game/car-paint';
import { baysBox, boxesMeet, workerBay, workerShown } from '../src/game/parked-cars';
import { LIBRARY } from '../src/game/library';
import type { LotPatch } from '../src/game/ground-protocol';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
type Inner = { routeFeatures(r: Route): Fx; nodeFeatures(n: Node): Fx | null };
/** a network of the given legs (class id each), rebuilt */
function net(legs: [Leg, string][]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  for (const [l, id] of legs) e.addLegs([l], CLASS[id]!, 0);
  e.commit(); e.net.rebuild(true); return e.net;
}
/** a crossroads at (100, 100): an east-west road of class a and a north-south one of class b, 60 tiles each way */
const plus = (a: string, b = a) => net([[leg(40, 100, 160, 100), a], [leg(100, 40, 100, 160), b]]);
const zebras = (n: RoadNetwork, x = 100, y = 100) => ((n as unknown as Inner).nodeFeatures(n.nodeAt({ x, y })!)?.zebra.length ?? 0);
const edgesOf = (n: RoadNetwork) => [...n.routes].flatMap(r => (n as unknown as Inner).routeFeatures(r).lines.filter(l => l.edge));
const town = (id: string) => ['small', 'medium', 'large'].includes(CLASS[id]!.family);

test('crossings: a class has zebras only where it has pavements and is a town road (none rural, on course drives or cart paths)', () => {
  for (const c of CLASSES) if (c.crosswalk) { assert.equal(c.walkTex, 'slabs', `${c.id}: a crossing needs pavements`); assert.ok(town(c.id), `${c.id}: a town road`); }
  for (const id of ['road', 'divided', 'gravel', 'drive', 'drive.tr', 'drive-avenue', 'cart', 'cart-slab', 'cart-dirt', 'cart-walk']) assert.equal(CLASS[id]!.crosswalk, false, id);
  for (const id of ['street', 'street.tr', 'street.ow', 'avenue', 'arterial', 'arterial.tl', 'boulevard', 'six', 'grand']) assert.equal(CLASS[id]!.crosswalk, true, id);
});

test('crossings: a crossroads of streets has a zebra on every arm, set back from the junction; rural roads, gravel, drives and cart paths none', () => {
  const s = plus('street'), n = s.nodeAt({ x: 100, y: 100 })!;
  assert.equal(zebras(s), 4);
  for (const a of n.arms) { assert.ok(a.xw >= a.reachEdge + 0.4, `set back: xw ${a.xw} past the crossing road's edge ${a.reachEdge}`); }
  for (const id of ['road', 'gravel', 'drive', 'cart', 'divided']) assert.equal(zebras(plus(id)), 0, id);
  // a street across a rural road: zebras on the street's two arms only (the road has verges, no pavements)
  const m = plus('street', 'road'), arms = m.nodeAt({ x: 100, y: 100 })!.arms;
  assert.equal(zebras(m), 2);
  for (const a of arms) assert.equal(a.xw >= 0, a.cls.id === 'street', a.cls.id);
});

test('edge lines: the town kerbed roads from the street up have them; the lane, rural roads, gravel, course drives and cart paths do not', () => {
  for (const id of ['street', 'street.tr', 'street.ow', 'street.ow.tr', 'avenue', 'avenue.gr', 'arterial', 'arterial.tl', 'arterial.ow', 'boulevard', 'six', 'six.ow', 'grand']) assert.ok(edgeLines(CLASS[id]!), id);
  for (const id of ['lane', 'road', 'divided', 'gravel', 'drive', 'drive.tr', 'drive-avenue', 'drive-gravel', 'cart', 'cart-slab', 'cart-dirt', 'cart-walk']) assert.ok(!edgeLines(CLASS[id]!), id);
  // a street: one solid white line inside each kerb, EDGE_IN in; a rural road none (its yellow shoulder lines stay)
  const s = edgesOf(net([[leg(0, 0, 60, 0), 'street']]));
  assert.deepEqual(s.map(l => l.offset).sort((a, b) => a - b), [-(CLASS.street!.h - EDGE_IN), CLASS.street!.h - EDGE_IN]);
  for (const l of s) { assert.equal(l.dash, null); assert.match(l.color, /^rgba\(238,238,230/); }
  assert.equal(edgesOf(net([[leg(0, 0, 60, 0), 'road']])).length, 0);
  assert.equal(edgesOf(net([[leg(0, 0, 60, 0), 'lane']])).length, 0);
});

test('edge lines are broken at junctions: each starts past its arm\'s zebra and corner fillets, and none crosses the junction', () => {
  for (const [a, b] of [['street', 'street'], ['avenue', 'street'], ['arterial', 'street'], ['street', 'road']] as const) {
    const s = plus(a, b), n = s.nodeAt({ x: 100, y: 100 })!;
    for (const r of s.routes) {
      const f = (s as unknown as Inner).routeFeatures(r);
      for (const l of f.lines.filter(q => q.edge)) {
        const ends = [l.pts[0]!, l.pts[l.pts.length - 1]!];
        for (const e of ends) {
          const d = Math.hypot(e.x - 100, e.y - 100); if (d > 50) continue; // the far end (a dead end)
          const arm = n.arms.find(q => q.seg === r.segs[0] || q.seg === r.segs[r.segs.length - 1])!;
          assert.ok(d >= arm.edgeInset - 1e-6, `${a}/${b}: starts ${d.toFixed(2)} from the node, inset ${arm.edgeInset.toFixed(2)}`);
          if (arm.xw >= 0) assert.ok(d >= arm.xw + 1.4, `${a}/${b}: past the zebra (${(arm.xw + 1.4).toFixed(2)})`);
          // past the crossing road's kerb and its corner: a street's corner rounds 1.75 tiles
          assert.ok(d >= arm.reachEdge + Math.min(arm.cls.rConcave, 1.75), `${a}/${b}: past the corner (${d.toFixed(2)})`);
        }
      }
    }
  }
  // a dead end stops its lines where the kerb meets the turning circle; a street running on into a street with trees (the same width) keeps them
  // to the joint, so the two meet
  const s2 = net([[leg(0, 0, 60, 0), 'street'], [leg(60, 0, 120, 0), 'street.tr']]);
  const at60 = edgesOf(s2).flatMap(l => [l.pts[0]!, l.pts[l.pts.length - 1]!]).filter(p => Math.abs(p.x - 60) < 1);
  assert.equal(at60.length, 4, 'both routes reach the joint, both sides');
  const dead = s2.nodeAt({ x: 0, y: 0 })!.arms[0]!, h = CLASS.street!.h, rb = h + CLASS.street!.bulb;
  assert.ok(Math.abs(dead.edgeInset - (Math.sqrt(rb * rb - h * h) + 0.3)) < 1e-9);
});

test('edge lines are broken at driveways: a drive that reaches the lot front cuts the near edge line, wide as the drive; a back drive none', () => {
  // a lot on the north side of an east-west street at y = 0: its front at the verge edge (y = -(h + walk)), u along +x, n away (-y)
  const h = CLASS.street!.h, w = CLASS.street!.walk, g = { o: { x: 10, y: -(h + w) }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 } };
  const P = (a: number, b: number) => [g.o.x + a, g.o.y - b];
  const quad = (a0: number, b0: number, a1: number, b1: number) => [...P(a0, b0), ...P(a1, b0), ...P(a1, b1), ...P(a0, b1)];
  const ground: LotPatch[] = [{ pts: quad(2, 0, 4.5, 6), tex: 'paving', drive: true }, { pts: quad(6, 0, 7, 3), tex: 'paving' }, { pts: quad(8, 5, 10, 9), tex: 'asphalt', drive: true }];
  const cuts = driveCuts(g, ground);
  assert.equal(cuts.length, 1, 'only the front drive');
  const c = cuts[0]!, xs = [c.pts[0]!, c.pts[2]!, c.pts[4]!, c.pts[6]!], ys = [c.pts[1]!, c.pts[3]!, c.pts[5]!, c.pts[7]!];
  assert.ok(c.cut && c.top, 'a cut, drawn by no other painter');
  assert.ok(Math.min(...xs) < 12 && Math.max(...xs) > 14.5 && Math.max(...xs) < 15, 'as wide as the drive, a little more');
  // it covers the near kerb's edge line (y = -(h - EDGE_IN)) and stops short of the far one (y = h - EDGE_IN) and the centre (y = 0)
  const near = -(h - EDGE_IN);
  assert.ok(Math.min(...ys) < -(h + w) && Math.max(...ys) > near + 0.1, `reaches the near line: ${Math.min(...ys)}..${Math.max(...ys)}`);
  assert.ok(Math.max(...ys) < 0, 'short of the centre line');
  assert.ok(DRIVE_CUT_REACH < w + 2 * h - EDGE_IN - 0.2, 'never reaches the far edge line');
});

test('edge lines are broken at bus stops: the stop cuts its near kerb\'s line STOP_CUT_HALF each way; none by a road without edge lines', () => {
  const s = net([[leg(0, 0, 60, 0), 'street']]), h = CLASS.street!.h;
  const c = stopCut({ x: 30, y: h + 0.6 }, s.segs)!;
  assert.ok(c && c.cut && c.top);
  const xs = [c.pts[0]!, c.pts[2]!, c.pts[4]!, c.pts[6]!], ys = [c.pts[1]!, c.pts[3]!, c.pts[5]!, c.pts[7]!];
  assert.ok(Math.abs(Math.min(...xs) - (30 - STOP_CUT_HALF)) < 1e-9 && Math.abs(Math.max(...xs) - (30 + STOP_CUT_HALF)) < 1e-9);
  assert.ok(Math.min(...ys) < h - EDGE_IN && Math.max(...ys) > h - EDGE_IN && Math.min(...ys) > 0, 'across the near (south) line only');
  assert.equal(stopCut({ x: 30, y: 2 }, net([[leg(0, 0, 60, 0), 'road']]).segs), null);
  assert.equal(stopCut({ x: 30, y: 30 }, s.segs), null, 'too far from any kerb');
});

test('car parks show their cars: the worker\'s cars fill the bays to the count, in a fixed order, from the far end when the car park is shared', () => {
  for (const shared of [false, true]) for (const [parked, bays] of [[0, 44], [6, 44], [44, 44], [60, 44], [3, 1]] as const) {
    const n = workerShown(parked, bays), at = Array.from({ length: n }, (_, i) => workerBay(i, bays, shared));
    assert.equal(n, Math.min(parked, bays), 'bays filled to the count');
    assert.equal(new Set(at).size, n, 'one car a bay');
    for (const b of at) assert.ok(b >= 0 && b < bays);
    assert.deepEqual(at, Array.from({ length: n }, (_, i) => workerBay(i, bays, shared)), 'deterministic');
  }
  // an arrival fills the next bay and keeps every other car where it stood; a departure frees the last
  const before = [0, 1, 2, 3, 4].map(i => workerBay(i, 44, false)), after = [0, 1, 2, 3, 4, 5].map(i => workerBay(i, 44, false));
  assert.deepEqual(after.slice(0, 5), before);
  // shared (the range's, the club's car park): the golfers' cars take the bays nearest the entrance (0..), the worker's the far end
  assert.equal(workerBay(0, 44, true), 43); assert.equal(workerBay(5, 44, true), 38);
});

test('car parks off screen are not looked at: the on-screen test is a box test on the car park\'s bays', () => {
  const bays = [{ x: 100, y: 100 }, { x: 110, y: 104 }, { x: 104, y: 120 }];
  const b = baysBox(bays, 4)!;
  assert.deepEqual(b, [96, 96, 114, 124]);
  assert.ok(boxesMeet(b, [90, 90, 98, 98]), 'a view over its corner');
  assert.ok(!boxesMeet(b, [300, 300, 400, 400]), 'a view far away');
  assert.equal(baysBox([]), null);
});

test('car paints: deterministic, a spread of colours, only on the two car models, read back by the shader as packed', () => {
  // a seed always gives the same paint, in 0..PAINTS.length, and a thousand bays give every paint (white, silver and black most)
  const seen = new Map<number, number>();
  for (let i = 0; i < 4000; i++) { const p = paintOf(hash3(i, 0x51)); assert.equal(p, paintOf(hash3(i, 0x51))); assert.ok(p >= 0 && p <= PAINTS.length); seen.set(p, (seen.get(p) ?? 0) + 1); }
  assert.equal(seen.size, PAINTS.length + 1, 'every paint comes up');
  assert.ok(seen.get(1)! > seen.get(7)!, 'white more often than yellow');
  assert.equal(paintAt(12.25, 40.5), paintAt(12.25, 40.5), 'the same bay, the same paint');
  // the codes: a burgundy wagon's body is family 0, a navy one's 1; not a car: none; no paint or the switch off: none
  const burg = LIBRARY.findIndex(i => i.id === 'cars:burgundy-wagon:N'), navy = LIBRARY.findIndex(i => i.id === 'cars:navy-wood-panel-wagon:SE'), tree = LIBRARY.findIndex(i => i.kind === 'tree');
  assert.equal(bodyOf(burg), 0); assert.equal(bodyOf(navy), 1); assert.equal(bodyOf(tree), -1);
  assert.equal(paintCode(burg, 5), 5); assert.equal(paintCode(navy, 5), 21); assert.equal(paintCode(tree, 5), 0); assert.equal(paintCode(burg, 0), 0);
  CAR_PAINT.on = false; assert.equal(paintCode(burg, 5), 0); CAR_PAINT.on = true;
  // packed and read back: T176's tint stays code 1, a paint its code + 1, the alpha exact
  for (const alpha of [0, 0.25, 0.5, 1]) {
    assert.deepEqual(unpackAlpha(packAlpha(alpha, false, 0)), { tint: 0, alpha });
    assert.deepEqual(unpackAlpha(packAlpha(alpha, true, 0)), { tint: 1, alpha });
    for (const code of [1, 11, 17, 27]) { const r = unpackAlpha(packAlpha(alpha, false, code)); assert.equal(r.tint, code + 1); assert.ok(Math.abs(r.alpha - alpha) < 1e-9); }
  }
});
