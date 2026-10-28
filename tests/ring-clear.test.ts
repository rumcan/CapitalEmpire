// T224 (#623) Big roundabouts clear what is in their way, with a price, or refuse with the reason. The owner, 2026-10-27, after laying a 3-lane ring
// over the range's sign and the drive-in's speaker posts, ticket booth and snack bar: "Has to move housers and shit when ou place massive round
// about or stop you form making one". A ring (a mini too, and a ring that grows or is widened) is judged by the road builder's own obstacle list
// (route-obstacles.ts): the houses its circle reaches are bulldozed and paid for (the lots the worker's partition drops, so the price is exactly
// what goes), the small placed props go for nothing; a business, a car park, the range's structures and pieces, an iconic place or a big prop
// refuse it, named, with the outline the preview draws red. Headless: the pure ring-clear.ts on real networks, lots and range starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, RB_BASE, ringRadius, classOf, type Leg, type Node } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, ringClear, type Lot } from '../src/game/lots/lots';
import { LU, LV } from '../src/game/lots/town';
import { compensation } from '../src/game/budget';
import { generateTerrain } from '../src/game/terrain';
import { planRangeStart } from '../src/game/golf/rangestart';
import { plotOfFront } from '../src/game/golf/range';
import { defaultRangeBiz, rangeScene, rangeStructures, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { placeBox, placeDef, placeName } from '../src/game/lots/iconic';
import { discOverlaps, inSentence, inTheWay, inTheWayOfDisc, rectPoly, ringWhy, routeObstacles, structureObstacles, type Obstacle } from '../src/game/route-obstacles';
import { judgeRing, lotsInRing, rangePieceName, ringGrows, ringDisc, type RingLot, type RingProp } from '../src/game/ring-clear';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const C = { x: 320, y: 320 }; // on the town's 40-tile street lattice, where its junctions are
/** a four-arm crossing of one class, 120 tiles to an arm, its centre a plain junction */
function crossing(cls: keyof typeof CLASS = 'street') {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(C.x - 120, C.y, C.x + 120, C.y), leg(C.x, C.y - 120, C.x, C.y + 120)], CLASS[cls]!, 0); e.commit();
  return e;
}
const arms = (n: Node) => ({ hs: n.arms.map(a => a.h), walk: Math.max(0, ...n.arms.map(a => a.walk)) });
/** a lot of the partition as the main thread holds it (sim/client.ts LotView), at a level and use */
const asRing = (l: Lot, level: number, use: number = LU.RES, decline = 0): RingLot => ({ key: l.key, o: [l.o.x, l.o.y], u: [l.u.x, l.u.y], n: [l.n.x, l.n.y], w: l.w, d: l.d, use, level, decline });
const none = { props: [] as RingProp<string>[], obstacles: [] as Obstacle[] };

test('a disc reaches into a convex polygon by more than touching: corners, edges, the centre inside, either winding', () => {
  const sq = rectPoly(10, 10, 20, 20), rev = [18, 0, 6, 4].map((_, k) => k).reverse().flatMap(k => [sq[k * 2]!, sq[k * 2 + 1]!]);
  for (const p of [sq, rev]) {
    assert.equal(discOverlaps({ x: 5, y: 15, r: 5 }, p), false, 'touching an edge');
    assert.equal(discOverlaps({ x: 5, y: 15, r: 5.01 }, p), true, 'past an edge');
    assert.equal(discOverlaps({ x: 5, y: 5, r: 7.0 }, p), false, 'short of a corner (7.07 away)');
    assert.equal(discOverlaps({ x: 5, y: 5, r: 7.2 }, p), true, 'past a corner');
    assert.equal(discOverlaps({ x: 15, y: 15, r: 0.5 }, p), true, 'centre inside');
    assert.equal(discOverlaps({ x: 40, y: 40, r: 5 }, p), false, 'far');
  }
});

