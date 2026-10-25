// The living ground (T111, #198): influence maps from what stands on the terrain, choosing the grass variants and doubling as ambient occlusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASTER_STRIDE, CK, CasterStore, SHADOW_DIR, casterChange, casterOf, debugImage, doorToward, influence, livingMasks, livingQueryBox, livingRes, livingSignature, openNoise,
  pxAcross, variantFamilies, type Box, type InfluenceGrid, type LivingSources,
} from '../src/game/living-ground';
import { CHUNK_H, CHUNK_W, worldX, worldY } from '../src/game/iso';

const rec = (...v: number[]) => { assert.equal(v.length, CASTER_STRIDE); return v; };
const fence = (x0: number, y0: number, x1: number, y1: number) => rec(CK.FENCE, x0, y0, x1, y1, 0.05, 0);
const tree = (x: number, y: number, r: number, leafy = 1) => rec(CK.TREE, x, y, r, leafy, 0, 0);
const src = (...recs: number[][]): LivingSources => ({ casters: new Float32Array(recs.flat()) });
/** a channel's value at tile (x, y), bilinear between the samples (as the renderer stretches the masks over a chunk) */
const at = (g: InfluenceGrid, ch: 'lush' | 'thin' | 'bare' | 'litter' | 'ao', x: number, y: number) => {
  const u = x * g.res - g.ix0 - 0.5, v = y * g.res - g.iy0 - 0.5, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
  assert.ok(i >= 0 && j >= 0 && i + 1 < g.w && j + 1 < g.h, `(${x}, ${y}) is on the grid`);
  const c = g[ch], q = j * g.w + i;
  return (c[q]! * (1 - fx) + c[q + 1]! * fx) * (1 - fy) + (c[q + g.w]! * (1 - fx) + c[q + g.w + 1]! * fx) * fy;
};
const BOX: Box = [0, 0, 40, 40];

test('a fence line makes a lush band beside it and soft darkening at its base, and nothing further out', () => {
  const bare = influence(BOX, 4, src()), g = influence(BOX, 4, src(fence(10, 20, 30, 20)));
  // 0.6 m off the line (0.3 tiles), on either side: lush well above the open ground's own patches; the base darkened
  for (const y of [19.7, 20.3]) {
    assert.ok(at(g, 'lush', 20, y) - at(bare, 'lush', 20, y) > 0.35, `lush band at y ${y}: ${at(g, 'lush', 20, y)} vs ${at(bare, 'lush', 20, y)}`);
    assert.ok(at(g, 'lush', 20, y) > 0.8);
  }
  assert.ok(at(g, 'ao', 20, 20.1) > 0.2, 'the base is darkened');
  // 4 m out (2 tiles) the fence no longer counts
  assert.ok(Math.abs(at(g, 'lush', 20, 22) - at(bare, 'lush', 20, 22)) < 1e-6);
  assert.equal(at(g, 'ao', 20, 22), 0);
  // the band runs the fence's length, and stops past its ends
  assert.ok(at(g, 'lush', 12, 20.3) > 0.8 && at(g, 'lush', 28, 20.3) > 0.8);
  assert.ok(Math.abs(at(g, 'lush', 33, 20.3) - at(bare, 'lush', 33, 20.3)) < 1e-6);
  // panels end to end make one band: no darker knot where two meet
  const two = influence(BOX, 4, src(fence(10, 20, 20, 20), fence(20, 20, 30, 20)));
  assert.ok(Math.abs(at(two, 'ao', 20, 20.25) - at(g, 'ao', 20, 20.25)) < 1e-6, 'a joint is not darker than the panel');
  // and its mask: the lush strip is laid there, not out on the open ground
  const m = livingMasks(g), lushA = (x: number, y: number) => m.lush[((Math.round(y * 4 - g.iy0 - 0.5)) * g.w + Math.round(x * 4 - g.ix0 - 0.5)) * 4 + 3]!;
  assert.ok(lushA(20, 20.3) > lushA(20, 23) + 60, `lush mask by the fence ${lushA(20, 20.3)} vs out ${lushA(20, 23)}`);
});

