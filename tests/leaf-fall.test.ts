// The fallen leaves (T220, #605): stamps laid from the trees, fences, walls, buildings, yards and roads, seeded by their place in the world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LK, MOOD, MOODS, ORIENTS, PIC_COUNT, PIC_LEAF, PIC_REACH, STAMP, WIND, clampLeafDensity, kindOfPic, layLeaves, leafPictures, leafSignature, orientOf, picInfo, picOf,
  type LeafRoad, type LeafSources,
} from '../src/game/leaf-fall';
import { CASTER_STRIDE, CK, casterOf, treeLeaves, type Box } from '../src/game/living-ground';

const rec = (...v: number[]) => { assert.equal(v.length, CASTER_STRIDE); return v; };
const tree = (x: number, y: number, r: number, mood = MOOD.MAPLE + 1, bare = 0.6, leafy = 1) => rec(CK.TREE, x, y, r, leafy, mood, bare);
const fence = (x0: number, y0: number, x1: number, y1: number) => rec(CK.FENCE, x0, y0, x1, y1, 0.05, 0);
const house = (x0: number, y0: number, x1: number, y1: number, dx = NaN, dy = NaN) => rec(CK.BUILDING, x0, y0, x1, y1, dx, dy);
const casters = (...recs: number[][]) => new Float32Array(recs.flat());
/** a house lot's lawn from the street side: o, o + u w, o + u w + n d, o + n d */
const yard = (ox: number, oy: number, w: number, d: number) => [ox, oy, ox + w, oy, ox + w, oy + d, ox, oy + d];
const stamps = (s: Float32Array) => { const out: { x: number; y: number; pic: number }[] = []; for (let k = 0; k < s.length; k += STAMP) out.push({ x: s[k]!, y: s[k + 1]!, pic: s[k + 2]! }); return out; };
const key = (p: { x: number; y: number; pic: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.pic}`;
const BOX: Box = [0, 0, 40, 40];
/** a back yard: a lot 16 wide and 12 deep from the street at y 10, its house, a maple in the back yard, fences round the back */
const backyard = (): LeafSources => ({
  casters: casters(house(4, 12, 12, 17, 8, 12), tree(9, 19.5, 2), fence(0, 22, 16, 22), fence(0, 16, 0, 22), fence(16, 16, 16, 22)),
  yards: [yard(0, 10, 16, 12)],
  roads: [{ ax: -10, ay: 8, bx: 30, by: 8, h: 1.625, walk: 1.025, keep: 1 }],
});

test('density 0 lays nothing (the ground exactly as before), and the knob is held to 0..2', () => {
  assert.equal(layLeaves(BOX, backyard(), 0).length, 0);
  assert.equal(clampLeafDensity(-1), 0); assert.equal(clampLeafDensity(5), 2); assert.equal(clampLeafDensity(NaN), 1);
});

test('a back yard gets hundreds of leaves: piles under its tree, drifts along its fences and house, a scatter over the lawn', () => {
  const all = stamps(layLeaves(BOX, backyard(), 1)), pics = leafPictures();
  const leaves = all.reduce((n, p) => n + pics[p.pic]!.length / PIC_LEAF, 0);
  const by = (k: number) => all.filter(p => kindOfPic(p.pic) === k).length;
  console.log(`backyard: ${all.length} stamps, ${Math.round(leaves)} leaves; piles ${by(LK.PILE)}, drifts ${by(LK.DRIFT)}, scatters ${by(LK.SCATTER)}, smalls ${by(LK.SMALL)}`);
  assert.ok(leaves > 800, `${leaves} leaves`);
  assert.ok(by(LK.PILE) >= 8 && by(LK.DRIFT) >= 10 && by(LK.SCATTER) >= 10, 'every kind is laid');
  // the piles lie under the tree, mostly downwind of the trunk
  const piles = all.filter(p => kindOfPic(p.pic) === LK.PILE && Math.hypot(p.x - 9, p.y - 19.5) < 5);
  const down = piles.reduce((s, p) => s + (p.x - 9) * WIND[0] + (p.y - 19.5) * WIND[1], 0) / piles.length;
  assert.ok(down > 0.3, `the piles lean downwind (${down})`);
  // none inside the house; the door kept clear
  assert.ok(!all.some(p => p.x > 4 && p.x < 12 && p.y > 12 && p.y < 17), 'nothing inside the house');
  assert.ok(!all.some(p => kindOfPic(p.pic) === LK.DRIFT && Math.hypot(p.x - 8, p.y - 11.8) < 0.6), 'the door is clear');
  // the back yard holds more than the front (per tile of open lawn, away from the tree and the house)
  const front = all.filter(p => p.y > 10 && p.y < 12 && kindOfPic(p.pic) >= LK.SCATTER).length / (16 * 2), back = all.filter(p => p.y > 17 && p.y < 22 && kindOfPic(p.pic) >= LK.SCATTER).length / (16 * 5);
  assert.ok(back > front, `back ${back} vs front ${front}`);
});

test('the same stamps whichever chunk asks: two boxes that share a strip agree on it', () => {
  const src = backyard(), a = stamps(layLeaves([0, 0, 10, 40], src, 1)), b = stamps(layLeaves([6, 0, 20, 40], src, 1));
  const inStrip = (p: { x: number; y: number }) => p.x > 6 + PIC_REACH + 0.1 && p.x < 10 - 0.01;
  const ka = new Set(a.filter(inStrip).map(key)), kb = new Set(b.filter(inStrip).map(key));
  assert.ok(ka.size > 5, `the strip holds stamps (${ka.size})`);
  assert.deepEqual([...ka].sort(), [...kb].sort());
  // and a re-lay is the same
  assert.deepEqual(layLeaves(BOX, src, 1), layLeaves(BOX, src, 1));
});

test('a lower density lays a subset of a higher one\'s', () => {
  const lo = new Set(stamps(layLeaves(BOX, backyard(), 0.4)).map(key)), hi = new Set(stamps(layLeaves(BOX, backyard(), 1)).map(key));
  assert.ok(lo.size > 30 && hi.size > lo.size * 1.8, `${lo.size} vs ${hi.size}`);
  for (const k of lo) assert.ok(hi.has(k), `stamp ${k} of the lower density is in the higher`);
});

test('a street tree drops into the gutter along the kerb (drifts along the road), a scatter on the sidewalk, fewer on a busy road', () => {
  // a road down x = 20 and a tree just past its west sidewalk: the wind (toward +x) carries the tree's leaves over the road
  const road = (keep: number): LeafRoad => ({ ax: 20, ay: 0, bx: 20, by: 40, h: 1.625, walk: 1.025, keep });
  const src = (keep: number): LeafSources => ({ casters: casters(tree(17.1, 20, 2.2)), roads: [road(keep)] });
  const quiet = stamps(layLeaves(BOX, src(1), 1)), busy = stamps(layLeaves(BOX, src(0.3), 1)), across = (p: { x: number }) => Math.abs(p.x - 20);
  const onRoad = quiet.filter(p => across(p) < 1.625);
  assert.ok(onRoad.length >= 3, `leaves in the road (${onRoad.length})`);
  for (const p of onRoad) {
    assert.ok(across(p) > 1.3, `in the gutter, by the kerb (${p.x})`);
    assert.equal(kindOfPic(p.pic), LK.DRIFT); assert.equal(picInfo(p.pic).orient, orientOf(0, 1), 'along the road');
  }
  const walk = quiet.filter(p => across(p) >= 1.625 && across(p) < 2.65);
  assert.ok(walk.length >= 2 && walk.every(p => kindOfPic(p.pic) !== LK.PILE), 'the sidewalk gets scatters, not piles');
  const inRoad = (l: typeof quiet) => l.filter(p => across(p) < 2.65).length;
  assert.ok(inRoad(busy) < inRoad(quiet) * 0.7, `a busy road keeps fewer (${inRoad(busy)} vs ${inRoad(quiet)})`);
});

test('blocked ground (water, the course) and conifers get none; a tree drops its own colour', () => {
  const src: LeafSources = { casters: casters(tree(20, 20, 2)), blocked: x => x < 20 };
  assert.ok(stamps(layLeaves(BOX, src, 1)).every(p => p.x >= 20));
  assert.equal(layLeaves(BOX, { casters: casters(tree(20, 20, 2, 1, 0.6, 0.5)) }, 1).length, 0, 'a conifer drops no broad leaves');
  const oak = stamps(layLeaves(BOX, { casters: casters(tree(20, 20, 2, MOOD.OAK + 1)) }, 1)), mood = (p: number) => picInfo(p).mood;
  assert.ok(oak.filter(p => mood(p.pic) === MOOD.OAK).length > oak.length * 0.6, 'an oak\'s leaves are mostly brown');
  // a near-bare tree drops more than a full one
  const n = (bare: number) => layLeaves(BOX, { casters: casters(tree(20, 20, 2, 1, bare)) }, 1).length;
  assert.ok(n(1) > n(0.35) * 1.4, `${n(1)} vs ${n(0.35)}`);
});

test('the pictures: every index has leaves, drifts turn with their direction, every mood mixes its colours', () => {
  const pics = leafPictures();
  assert.equal(pics.length, PIC_COUNT);
  for (const p of pics) assert.ok(p.length >= 2 * PIC_LEAF && p.length % PIC_LEAF === 0);
  // a drift's leaves lie along its direction: the spread along it beats the spread across it
  for (let o = 0; o < ORIENTS; o++) {
    const v = pics[picOf(LK.DRIFT, 1, o, MOOD.MIXED)]!, a = (o * Math.PI) / ORIENTS; let along = 0, across = 0;
    for (let k = 0; k < v.length; k += PIC_LEAF) { const x = v[k]!, y = v[k + 1]!; along += (x * Math.cos(a) + y * Math.sin(a)) ** 2; across += (-x * Math.sin(a) + y * Math.cos(a)) ** 2; }
    assert.ok(along > across * 3, `drift ${o}: along ${along} across ${across}`);
  }
  // every leaf within the reach the chunks lay their margin by
  for (const v of pics) for (let k = 0; k < v.length; k += PIC_LEAF) assert.ok(Math.hypot(v[k]!, v[k + 1]!) <= PIC_REACH, 'within the reach');
  for (let m = 0; m < MOODS; m++) { const cols = new Set<number>(); pics.forEach((v, i) => { if (picInfo(i).mood === m) for (let k = 4; k < v.length; k += PIC_LEAF) cols.add(v[k]!); }); assert.ok(cols.size >= 4, `mood ${m} mixes ${cols.size} colours`); }
  // picOf and picInfo agree
  for (let i = 0; i < PIC_COUNT; i++) { const q = picInfo(i); assert.equal(picOf(q.kind, q.shape, q.orient, q.mood), i); }
});

test('trees carry their leaves\' colour and bareness in their caster record; the signature follows the casters and the density', () => {
  assert.deepEqual(treeLeaves('capital:tree-maple-near-bare'), [MOOD.MAPLE + 1, 1]);
  assert.deepEqual(treeLeaves('world:tree_oak_1'), [MOOD.OAK + 1, 0.5]);
  assert.deepEqual(treeLeaves('ref:tree-birch-gold'), [MOOD.BIRCH + 1, 0.5]);
  assert.equal(treeLeaves('world:tree_pine_0')[0], MOOD.MIXED + 1);
  const out: number[] = []; casterOf({ kind: 'tree', id: 'capital:tree-oak-moderate', cat: 'Capital vegetation', big: false, x0: 9.6, y0: 9.7, x1: 10.4, y1: 10.3, across: 3 }, out);
  assert.equal(out[5], MOOD.OAK + 1); assert.equal(out[6], 0.35);
  const c = casters(tree(1, 1, 2));
  assert.equal(leafSignature({ casters: c }, 1), leafSignature({ casters: casters(tree(1, 1, 2)) }, 1));
  assert.notEqual(leafSignature({ casters: c }, 1), leafSignature({ casters: c }, 0.5));
  assert.notEqual(leafSignature({ casters: c }, 1), leafSignature({ casters: casters(tree(1, 1.5, 2)) }, 1));
});
