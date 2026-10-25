import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blendMetres, clampGrassArt, grassDetailWeights, grassPatches, grassTone, grassTranslationSeeds, grassZoomLevels, patchAngle, patchPhase, patchRadius, trimLru,
  GRASS_ART_DEFAULT, PATCH_ANGLES, PATCH_PHASES, PATCH_SPACING, PATCH_SPRITES, TONE_WAVES, toneOps, type PaintedFamily,
} from '../src/game/painted-grass-lod';
import { clampPreset, PRESETS } from '../src/game/paint-presets';

/** the family's shape as painted-grass-art.ts lays it (the pictures are empty strings here): each level at its own pixels at its zoom */
const FAMILY: PaintedFamily = { near: { src: 'n', metres: 48 }, mid: { src: 'm', metres: 96 }, far: { src: 'f', metres: 192 }, repeat: 0 };

test('camera zoom chooses the same art on dpr 1 and dpr 2, while the bake density follows the device', () => {
  for (const zoom of [.04, .055, .099, .101, .14, .15, .199, .201, .3]) {
    const a = grassZoomLevels(zoom, 1), b = grassZoomLevels(zoom, 2);
    assert.equal(a.artL, b.artL);
    assert.equal(a.district, b.district);
    assert.deepEqual(grassDetailWeights(a.artL), grassDetailWeights(b.artL));
    assert.ok(b.rasterL >= a.rasterL);
  }
  // the closest zoom on a dpr-2 screen bakes at 0.6 px a world px: 21.5 px a metre along a tile edge, the near picture's own density (1024 px / 48 m)
  assert.equal(grassZoomLevels(.3, 2).rasterL, .6);
  assert.ok(Math.abs(.6 * 71.55 / 2 - 1024 / 48) < .3);
  assert.deepEqual(grassZoomLevels(.151, 2), grassZoomLevels(.19, 2), 'moving inside one cache band never asks for a new bake');
});

test('the levels crossfade by zoom: near at 30%, mid at 15%, far from the district view out; at most two, summing to 1, never jumping', () => {
  assert.deepEqual(grassDetailWeights(.3), [{ detail: 'near', weight: 1 }]);
  assert.deepEqual(grassDetailWeights(.035), [{ detail: 'far', weight: 1 }]);
  assert.deepEqual(grassDetailWeights(.15).map(w => w.detail), ['mid']);
  assert.deepEqual(grassDetailWeights(.2).map(w => w.detail), ['mid', 'near'], 'halfway between 30% and 15% is a mix');
  assert.deepEqual(grassDetailWeights(.1).map(w => w.detail), ['far', 'mid'], 'the district view mixes mid into far');
  for (const L of [NaN, -1, Infinity, 0]) assert.deepEqual(grassDetailWeights(L).map(w => w.detail), [Number.isFinite(L) && L > 0 ? 'near' : 'far']);
  let prev = grassDetailWeights(0);
  for (let L = 0; L <= .61; L += .0005) {
    const w = grassDetailWeights(L);
    assert.ok(w.length >= 1 && w.length <= 2 && w.every(x => x.weight >= .02 && x.weight <= 1));
    assert.ok(Math.abs(w.reduce((s, x) => s + x.weight, 0) - 1) < 1e-12);
    for (const d of ['far', 'mid', 'near'] as const) assert.ok(Math.abs((w.find(x => x.detail === d)?.weight ?? 0) - (prev.find(x => x.detail === d)?.weight ?? 0)) < .03, `no jump at ${L.toFixed(4)}`);
    prev = w;
  }
});

test('a blend repeats over its biggest level (or the mosaic), and every level divides it', () => {
  assert.equal(blendMetres(FAMILY, ['near']), 48);
  assert.equal(blendMetres(FAMILY, ['mid', 'near']), 96);
  assert.equal(blendMetres(FAMILY, ['far', 'mid']), 192);
  assert.equal(blendMetres({ ...FAMILY, repeat: 384 }, ['near']), 384);
  for (const d of [['near'], ['mid', 'near'], ['far', 'mid'], ['far']] as const) { const P = blendMetres(FAMILY, d); for (const x of d) assert.equal(P % FAMILY[x].metres, 0); }
  const seeds = grassTranslationSeeds(48, 8);
  assert.deepEqual(seeds, grassTranslationSeeds(48, 8));
  assert.equal(seeds.length, 256);
  assert.ok(seeds.every(s => s.x >= 0 && s.x < 48 && s.y >= 0 && s.y < 48 && s.phaseX >= 0 && s.phaseX < 1 && s.phaseY >= 0 && s.phaseY < 1));
  assert.deepEqual(Object.keys(seeds[0]!).sort(), ['phaseX', 'phaseY', 'x', 'y'], 'translations only: no turn, mirror or scale (the painted light stays upper right)');
});

test('the LRU keeps the current batch and drops the oldest past its limit', () => {
  const m = new Map<string, number>(); for (let i = 0; i < 12; i++) m.set('k' + i, i);
  const dropped: number[] = [];
  trimLru(m, new Set(['k0', 'k1']), 5, v => dropped.push(v));
  assert.deepEqual([...m.keys()], ['k0', 'k1', 'k9', 'k10', 'k11']);
  assert.deepEqual(dropped, [2, 3, 4, 5, 6, 7, 8]);
});

