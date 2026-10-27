// Headless tests for the cast shadows' settings (src/game/cast-shadow.ts; the drawing is gl.ts's VS_CAST and lot-render.mjs's castOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAST, CAST_DEFAULT, SHADOW_AMBIENT, castShear, clampCast, shadeCoverage, shadowMultiplier, shadowOverShade } from '../src/game/cast-shadow';
import { EDGE_LOOKS, SHADE_RGB } from '../src/game/paint-edges';

test('cast shadows: settings held to their ranges, the file read, the shear from the sun side and length', () => {
  assert.deepEqual(clampCast(null), CAST_DEFAULT);
  assert.deepEqual(clampCast({ on: false, angle: 999, length: -1, strength: 2 }), { on: false, angle: 360, length: 0.1, strength: 1 });
  assert.equal(typeof CAST.on, 'boolean');
  const left = castShear({ on: true, angle: 180, length: 0.5, strength: 0.3 });
  assert.ok(Math.abs(left.sx + 0.5) < 1e-9 && Math.abs(left.sy) < 1e-9, 'falling left: x only');
  const down = castShear({ on: true, angle: 90, length: 0.4, strength: 0.3 });
  assert.ok(Math.abs(down.sx) < 1e-9 && Math.abs(down.sy - 0.4) < 1e-9, 'falling down: y only');
});

// T185 (the owner, 2026-10-27: "two shadows blocking the same light does not multiply a shadow"; "one shadow colour everywhere")

test('T185 shadow colour: a multiply toward one cool ambient, the ground shade\'s tint at the cast shadows\' darkness', () => {
  assert.deepEqual(shadowMultiplier(0), [1, 1, 1], 'no shadow: the ground as it is');
  const full = shadowMultiplier(1); full.forEach((v, i) => assert.ok(Math.abs(v - SHADOW_AMBIENT[i]!) < 1e-12));
  assert.ok(SHADOW_AMBIENT[2] > SHADOW_AMBIENT[1] && SHADOW_AMBIENT[1] > SHADOW_AMBIENT[0], 'cool: blue over green over red');
  // as dark as the old near-black (6, 8, 13) laid over a mid-tone ground at the default cast darkness (0.6): within 3%
  const m = shadowMultiplier(CAST_DEFAULT.strength), lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  const old = [0.5 * 0.4 + 0.6 * 6 / 255, 0.5 * 0.4 + 0.6 * 8 / 255, 0.5 * 0.4 + 0.6 * 13 / 255].map(v => v / 0.5);
  assert.ok(Math.abs(lum(m) - lum(old)) < 0.03, `darkness ${lum(m).toFixed(3)} vs the old ${lum(old).toFixed(3)}`);
  // one shadow colour: its tint (the multiplier over its luminance) is the ground shade's at a raised edge's shadow (paint-edges.ts), within 2%
  const a = EDGE_LOOKS.raised!.shadow, g = SHADE_RGB.map(v => 1 - a * (1 - v / 255)), tint = (c: readonly number[]) => c.map(v => v / lum(c));
  tint(m).forEach((v, i) => assert.ok(Math.abs(v - tint(g)[i]!) < 0.02, `channel ${i}: ${v.toFixed(3)} vs the ground shade's ${tint(g)[i]!.toFixed(3)}`));
});

test('T185 shadow layer: every sprite shadow draws its darkness into one layer with MAX blending, laid on the ground once', () => {
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), engine = readFileSync(resolve('src/game/engine.ts'), 'utf8');
  // the shadow shaders write their coverage only (no colour of their own, no premultiplied over: that compounded overlaps)
  for (const name of ['FS_CAST', 'FS_SHADOW', 'FS_VEC']) {
    const src = gl.slice(gl.indexOf(`const ${name}`), gl.indexOf('}`;', gl.indexOf(`const ${name}`)));
    assert.ok(src.length > 50, `${name} found`);
    assert.match(src, /o = vec4\((clamp\(a, 0\.0, 1\.0\)|a)\);/, `${name} writes its darkness alone`);
    assert.doesNotMatch(src, /6\.0, 8\.0, 13\.0|0\.024, 0\.031, 0\.051/, `${name} has no colour of its own`);
  }
  const begin = gl.slice(gl.indexOf('  beginShadows()'), gl.indexOf('  endShadows()'));
  assert.match(begin, /blendEquation\(gl\.MAX\)/, 'the layer keeps the darkest shadow (MAX), never their product');
  const end = gl.slice(gl.indexOf('  endShadows()'), gl.indexOf('  drawCast('));
  assert.match(end, /blendFunc\(gl\.ZERO, gl\.SRC_COLOR\)/, 'laid as a multiply (the ground keeps its texture)');
  assert.match(end, /SHADOW_AMBIENT/, 'in the one shadow colour');
  // the game draws every shadow inside the layer
  const draw = engine.slice(engine.indexOf('gl.beginShadows()'), engine.indexOf('gl.endShadows()'));
  for (const call of ['gl.drawCast(', 'gl.drawShadows(', 'gl.drawVector(']) {
    assert.ok(draw.includes(call), `${call} inside the shadow layer`);
    assert.equal(engine.split(call).length - 1, draw.split(call).length - 1, `every ${call} inside the shadow layer`);
  }
});

