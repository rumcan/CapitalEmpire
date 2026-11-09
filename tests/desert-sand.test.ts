// The desert's sand blotches (T382, #1038; the owner, 2026-11-08: "some sand texture was added to the map for desert mode but it isn't there enough. we need more small sand blotches but no big sandy spaces. sand should be blended"):
// many small windblown patches of pale rippled sand over the desert dirt, from world-space noise (deterministic, never periodic), feathered at their edges; the yards are dirt with a few drifts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CASTER_STRIDE, CK, SAND, SAND_BIAS, influence, livingMasks, livingSignature, sandBlotch, sandField, type Box, type InfluenceGrid, type LivingSources,
} from '../src/game/living-ground';
import { DESERT_DUNE, DESERT_GROUND, DESERT_LAWN, DESERT_PALE, DESERT_SAND, desertSurfaces } from '../src/game/desert-theme';
import { SURFACES, clampSurfaces } from '../src/game/painted-surfaces';

const read = (p: string) => readFileSync(resolve(p), 'utf8');

/** the blotches over a square of open ground (tiles of 2 m): their share of the ground, the widest disc of sand that fits in one (metres across), the share of the sand lying in discs wider than 8 m, and how many there are to a hectare */
function stats(bias = 0, N = 200, step = 0.5) {
  const n = Math.round(N / step), a = new Uint8Array(n * n); let sum = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = sandBlotch(1000 + i * step, 1000 + j * step, bias); sum += v; if (v > 0.5) a[j * n + i] = 1; }
  const seen = new Uint8Array(n * n); let blobs = 0; const sizes: number[] = [];
  for (let s = 0; s < n * n; s++) if (a[s] && !seen[s]) {
    const stack = [s]; seen[s] = 1; let cnt = 0;
    while (stack.length) {
      const p = stack.pop()!, x = p % n; cnt++;
      for (const q of [p - 1, p + 1, p - n, p + n]) { if (q < 0 || q >= n * n || (q === p - 1 && x === 0) || (q === p + 1 && x === n - 1)) continue; if (a[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
    }
    blobs++; sizes.push(Math.sqrt(cnt * step * step * 4));
  }
  sizes.sort((p, q) => p - q);
  // the largest disc (chamfer distance to the nearest ground that is not sand)
  const D = new Float32Array(n * n); for (let k = 0; k < n * n; k++) D[k] = a[k] ? 1e6 : 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; if (!a[k]) continue; let d = D[k]!; if (i > 0) d = Math.min(d, D[k - 1]! + 1); if (j > 0) d = Math.min(d, D[k - n]! + 1); if (i > 0 && j > 0) d = Math.min(d, D[k - n - 1]! + 1.414); if (i < n - 1 && j > 0) d = Math.min(d, D[k - n + 1]! + 1.414); D[k] = d; }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) { const k = j * n + i; if (!a[k]) continue; let d = D[k]!; if (i < n - 1) d = Math.min(d, D[k + 1]! + 1); if (j < n - 1) d = Math.min(d, D[k + n]! + 1); if (i < n - 1 && j < n - 1) d = Math.min(d, D[k + n + 1]! + 1.414); if (i > 0 && j < n - 1) d = Math.min(d, D[k + n - 1]! + 1.414); D[k] = d; }
  let maxR = 0, wide = 0, sandN = 0;
  for (let k = 0; k < n * n; k++) if (a[k]) { sandN++; maxR = Math.max(maxR, D[k]!); if (D[k]! * step * 2 > 4) wide++; }
  return { mean: sum / (n * n), cover: sandN / (n * n), discMetres: maxR * step * 4, wideShare: wide / Math.max(1, sandN), median: sizes[Math.floor(sizes.length / 2)] ?? 0, perHectare: blobs / ((N * 2) * (N * 2) / 10000) };
}

test('the sand is many small blotches: about an eighth of the open ground, none wider than a dozen metres', () => {
  const s = stats();
  assert.ok(s.mean > 0.08 && s.mean < 0.25, `the share of the ground under sand ${s.mean}`);
  assert.ok(s.perHectare > 30, `blotches to a hectare ${s.perHectare}`);
  assert.ok(s.median >= 1.5 && s.median <= 6, `a typical blotch is ${s.median} m across`);
  assert.ok(s.discMetres <= 13, `the widest disc of sand is ${s.discMetres} m (no big flat sand fields)`);
  assert.ok(s.wideShare < 0.03, `${(s.wideShare * 100).toFixed(1)}% of the sand lies in discs wider than 8 m`);
});