test('a 3-lane roundabout over houses: the built lots in its circle are cleared and paid for, exactly the lots the worker drops when it is built', () => {
  const e = crossing('street'), lm = new LotMap(); lm.update(e.net, null);
  const n0 = e.net.nodeAt(C)!, { hs, walk } = arms(n0), rb = ringRadius(hs, 3);
  assert.equal(rb, RB_BASE[3]);
  // every lot built (a house, BUILT) but every fifth, a shop under construction (BUILDING), and one empty
  const lots = [...lm.lots.values()], rings = lots.map((l, i) => asRing(l, i % 5 === 4 ? LV.BUILDING : i === 0 ? LV.EMPTY : LV.BUILT, i % 5 === 4 ? LU.COM : LU.RES));
  const v = judgeRing({ x: C.x, y: C.y, rb, walk, kind: 'roundabout', name: 'A roundabout', ...none, lots: rings });
  assert.equal(v.why, '');
  assert.ok(v.lots.length >= 4, `a big ring takes in houses (${v.lots.length})`);
  assert.equal(v.comp, v.lots.reduce((s, l) => s + compensation(l), 0), 'the compensation is the lots\' own');
  assert.ok(v.comp > 0 && v.lotOutlines.length === v.lots.length);
  assert.ok(v.lots.every(l => l.level >= LV.BUILDING), 'an empty lot is not paid for');
  assert.equal(v.comp, v.lots.reduce((s, l) => s + (l.use === LU.COM ? 500 : 2000), 0), 'a house 2,000, a shop under construction 500');
  // build it as the engine does, and let the worker's partition run with every lot kept (the range start's rule): the lots it drops are the priced lots
  e.setNodeType(n0, 'roundabout'); e.setNodeFlags(n0, false, false, 3); e.commit();
  const n = e.net.nodeAt(C)!; assert.equal(n.rb, rb, 'the radius the check predicts is the radius the network builds');
  const keys = new Set(rings.filter(l => l.level >= LV.BUILDING).map(l => l.key!));
  const { removed } = lm.update(e.net, null, k => keys.has(k));
  const goneBuilt = removed.filter(k => keys.has(k)).sort();
  assert.deepEqual(goneBuilt, v.lots.map(l => l.key!).sort(), 'priced = removed');
  // and none of the kept lots reaches the circle
  assert.ok(ringClear(n) > rb && [...lm.lots.values()].every(l => !lotsInRing([asRing(l, LV.BUILT)], C.x, C.y, rb, walk, 'roundabout').length || !keys.has(l.key)));
});

test('a smaller ring takes fewer houses; a mini keeps no lot out (a painted island); a ring that does not grow takes nothing', () => {
  const e = crossing('street'), lm = new LotMap(); lm.update(e.net, null);
  const n = e.net.nodeAt(C)!, { hs, walk } = arms(n), lots = [...lm.lots.values()].map(l => asRing(l, LV.BUILT));
  const take = (rl: 1 | 2 | 3) => judgeRing({ x: C.x, y: C.y, rb: ringRadius(hs, rl), walk, kind: 'roundabout', name: 'A roundabout', ...none, lots });
  const [a, b, c] = [take(1), take(2), take(3)];
  assert.ok(a.lots.length <= b.lots.length && b.lots.length <= c.lots.length && a.comp <= b.comp && b.comp <= c.comp, `${a.lots.length} <= ${b.lots.length} <= ${c.lots.length}`);
  assert.ok(c.lots.length > a.lots.length, 'three lanes reach lots one lane does not');
  const mini = judgeRing({ x: C.x, y: C.y, rb: Math.max(4, Math.max(...hs) + 1), walk, kind: 'mini', name: 'A mini-roundabout', ...none, lots });
  assert.deepEqual([mini.why, mini.lots.length, mini.comp], ['', 0, 0]);
  // re-laned down (3 to 1, 3 to 2): the ring that stands already covers all of it, so nothing is judged, however much legacy stands in it
  const now = { type: 'roundabout', rb: ringRadius(hs, 3), walk }, wall = [{ why: 'x', name: 'a business', zone: rectPoly(C.x + 6, C.y - 40, C.x + 60, C.y + 40), outline: rectPoly(C.x + 6, C.y - 40, C.x + 60, C.y + 40) }];
  for (const rl of [1, 2] as const) assert.deepEqual(judgeRing({ x: C.x, y: C.y, rb: ringRadius(hs, rl), walk, kind: 'roundabout', name: 'A roundabout', props: [], obstacles: wall, lots, now }), { why: '', outline: [], props: [], lots: [], comp: 0, lotOutlines: [] });
  assert.equal(ringGrows(now, 'roundabout', ringRadius(hs, 3), walk), false);
  assert.equal(ringGrows(now, 'mini', 5, walk), false, 'a mini inside the ring that stands');
  assert.equal(ringGrows({ type: 'roundabout', rb: ringRadius(hs, 1), walk }, 'roundabout', ringRadius(hs, 3), walk), true, 'one lane to three grows');
  assert.equal(ringGrows({ type: 'mini', rb: 5, walk }, 'roundabout', 7, walk), true, 'a mini to a roundabout grows');
  assert.equal(ringGrows(null, 'mini', 5, walk), true, 'a plain junction to a mini');
});

