// Headless tests for T215 (#561, phase 1): the street lamps' reflection pools as the camera specular (src/game/lamp-reflect.ts; the drawing
// is gl.ts FS_QUAD's specLight, the bake renderer.ts step 9; the look is checked in the browser by scripts/dev/spec-cam-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASPHALT_MEAN } from '../src/game/ground-art';
import {
  FOREIGN, LIT1, LIT2, SPEC_LIGHT_GLSL, SPEC_LOOK, bakedPixel, clampSpecLook, litPixel, poolCover, poolIntensity, specFalloff, specGain, specPixel,
} from '../src/game/lamp-reflect';

// the response as textures.ts had it before T215 moved it (frozen here: the 'lit' mosaics, and so the baked pools, must not change)
const IB = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1];
const DMU = [[0, 16.76, 46.07, 78.8, 107.09, 134.12, 158.92, 170.35, 189.37, 200.48, 203.72, 203.72], [0, 5.94, 15.45, 26.45, 37.96, 52.13, 67.37, 80.68, 109.8, 124.57, 153.05, 153.05], [0, -3.62, -11.36, -18.76, -24.21, -26.76, -30.88, -32.08, -19.45, -18.64, -6.87, -6.87]];
const DSG = [[0, 8.15, 19.72, 26.77, 29.02, 27.95, 27.86, 32.33, 21.16, 0, 0, 0], [0, 3.27, 9.8, 15.27, 20.71, 23.44, 29.76, 37.91, 37.43, 34.72, 25.59, 25.59], [0, 0.95, 0.86, 0.55, 1.29, 4.02, 9.32, 16.99, 27.67, 31.84, 34.4, 34.4]];
for (let b = 1; b < IB.length; b++) DSG[0]![b] = Math.max(DSG[0]![b]!, Math.min(30, DSG[0]![b - 1]!));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const LUMA0 = 0.3 * ASPHALT_MEAN[0] + 0.59 * ASPHALT_MEAN[1] + 0.11 * ASPHALT_MEAN[2];
function tbl(t: number[], I: number) { if (I <= 0) return 0; if (I >= 1) return t[t.length - 1]!; let i = 1; while (IB[i]! < I) i++; const f = (I - IB[i - 1]!) / (IB[i]! - IB[i - 1]!); return t[i - 1]! + (t[i]! - t[i - 1]!) * f; }
function oldLitPixel(c: number[], I: number) {
  const z = clamp((0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]! - LUMA0) / 8.8, -3, 3);
  for (let k = 0; k < 3; k++) c[k] = c[k]! + tbl(DMU[k]!, I) + z * tbl(DSG[k]!, I);
  if (c[0]! > 140) { const k = smooth(140, 200, c[0]!); c[1] = Math.min(c[1]!, c[1]! * (1 - k) + c[0]! * 0.9 * k); }
  const mx = Math.max(c[0]!, c[1]!, c[2]!);
  if (mx > 248) { const over = mx - 248, k = 248 / mx; c[0] = c[0]! * k + over * 0.42; c[1] = c[1]! * k + over * 0.36; c[2] = c[2]! * k + over * 0.3; }
  for (let i = 0; i < 3; i++) c[i] = clamp(c[i]!, 0, 255);
}
const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('T215 the lamp response moved, unchanged: litPixel is bit for bit the one the lit mosaics were made with', () => {
  for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 51) for (const I of [0, 0.03, 0.4, 0.62, 0.9, 1]) {
    const a = [r, g, b], o = [r, g, b]; litPixel(a, I); oldLitPixel(o, I);
    assert.deepEqual(a, o, `rgb ${r},${g},${b} at ${I}`);
  }
});

test('T215 the mask keeps the stamp\'s intensity: 0.4 pool1 + 0.5 pool2 = min(a, 0.9), and splits back into the bake\'s two coverages', () => {
  for (let a = 0; a <= 1.0001; a += 0.01) {
    const p1 = Math.min(a, 0.4) / 0.4, p2 = clamp((a - 0.4) / 0.5, 0, 1), I = poolIntensity(p1, p2);
    assert.ok(Math.abs(I - Math.min(a, 0.9)) < 1e-12, `a ${a}`);
    const [q1, q2] = poolCover(I); assert.ok(Math.abs(q1 - p1) < 1e-12 && Math.abs(q2 - p2) < 1e-12, `cover at ${a}`);
  }
});

