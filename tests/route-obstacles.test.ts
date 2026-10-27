// T207 (#546) Drives and cart paths on the player's own land: the owner's paved drive across the practice area and past the range's front was
// refused on Build with "Roads cannot cross a business" (the range business's whole front rectangle, padded), and the preview never warned.
// Now a course road (cart paths and drives) is refused only by real structures (the range's shop, home, covered bays, kiosk and car park
// building; the clubhouse and halfway house), named in the refusal and outlined; a drive may come up to a car park's edge; town roads keep the
// whole rectangles. Real range starts (golf/rangestart.ts), headless: the road tool's checkLegs and route-obstacles.ts inTheWay, the one function
// the preview, each click and Build share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain } from '../src/game/terrain';
import { planRangeStart, type RangeStart } from '../src/game/golf/rangestart';
import { plotOfFront, plotPoint } from '../src/game/golf/range';
import { defaultRangeBiz, rangeScene, rangeStructures, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { CLASS, RoadNetwork, classOf, isCourseClass, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { checkLegs, snapPoint } from '../src/game/snap';
import { inTheWay, overlaps, rectPoly, routeObstacles, type Obstacle } from '../src/game/route-obstacles';
import type { Rect } from '../src/game/golf/mode';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const DRIVE = classOf('drive'), GRAVEL = classOf('drive-gravel'), CART = classOf('cart'), STREET = CLASS.street!;
const plans = new Map<number, RangeStart | null>();
const plan = (s: number) => { if (!plans.has(s)) plans.set(s, planRangeStart(generateTerrain(s), s)); return plans.get(s)!; };
const SEEDS = [1, 2, 3];

/** a range start as the engine lays it (newRangeGame): the county road, the gravel drive, the range's cement paths; the range business (its
 *  front), its car park, its plot and facing, and the range save with the upgrades given */
function world(seed: number, owned: RangeUpgradeId[] = []) {
  const s = plan(seed); assert.ok(s, `seed ${seed} has a range start`);
  const { road, site } = s, facing = s.save.dir as 0 | 1 | 2 | 3, plot: Rect = plotOfFront(site.rangeFront, facing);
  const biz: RangeBizSave = { ...defaultRangeBiz(), owned: [...owned] };
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(road.legs, CLASS.road!, 0, road.kinds, true); e.addLegs(site.drive, GRAVEL, 0, undefined, true);
  e.addLegs(rangeScene(plot, facing, biz).paths, classOf('cart-slab'), 0, undefined, true); e.commit(true);
  const [fx, fy, fw, fh] = site.rangeFront, [px, py, pw, ph] = site.carpark;
  return { net: e.net, plot, facing, land: [s.save.parcel] as Rect[], biz: [{ type: 'range', x: fx, y: fy, w: fw, h: fh }], parks: [{ x: px, y: py, w: pw, h: ph }], structures: rangeStructures(plot, facing, biz), P: (u: number, v: number) => plotPoint(plot, facing, u, v) };
}
type World = ReturnType<typeof world>;
/** a route through plot-frame points (u along the road, v away from it: the plot u 0..70, the drive at u 72, the practice area u 75..111) */
const route = (w: World, uv: [number, number][]): Leg[] => uv.slice(1).map((q, i) => ({ a: w.P(...uv[i]!), b: w.P(...q) }));
/** the click's verdict, as the engine judges it (preview, each point, Build): checkLegs, then what is in the way */
function verdict(w: World, legs: Leg[], cls: RoadClass): { why: string; hit: Obstacle | null } {
  const step = cls.noCars ? 0.5 : 1, from = snapPoint(w.net, legs[0]!.a, 2, step), to = snapPoint(w.net, legs[legs.length - 1]!.b, 2, step);
  const why = checkLegs(w.net, legs, from, to, cls, undefined, w.land); if (why) return { why, hit: null };
  const hit = inTheWay(legs, cls.h + cls.walk, routeObstacles({ course: isCourseClass(cls.id), biz: w.biz, parks: w.parks, structures: w.structures }));
  return { why: hit?.why ?? '', hit };
}

/** the owner's kind of routes: across the practice area to the drive; from the drive past the sign along the front, between the yard and the
 *  shop into the range land; a cart path from the practice area across the range land to the tee's path */
const OWNER: [string, [number, number][], boolean][] = [
  ['across the practice area to the drive', [[104, 30], [104, 8], [72, 8]], false],
  ['across the practice area, past the drive\'s end into the range land', [[104, 30], [104, 20], [62, 20]], true],
  ['on from the drive\'s end along the tee, between the yard and the shop', [[72, 16], [72, 21], [25, 21], [25, 13]], true],
];

test('the owner\'s paved drives across the practice area and the range\'s empty land build (they were refused by the whole front)', () => {
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const [name, uv, wasRefused] of OWNER) {
      const legs = route(w, uv);
      assert.equal(verdict(w, legs, DRIVE).why, '', `seed ${seed}: ${name}`);
      assert.equal(verdict(w, legs, CART).why, '', `seed ${seed}: ${name} (a cart path)`);
      // the old rule (the range's whole front, padded): refused
      if (wasRefused) assert.equal(inTheWay(legs, DRIVE.h + DRIVE.walk, routeObstacles({ course: false, biz: w.biz, parks: [] }))?.why, 'Roads cannot cross the driving range', `seed ${seed}: ${name}, the old rule`);
    }
  }
});