test('a tree makes a patchy disc, bare at the trunk and fading to its drip line, with litter, and its canopy shade toward 145 degrees', () => {
  const R = 2.5, T = [20, 20] as const, none = influence(BOX, 4, src()), g = influence(BOX, 4, src(tree(T[0], T[1], R)));
  assert.ok(at(g, 'thin', 20, 20) > 0.85, 'thin at the trunk');
  assert.ok(at(g, 'bare', 20, 20) > 0.6, 'bare soil at the trunk');
  assert.ok(at(g, 'litter', 20, 20) > 0.8, 'leaf litter under the canopy');
  // fading out: half way it is thinner than at the trunk, past the drip line nothing of it is left
  assert.ok(at(g, 'thin', 20 + R * 0.5, 20) < at(g, 'thin', 20, 20) && at(g, 'thin', 20 + R * 0.5, 20) > 0.3);
  assert.ok(at(g, 'bare', 20 + R * 0.8, 20) < 0.1, 'the bare core stays near the trunk');
  assert.ok(Math.abs(at(g, 'thin', 20 + R * 1.15, 20) - at(none, 'thin', 20 + R * 1.15, 20)) < 0.02, 'the drip line');
  // the ambient occlusion: contact darkening at the trunk, the canopy's shade lying toward the shadow side (the sun at the upper right)
  assert.ok(at(g, 'ao', 20, 20) > 0.3, `trunk shade ${at(g, 'ao', 20, 20)}`);
  const [sx, sy] = SHADOW_DIR, k = R * 0.8;
  assert.ok(at(g, 'ao', 20 + sx * k, 20 + sy * k) > at(g, 'ao', 20 - sx * k, 20 - sy * k) + 0.05, 'shade on the shadow side');
  assert.ok(sy > 0.9 && sx > 0, 'the shadow falls toward the lower left on screen: +y in tiles');
  assert.equal(at(g, 'ao', 20 + R * 2.2, 20), 0);
  // a conifer drops less litter than a broadleaf tree
  const pine = influence(BOX, 4, src(tree(20, 20, R, 0.5)));
  assert.ok(at(pine, 'litter', 20 + R * 0.6, 20) < at(g, 'litter', 20 + R * 0.6, 20));
  // the masks break the disc up into patches (painted, never a smooth disc): along a ring at half the radius the thin mask varies
  const m = livingMasks(g), vals: number[] = [];
  for (let a = 0; a < 64; a++) { const x = 20 + Math.cos(a / 64 * 2 * Math.PI) * R * 0.7, y = 20 + Math.sin(a / 64 * 2 * Math.PI) * R * 0.7; vals.push(m.thin[((Math.round(y * 4 - g.iy0 - 0.5)) * g.w + Math.round(x * 4 - g.ix0 - 0.5)) * 4 + 3]!); }
  assert.ok(Math.max(...vals) - Math.min(...vals) > 40, `the patchy ring varies: ${Math.min(...vals)}..${Math.max(...vals)}`);
});

test('buildings darken round their foundations and wear the ground at the door; roads leave a worn edge and a lush verge; water a lush bank', () => {
  const house = rec(CK.BUILDING, 10, 10, 16, 14, 13, 14), g = influence(BOX, 4, src(house)), none = influence(BOX, 4, src());
  assert.ok(at(g, 'ao', 16.2, 12) > 0.3, 'foundation shade');
  assert.ok(at(g, 'thin', 13, 14.6) > 0.7 && at(g, 'bare', 13, 14.4) > 0.4, 'the door wears the ground');
  assert.ok(at(g, 'thin', 13, 9.4) < at(g, 'thin', 13, 14.6), 'the back is less worn than the door');
  const road: LivingSources = { casters: new Float32Array(0), roads: [{ ax: 0, ay: 30, bx: 40, by: 30, hw: 2 }] }, r = influence(BOX, 4, road);
  assert.ok(at(r, 'thin', 20, 32.25) - at(none, 'thin', 20, 32.25) > 0.2, 'a trampled band at the edge');
  assert.ok(at(r, 'ao', 20, 32.1) > 0.1, 'a small shade at the kerb');
  assert.ok(at(r, 'lush', 20, 33.6) - at(none, 'lush', 20, 33.6) > 0.2, 'a lush verge beyond it');
  const pond: LivingSources = { casters: new Float32Array(0), shores: [{ pts: [5, 5, 12, 5, 12, 12, 5, 12], ring: true }] }, p = influence(BOX, 4, pond);
  assert.ok(at(p, 'lush', 13, 8) - at(none, 'lush', 13, 8) > 0.4, 'lush beside the water');
  assert.ok(Math.abs(at(p, 'lush', 20, 8) - at(none, 'lush', 20, 8)) < 1e-6, 'not far from it');
  const river: LivingSources = { casters: new Float32Array(0), rivers: [{ pts: [{ x: 0, y: 20, w: 6 }, { x: 40, y: 20, w: 6 }], bank: 2.6 }] }, v = influence(BOX, 4, river);
  assert.ok(at(v, 'lush', 20, 26.2) - at(none, 'lush', 20, 26.2) > 0.4, 'lush past the river bank');
});

