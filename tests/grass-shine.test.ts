// Headless tests for T262 (#769, phase 1): the grass catches the camera's shine (src/game/grass-shine.ts; the drawing is gl.ts FS_QUAD, the
// weight mask renderer.ts grassShineMask, the bump maps scripts/assets/prep-grass-bump.mjs; the look is checked in the browser by
// scripts/dev/grass-shine-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUMP_FAMILIES, GRASS_SHINE_GLSL, SHINE_CODE, SHINE_INSET, SHINE_LOOK, SHINE_MODES, SUN_SCREEN, bumpK, bumpSlot, clampShineLook, insetAt, isShineMode,
  maskColour, maskPad, maskWeight, shineGain, shineMaskPixels, shineWeight,
} from '../src/game/grass-shine';
import { TILED_FAMILIES } from '../src/game/painted-tiles';

/** a W x H mask canvas's RGBA as the worker draws it: covered px in colour (r, g), the rest clear */
function canvas(W: number, H: number, inside: (x: number, y: number) => boolean, r: number, g = 0) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) { const i = 4 * (y * W + x); d[i] = r; d[i + 1] = g; d[i + 3] = 255; }
  return d;
}

test('the modes: off is 0 to the shader, every source a number, b measured as a4 (T215 mask has no free channel)', () => {
  assert.equal(SHINE_CODE.off, 0);
  for (const m of SHINE_MODES) assert.ok(isShineMode(m));
  assert.ok(!isShineMode('b') && !isShineMode('x') && !isShineMode(null));
  assert.equal(bumpK('a'), 2); assert.equal(bumpK('a4'), 4); assert.equal(bumpK('c'), 0); assert.equal(bumpK('d'), 0);
});

test('the sun lies at the upper right of the screen, opposite the 145 degree shadows, about 46 degrees up', () => {
  const [x, y, z] = SUN_SCREEN;
  assert.ok(x > 0 && y < 0, 'right and up (screen y down)');
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.ok(Math.abs((Math.atan2(-y, -x) * 180) / Math.PI - 145) < 1e-6, 'the shadows fall away from it at 145 degrees (0 right, 90 down)');
  assert.ok(Math.abs((Math.asin(z) * 180) / Math.PI - 46) < 1.5);
});

test('per-surface weights: greens most, fairways next, town lawns less; the rough and everything else none in phase 1', () => {
  assert.equal(shineWeight('green', 'green-concept-run'), 1);
  assert.ok(shineWeight('fairway', 'fairway-concept-run') < 1 && shineWeight('fairway', null) > shineWeight('lawn', null));
  assert.equal(shineWeight('lawn:2', 'lawn-concept-run'), shineWeight('lawns', null));
  assert.equal(shineWeight('rough', 'lawn-concept-run'), 0, 'the rough wears the lawn family but is not a lawn');
  for (const t of ['bunker', 'water', 'dirt', 'asphalt', 'fescue', 'longGrass']) assert.equal(shineWeight(t, null), 0, t);
  // a course look named for another family falls back to its family
  assert.equal(shineWeight('hole3-fairway-look', 'fairway-concept-run'), shineWeight('fairway', null));
});

test('the look clamps, and the day gain fades the shine after dusk', () => {
  assert.deepEqual(clampShineLook(null), SHINE_LOOK);
  const c = clampShineLook({ strength: 99, gloss: -1, bump: Number.NaN, eye: 0 });
  assert.equal(c.strength, 4); assert.equal(c.gloss, 1); assert.equal(c.bump, SHINE_LOOK.bump); assert.equal(c.eye, 0.2);
  assert.equal(shineGain(SHINE_LOOK, 0), SHINE_LOOK.strength);
  assert.ok(shineGain(SHINE_LOOK, 1) < 0.2 * SHINE_LOOK.strength);
  assert.ok(shineGain(SHINE_LOOK, 0.5) < shineGain(SHINE_LOOK, 0));
});