test('a drive into the shop is refused, named, with the shop outlined; so are the home, the covered bays, the kiosk and the car park building', () => {
  for (const seed of SEEDS) {
    const w = world(seed), legs = route(w, [[25, 9], [45, 9]]), v = verdict(w, legs, DRIVE);
    assert.equal(v.why, 'Roads cannot cross the pro shop', `seed ${seed}`);
    assert.deepEqual(v.hit!.outline, v.hit!.zone);
    const shop = w.structures.find(s => s.name === 'the pro shop')!, c = w.P(34, 8.5);
    assert.ok(shop.box[0] < c.x && c.x < shop.box[2] && shop.box[1] < c.y && c.y < shop.box[3], 'the outline is round the shop\'s spot');
    // the pro shop upgrade: the same words, its bigger footprint
    const u = world(seed, ['proshop', 'covered', 'kiosk', 'bays12', 'tier2', 'parking']);
    assert.equal(verdict(u, route(u, [[25, 9], [30, 9]]), DRIVE).why, '', `seed ${seed}: up to the shop's side`);
    assert.equal(verdict(u, route(u, [[25, 9], [32, 9]]), DRIVE).why, 'Roads cannot cross the pro shop');
    assert.equal(verdict(u, route(u, [[25, 19], [40, 19]]), CART).why, 'Roads cannot cross the covered bays');
    assert.equal(verdict(u, route(u, [[44.6, 4], [44.6, 13]]), CART).why, 'Roads cannot cross the coffee kiosk');
    assert.equal(verdict(u, route(u, [[53, 1], [53, 10]]), DRIVE).why, 'Roads cannot cross the car park building');
    assert.equal(verdict(w, route(w, [[9.5, 1], [9.5, 9]]), CART).why, 'Roads cannot cross your caravan');
  }
});

test('a cart path laid along the path behind the bays passes the covered bays; the practice area and the drive stay clear of every structure', () => {
  const w = world(1, ['proshop', 'covered', 'kiosk', 'bays12', 'tier2', 'parking']);
  assert.equal(inTheWay(route(w, [[30, 16.2], [45, 16.2]]), CART.h + CART.walk, routeObstacles({ course: true, biz: w.biz, parks: w.parks, structures: w.structures })), null);
  for (const s of w.structures) {
    const [x0, y0, x1, y1] = s.box, pa = [w.P(75, 2), w.P(111, 36)], drive = [w.P(70, -10), w.P(74, 16)];
    for (const [a, b] of [pa, drive]) assert.ok(!overlaps(rectPoly(x0, y0, x1, y1), rectPoly(Math.min(a!.x, b!.x), Math.min(a!.y, b!.y), Math.max(a!.x, b!.x), Math.max(a!.y, b!.y))), `${s.name} off the practice area and the drive`);
  }
});