test('T215 at full gain the GPU\'s pool is the bake\'s wherever the road is a darkened painting: exact at its mean, its grain kept in part', () => {
  for (const tone of [[1, 1, 1], [0.73, 0.73, 0.75], [0.5, 0.45, 0.4]]) for (const a of [0.05, 0.2, 0.4, 0.55, 0.9]) {
    const m = ASPHALT_MEAN.map((v, i) => v * tone[i]!), [p1, p2] = poolCover(a);
    // the painting's mean, darkened by a tone (asphaltDark's x0.73, a gutter's x0.5): the bake's colour exactly
    const gpu = specPixel(m, m, a, 1), bake = bakedPixel(m, ASPHALT_MEAN, p1, p2);
    gpu.forEach((v, i) => assert.ok(Math.abs(v - bake[i]!) < 1e-6, `tone ${tone} a ${a}: ${gpu.map(Math.round)} vs ${bake.map(Math.round)}`));
    // its grain (the painting's p5 and p95, luma -12 and +12): the same way round as the bake's, a part of its spread, never more
    const lo = ASPHALT_MEAN.map(v => v - 12), hi = ASPHALT_MEAN.map(v => v + 12);
    const g = lum(specPixel(hi.map((v, i) => v * tone[i]!), m, a, 1)) - lum(specPixel(lo.map((v, i) => v * tone[i]!), m, a, 1));
    const b = lum(bakedPixel(hi.map((v, i) => v * tone[i]!), hi, p1, p2)) - lum(bakedPixel(lo.map((v, i) => v * tone[i]!), lo, p1, p2));
    assert.ok(g > 0 && g >= b / 4 && g <= b + 1e-6, `tone ${tone} a ${a}: grain ${g.toFixed(1)} vs bake ${b.toFixed(1)}`);
  }
});

test('T215 the GPU\'s pool: nothing without intensity or gain, the falloff scales it, leaves and lines unlit, no hot rim on their edges', () => {
  const m = ASPHALT_MEAN.map(v => v * 0.73), c = [...m];
  assert.deepEqual(specPixel(c, m, 0, 1), c); assert.deepEqual(specPixel(c, m, 0.6, 0), c);
  // brighter as the camera brings it to the centre (k: falloff x gain), never past the bake's brightest (lit(0.9))
  let last = lum(c); for (const k of [0.1, 0.3, 0.6, 1, 2]) { const l = lum(specPixel(c, m, 0.6, k)); assert.ok(l > last, `k ${k}`); last = l; }
  assert.deepEqual(specPixel(c, m, 0.9, 3), specPixel(c, m, 0.9, 1));
  // warm: the lamp's tint (red up most, blue not), the texture kept (a darker pixel stays darker)
  const lit = specPixel(c, m, 0.6, 1); assert.ok(lit[0]! - c[0]! > lit[2]! - c[2]! + 40, 'warm');
  const dark = specPixel(c.map(v => v - 8), m, 0.6, 1), light = specPixel(c.map(v => v + 6), m, 0.6, 1);
  assert.ok(lum(dark) < lum(lit) - 4 && lum(light) > lum(lit) + 3, 'texture kept: a darker px stays darker, a lighter one lighter');
  // a leaf (bright orange) and a white line are not lit; an edge px, part road, is never lit far past both the lit road and the thing (no hot
  // rim: at most 20 luma over the brighter, on a grey decal's edge, the worst; it was 58 before CONTRAST and DEVIATION)
  for (const thing of [[205, 95, 30], [225, 222, 205], [120, 110, 90], [160, 60, 25]]) {
    assert.ok(Math.hypot(...thing.map((v, i) => v - m[i]!)) > FOREIGN[1]);
    assert.deepEqual(specPixel(thing, m, 0.8, 1), thing);
    for (let t = 0.02; t <= 0.8; t += 0.02) for (const I of [0.3, 0.6, 0.9]) {
      const edge = thing.map((v, i) => c[i]! + (v - c[i]!) * t), e = specPixel(edge, m, I, 1), road = specPixel(c, m, I, 1);
      assert.ok(lum(e) <= Math.max(lum(road), lum(thing)) + 20, `edge ${t.toFixed(2)} of ${thing} at ${I}: ${lum(e).toFixed(1)} vs road ${lum(road).toFixed(1)}`);
    }
  }
});