test('neighbouring chunks agree at their seam: every sample depends only on its world point and the casters within reach', () => {
  const store = new CasterStore();
  // things standing across the seam at x = 32: a tree on it, a fence crossing it, a house beside it
  store.set('p:a', new Float32Array([...tree(32, 16, 3), ...fence(26, 24, 38, 24), ...rec(CK.BUILDING, 33, 4, 37, 8, NaN, NaN)]));
  store.set('p:b', new Float32Array([...tree(29.5, 9, 2), ...tree(36, 28, 2.5, 0.5)]));
  const roads = [{ ax: 32, ay: 0, bx: 32, by: 64, hw: 1.5, cart: true }];
  for (const res of [4, 2, 1, 0.5]) {
    const A: Box = [0, 0, 32, 32], B: Box = [32, 0, 64, 32];
    const gA = influence(A, res, { casters: store.query(livingQueryBox(A, res)), roads }), gB = influence(B, res, { casters: store.query(livingQueryBox(B, res)), roads });
    const mA = livingMasks(gA), mB = livingMasks(gB);
    let n = 0;
    for (let j = 0; j < gA.h; j++) for (let i = 0; i < gA.w; i++) {
      const gi = gA.ix0 + i, gj = gA.iy0 + j, bi = gi - gB.ix0, bj = gj - gB.iy0;
      if (bi < 0 || bi >= gB.w || bj < 0 || bj >= gB.h) continue;
      const qa = j * gA.w + i, qb = bj * gB.w + bi; n++;
      for (const ch of ['lush', 'thin', 'bare', 'litter', 'ao'] as const) assert.ok(Math.abs(gA[ch][qa]! - gB[ch][qb]!) < 1e-5, `res ${res} ${ch} at sample (${gi}, ${gj}): ${gA[ch][qa]} vs ${gB[ch][qb]}`);
      for (const mk of ['lush', 'thin', 'bare', 'litter', 'ao'] as const) for (let k = 0; k < 4; k++) assert.ok(Math.abs(mA[mk][qa * 4 + k]! - mB[mk][qb * 4 + k]!) <= 1, `res ${res} mask ${mk}`);
    }
    assert.ok(n >= 4 * gA.h, `the grids overlap at the seam (res ${res}: ${n} samples)`);
  }
});

test('an edit re-bakes only the chunks under what changed', () => {
  // a prop cell with forty fence panels and ten trees; one panel moves
  const recs: number[] = [];
  for (let k = 0; k < 40; k++) recs.push(...fence(100 + k * 2, 100, 102 + k * 2, 100));
  for (let k = 0; k < 10; k++) recs.push(...tree(100 + k * 8, 110, 2));
  const old = new Float32Array(recs), moved = new Float32Array(recs);
  moved[5 * CASTER_STRIDE + 2] = 101; moved[5 * CASTER_STRIDE + 4] = 101; // panel 5 one tile down
  assert.equal(casterChange(old, old.slice()), null, 'the same records: nothing to re-bake');
  const box = casterChange(old, moved)!;
  assert.ok(box, 'a moved panel changes something');
  assert.ok(box[0] >= 108 && box[2] <= 114 && box[1] >= 98 && box[3] <= 103, `only round panel 5: ${box}`);
  // the chunks under that box (as GroundCache.invalidate finds them): a handful, out of the many under the whole cell
  const chunksUnder = (b: Box) => {
    const xs = [worldX(b[0], b[1]), worldX(b[2], b[1]), worldX(b[0], b[3]), worldX(b[2], b[3])], ys = [worldY(b[0], b[1]), worldY(b[2], b[1]), worldY(b[0], b[3]), worldY(b[2], b[3])];
    return (Math.floor(Math.max(...xs) / CHUNK_W) - Math.floor(Math.min(...xs) / CHUNK_W) + 1) * (Math.floor(Math.max(...ys) / CHUNK_H) - Math.floor(Math.min(...ys) / CHUNK_H) + 1);
  };
  const all = casterChange(undefined, old)!;
  assert.ok(chunksUnder(box) <= 4, `a moved panel touches ${chunksUnder(box)} chunks`);
  assert.ok(chunksUnder(all) > chunksUnder(box) * 2, `the whole cell touches ${chunksUnder(all)}`);
  // a removed tree: just round it; reordered records: nothing
  const fewer = new Float32Array([...recs.slice(0, 45 * CASTER_STRIDE), ...recs.slice(46 * CASTER_STRIDE)]), gone = casterChange(old, fewer)!;
  assert.ok(gone[0] > 130 && gone[2] < 150, `only round the removed tree: ${gone}`);
  const shuffled = new Float32Array([...recs.slice(CASTER_STRIDE), ...recs.slice(0, CASTER_STRIDE)]);
  assert.equal(casterChange(old, shuffled), null);
});