test('a roundabout over the drive-in is refused, naming it, with its footprint outlined; the road builder\'s list refuses a road the same way', () => {
  const def = placeDef('drive-in')!, box = placeBox({ id: 'drive-in', x: C.x + 12, y: C.y - 15, q: 3 }, def); // 20 by 30 tiles, its near edge 12 tiles east of the junction
  const name = inSentence(placeName(def, null));
  assert.equal(name, 'the Drive-In');
  assert.equal(inSentence(placeName(def, 'Maple Falls')), 'Maple Falls Drive-In', 'a town\'s own name keeps its capital');
  const obstacles = routeObstacles({ course: false, biz: [], parks: [], places: [{ name, box }] });
  const e = crossing('street'), lm = new LotMap(); lm.update(e.net, null);
  const n = e.net.nodeAt(C)!, { hs, walk } = arms(n), lots = [...lm.lots.values()].map(l => asRing(l, LV.BUILT));
  const ring = (rl: 1 | 2 | 3, kind: 'roundabout' | 'mini' = 'roundabout', rbOverride?: number) => judgeRing({ x: C.x, y: C.y, rb: rbOverride ?? ringRadius(hs, rl), walk, kind, name: kind === 'mini' ? 'A mini-roundabout' : 'A roundabout', ...none, obstacles, lots });
  const v = ring(3);
  assert.equal(v.why, 'A roundabout cannot cover the Drive-In');
  assert.deepEqual(v.outline, [rectPoly(box[0], box[1], box[2], box[3])], 'the footprint is the outline');
  assert.deepEqual([v.lots.length, v.comp, v.props.length], [0, 0, 0], 'a refused ring takes nothing and costs nothing (the houses in it stay)');
  // the one-lane ring stops short of it; so a ring is refused only where it reaches
  assert.equal(ring(1).why, '', 'one lane stays clear of the footprint');
  assert.equal(ringDisc(C.x, C.y, RB_BASE[1], walk).r + C.x < box[0], true);
  // a mini that reaches it is refused the same way, in the mini's words
  const reach = box[0] - C.x - walk + 0.5;
  assert.equal(ring(1, 'mini', reach).why, 'A mini-roundabout cannot cover the Drive-In');
  assert.equal(ring(1, 'mini', reach - 1).why, '');
  // the same list stops a road along the same footprint, in the road's words, for a town class and a course class alike
  for (const course of [false, true]) {
    const o = routeObstacles({ course, biz: [], parks: [], places: [{ name, box }] }), cls = classOf(course ? 'drive' : 'street');
    assert.equal(inTheWay([leg(box[0] - 20, (box[1] + box[3]) / 2, box[0] + 4, (box[1] + box[3]) / 2)], cls.h + cls.walk, o)?.why, 'Roads cannot cross the Drive-In', `course ${course}`);
    assert.equal(inTheWay([leg(box[0] - 20, box[1] - 10, box[0] + 40, box[1] - 10)], cls.h + cls.walk, o), null, `course ${course}: a road past it`);
  }
  // a ring has no pass: a toll plaza's own centre line lets a road through, never a ring
  const toll: Obstacle = { why: 'Roads cannot cross a toll plaza', name: 'a toll plaza', zone: rectPoly(C.x + 3, C.y - 3, C.x + 30, C.y + 3), outline: rectPoly(C.x + 4, C.y - 2, C.x + 29, C.y + 2), pass: () => true };
  assert.equal(inTheWay([leg(C.x - 20, C.y, C.x + 60, C.y)], 2, [toll]), null);
  assert.equal(inTheWayOfDisc({ x: C.x, y: C.y, r: 8 }, [toll])?.name, 'a toll plaza');
});