/** the patches whose disc touches a box, keyed by centre and phase */
const keyOf = (q: { x: number; y: number; k: number }) => `${q.x.toFixed(6)},${q.y.toFixed(6)},${q.k}`;
test('neighbouring chunks lay the same patches, in the same order, where they meet (no seam), and every point is well inside a patch', () => {
  const R = patchRadius(24), A = [-40, -40, 31, 31] as const, B = [31, -40, 102, 31] as const;
  const a = grassPatches(A, R), b = grassPatches(B, R);
  assert.deepEqual(grassPatches(A, R), a, 'deterministic');
  // every patch that reaches across the shared edge (x = 31) is in both, and they come in the same order
  const shared = (q: { x: number; r?: number }) => Math.abs(q.x - 31) < R;
  assert.deepEqual(a.filter(shared).map(keyOf), b.filter(shared).map(keyOf));
  assert.ok(a.every(q => q.k >= 0 && q.k < PATCH_SPRITES && Number.isInteger(q.k)));
  // coverage: the nearest centre is never further than 0.75 R (the patch mask is still at least half opaque there)
  let worst = 0;
  for (let y = A[1]; y <= A[3]; y += .5) for (let x = A[0]; x <= A[2]; x += .5) worst = Math.max(worst, Math.min(...a.map(q => Math.hypot(q.x - x, q.y - y))));
  assert.ok(worst < .75 * R, `worst gap ${(worst / R).toFixed(2)} R`);
  assert.ok(PATCH_SPACING < 1);
  // the sprites differ: no two of them show the blend at the same offset
  assert.equal(new Set(Array.from({ length: PATCH_SPRITES }, (_, k) => patchPhase(k).join())).size, PATCH_SPRITES);
});

test('the strokes swing: patches turn by at most 36 degrees (the light stays upper right), every turn is used everywhere', () => {
  assert.equal(PATCH_SPRITES, PATCH_ANGLES.length * PATCH_PHASES);
  assert.ok(PATCH_ANGLES.every(a => Math.abs(a) < 45), 'the sun stays in the upper right quadrant (45 +- 36 degrees)');
  const R = patchRadius(24), ps = grassPatches([0, 0, 600, 600], R), turn = (q: { k: number }) => patchAngle(q.k), count = new Map<number, number>();
  for (const q of ps) count.set(turn(q), (count.get(turn(q)) ?? 0) + 1);
  assert.equal(count.size, PATCH_ANGLES.length, 'every turn shows somewhere');
  for (const [a, n] of count) assert.ok(Math.abs(n / ps.length - 1 / PATCH_ANGLES.length) < 0.05, `turn ${a} is used (${(100 * n / ps.length).toFixed(0)}%)`);
  // no stretch of ground keeps one direction: every 3 R square holds two turns or more, and nearly all of them three or more
  let rich = 0, squares = 0;
  for (let y = 0; y + 3 * R <= 600; y += 3 * R) for (let x = 0; x + 3 * R <= 600; x += 3 * R) {
    const here = new Set(ps.filter(q => q.x >= x && q.x < x + 3 * R && q.y >= y && q.y < y + 3 * R).map(turn));
    assert.ok(here.size >= 2, `turns ${[...here].join()} at ${x},${y}`); squares++; if (here.size >= 3) rich++;
  }
  assert.ok(rich / squares > 0.95, `${(100 * rich / squares).toFixed(1)}% of 3 R squares hold three turns or more`);
});