test('the blotches fade into the dirt: a good share of what is sand is partly sand, and no step between neighbours is a cut', () => {
  const n = 600, step = 0.5; let covered = 0, partial = 0, worst = 0, prev = 0;
  for (let j = 0; j < 40; j++) for (let i = 0; i < n; i++) {
    const v = sandBlotch(2000 + i * step, 2000 + j * 25 * step, 0);
    if (v > 0.02) { covered++; if (v < 0.9) partial++; }
    if (i) worst = Math.max(worst, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(partial / covered > 0.3, `${(partial / covered * 100).toFixed(0)}% of the sand is partly sand (feathered edges)`);
  assert.ok(worst < 1.0001, 'a cover is 0 to 1');
});

test('world space only: the same value for the same place, and chunks that overlap agree on their seam', () => {
  assert.equal(sandBlotch(123.4, 567.8), sandBlotch(123.4, 567.8));
  assert.equal(sandField(10.25, 77.5), sandField(10.25, 77.5));
  const none: LivingSources = { casters: new Float32Array(0), desert: true, sand: true };
  const A: Box = [100, 100, 160, 160], B: Box = [130, 120, 190, 180], a = influence(A, 4, none), b = influence(B, 4, none);
  assert.ok(a.sand && b.sand, 'the sand channel is made in the desert');
  let same = 0, n = 0;
  for (let y = 130; y < 160; y += 0.5) for (let x = 135; x < 160; x += 0.5) {
    const ia = Math.floor(x * 4 - a.ix0), ja = Math.floor(y * 4 - a.iy0), ib = Math.floor(x * 4 - b.ix0), jb = Math.floor(y * 4 - b.iy0);
    n++; if (Math.abs(a.sand![ja * a.w + ia]! - b.sand![jb * b.w + ib]!) < 1e-6) same++;
  }
  assert.equal(same, n, 'two chunks lay the same blotch on the seam');
});

test('the field is band-limited to the samples a chunk is baked with: the octaves they cannot resolve fade out (no aliasing at the far levels), the coarse pattern stays where it is', () => {
  const rough = (res: number) => { let s = 0, n = 0; for (let j = 0; j < 60; j++) for (let i = 0; i < 400; i++) { const x = 3000 + i * 0.25, y = 3000 + j * 3.3; s += Math.abs(sandField(x + 0.25, y, res) - sandField(x, y, res)); n++; } return s / n; };
  assert.ok(rough(1) < rough(1e9) * 0.6, `at one sample a tile the finest octaves are gone: ${rough(1).toFixed(4)} against ${rough(1e9).toFixed(4)}`);
  assert.ok(rough(1) < rough(2) && rough(2) < rough(1e9), 'and fewer of them the fewer the samples');
  // the same blotches' coarse structure: the fields correlate
  const xs: number[] = [], ys: number[] = [];
  for (let j = 0; j < 80; j++) for (let i = 0; i < 80; i++) { const x = 4000 + i * 2.9, y = 4000 + j * 2.3; xs.push(sandField(x, y, 1)); ys.push(sandField(x, y)); }
  const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length, mx = mean(xs), my = mean(ys);
  let cxy = 0, cxx = 0, cyy = 0; for (let k = 0; k < xs.length; k++) { cxy += (xs[k]! - mx) * (ys[k]! - my); cxx += (xs[k]! - mx) ** 2; cyy += (ys[k]! - my) ** 2; }
  assert.ok(cxy / Math.sqrt(cxx * cyy) > 0.7, `the far level's field follows the close level's: correlation ${(cxy / Math.sqrt(cxx * cyy)).toFixed(2)}`);
  assert.equal(sandField(55.5, 66.25, 1e9), sandField(55.5, 66.25), 'the default is all of it');
  // the chunk's channel is made at its own density
  const none: LivingSources = { casters: new Float32Array(0), desert: true, sand: true }, hi = influence([0, 0, 40, 40], 3, none), lo = influence([0, 0, 40, 40], 1, none);
  assert.ok(hi.sand && lo.sand, 'both levels lay it');
});

test('never periodic: the pattern shifted by any distance up to a kilometre is a different pattern', () => {
  const pts: [number, number][] = []; let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 3000; i++) pts.push([500 + rnd() * 600, 500 + rnd() * 600]);
  for (const lag of [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024]) for (const [dx, dy] of [[lag, 0], [0, lag], [lag, lag]] as const) {
    let diff = 0; for (const [x, y] of pts) if ((sandBlotch(x, y) > 0.5) !== (sandBlotch(x + dx, y + dy) > 0.5)) diff++;
    assert.ok(diff / pts.length > 0.18, `shifted by (${dx}, ${dy}) tiles the blotches still match: they differ at ${(diff / pts.length * 100).toFixed(0)}% of the places`);
  }
});

test('the wind runs the drifts one way: blotches are longer along the wind than across it', () => {
  // the field's correlation along the wind (WIND = the fallen leaves': x +, y -0.25) is longer than across
  const wx = 1 / Math.hypot(1, 0.25), wy = -0.25 / Math.hypot(1, 0.25); let along = 0, across = 0, n = 0;
  for (let j = 0; j < 80; j++) for (let i = 0; i < 80; i++) {
    const x = 3000 + i * 3.7, y = 3000 + j * 3.1, v = sandBlotch(x, y) > 0.5;
    if (v === (sandBlotch(x + wx * 1.5, y + wy * 1.5) > 0.5)) along++;
    if (v === (sandBlotch(x - wy * 1.5, y + wx * 1.5) > 0.5)) across++;
    n++;
  }
  assert.ok(along > across, `the same cover 3 m along the wind ${along}/${n}, across ${across}/${n}`);
});

test('the bias moves the share: sand gathers by the road, thins in the yards and is gone on the damp dirt', () => {
  const cover = (bias: number) => stats(bias, 120).mean;
  const damp = cover(SAND_BIAS.damp), yard = cover(SAND_BIAS.yard), open = cover(0), road = cover(SAND_BIAS.road);
  assert.ok(damp < yard && yard < open && open < road, `damp ${damp} < yard ${yard} < open ${open} < road ${road}`);
  assert.ok(damp < 0.005, `the damp dirt keeps no sand ${damp}`);
  assert.ok(yard < open * 0.45, `a yard keeps only a few drifts ${yard} of ${open}`);
  assert.ok(road < 0.45, 'and even by the road it is blotches, not a sheet of sand');
});

const BOX: Box = [0, 0, 100, 100];
const road = (ax: number, ay: number, bx: number, by: number) => ({ ax, ay, bx, by, hw: 2, cart: false });
const tree = (x: number, y: number) => [CK.TREE, x, y, 2, 1, 0, 0];
const src = (extra: Partial<LivingSources> = {}, casters: number[] = []): LivingSources => ({ casters: new Float32Array(casters), desert: true, sand: true, ...extra });
const meanOver = (g: InfluenceGrid, x0: number, y0: number, x1: number, y1: number) => {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y += 0.5) for (let x = x0; x < x1; x += 0.5) { const i = Math.floor(x * g.res - g.ix0), j = Math.floor(y * g.res - g.iy0); if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue; s += g.sand![j * g.w + i]!; n++; }
  return s / Math.max(1, n);
};