test('a ring over a business, a car park, or the range\'s buildings and pieces is refused, named: the town\'s rectangles padded, the range\'s own structures on a drive', () => {
  const plan = planRangeStart(generateTerrain(1), 1)!; assert.ok(plan);
  const { site } = plan, facing = plan.save.dir as 0 | 1 | 2 | 3, plot = plotOfFront(site.rangeFront, facing), biz = { ...defaultRangeBiz(), owned: ['proshop', 'covered', 'kiosk', 'bays12', 'tier2', 'parking'] as RangeUpgradeId[] };
  const structures = rangeStructures(plot, facing, biz), scene = rangeScene(plot, facing, biz);
  const [fx, fy, fw, fh] = site.rangeFront, [px, py, pw, ph] = site.carpark, bizList = [{ type: 'range', x: fx, y: fy, w: fw, h: fh }, { type: 'diner', x: 500, y: 500, w: 10, h: 10 }];
  const at = (x: number, y: number, r: number, course: boolean, props: RingProp<string>[] = [], list = bizList) => judgeRing({ x, y, rb: r, walk: 1, kind: 'roundabout', name: 'A roundabout', obstacles: routeObstacles({ course, biz: list, parks: [{ x: px, y: py, w: pw, h: ph }], structures }), props, lots: [] });
  // the pro shop, on a drive (the course rules: its structures)
  const shop = structures.find(s => s.name === 'the pro shop')!, sx = (shop.box[0] + shop.box[2]) / 2, sy = (shop.box[1] + shop.box[3]) / 2;
  const v = at(sx, sy, 7, true);
  assert.equal(v.why, 'A roundabout cannot cover the pro shop');
  assert.deepEqual(v.outline, [rectPoly(...shop.box)]);
  for (const s of structures) { const [x0, y0, x1, y1] = s.box; assert.equal(at((x0 + x1) / 2, (y0 + y1) / 2, 4, true).why, `A roundabout cannot cover ${s.name}`, s.name); }
  // a town ring beside the range: the structures first (the nearest named thing), the range's whole front, a business, a car park
  assert.ok(at(sx, sy, 7, false).why.startsWith('A roundabout cannot cover '));
  assert.equal(at(505, 505, 8, false).why, 'A roundabout cannot cover a business');
  assert.equal(at(505, 505, 8, true).why, 'A roundabout cannot cover a business', 'a town business is a building to a drive too');
  assert.equal(at(px + pw / 2, py + ph / 2, 3, false, [], bizList.slice(1)).why, 'A roundabout cannot cover a car park');
  assert.equal(at(500 - 1 - 9 - 0.01, 505, 8, false).why, '', 'the disc just short of the business\'s padded rectangle is clear');
  // the range's sign (a piece of the scene, not a structure): a ring on a drive that reaches it is refused, named
  const sign = scene.pieces.find(p => p.key === 'sign')!, signProp: RingProp<string> = { p: 'sign', box: [sign.x - 1.5, sign.y - 1.5, sign.x + 1.5, sign.y + 1.5], refuse: ringWhy('A roundabout', rangePieceName('range:sign')) };
  const sg = (props: RingProp<string>[] = []) => judgeRing({ x: sign.x, y: sign.y, rb: 0.2, walk: 1, kind: 'roundabout', name: 'A roundabout', obstacles: routeObstacles({ course: true, biz: bizList, parks: [], structures }), props, lots: [] });
  assert.equal(sg().why, '', 'the sign is no structure: a drive ring is judged by the structures alone, and passes');
  const w = sg([signProp]);
  assert.equal(w.why, 'A roundabout cannot cover the driving range sign');
  assert.deepEqual(w.outline, [rectPoly(sign.x - 1.5, sign.y - 1.5, sign.x + 1.5, sign.y + 1.5)]);
  assert.equal(sg([{ ...signProp, box: [sign.x + 30, sign.y + 30, sign.x + 31, sign.y + 31] }]).why, '', 'a sign out of reach is none of the ring business');
  // the named pieces
  assert.deepEqual(['sign', 'academy-sign', 'shop', 'roof2', 'kiosk', 'carpark', 'caravan', 'braai', 'bench', 'nothing-known'].map(k => rangePieceName(`range:${k}`)), ['the driving range sign', 'the academy sign', 'the pro shop', 'the covered bays', 'the coffee kiosk', 'the car park building', 'your home', 'your yard', 'the tee area', 'the driving range']);
  // every structure obstacle carries its name
  assert.deepEqual(structureObstacles(structures).map(o => o.name), structures.map(s => s.name));
});