// T186 (the owner: "two shadows blocking the same light does not multiply a shadow", the ground's baked shade included)
test('T186 sprite shadow over a baked shade: the darker of the two, never their product; unchanged where only one lies', () => {
  const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  // no baked shade: the sprite shadow as before (T185)
  assert.deepEqual(shadowOverShade(0.6, 0), shadowMultiplier(0.6));
  // no sprite shadow, or a lighter one than the baked shade: the ground untouched (the shader discards)
  assert.deepEqual(shadowOverShade(0, 0.3), [1, 1, 1]); assert.deepEqual(shadowOverShade(0.2, 0.3), [1, 1, 1]);
  // a darker sprite shadow: the ground ends as dark as that shadow alone (baked x factor = M(s)), not darker
  const b = 0.3, s = 0.6, baked = shadowMultiplier(b), f = shadowOverShade(s, b), total = baked.map((v, i) => v * f[i]!);
  total.forEach((v, i) => assert.ok(Math.abs(v - shadowMultiplier(s)[i]!) < 1e-9, `channel ${i}`));
  assert.ok(lum(total) > lum(baked.map((v, i) => v * shadowMultiplier(s)[i]!)) + 0.05, 'lighter than the old product');
  // continuous where the sprite shadow passes the baked shade
  const near = shadowOverShade(b + 1e-4, b); near.forEach(v => assert.ok(Math.abs(v - 1) < 1e-3));
  // the mask's coverage: white is none; the ground shade (SHADE_RGB) at full strength is about half a sprite shadow's darkness
  assert.equal(shadeCoverage(1), 0);
  const shade = lum(SHADE_RGB.map(v => v / 255)), c = shadeCoverage(shade);
  assert.ok(c > 0.45 && c < 0.65, `SHADE_RGB as coverage: ${c.toFixed(3)}`);
  assert.ok(Math.abs(lum(shadowMultiplier(c)) - shade) < 0.01, 'as dark by luminance');
});

test('T186 shader and bake: the layer keeps the baked shade in green, the composite divides it out, every shade the bake multiplies is mirrored', () => {
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), engine = readFileSync(resolve('src/game/engine.ts'), 'utf8'), r = readFileSync(resolve('src/game/renderer.ts'), 'utf8');
  assert.match(gl, /gl\.RG8/, 'the layer has a green channel');
  const layer = gl.slice(gl.indexOf('const FS_LAYER'), gl.indexOf('}`;', gl.indexOf('const FS_LAYER')));
  assert.match(layer, /sb\.r < sb\.g \+ 0\.002\) discard/, 'untouched where the baked shade is the darker');
  assert.match(layer, /mix\(vec3\(1\.0\), uAmbient, sb\.r\) \/ mix\(vec3\(1\.0\), uAmbient, sb\.g\)/, 'M(s) / M(b)');
  assert.match(gl.slice(gl.indexOf('  beginShadows()'), gl.indexOf('  drawShadeMask(')), /colorMask\(true, false, false, false\)/, 'sprite shadows write red only');
  assert.match(gl.slice(gl.indexOf('  drawShadeMask('), gl.indexOf('  endShadows()')), /colorMask\(false, true, false, false\)/, 'the masks write green only');
  // the engine lays the masks inside the layer, before the sprite shadows
  const draw = engine.slice(engine.indexOf('gl.beginShadows()'), engine.indexOf('gl.endShadows()'));
  assert.ok(draw.indexOf('gl.drawShadeMask(') >= 0 && draw.indexOf('gl.drawShadeMask(') < draw.indexOf('gl.drawCast('), 'masks first');
  // the bake: every edge image's shadow, dark rim and edge shade put with multiply also goes onto the mask
  for (const what of ['im.shadow', 'im.dark', 'sd.shade', 'q.im.shadow', 'q.im.dark']) {
    const puts = r.split(`put(${what}, `).length - 1 + r.split(`, ${what}, `).filter((_, i) => i > 0).length;
    assert.ok(puts >= 2, `${what} is put on the chunk and on the mask (${puts})`);
  }
  assert.ok((r.match(/onShadeMask\(/g) ?? []).length >= 9, 'the shade sites mirrored');
});