test('a drive may come up to the car park\'s edge to join it, not through it; a town road keeps the padded rectangles', () => {
  const w = world(2), cp = w.parks[0]!, obs = (course: boolean) => routeObstacles({ course, biz: [], parks: w.parks });
  const hw = DRIVE.h + DRIVE.walk, mid = cp.y + cp.h / 2;
  const toEdge: Leg[] = [{ a: { x: cp.x - 10, y: mid }, b: { x: cp.x, y: mid } }], through: Leg[] = [{ a: { x: cp.x - 10, y: mid }, b: { x: cp.x + 3, y: mid } }];
  assert.equal(inTheWay(toEdge, hw, obs(true)), null);
  assert.equal(inTheWay(through, hw, obs(true))?.why, 'Roads cannot cross a car park');
  assert.equal(inTheWay(toEdge, STREET.h + STREET.walk, obs(false))?.why, 'Roads cannot cross a car park');
});

test('town roads: still refused at the range (the course land first, then the business), any town business by its padded rectangle', () => {
  for (const seed of SEEDS) {
    const w = world(seed), legs = route(w, [[72, 1], [25, 1], [25, 13]]);
    assert.notEqual(verdict(w, legs, STREET).why, '', `seed ${seed}: a street at the range`);
    assert.equal(inTheWay(legs, STREET.h + STREET.walk, routeObstacles({ course: false, biz: w.biz, parks: w.parks, structures: w.structures }))?.why, 'Roads cannot cross the driving range');
  }
  const diner = [{ type: 'diner', x: 100, y: 100, w: 10, h: 10 }], hw = STREET.h + STREET.walk;
  const o = (course: boolean) => routeObstacles({ course, biz: diner, parks: [] });
  assert.equal(inTheWay([{ a: { x: 90, y: 105 }, b: { x: 120, y: 105 } }], hw, o(false))?.why, 'Roads cannot cross a business');
  assert.equal(inTheWay([{ a: { x: 90, y: 99 - hw + 0.2 }, b: { x: 120, y: 99 - hw + 0.2 } }], hw, o(false))?.why, 'Roads cannot cross a business', 'within the pad');
  assert.equal(inTheWay([{ a: { x: 90, y: 99 - hw }, b: { x: 120, y: 99 - hw } }], hw, o(false)), null, 'touching the pad');
  // a town business is a building to a drive too; the clubhouse and the halfway house by name
  assert.equal(inTheWay([{ a: { x: 90, y: 105 }, b: { x: 120, y: 105 } }], DRIVE.h + DRIVE.walk, o(true))?.why, 'Roads cannot cross a business');
  for (const [type, name] of [['clubhouse', 'the clubhouse'], ['halfway', 'the halfway house']] as const)
    assert.equal(inTheWay([{ a: { x: 90, y: 105 }, b: { x: 120, y: 105 } }], DRIVE.h + DRIVE.walk, routeObstacles({ course: true, biz: [{ type, x: 100, y: 100, w: 10, h: 10 }], parks: [] }))?.why, `Roads cannot cross ${name}`);
});

test('an obstacle that lets a leg pass (a toll plaza\'s own centre line) is skipped for that leg only', () => {
  const zone = rectPoly(0, -3, 30, 3), toll: Obstacle = { why: 'Roads cannot cross a toll plaza', zone, outline: zone, pass: l => Math.abs(l.a.y) < 0.05 && Math.abs(l.b.y) < 0.05 };
  assert.equal(inTheWay([{ a: { x: -10, y: 0 }, b: { x: 40, y: 0 } }], 2, [toll]), null);
  assert.equal(inTheWay([{ a: { x: 10, y: -10 }, b: { x: 10, y: 10 } }], 2, [toll])?.why, 'Roads cannot cross a toll plaza');
});