test('mask colours round-trip their weight and slot', () => {
  for (const w of [0.2, 0.6, 0.85, 1]) {
    const m = /rgb\((\d+),(\d+),0\)/.exec(maskColour(w, 2))!;
    assert.ok(Math.abs(maskWeight(+m[1]!) - w) < 0.01, `${w}`); assert.equal(+m[2]! / 40, 2);
  }
  assert.equal(maskWeight(+/rgb\((\d+)/.exec(maskColour(0, 0))![1]!), 0);
});

test('the weight mask is inset from the shiny ground\'s edges, never a flat wash to its border', () => {
  const W = 60, H = 30, tw = 8, half = (x: number) => x < 30;
  const out = shineMaskPixels(canvas(W, H, half, 255), W, H, tw, 1);
  assert.equal(out[15 * W + 29], 0, 'the last texel before the edge takes none (within the first inset)');
  assert.equal(out[15 * W + 35], 0, 'outside: none');
  const deep = out[15 * W + 2]!; assert.ok(deep > 250, `far inside: whole (${deep})`);
  // monotone from the edge inwards, reaching whole by SHINE_INSET[1]
  let prev = -1; for (let x = 29; x >= 0; x--) { const v = out[15 * W + x]!; assert.ok(v >= prev, `${x}: ${v} < ${prev}`); prev = v; }
  const atEnd = Math.ceil(SHINE_INSET[1] / tw) + 1; assert.ok(out[15 * W + 29 - atEnd]! > 250);
  // past the mask's border counts as more of the same: the top and bottom rows of the shiny half are whole
  assert.ok(out[0 * W + 2]! > 250 && out[(H - 1) * W + 2]! > 250);
  assert.ok(Math.abs(insetAt(SHINE_INSET[0]) - 0) < 1e-9 && Math.abs(insetAt(SHINE_INSET[1]) - 1) < 1e-9);
});

test('the margin: an edge just past the chunk insets the chunk, and the output is the inner part with the weight and the slot', () => {
  const tw = 8, pad = maskPad(tw), w = 20, h = 10, W = w + 2 * pad, H = h + 2 * pad;
  // shiny everywhere except a column just left of the chunk (in the margin)
  const src = canvas(W, H, x => x !== pad - 2, Number(/rgb\((\d+)/.exec(maskColour(0.5, 3))![1]), 120);
  const out = shineMaskPixels(src, W, H, tw, 2, pad);
  assert.equal(out.length, w * h * 2);
  assert.ok(out[2 * (5 * w + 0)]! < out[2 * (5 * w + w - 1)]!, 'the chunk\'s left texels are inset by the edge in the margin');
  assert.ok(Math.abs(out[2 * (5 * w + w - 1)]! - 127) <= 2, `half weight far from the edge (${out[2 * (5 * w + w - 1)]})`);
  assert.equal(out[2 * (5 * w + 10) + 1], 3, 'the family slot');
});

test('the bump maps: one per tile of the prototype families, NEAR and MID, made from the colour tiles the game ships (a stale one fails)', () => {
  assert.deepEqual(BUMP_FAMILIES.map(f => f.id), ['fairway-concept-run', 'green-concept-run', 'lawn-concept-run']);
  for (const f of BUMP_FAMILIES) {
    const tf = TILED_FAMILIES.find(t => t.id === f.id)!; assert.ok(tf, f.id);
    assert.equal(bumpSlot(f.id), BUMP_FAMILIES.indexOf(f) + 1);
    for (const band of ['near', 'mid'] as const) {
      const bl = f.levels[band]!, lv = tf.levels[band]; assert.ok(bl, `${f.id} ${band}`);
      assert.deepEqual(bl.size, [Math.round(lv.native[0] / 2), Math.round(lv.native[1] / 2)]);
      assert.equal(bl.tiles.length, lv.tiles.length);
      bl.tiles.forEach((t, i) => {
        assert.equal(t.of, lv.tiles[i]!.file, 'the same order as the colour tiles (the same permutation)');
        assert.equal(t.sha256, lv.tiles[i]!.sha256, `${t.of}: re-run prep-grass-bump.mjs`);
        assert.ok(existsSync(resolve('src/assets/ground/painted', t.file)), t.file);
      });
    }
  }
  assert.equal(bumpSlot('golden-fescue'), 0); assert.equal(bumpSlot(null), 0);
});

test('the GLSL: one function, the sun and the tint as numbers, the camera falloff and gain applied by the caller', () => {
  assert.match(GRASS_SHINE_GLSL, /vec3 grassShine\(vec3 c, float z, vec2 slope, float w, float k\)/);
  assert.ok(GRASS_SHINE_GLSL.includes(String(+SUN_SCREEN[0].toFixed(5))));
  assert.ok(!/NaN|undefined/.test(GRASS_SHINE_GLSL));
});
