// Zooming without glitches (T197, the owner: "zooming in and out glitches the textures alot"): the chunks a zoom shows next are baked ahead
// (ground-layers.ts prebakeTargets), and a tile band switch crossfades like any zoom level (chunkLayers). npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkLayers, prebakeTargets, type PrebakeLevels, type PrebakeView } from '../src/game/ground-layers';

// a toy ground: full chunks 100 x 50 world px, district chunks 400 x 200; the district tier below z 0.1; raster level = z rounded
const LV: PrebakeLevels = {
  levels: z => ({ district: z < 0.1, artL: Math.round(z * 100) / 100, rasterL: Math.round(z * 100) / 100 }),
  spec: (z) => (z < 0.15 ? 1 : 0), zMin: 0.035, zMax: 0.3, chunk: { g: [100, 50], m: [400, 200] },
};
const view = (z: number, kind: 'g' | 'm' | 'p'): PrebakeView => {
  const ze = z, cw = 160, ch = 90, X = 0, Y = 0;
  return { X, Y, cw, ch, dpr: 1, z, kind, box: [X - cw / 2 / ze, Y - ch / 2 / ze, X + cw / 2 / ze, Y + ch / 2 / ze], band: 0 };
};
const none = () => false;

test('a chunk of the tier drawn now that is on screen is never baked ahead (one picture a chunk: it would blur it now)', () => {
  const v = view(0.2, 'g'), out = prebakeTargets(v, LV, [1 / 1.6], none, 1000);
  assert.ok(out.length > 0, 'the ring a zoom out uncovers');
  for (const p of out) {
    if (p.kind !== 'g') continue;
    const x0 = p.i * 100, y0 = p.j * 50;
    assert.ok(!(x0 + 100 > v.box[0] && x0 < v.box[2] && y0 + 50 > v.box[1] && y0 < v.box[3]), `g ${p.i},${p.j} is on screen`);
  }
});

test('a chunk with any picture is left as it is; the rest come nearest the camera first, nearer zooms first, up to the limit', () => {
  const v = view(0.2, 'g');
  const all = prebakeTargets(v, LV, [1 / 1.6, 1 / 3], none, 1000);
  const some = prebakeTargets(v, LV, [1 / 1.6, 1 / 3], (k, i, j) => k === 'g' && (i + j) % 2 === 0, 1000);
  assert.ok(some.length < all.length && some.every(p => !(p.kind === 'g' && (p.i + p.j) % 2 === 0)), 'pictured chunks skipped');
  const three = prebakeTargets(v, LV, [1 / 1.6, 1 / 3], none, 3);
  assert.equal(three.length, 3);
  assert.deepEqual(three, all.slice(0, 3), 'the limit takes the first');
  const firstFar = all.findIndex(p => p.kind === 'm');
  assert.ok(firstFar > 0 && all.slice(0, firstFar).every(p => p.kind === 'g'), 'the nearer zoom (still full chunks) first');
  for (let k = 1; k < firstFar; k++) assert.ok(all[k]!.pri >= all[k - 1]!.pri, 'nearest first within a zoom');
});

test('zooming out readies the district chunks at their level and band, and the planner map readies the district chunks a zoom in shows', () => {
  const out = prebakeTargets(view(0.2, 'g'), LV, [1 / 3], none, 1000);
  assert.ok(out.length > 0 && out.every(p => p.kind === 'm' && p.L === 0.07 && p.ts === 1), JSON.stringify(out[0]));
  const fromPlan = prebakeTargets(view(0.02, 'p'), LV, [1.6], none, 1000);
  assert.ok(fromPlan.length > 0 && fromPlan.every(p => p.kind === 'm'), 'district chunks for z 0.035');
  assert.equal(prebakeTargets(view(0.3, 'g'), LV, [1.6], none, 1000).length, 0, 'no zoom past the closest');
});

test('a tile band switch crossfades: a chunk with its new band\'s picture and its old one draws the old under the new at the blend', () => {
  const t = { tex: 'new', texL: 0.2, texArtL: 0.2, texTs: 1, texTiled: true, fadeFrom: 'old', prev: null };
  const mid = chunkLayers(t, 0.2, 0.2, 0.5, false, 1);
  assert.equal(mid.base, 'old'); assert.equal(mid.top, 'new'); assert.equal(mid.topAlpha, 0.5);
  const done = chunkLayers(t, 0.2, 0.2, 1, false, 1);
  assert.equal(done.base, 'new'); assert.equal(done.top, null);
});
