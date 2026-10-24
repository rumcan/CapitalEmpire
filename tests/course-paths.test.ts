// The course's cart paths (P19, T084): the dirt and cement slab starters and the paved cart path, at real widths, with their own ladder and golf
// tiers, the dev unlock, the split of the catalogue between the Roads panel and the Course menu's Paths & drives, and how they sit in the network
// (no lanes, no lots, no car park frontage, the frontage snap). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEMENT_JOINT, CLASS, COURSE_FAMILIES, COURSE_TYPES, DIRT_GRASS, DIRT_RUT, NARROWER, ROAD_TYPES, RoadNetwork, TYPES, VARIANTS, WIDER, classOf, courseClassOpen, courseRoadOpen, courseTierNeeded, isCourseClass, type ClassId, type Leg, type Route } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { frontage, type CarParkDef } from '../src/game/event/carpark';
import { snapFrontage, snapSegOf } from '../src/game/ext/frontage-snap/index.js';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a class's surface width in metres (h is the half width in tiles of 2 m) */
const widthM = (id: ClassId) => 2 * CLASS[id]!.h * 2;
const CARTS = ['cart-dirt', 'cart-slab', 'cart'] as const;
const DRIVES = ['drive-gravel', 'drive', 'drive-avenue'] as const;
/** a committed network of the given legs per class */
function netOf(...parts: [ClassId, Leg[]][]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  for (const [id, legs] of parts) e.addLegs(legs, CLASS[id]!, 0);
  e.commit(true);
  return e.net;
}

test('the cart paths: dirt 2 m, cement slabs 2.5 m, paved 3 m; the single-lane drives stay 4 m', () => {
  assert.equal(widthM('cart-dirt'), 2);
  assert.equal(widthM('cart-slab'), 2.5);
  assert.equal(widthM('cart'), 3);
  for (const id of ['drive-gravel', 'drive']) { const w = widthM(id); assert.ok(w >= 3.5 && w <= 4, `${id}: ${w} m`); }
  // each path reads in its description at its real width, and is wider than the one below it on the ladder
  for (const id of CARTS) assert.ok(CLASS[id]!.desc.includes(`${widthM(id)} m`), `${id}: ${CLASS[id]!.desc}`);
  assert.ok(widthM('cart-dirt') < widthM('cart-slab') && widthM('cart-slab') < widthM('cart') && widthM('cart') < widthM('drive'));
});

test('the cart paths are carts and walkers only: no lanes, no lots, no lamps, a turf verge, their own surfaces', () => {
  const surface: Record<string, string> = { 'cart-dirt': 'dirt', 'cart-slab': 'cement', cart: 'asphalt' };
  for (const id of CARTS) {
    const c = CLASS[id]!;
    assert.equal(c.family, 'cart', id); assert.equal(c.base, id, id); assert.deepEqual(c.flags, [], id);
    assert.equal(c.noCars, true, id); assert.equal(c.noLots, true, id);
    assert.deepEqual(c.laneCentres, [], id); assert.deepEqual(c.laneLines, [], id); assert.equal(c.centre, 'none', id);
    assert.equal(c.walkTex, 'turf', id); assert.ok(c.walk > 0 && c.walk <= 0.25, id);
    assert.equal(c.tex, surface[id], id);
    assert.ok(c.order < CLASS['drive-gravel']!.order && c.order < CLASS.gravel!.order, `${id} paints under every road`);
    assert.deepEqual(VARIANTS[c.base], [id]);
  }
  // nothing else gives up its lanes
  for (const t of TYPES) if (classOf(t.id).family !== 'cart') { assert.ok(!classOf(t.id).noCars, t.id); assert.ok(classOf(t.id).laneCentres.length > 0, t.id); }
});

test('the cart path ladder: dirt -> cement slabs -> paved, and back down; each step costs more; never into a drive or a town road', () => {
  assert.equal(WIDER['cart-dirt'], 'cart-slab'); assert.equal(WIDER['cart-slab'], 'cart'); assert.equal(WIDER.cart, undefined);
  assert.equal(NARROWER.cart, 'cart-slab'); assert.equal(NARROWER['cart-slab'], 'cart-dirt'); assert.equal(NARROWER['cart-dirt'], undefined);
  assert.ok(CLASS['cart-dirt']!.cost < CLASS['cart-slab']!.cost && CLASS['cart-slab']!.cost < CLASS.cart!.cost);
  for (const [from, to] of [...Object.entries(WIDER), ...Object.entries(NARROWER)]) assert.equal(classOf(from).family === 'cart', classOf(to!).family === 'cart', `${from} -> ${to}`);
});

test('the starters are cheap: a 300 m loop of dirt or cement slabs costs a fraction of the same loop of paved path or gravel drive', () => {
  const loop = (id: ClassId) => CLASS[id]!.cost * 150; // 150 tiles of 2 m
  assert.ok(loop('cart-dirt') <= 1500, `dirt: $${loop('cart-dirt')}`);
  assert.ok(loop('cart-slab') <= 3000, `cement slabs: $${loop('cart-slab')}`);
  assert.ok(loop('cart-dirt') < loop('drive-gravel') && loop('cart-slab') < loop('drive-gravel'), 'both starters cost less than the gravel drive');
  assert.ok(loop('cart') < loop('drive'), 'the paved cart path costs less than the paved drive');
});