test('a re-bake with the same sources reuses its maps; any change to them is a new signature', () => {
  const base = (): LivingSources => ({ casters: new Float32Array([...tree(5, 5, 2), ...fence(1, 1, 4, 1)]), roads: [{ ax: 0, ay: 9, bx: 20, by: 9, hw: 1.5 }], paths: [[2, 2, 3, 2, 3, 3]], shores: [{ pts: [8, 8, 9, 8, 9, 9], ring: true }] });
  const s0 = livingSignature(2, base());
  assert.equal(livingSignature(2, base()), s0, 'the same sources');
  assert.notEqual(livingSignature(3, base()), s0, 'another density');
  const moved = base(); moved.casters[1] = 5.1; assert.notEqual(livingSignature(2, moved), s0, 'a tree moved 20 cm');
  const road = base(); road.roads = [{ ax: 0, ay: 9, bx: 20, by: 9, hw: 2 }]; assert.notEqual(livingSignature(2, road), s0, 'a wider road');
  const door = new Float32Array(rec(CK.BUILDING, 1, 1, 4, 4, NaN, NaN)), door2 = new Float32Array(rec(CK.BUILDING, 1, 1, 4, 4, 2, 4));
  assert.notEqual(livingSignature(1, { casters: door }), livingSignature(1, { casters: door2 }), 'a door added');
});

test('the caster store finds what reaches a box, and forgets keys and whole families', () => {
  const s = new CasterStore();
  s.set('p:1', new Float32Array([...fence(10, 10, 14, 10), ...tree(200, 200, 2)]));
  s.set('f:7', new Float32Array(tree(300, 40, 1.5)));
  s.set('t:7', new Float32Array(tree(302, 44, 1.5)));
  assert.equal(s.query([0, 0, 20, 20]).length / CASTER_STRIDE, 1);
  assert.equal(s.query([195, 195, 205, 205]).length / CASTER_STRIDE, 1);
  assert.equal(s.query([280, 20, 320, 60]).length / CASTER_STRIDE, 2);
  assert.equal(s.query([500, 500, 510, 510]).length, 0);
  // a tree's canopy reaches past its trunk: a box just beside it still finds it
  assert.equal(s.query([203, 198, 206, 202]).length / CASTER_STRIDE, 1);
  s.dropPrefix('f:'); assert.equal(s.query([280, 20, 320, 60]).length / CASTER_STRIDE, 1);
  s.drop('p:1'); assert.equal(s.query([0, 0, 20, 20]).length, 0); assert.equal(s.size, 1);
  s.set('t:7', new Float32Array(0)); assert.equal(s.size, 0, 'an empty set drops the key');
});

test('props become casters: fences and hedges as lines, trees by their canopy, buildings with a door toward the road; decor casts nothing', () => {
  const out: number[] = [];
  casterOf({ kind: 'fencex', id: 'expansion:fence-privacy-x', cat: 'Fences', big: false, x0: 10, y0: 5, x1: 12, y1: 5.1, across: 1 }, out);
  assert.deepEqual(out.slice(0, 5).map(v => +v.toFixed(3)), [CK.FENCE, 10, 5.05, 12, 5.05]);
  out.length = 0; casterOf({ kind: 'fencex', id: 'world:hedge', cat: 'Trees & plants', big: false, x0: 3, y0: 3, x1: 3.8, y1: 3.8, across: 1 }, out); assert.equal(out[0], CK.HEDGE);
  out.length = 0; casterOf({ kind: 'decor', id: 'world:bench', cat: 'Yard', big: false, x0: 0, y0: 0, x1: 1, y1: 1, across: 1 }, out); assert.equal(out.length, 0);
  out.length = 0; casterOf({ kind: 'car', id: 'car:1', cat: 'Vehicles', big: true, x0: 0, y0: 0, x1: 1, y1: 2, across: 1 }, out); assert.equal(out.length, 0);
  // a tree 420 px across at scale 1 (a town tree) has a canopy about 2 tiles (4 m) round
  out.length = 0; casterOf({ kind: 'tree', id: 'capital:tree-oak-open', cat: 'Capital vegetation', big: false, x0: 9.6, y0: 9.7, x1: 10.4, y1: 10.3, across: pxAcross(411) }, out);
  assert.equal(out[0], CK.TREE); assert.ok(out[3]! > 1.6 && out[3]! < 2.4, `canopy radius ${out[3]}`); assert.equal(out[4], 1);
  const door = doorToward(10, 10, 16, 14, { x: 13, y: 20 })!;
  assert.deepEqual(door, { x: 13, y: 14 }, 'the door is on the side facing the road');
  assert.deepEqual(doorToward(10, 10, 16, 14, { x: 30, y: 12 }), { x: 16, y: 12 });
  assert.equal(doorToward(10, 10, 16, 14, null), null);
  out.length = 0; casterOf({ kind: 'house', id: 'town:house_1', cat: 'Houses', big: true, x0: 10, y0: 10, x1: 16, y1: 14, across: 4, door }, out);
  assert.deepEqual(out, [CK.BUILDING, 10, 10, 16, 14, 13, 14]);
});