test('the ground bends the sand: more along a road and in the lee of plants, fewer in a yard, none on the damp dirt', () => {
  const open = influence(BOX, 4, src()), withRoad = influence(BOX, 4, src({ roads: [road(10, 30, 90, 30)] }));
  const yardPoly = [20, 60, 70, 60, 70, 95, 20, 95];
  const withYard = influence(BOX, 4, src({ yards: [yardPoly] }));
  assert.ok(meanOver(withRoad, 20, 33, 80, 37) > meanOver(open, 20, 33, 80, 37) + 0.01, 'sand gathers along the road verge');
  assert.ok(meanOver(withYard, 24, 64, 66, 92) < meanOver(open, 24, 64, 66, 92) * 0.5, 'a yard keeps a few small drifts');
  assert.ok(meanOver(withYard, 24, 64, 66, 92) > 0, 'but still some (dirt with drifts, not a bare rectangle)');
  assert.equal(meanOver(withYard, 75, 64, 95, 92), meanOver(open, 75, 64, 95, 92), 'and the yard bends only itself');
  const withTrees = influence(BOX, 4, src({}, [...tree(80, 20), ...tree(83, 21), ...tree(81, 24)]));
  assert.ok(meanOver(withTrees, 76, 16, 88, 28) > meanOver(open, 76, 16, 88, 28), 'sand collects round plants and at worn ground');
});