test('golf tiers: both starter paths from tier 1, the paved cart path from tier 2; the drives keep theirs', () => {
  assert.equal(courseTierNeeded('cart-dirt'), 1); assert.equal(courseTierNeeded('cart-slab'), 1); assert.equal(courseTierNeeded('cart'), 2);
  assert.equal(courseTierNeeded('drive-gravel'), 1); assert.equal(courseTierNeeded('drive'), 2); assert.equal(courseTierNeeded('drive-avenue.gd'), 3);
  assert.equal(courseClassOpen('cart-dirt', 1), true); assert.equal(courseClassOpen('cart-slab', 1), true);
  assert.equal(courseClassOpen('cart', 1), false); assert.equal(courseClassOpen('cart', 2), true);
});

test('the dev unlock: with the sandbox unlock-all every course path and drive tier is open, in or out of a golf game; without it, the tiers rule', () => {
  const course = TYPES.filter(t => COURSE_FAMILIES.includes(t.family)).flatMap(t => VARIANTS[t.id]);
  assert.ok(course.length >= 9, `${course.length} course classes`);
  for (const id of course) {
    for (const tier of [null, 1, 2, 3]) assert.equal(courseRoadOpen(id, tier, true), true, `${id} at tier ${tier} with the dev unlock`);
    assert.equal(courseRoadOpen(id, null, false), false, `${id} outside golf without the dev unlock`);
    for (let tier = 1; tier <= 4; tier++) assert.equal(courseRoadOpen(id, tier, false), courseClassOpen(id, tier), `${id} at tier ${tier}`);
  }
  assert.equal(courseRoadOpen('cart', 1, false), false, 'production: the paved cart path waits for tier 2');
  assert.equal(courseRoadOpen('drive-avenue', 2, false), false, 'production: the avenue drive waits for tier 3');
});

test('the catalogue split: the Roads panel lists town roads only; the Course menu lists every cart path and drive, nothing else', () => {
  assert.ok(ROAD_TYPES.length > 0 && COURSE_TYPES.length > 0);
  for (const t of ROAD_TYPES) assert.ok(!COURSE_FAMILIES.includes(t.family) && !isCourseClass(t.id), `Roads lists ${t.id}`);
  for (const t of COURSE_TYPES) assert.ok(COURSE_FAMILIES.includes(t.family) && isCourseClass(t.id), `Course lists ${t.id}`);
  assert.deepEqual(COURSE_TYPES.map(t => t.id).sort(), [...CARTS, ...DRIVES].sort());
  assert.equal(ROAD_TYPES.length + COURSE_TYPES.length, TYPES.length, 'every palette entry is in exactly one menu');
  for (const id of ['gravel', 'lane', 'street', 'road', 'avenue', 'arterial', 'boulevard', 'six', 'grand', 'divided']) assert.ok(ROAD_TYPES.some(t => t.id === id), `Roads keeps ${id}`);
  for (const id of ['street', 'street.tr', 'divided']) assert.equal(isCourseClass(id), false, id);
  for (const id of ['cart-dirt', 'cart', 'drive.tr', 'drive-avenue.gd']) assert.equal(isCourseClass(id), true, id);
});

test('a dirt path crossing a street: a node, the street keeps its through traffic, the path gets no lanes and no car can turn onto it', () => {
  const net = netOf(['street', [leg(100, 200, 300, 200)]], ['cart-dirt', [leg(200, 120, 200, 280)]]);
  const g = new LaneGraph(); g.update(net);
  assert.deepEqual(checkGraph(g), [], 'a sound lane graph');
  const cart = g.dsegs.filter(d => d && d.seg.cls.noCars), street = g.dsegs.filter(d => d && !d.seg.cls.noCars);
  assert.ok(cart.length >= 2 && cart.every(d => d!.lanes.length === 0), 'the path has no lanes');
  assert.ok(street.length >= 2 && street.every(d => d!.lanes.length > 0), 'the street keeps its lanes');
  const moves = g.moves.filter(m => m);
  assert.ok(moves.every(m => !g.dsegs[m!.to]!.seg.cls.noCars && !g.dsegs[m!.from]!.seg.cls.noCars), 'no movement onto or off the path');
  const cross = [...net.nodes.values()].find(n => n.x === 200 && n.y === 200)!;
  assert.ok(cross && cross.arms.length === 4, 'the crossing is a node of four arms');
  assert.ok(moves.some(m => m!.node === cross && m!.turn === 'S'), 'the street runs straight on through the crossing');
});