test('props under a ring: the small placed ones go for nothing, a big one refuses it with its own words, and a refusal wins over what would have gone', () => {
  const small: RingProp<string> = { p: 'bench', box: [C.x + 1, C.y + 1, C.x + 2, C.y + 2], refuse: null }, small2: RingProp<string> = { p: 'bush', box: [C.x - 4, C.y - 4, C.x - 3, C.y - 3], refuse: null };
  const far: RingProp<string> = { p: 'far', box: [C.x + 40, C.y + 40, C.x + 41, C.y + 41], refuse: null }, big: RingProp<string> = { p: 'house', box: [C.x + 4, C.y - 1, C.x + 8, C.y + 3], refuse: 'house is in the way — bulldoze it first' };
  const base = { x: C.x, y: C.y, rb: 5, walk: 1, kind: 'mini' as const, name: 'A mini-roundabout', obstacles: [] as Obstacle[], lots: [] as RingLot[] };
  const v = judgeRing({ ...base, props: [small, small2, far] });
  assert.deepEqual([v.why, v.props], ['', ['bench', 'bush']], 'the mini over small props clears them, not the one out of reach');
  const w = judgeRing({ ...base, props: [small, big, small2] });
  assert.equal(w.why, 'house is in the way — bulldoze it first');
  assert.deepEqual([w.props, w.comp], [[], 0]);
  assert.deepEqual(w.outline, [rectPoly(C.x + 4, C.y - 1, C.x + 8, C.y + 3)]);
  assert.equal(judgeRing({ ...base, rb: 3, props: [big] }).why, '', 'a big prop beyond the island and the walk is none of the ring\'s business');
});