test('T215 the camera falloff: whole at the centre, gone past the outer radius, smooth, round on a wide screen', () => {
  const W = 1280, H = 800, L = SPEC_LOOK;
  assert.equal(specFalloff(W / 2, H / 2, W, H, L.inner, L.outer), 1);
  assert.equal(specFalloff(0, H / 2, W, H, L.inner, L.outer), 0); assert.equal(specFalloff(W, H / 2, W, H, L.inner, L.outer), 0); assert.equal(specFalloff(0, 0, W, H, L.inner, L.outer), 0);
  // round: the same at the same px from the centre across and down (the aspect corrected); the top edge's middle is 0.625 of the way
  assert.ok(Math.abs(specFalloff(W / 2 + 300, H / 2, W, H, 0.15, 1) - specFalloff(W / 2, H / 2 + 300, W, H, 0.15, 1)) < 1e-12);
  const top = specFalloff(W / 2, 0, W, H, 0.15, 1); assert.ok(top > 0.3 && top < 0.5, `top edge ${top}`);
  // monotone, no step: along the row to the right edge it only falls, by less than 0.01 a px
  let prev = 1; for (let x = W / 2; x <= W; x++) { const f = specFalloff(x, H / 2, W, H, L.inner, L.outer); assert.ok(f <= prev + 1e-12 && prev - f < 0.01); prev = f; }
});

test('T215 the knobs: held to their ranges (outer past inner), the gain grows from the day share to the whole after dusk', () => {
  assert.deepEqual(clampSpecLook(null), SPEC_LOOK);
  const k = clampSpecLook({ inner: 0.8, outer: 0.2, strength: 9, day: -1 });
  assert.ok(k.outer > k.inner); assert.equal(k.strength, 3); assert.equal(k.day, 0);
  const s = { ...SPEC_LOOK, strength: 1, day: 0.5 };
  assert.equal(specGain(s, 0), 0.5); assert.equal(specGain(s, 1), 1); assert.ok(specGain(s, 0.5) > 0.5 && specGain(s, 0.5) < 1);
});

test('T215 the shader runs the same tables, and off draws and bakes as before', () => {
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'), e = readFileSync(resolve('src/game/engine.ts'), 'utf8'), gc = readFileSync(resolve('src/game/ground-cache.ts'), 'utf8');
  // the GLSL twin is made from the same values (the lit mosaics' two intensities, the rebuild's limits)
  for (const v of [...LIT1.mu, ...LIT1.sg, ...LIT2.mu, ...LIT2.sg]) assert.ok(SPEC_LIGHT_GLSL.includes(String(+v.toFixed(4)).replace(/^(-?\d+)$/, '$1.0')), `GLSL has ${v}`);
  assert.match(SPEC_LIGHT_GLSL, /mix\(mix\(r, l1, clamp\(I, 0\.0, 0\.4\) \/ 0\.4\), l2, clamp\(\(I - 0\.4\) \/ 0\.5, 0\.0, 1\.0\)\)/, 'the bake\'s two-step blend');
  const fs = gl.slice(gl.indexOf('const FS_QUAD'), gl.indexOf('}`;', gl.indexOf('const FS_QUAD')));
  assert.match(fs, /\$\{SPEC_LIGHT_GLSL\}/); assert.match(fs, /if \(uSpec\.z > 0\.0\)/, 'no mask, no gain: the chunk as before');
  assert.match(fs, /m\.rgb \/ m\.a/, 'the premultiplied mean divided out');
  assert.match(gl, /UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\)[\s\S]*UNPACK_PREMULTIPLY_ALPHA_WEBGL, false\)/, 'the mask uploaded premultiplied, the state put back');
  // the bake: with specCam off the lit mosaics are laid as before; on, the pools go to the mask (no read back in the worker)
  const step9 = r.slice(r.indexOf('// ---- 9. polished wheel paths'), r.indexOf('// ---- 9b.'));
  assert.match(step9, /\} else for \(const \[variant, stamp\] of \[\['lit1', tex\.pool1\], \['lit2', tex\.pool2\]\] as const\)/);
  assert.match(step9, /tex\.mosaicFor\(variant, L\)/); assert.doesNotMatch(r, /getImageData\(0, 0, mw, mh\)/);
  // the engine draws every chunk picture with its own mask (crossfade, reveal, the other tier's fallback)
  const ground = e.slice(e.indexOf('const lay = chunkLayers('), e.indexOf('// T188: the first view'));
  for (const call of ground.match(/gl\.drawChunk\([^;]*\)/g) ?? []) assert.match(call, /spec\(|picture\.spec/, call);
  assert.match(e, /if \(t\.prev && now < t\.prevUntil\) \{ gl\.drawChunk\(t\.prev, \.\.\.r, false, 1, FULL_UV, spec\(t\.prev\)\)/);
  // a mask goes with its picture: every picture the cache lets go of is dropped with its mask
  assert.doesNotMatch(gc, /this\.gl\.deleteTexture\((t\.tex|t\.prev|t\.fadeFrom|old)!?\)/);
});