test('a cart path T-joining a street from any side: one straight movement each way through the node, never back into its own seg', () => {
  const cases: [string, Leg, Leg][] = [
    ['north', leg(100, 200, 300, 200), leg(200, 200, 200, 120)], ['south', leg(100, 200, 300, 200), leg(200, 200, 200, 280)],
    ['west', leg(200, 100, 200, 300), leg(200, 200, 120, 200)], ['east', leg(200, 100, 200, 300), leg(200, 200, 280, 200)],
  ];
  for (const [side, street, path] of cases) {
    const net = netOf(['street', [street]], ['cart-slab', [path]]);
    const g = new LaneGraph(); g.update(net);
    assert.deepEqual(checkGraph(g), [], side);
    const node = [...net.nodes.values()].find(n => n.x === 200 && n.y === 200)!;
    assert.equal(node.arms.length, 3, `${side}: a node of three arms`);
    const moves = g.moves.filter(m => m && m.node === node);
    assert.equal(moves.length, 2, `${side}: one movement each way`);
    for (const m of moves) {
      const f = g.dsegs[m!.from]!, t = g.dsegs[m!.to]!;
      assert.notEqual(f.seg, t.seg, `${side}: not back into its own seg`);
      assert.ok(!f.seg.cls.noCars && !t.seg.cls.noCars, `${side}: street to street`);
      assert.equal(m!.turn, 'S', `${side}: straight on`);
    }
  }
});

test('a node of cart paths only builds no lanes; a car park never opens onto a cart path', () => {
  const net = netOf(['cart-slab', [leg(100, 100, 200, 100), leg(150, 50, 150, 100)]]);
  const g = new LaneGraph(); g.update(net);
  assert.deepEqual(checkGraph(g), []);
  assert.equal(g.lanes.filter(l => l).length, 0, 'no lanes anywhere');
  const PARK: CarParkDef = { id: 1, x: 400, y: 285, w: 15, h: 12 };
  assert.equal(frontage(netOf(['cart', [leg(200, 300, 800, 300)]]), PARK), null, 'no frontage on a paved cart path');
  assert.ok(frontage(netOf(['street', [leg(200, 300, 800, 300)]]), PARK), 'the same park opens onto a street');
});

test('no cart path grows town lots', () => {
  for (const id of CARTS) {
    const lm = new LotMap(); lm.update(netOf([id, [leg(40, 40, 240, 40)]]), null);
    assert.equal(lm.lots.size, 0, id);
  }
});

test('the paint: cement slabs a joint across the full width every 3 m, dirt two ruts and a grass strip, no decals on any cart path', () => {
  const fx = (id: ClassId) => {
    const net = netOf([id, [leg(0, 0, 60, 0)]]);
    const r: Route = [...net.routes][0]!;
    return (net as unknown as { routeFeatures(r: Route): { lines: { width: number; color: string; dash: [number, number] | null; offset: number }[]; decals: unknown[] } }).routeFeatures(r);
  };
  const slab = fx('cart-slab'), joints = slab.lines.filter(l => l.color === CEMENT_JOINT);
  assert.equal(joints.length, 1);
  assert.equal(joints[0]!.width, 2 * CLASS['cart-slab']!.h, 'the joint runs across the whole path');
  assert.ok(Math.abs(joints[0]!.dash![0] + joints[0]!.dash![1] - 1.5) < 1e-9, 'a joint every 1.5 tiles (3 m)');
  const dirt = fx('cart-dirt');
  assert.equal(dirt.lines.filter(l => l.color === DIRT_RUT).length, 2, 'two wheel ruts');
  assert.deepEqual(dirt.lines.filter(l => l.color === DIRT_RUT).map(l => Math.abs(l.offset)), [0.25, 0.25]);
  assert.equal(dirt.lines.filter(l => l.color === DIRT_GRASS && l.offset === 0).length, 1, 'a centre grass strip');
  assert.equal(fx('cart').lines.length, 0, 'the paved cart path is plain asphalt');
  for (const id of CARTS) assert.equal(fx(id).decals.length, 0, `${id}: no manholes, drains, oil or patches`);
});

test('the frontage snap at the new widths: a building beside any cart path or drive stands just off its surface, never over it', () => {
  for (const id of [...CARTS, ...DRIVES]) {
    const net = netOf([id, [leg(100, 100, 160, 100)]]);
    const segs = [...net.segs].map(snapSegOf);
    assert.ok(segs.every(s => s), `${id}: a snap target`);
    const c = CLASS[id]!, s = segs[0]!;
    assert.equal(s.kind, c.family === 'cart' ? 'path' : 'drive', id);
    assert.equal(s.verge, c.h + c.walk, id);
    const fp = { w: 8, d: 6 }, snap = snapFrontage(130, 106, fp, segs as NonNullable<typeof s>[], 6)!;
    assert.ok(snap, `${id}: snaps from 6 tiles off`);
    const front = snap.cy - fp.d / 2; // the footprint lies south of the path (y grows south), its front edge toward it
    assert.ok(Math.abs(front - 100 - (c.h + c.walk)) < 1e-9, `${id}: the front edge on the verge (${front - 100} tiles off the centre line)`);
    assert.ok(front - 100 >= c.h, `${id}: clear of the surface`);
    assert.deepEqual(snap.face, { x: 0, y: -1 }, `${id}: faces the path`);
  }
  assert.equal(snapSegOf([...netOf(['street', [leg(0, 0, 40, 0)]]).segs][0]!), null, 'a town street is no snap target');
});