test('the open ground has slow natural patches that never repeat at the grass pictures\' periods', () => {
  // the correlation of the open noise with itself shifted by 24, 48 and 96 tiles (the painted grass's 48, 96 and 192 m pictures) stays low
  const N = 96, a: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) a.push(openNoise(i * 1.5, j * 1.5));
  for (const lag of [24, 48, 96]) {
    const b: number[] = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) b.push(openNoise(i * 1.5 + lag, j * 1.5 + lag * 0.5));
    const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
    let ab = 0, aa = 0, bb = 0; for (let k = 0; k < a.length; k++) { ab += (a[k]! - ma) * (b[k]! - mb); aa += (a[k]! - ma) ** 2; bb += (b[k]! - mb) ** 2; }
    assert.ok(Math.abs(ab / Math.sqrt(aa * bb)) < 0.3, `r at a ${lag}-tile shift: ${(ab / Math.sqrt(aa * bb)).toFixed(3)}`);
  }
  // it varies: some lush, some thin ground
  assert.ok(Math.max(...a) > 0.5 && Math.min(...a) < -0.5);
});

test('sample density follows the bake level, masks and the debug view have one RGBA px per sample', () => {
  assert.equal(livingRes(0.6, false), 3); assert.equal(livingRes(0.3, false), 2); assert.equal(livingRes(0.2, false), 1);
  assert.equal(livingRes(0.14, true), 1); assert.equal(livingRes(0.05, true), 0.5);
  const g = influence([0, 0, 10, 10], 2, src(tree(5, 5, 2))), m = livingMasks(g), d = debugImage(g);
  for (const k of ['lush', 'thin', 'bare', 'litter', 'ao'] as const) assert.equal(m[k].length, g.w * g.h * 4);
  assert.equal(d.length, g.w * g.h * 4);
  assert.ok(m.max.thin > 0.5 && m.max.ao > 0.2, `max thin ${m.max.thin} ao ${m.max.ao}`);
  // the ambient occlusion is a cool multiply (blue kept most), never grey: under the trunk blue > red
  const q = (Math.round(5 * 2 - g.iy0 - 0.5) * g.w + Math.round(5 * 2 - g.ix0 - 0.5)) * 4;
  assert.ok(m.ao[q + 2]! > m.ao[q]! + 10, `cool shade ${m.ao[q]} ${m.ao[q + 1]} ${m.ao[q + 2]}`);
  assert.ok(m.ao[q]! < 255);
});

test('the variant art drops in by file name: a set needs all three levels, the newest version wins', () => {
  const fams = variantFamilies({
    '../assets/ground/painted/grass-lush-close-v1.webp': 'u1', '../assets/ground/painted/grass-lush-close-v2.webp': 'u2',
    '../assets/ground/painted/grass-lush-mid-v1.webp': 'u3', '../assets/ground/painted/grass-lush-far-v1.png': 'u4',
    '../assets/ground/painted/leaf-litter-near-v1.webp': 'u5', '../assets/ground/painted/leaf-litter-mid-v1.webp': 'u6',
    '../assets/ground/painted/grass-near-v1.webp': 'g',
  });
  assert.deepEqual(Object.keys(fams), ['grass-lush'], 'leaf-litter has no far level yet; the base grass is no variant');
  assert.equal(fams['grass-lush']!.near.src, 'u2');
  assert.deepEqual([fams['grass-lush']!.near.metres, fams['grass-lush']!.mid.metres, fams['grass-lush']!.far.metres], [48, 96, 192]);
});