/** Pearson r between a field and itself shifted by (dx, dy) samples */
function pearson(f: Float64Array, W: number, H: number, dx: number, dy: number) {
  let sa = 0, sb = 0, n = 0;
  for (let y = 0; y < H - dy; y++) for (let x = 0; x < W - dx; x++) { sa += f[y * W + x]!; sb += f[(y + dy) * W + x + dx]!; n++; }
  const ma = sa / n, mb = sb / n; let ab = 0, aa = 0, bb = 0;
  for (let y = 0; y < H - dy; y++) for (let x = 0; x < W - dx; x++) { const p = f[y * W + x]! - ma, q = f[(y + dy) * W + x + dx]! - mb; ab += p * q; aa += p * p; bb += q * q; }
  return ab / Math.sqrt(aa * bb);
}
test('no repeat: a periodic picture laid in the stochastic layout has no correlation at its period (the photo way repeats exactly)', () => {
  // a blend of period P tiles: smooth random shapes, sampled one per tile; laid as painted-ground.ts lays it (its mean under everything, then
  // each patch in order through its soft mask: opaque to 35% of the radius, half at 70%, clear at the rim)
  const P = 24, src = new Float64Array(P * P), rnd = (() => { let s = 7; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1 | 0) >>> 0) / 4294967296; })();
  const raw = Array.from({ length: P * P }, rnd);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) { let s = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += raw[((y + j + P) % P) * P + (x + i + P) % P]!; src[y * P + x] = s; }
  const at = (u: number, v: number) => src[(((Math.floor(v) % P) + P) % P) * P + ((Math.floor(u) % P) + P) % P]!;
  const S = 10 * P, R = patchRadius(P), layout = new Float64Array(S * S), plain = new Float64Array(S * S), mask = (d: number) => d < .35 ? 1 : d < .7 ? 1 - (d - .35) / .35 * .5 : d < 1 ? .5 * (1 - (d - .7) / .3) : 0;
  let mean = 0; for (const v of src) mean += v / src.length;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { plain[y * S + x] = at(x, y); layout[y * S + x] = mean; }
  for (const q of grassPatches([0, 0, S, S], R)) {
    const [u, v] = patchPhase(q.k);
    for (let y = Math.max(0, Math.floor(q.y - R)); y < Math.min(S, Math.ceil(q.y + R)); y++) for (let x = Math.max(0, Math.floor(q.x - R)); x < Math.min(S, Math.ceil(q.x + R)); x++) {
      const a = mask(Math.hypot(x + .5 - q.x, y + .5 - q.y) / R); if (!a) continue;
      // a sprite shows the blend turned about its centre: texture = phase + turn^-1 (point - centre) (painted-ground.ts patchSet)
      const t = -patchAngle(q.k) * Math.PI / 180, ex = x + .5 - q.x, ey = y + .5 - q.y, o = y * S + x;
      layout[o] = layout[o]! * (1 - a) + a * at(Math.cos(t) * ex - Math.sin(t) * ey + u * P, Math.sin(t) * ex + Math.cos(t) * ey + v * P);
    }
  }
  for (const [dx, dy] of [[P, 0], [0, P], [P, P], [2 * P, 0], [0, 2 * P]] as const) {
    assert.ok(pearson(plain, S, S, dx, dy) > .99, 'the plain picture repeats');
    const r = pearson(layout, S, S, dx, dy);
    assert.ok(Math.abs(r) < .2, `r at lag (${dx}, ${dy}) = ${r.toFixed(3)}`);
  }
});

test('the hue and value drift is smooth, bounded and does not repeat', () => {
  let lo = 1, hi = -1, step = 0;
  const N = 600, f = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = grassTone(x * 2, y * 2); f[y * N + x] = t; lo = Math.min(lo, t); hi = Math.max(hi, t); if (x) step = Math.max(step, Math.abs(t - f[y * N + x - 1]!)); }
  assert.ok(lo >= -1 && hi <= 1 && hi - lo > 1, `range ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  assert.ok(step < .25, 'two tiles apart it barely changes');
  // past one wave of its longest octave it no longer correlates (value noise has no period); sampled every 2 tiles
  for (const lag of [TONE_WAVES[0], 2 * TONE_WAVES[0], 3 * TONE_WAVES[0]]) { const r = pearson(f, N, N, lag / 2, 0); assert.ok(Math.abs(r) < .3, `drift r at ${lag} tiles = ${r.toFixed(3)}`); }
});

test('the drift lights and shades by the owner\'s light rule (T110): light in proportion to the grass itself, shade a cool multiply', () => {
  assert.deepEqual(toneOps(0), { mul: [1, 1, 1], gain: [0, 0, 0] });
  const lit = toneOps(1), shaded = toneOps(-1);
  assert.deepEqual(lit.mul, [1, 1, 1], 'light never darkens');
  assert.ok(lit.gain.every(v => v > 0 && v < 0.2) && lit.gain[0] >= lit.gain[2], 'a warm lift, added as the grass times this gain: a black gap stays black');
  // a dark gap and a lit stroke: the lit one gains more (masked by its own luminance), the gap almost nothing
  const lift = (c: number) => c * lit.gain[1];
  assert.ok(lift(200) > 4 * lift(40));
  assert.deepEqual(shaded.gain, [0, 0, 0], 'shade never adds light');
  assert.ok(shaded.mul.every(v => v < 1 && v > 0.8) && shaded.mul[2] > shaded.mul[0], 'a cool darkening multiply (blue kept most)');
});

test('the Grass setting and the presets\' Painted set', () => {
  assert.equal(GRASS_ART_DEFAULT, 'painted');
  assert.equal(clampGrassArt('photo'), 'photo');
  assert.equal(clampGrassArt('painted'), 'painted');
  for (const v of [null, undefined, '', 'Photo', 3]) assert.equal(clampGrassArt(v), 'painted');
  const base = { name: 'Lawn test', a: { src: 'a.webp' }, b: { src: 'b.webp' } }, pre = (o: object) => clampPreset(o as Parameters<typeof clampPreset>[0]);
  assert.equal(pre({ ...base, painted: 'grass' })?.painted, 'grass');
  assert.equal(pre(base)?.painted, null, 'an old preset lays its picture');
  for (const bad of ['Grass!', '', 7, '../x']) assert.equal(pre({ ...base, painted: bad })?.painted, null);
  // the town lawns are painted by default, and the golf surfaces keep their pictures until their own painted sets come
  assert.equal(PRESETS.find(p => p.id === 'lawns')?.painted, 'grass');
  for (const p of PRESETS.filter(q => q.surface && q.id !== 'lawns')) assert.equal(p.painted, null, p.id);
});
