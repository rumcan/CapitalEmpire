import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLook, coversMap, crossovers, FAMILIES, familyById, familyVersions, familyWeights, LEVEL_NAMES, lookColour, lookKey, nativeZoom, resolveFamily } from '../src/game/painted-families';
import { clampSurfaces, lawnSlot, lawnTex, lookOfTex, SURFACES, surfaceOfTex } from '../src/game/painted-surfaces';
import { grassDetailWeights } from '../src/game/painted-grass-lod';
import { BLEND_WAVES, blendAlpha, blendNoise } from '../src/game/painted-grass-lod';
import { courseBandOf, courseTexOf, lookChanged } from '../src/game/course-look';
import { BRUSH_PRESETS, clampStyle, DEFAULT_STYLE } from '../src/game/paint';
import { PRESETS } from '../src/game/paint-presets';
import file from '../src/game/painted-surfaces.json';

const SCALED = { near: 40, mid: 320, far: 4096 };

test('every new hand-painted family has the spatial-scales coverage: near 40 m, mid 320 m, far 4096 m a tile', () => {
  const scaled = FAMILIES.filter(f => !f.legacy && !f.id.startsWith('cutaway-'));
  assert.ok(scaled.length >= 15, 'the 10 grasses, 2 sands, the water and the 2 cut faces');
  for (const f of scaled) assert.deepEqual(f.coverage, SCALED, f.id);
  for (const id of ['emerald-short', 'emerald-medium', 'emerald-long', 'sage-short', 'sage-medium', 'sage-long', 'straw-short', 'straw-medium', 'straw-long', 'olive-short', 'sand-raked', 'sand-ripples', 'water-pond', 'underground-earth', 'underground-sand'])
    assert.ok(familyById(id), id);
  // the 48 px a metre cut faces of the earlier selection: one level, 21.333 m
  for (const id of ['cutaway-earth', 'cutaway-sand']) assert.equal(Math.round(familyById(id)!.coverage.near * 1000) / 1000, 21.333);
  const first = familyById('first-painted')!; assert.ok(first.legacy); assert.deepEqual(first.coverage, { near: 48, mid: 96, far: 192 });
});