test('widening: a ring grown by a wider arm or more lanes is judged on the circle it will have, so a business that one lane spares refuses three', () => {
  const street = crossing('street'), boulevard = crossing('boulevard');
  const hsS = arms(street.net.nodeAt(C)!), hsB = arms(boulevard.net.nodeAt(C)!);
  const r1 = ringRadius(hsS.hs, 1), r3 = ringRadius(hsS.hs, 3), rb1 = ringRadius(hsB.hs, 1);
  assert.ok(r1 < rb1 && rb1 < r3, `${r1} < ${rb1} < ${r3}`);
  // a diner whose padded rectangle lies between the one-lane circle and the three-lane circle, on the east side
  const gap = (r1 + hsS.walk + r3 + hsS.walk) / 2, diner = { type: 'diner', x: C.x + gap + 1, y: C.y - 4, w: 8, h: 8 };
  const obstacles = routeObstacles({ course: false, biz: [diner], parks: [] });
  const judge = (rb: number, walk: number, now?: { type: string; rb: number; walk: number }) => judgeRing({ x: C.x, y: C.y, rb, walk, kind: 'roundabout', name: 'A roundabout', props: [], lots: [], obstacles, now });
  assert.equal(judge(r1, hsS.walk).why, '', 'one lane');
  assert.equal(judge(r3, hsS.walk).why, 'A roundabout cannot cover a business', 'three lanes: refused');
  assert.equal(judge(r3, hsS.walk, { type: 'roundabout', rb: r1, walk: hsS.walk }).why, 'A roundabout cannot cover a business', 're-laned up from one lane: refused the same');
  assert.equal(judge(r3, hsS.walk, { type: 'roundabout', rb: r3, walk: hsS.walk }).why, '', 'a ring of three lanes that already stands is not judged again');
  // the Upgrade tool widens an arm: the ring is as wide as its widest arm, so the same ring grows with the class, and meets the same rules
  const bw = classOf('boulevard'), rbW = ringRadius([...hsS.hs.slice(1), bw.h], 1), now1 = { type: 'roundabout', rb: r1, walk: hsS.walk };
  assert.equal(ringGrows(now1, 'roundabout', rbW, bw.walk), true, 'a wider arm grows the ring');
  const near = { type: 'diner', x: C.x + rbW + bw.walk - 0.5 + 1, y: C.y - 4, w: 8, h: 8 }, nearObs = routeObstacles({ course: false, biz: [near], parks: [] });
  const grown = (now?: typeof now1) => judgeRing({ x: C.x, y: C.y, rb: rbW, walk: bw.walk, kind: 'roundabout', name: 'A roundabout', props: [], lots: [], obstacles: nearObs, now });
  assert.equal(judgeRing({ x: C.x, y: C.y, rb: r1, walk: hsS.walk, kind: 'roundabout', name: 'A roundabout', props: [], lots: [], obstacles: nearObs }).why, '', 'the ring as it stands spares the diner');
  assert.equal(grown(now1).why, 'A roundabout cannot cover a business', 'the ring a boulevard arm makes reaches it: the Upgrade is refused');
});

test('one price: a ring that clears houses is dearer by exactly their compensation, and costs nothing more when it refuses', () => {
  const e = crossing('street'), lm = new LotMap(); lm.update(e.net, null);
  const n = e.net.nodeAt(C)!, { hs, walk } = arms(n);
  const mk = (level: number, use: number) => [...lm.lots.values()].map(l => asRing(l, level, use));
  for (const [level, use, per] of [[LV.BUILT, LU.RES, 2000], [LV.UPGRADED, LU.COM, 8000], [LV.BUILDING, LU.IND, 500]] as const) {
    const v = judgeRing({ x: C.x, y: C.y, rb: ringRadius(hs, 3), walk, kind: 'roundabout', name: 'A roundabout', props: [], obstacles: [], lots: mk(level, use) });
    assert.ok(v.lots.length > 0);
    assert.equal(v.comp, v.lots.length * per, `${v.lots.length} lots at ${per}`);
  }
  // a derelict lot is paid a tenth
  const d = judgeRing({ x: C.x, y: C.y, rb: ringRadius(hs, 3), walk, kind: 'roundabout', name: 'A roundabout', props: [], obstacles: [], lots: [...lm.lots.values()].map(l => asRing(l, LV.BUILT, LU.RES, 3)) });
  assert.equal(d.comp, d.lots.length * 200);
});