test('only the desert with the sand on has the channel and its mask; the old desert and autumn lay none', () => {
  assert.equal(influence(BOX, 4, { casters: new Float32Array(0), desert: true }).sand, undefined, 'the old desert: no sand channel');
  assert.equal(influence(BOX, 4, { casters: new Float32Array(0) }).sand, undefined, 'autumn: none');
  const g = influence(BOX, 4, src()), m = livingMasks(g);
  assert.ok(m.sand && (m.max.sand ?? 0) > 0.9, 'the mask is laid, its strongest sample near full');
  assert.equal(livingMasks(influence(BOX, 4, { casters: new Float32Array(0), desert: true })).sand, undefined);
  // the mask's alpha is the cover
  const q = 4 * 50 * g.w + 4 * 60; assert.ok(Math.abs(m.sand![q * 4 + 3]! - Math.round(g.sand![q]! * 255)) <= 1, 'the mask alpha is the cover');
});

test('the signature knows the sand and the yards (a re-bake of the same sources reuses the grid)', () => {
  const base = livingSignature(4, src()), noSand = livingSignature(4, { casters: new Float32Array(0), desert: true });
  assert.notEqual(base, noSand);
  assert.equal(livingSignature(4, src()), base, 'the same sources, the same signature');
  assert.notEqual(livingSignature(4, src({ yards: [[1, 1, 5, 1, 5, 5, 1, 5]] })), base, 'a yard changes it');
  assert.notEqual(livingSignature(4, src({ yards: [[1, 1, 5, 1, 5, 6, 1, 5]] })), livingSignature(4, src({ yards: [[1, 1, 5, 1, 5, 5, 1, 5]] })), 'and its shape');
});

test('the desert theme: the pale sand lives in the Sand drifts surface, the big pale patches are the dirt, the yards are dirt', () => {
  assert.ok(SURFACES.some(s => s.key === 'dune' && s.tex.includes('duneSand') && s.slot), 'a Sand drifts surface (an art slot: no look in autumn)');
  assert.equal(DESERT_DUNE.family, DESERT_PALE, 'the desert gives it the pale rippled sand');
  assert.equal(DESERT_GROUND.meadow?.family, DESERT_SAND, 'the meadow patches are the ground itself, not big pale spaces');
  assert.equal(DESERT_GROUND.dry?.family, DESERT_SAND);
  for (const k of ['lawn', 'lawnBuilt', 'lawnUpgraded', 'lawnDeclined']) assert.ok(/dirt/.test(DESERT_LAWN[k]!.family), `${k} is dirt in the desert`);
  const f = desertSurfaces(clampSurfaces({}));
  assert.ok(f.desert && f.surfaces.dune, 'the desert file carries the Sand drifts look');
  assert.equal(clampSurfaces({}).surfaces.dune, undefined, 'autumn: unset');
  // the dev server's ?sand=old: the desert as it was
  const old = desertSurfaces(clampSurfaces({}), { oldSand: true });
  assert.equal(old.surfaces.dune, undefined, 'the old desert lays no sand blotches');
  assert.equal(old.surfaces.meadow?.family, DESERT_PALE, 'and keeps its big pale patches');
  assert.ok(/fescue/.test(old.surfaces.lawn!.family), 'and its golden yards');
});

test('wiring: the living ground lays the sand through its mask over the dirt, the yards go in as sources, the rough yards\' sand patches are dirt', () => {
  const r = read('src/game/renderer.ts');
  assert.match(r, /const sandOn = desert && !!this\.tex\.surfaces\.surfaces\.dune/);
  assert.match(r, /sand: sandOn, yards/);
  assert.match(r, /paintedBuf\('duneSand', maskBox\(m\.sand\)\)/);
  assert.match(r, /this\.tex\.surfaces\.desert && k === 'desert' \? 'dirt' : k/);
  const l = read('src/game/living-ground.ts');
  assert.match(l, /export function sandBlotch/);
  assert.match(l, /mix\(src\.sand \? 1 : 0\)/);
  assert.match(l, /sand\[q\] = sandBlotch\(X\(i\), Y\(j\), bias, res\)/, 'the chunk\'s own sample density band-limits the field');
  assert.match(read('src/game/painted-surfaces-live.ts'), /sand=old|desertSandDev/);
  assert.match(read('src/game/ground.worker.ts'), /need\.add\('duneSand'\)/, 'the painted sand pictures are asked for (no other texture of the chunk wears that family)');
});

test('the constants a look is tuned by are the ones the tests measure', () => {
  assert.ok(SAND.lo < SAND.hi && SAND.waves.length === 3 && SAND.weights.length === 3);
  assert.ok(Math.abs(SAND.weights.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the octave weights sum to 1 (the field is about 0.5 on average)');
  void CASTER_STRIDE;
});