test('a family resolves every level: the picked version, the look\'s version where the level has it, a borrowed macro, and the scale', () => {
  const r = resolveFamily({ family: 'emerald-short', version: null, scale: 1 })!;
  assert.equal(r.near.version, 'v2'); assert.equal(r.mid.version, 'v3'); assert.equal(r.far.version, 'v2');
  assert.deepEqual(LEVEL_NAMES.map(l => r[l].metres), [40, 320, 4096]);
  // v1 exists only at near: mid and far keep their picks
  const v1 = resolveFamily({ family: 'emerald-short', version: 'v1', scale: 1 })!;
  assert.equal(v1.near.version, 'v1'); assert.equal(v1.mid.version, 'v3'); assert.equal(v1.far.version, 'v2');
  // a length with no macro paintings borrows its palette's (grassMacroReuse): emerald medium shows emerald short's mid and far
  const med = resolveFamily({ family: 'emerald-medium', version: null, scale: 1 })!;
  assert.equal(med.mid.file, r.mid.file); assert.equal(med.far.file, r.far.file); assert.notEqual(med.near.file, r.near.file);
  // the scale multiplies the ground each tile covers
  const half = resolveFamily({ family: 'sage-medium', version: null, scale: 0.5 })!;
  assert.deepEqual(LEVEL_NAMES.map(l => half[l].metres), [20, 160, 2048]);
  // a cut face painted once shows its one painting at every level
  const cut = resolveFamily({ family: 'cutaway-earth', version: null, scale: 1 })!;
  assert.equal(cut.mid.file, cut.near.file); assert.equal(cut.far.file, cut.near.file);
  assert.equal(resolveFamily({ family: 'nope', version: null, scale: 1 }), null);
  // every version listed has a painting at some level, and every painting is a webp under the painted folder
  for (const f of FAMILIES) for (const v of familyVersions(f)) assert.ok(LEVEL_NAMES.some(l => f.levels[l][v]), `${f.id} ${v}`);
  for (const f of FAMILIES) for (const l of LEVEL_NAMES) for (const p of Object.values(f.levels[l])) { assert.match(p.file, /\.webp$/); assert.equal(p.px, 1024); assert.match(p.mean, /^#[0-9a-f]{6}$/); }
});

test('the levels crossfade by zoom where neither is much enlarged or shrunk: near at the street zooms, mid in the district, far on the planner', () => {
  const r = resolveFamily({ family: 'sage-medium', version: null, scale: 1 })!;
  // native zoom (one picture px a screen px on a dpr-2 screen): near 40 m at about 36%, mid at 4.5%, far below the closest planner zoom
  assert.ok(Math.abs(nativeZoom(r.near) - 0.358) < 0.002 && Math.abs(nativeZoom(r.mid) - 0.0447) < 0.001 && nativeZoom(r.far) < 0.006);
  const [c1, c2] = crossovers(r);
  assert.ok(c1 > 0.12 && c1 < 0.13, `near to mid at about 12.6% (${c1})`); assert.ok(c2 > 0.012 && c2 < 0.013, `mid to far at about 1.25% (${c2})`);
  assert.deepEqual(familyWeights(r, 0.3), [{ detail: 'near', weight: 1 }]);
  assert.deepEqual(familyWeights(r, 0.15).map(w => w.detail), ['mid', 'near'], 'the 15% zoom mixes mid into near');
  assert.deepEqual(familyWeights(r, 0.07), [{ detail: 'mid', weight: 1 }]);
  assert.deepEqual(familyWeights(r, 0.035), [{ detail: 'mid', weight: 1 }], 'the district view is the mid painting');
  assert.deepEqual(familyWeights(r, 0.0125).map(w => w.detail), ['far', 'mid']); assert.deepEqual(familyWeights(r, 0.006), [{ detail: 'far', weight: 1 }]);
  for (const L of [0.3, 0.2, 0.15, 0.1, 0.07, 0.05, 0.035, 0.01]) { const w = familyWeights(r, L); assert.ok(Math.abs(w.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9); assert.ok(w.length <= 2); }
  // near's weight only falls as the camera pulls back
  let prev = 2; for (let L = 0.3; L > 0.03; L *= 0.9) { const n = familyWeights(r, L).find(w => w.detail === 'near')?.weight ?? 0; assert.ok(n <= prev + 1e-9); prev = n; }
  // a finer scale hands over to mid sooner; the first painted grass keeps its own crossfade
  assert.ok(crossovers(resolveFamily({ family: 'sage-medium', version: null, scale: 0.5 })!)[0] > c1);
  const first = resolveFamily({ family: 'first-painted', version: null, scale: 1 })!;
  for (const L of [0.3, 0.2, 0.15, 0.1, 0.035]) assert.deepEqual(familyWeights(first, L), grassDetailWeights(L));
  // the far level covers the map: laid once, it cannot repeat on it
  assert.ok(coversMap(r.far) && !coversMap(r.mid));
  assert.ok(!coversMap(resolveFamily({ family: 'sage-medium', version: null, scale: 0.5 })!.far));
});

test('a look is clamped, keyed without its tint and tone, and coloured by its tint and tone', () => {
  assert.deepEqual(clampLook({ family: 'sand-raked', version: 'v9', scale: 99, tint: 'red', tone: -3 }), { family: 'sand-raked', version: null, scale: 4, tint: '#ffffff', tone: -0.6 });
  assert.equal(clampLook({ family: 'nope' }), null);
  assert.equal(lookKey({ family: 'a', version: null, scale: 0.5 }), 'a/*@0.5');
  assert.equal(lookColour('#808080', { tint: '#ffffff', tone: 0 }), '#808080');
  assert.equal(lookColour('#808080', { tint: '#ff0000', tone: 0 }), '#800000');
  assert.equal(lookColour('#808080', { tint: '#ffffff', tone: -0.5 }), '#404040');
});

test('every surface of the game wears a painted family: golf, map, town lawns, living ground, course walls', () => {
  const f = clampSurfaces(file);
  for (const s of SURFACES) assert.ok(f.surfaces[s.key], `${s.key} has a look`);
  // the golf logic: greens and tees the shortest emerald at the finest scale, the fairway short emerald, the collars medium, the rough sage,
  // the fescue long straw, the bunker raked sand, waste rippled sand, water the pond
  const S = f.surfaces;
  for (const k of ['green', 'tee', 'fairway']) assert.equal(S[k]!.family, 'emerald-short', k);
  assert.ok(S.green!.scale <= S.fairway!.scale && S.tee!.scale <= S.fairway!.scale);
  assert.ok(S.rough!.family.startsWith('sage-')); assert.equal(S.fescue!.family, 'straw-long');
  assert.equal(S.bunker!.family, 'sand-raked'); assert.equal(S.waste!.family, 'sand-ripples'); assert.equal(S.water!.family, 'water-pond');
  for (const k of ['wallTurf', 'wallBank']) assert.equal(S[k]!.family, 'underground-earth'); assert.equal(S.wallSand!.family, 'underground-sand');
  assert.ok(S.lush!.family.endsWith('-long')); assert.ok(S.patchy!.family.startsWith('straw-'));
  // the town lawns differ in palette and length
  assert.ok(f.lawns.length >= 4); assert.ok(new Set(f.lawns.map(l => l.family)).size >= 4);
  assert.ok(new Set(f.lawns.map(l => l.family.split('-')[0])).size >= 3, 'at least three palettes');
});

test('a texture finds its look: photo ids, presets by their golf surface (fescue by id), a preset\'s own look, the lawn slots', () => {
  const f = clampSurfaces(file);
  assert.equal(lookOfTex('golfGreen', f), f.surfaces.green); assert.equal(lookOfTex('grass', f), f.surfaces.base);
  assert.equal(lookOfTex('waterClear', f), f.surfaces.water); assert.equal(lookOfTex('dirt', f), f.surfaces.dirt); assert.equal(lookOfTex('water', f), f.surfaces.river);
  assert.equal(lookOfTex('preset:golf-green', f, PRESETS), f.surfaces.green, 'a preset standing for the green wears the green');
  assert.equal(lookOfTex('preset:fescue', f, PRESETS), f.surfaces.fescue, 'the Fescue preset is the course\'s fescue');
  assert.equal(lookOfTex('preset:lawns', f, PRESETS), f.presets.lawns, 'a preset\'s own look wins');
  assert.equal(lookOfTex(lawnTex(0), f), f.lawns[0]); assert.equal(lookOfTex(lawnTex(99), f), null);
  assert.equal(lookOfTex('asphalt', f), null, 'no painted asphalt yet: it keeps its photo');
  assert.equal(surfaceOfTex('golfFescue'), 'fescue');
  // every preset of the game is painted (none left on its photo mix)
  for (const p of PRESETS) assert.ok(lookOfTex('preset:' + p.id, f, PRESETS), p.id);
});

test('the studio round trip: a saved file reads back the same, bad looks are dropped, lawns capped', () => {
  const f = clampSurfaces(file), again = clampSurfaces(JSON.parse(JSON.stringify(f)));
  assert.deepEqual(again, f);
  const bad = clampSurfaces({ surfaces: { green: { family: 'nope' }, fairway: { family: 'olive-short', scale: 0.1 }, notASurface: { family: 'olive-short' } }, lawns: Array.from({ length: 20 }, () => ({ family: 'sage-short', weight: 99 })), presets: { 'Bad Id': { family: 'sage-short' } } });
  assert.equal(bad.surfaces.green, undefined); assert.equal(bad.surfaces.fairway!.scale, 0.25); assert.equal((bad.surfaces as Record<string, unknown>).notASurface, undefined);
  assert.equal(bad.lawns.length, 8); assert.equal(bad.lawns[0]!.weight, 10); assert.deepEqual(bad.presets, {});
  assert.deepEqual(clampSurfaces(null), { v: 1, surfaces: {}, lawns: [], presets: {} });
});

test('a lawn is picked by where it lies: stable, every lawn used by its weight, none when weightless', () => {
  const lawns = [{ weight: 2 }, { weight: 1 }, { weight: 0 }, { weight: 1 }], n = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) { const pts = [i % 97 * 7.3, Math.floor(i / 97) * 11.1, 3, 4]; const k = lawnSlot(pts, lawns); n[k]!++; assert.equal(lawnSlot(pts, lawns), k); }
  assert.equal(n[2], 0); assert.ok(n[0]! > n[1]! * 1.5 && n[1]! > 600 && n[3]! > 600, JSON.stringify(n));
  assert.equal(lawnSlot([0, 0], [{ weight: 0 }]), -1); assert.equal(lawnSlot([0, 0], []), -1);
});

test('the blend\'s soft patches never repeat and cover about their share', () => {
  // the noise is not periodic: a shift by any of the old tiled mask's periods (24, 48 tiles) or by a wave length does not bring it back
  const N = 120, sample = (dx: number, dy: number) => { let s = 0, a = 0, b = 0, aa = 0, bb = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = blendNoise(i * 0.7, j * 0.7, 1), q = blendNoise(i * 0.7 + dx, j * 0.7 + dy, 1); s += p * q; a += p; b += q; aa += p * p; bb += q * q; } const n = N * N; return (s / n - a / n * b / n) / Math.sqrt((aa / n - (a / n) ** 2) * (bb / n - (b / n) ** 2)); };
  for (const lag of [24, 48, BLEND_WAVES[0]![0] * 3, 96]) assert.ok(Math.abs(sample(lag, 0)) < 0.3 && Math.abs(sample(0, lag)) < 0.3, `r at ${lag}`);
  for (const share of [0.2, 0.5, 0.8]) { let c = 0; for (let j = 0; j < 150; j++) for (let i = 0; i < 150; i++) c += blendAlpha(blendNoise(i * 0.9, j * 0.9, 1), share, 0.12); c /= 150 * 150; assert.ok(Math.abs(c - share) < 0.15, `share ${share}: covered ${c.toFixed(2)}`); }
  assert.equal(blendAlpha(0.3, 1, 0.1), 1); assert.equal(blendAlpha(0.9, 0, 0.1), 0);
});

test('every look control reaches the course: the fill\'s tone and blend, the band\'s own texture, scale, angle and tone', () => {
  const green = BRUSH_PRESETS.find(b => b.kind === 'green')!.style, dflt = { tex: 'preset:fringe', sc: 1, a: 0 };
  // the defaults: the fill alone, the band its own
  assert.deepEqual(courseTexOf(green), { tex: green.tex, sc: 1, a: 0 });
  assert.deepEqual(courseBandOf('green', green, dflt), dflt);
  const st = clampStyle({ ...green, tone: 1, toneAmt: 0.4, tint: '#102030', mtex: 'preset:rough', mshare: 0.3, msoft: 0.2, mpatch: 2, btex: 'preset:first-cut', bscale: 2, bangle: 30, btone: 2, btoneAmt: 0.5, btint: '#ffffff' });
  assert.deepEqual(courseTexOf(st), { tex: green.tex, sc: 1, a: 0, t: 1, ta: 0.4, tc: '#102030', m: { t: 'preset:rough', s: 0.3, f: 0.2, p: 2 } });
  assert.deepEqual(courseBandOf('green', st, dflt), { tex: 'preset:first-cut', sc: 2, a: 30, t: 2, ta: 0.5, tc: '#ffffff' });
  // the kerb is not a course band: the band keeps its own texture
  assert.equal(courseBandOf('green', { ...st, btex: 'kerb' }, dflt).tex, 'preset:fringe');
  // a change to any of them draws the course again; the brush radius does not
  for (const k of ['tone', 'mtex', 'btex', 'bscale', 'btone'] as const) assert.ok(lookChanged(green, st), k);
  assert.ok(!lookChanged(green, { ...green, radius: 3 }));
  assert.ok(DEFAULT_STYLE);
});
