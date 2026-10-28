// Headless tests for T262 (#769): the grass catches the camera's shine (src/game/grass-shine.ts; the drawing is gl.ts FS_QUAD, the weight
// mask renderer.ts grassShineMask; the look is checked in the browser by scripts/dev/grass-shine-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRASS_SHINE_GLSL, MASK_SCALE, SHINE_GLOSS, SHINE_GROUPS, SHINE_INSET, SHINE_LOOK, SHINE_WEIGHTS, SHINE_ZOOM, SUN_SCREEN, clampShineLook, insetAt,
  maskColour, maskPad, maskWeight, shineExponent, shineGain, shineGroup, shineMaskPixels, shineWeight,
} from '../src/game/grass-shine';
import SURFACES from '../src/game/painted-surfaces.json';

/** a W x H mask canvas's RGBA as the worker draws it: covered px in red r, the rest clear */
function canvas(W: number, H: number, inside: (x: number, y: number) => boolean, r: number) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) { const i = 4 * (y * W + x); d[i] = r; d[i + 3] = 255; }
  return d;
}
const red = (w: number | null) => Number(/rgb\((\d+)/.exec(maskColour(w))?.[1] ?? 0);

test('the sun lies at the upper right of the screen, opposite the 145 degree shadows, about 46 degrees up', () => {
  const [x, y, z] = SUN_SCREEN;
  assert.ok(x > 0 && y < 0, 'right and up (screen y down)');
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.ok(Math.abs((Math.atan2(-y, -x) * 180) / Math.PI - 145) < 1e-6, 'the shadows fall away from it at 145 degrees (0 right, 90 down)');
  assert.ok(Math.abs((Math.asin(z) * 180) / Math.PI - 46) < 1.5);
});

test('the weights: greens and fairways most, then fringe, first cut and tee, then lawns, map grass and outfield, rough, long grass and fescue least but never none', () => {
  const W = SHINE_WEIGHTS, tier = (ks: (keyof typeof W)[]) => ks.map(k => W[k]);
  const top = tier(['green', 'fairway']), second = tier(['fringe', 'firstCut', 'tee']), third = tier(['lawn', 'map', 'outfield']), last = tier(['rough', 'longGrass', 'fescue']);
  assert.ok(Math.min(...top) > Math.max(...second), 'greens and fairways over the collars and tees');
  assert.ok(Math.min(...second) > Math.max(...third), 'the collars and tees over the lawns, map grass and outfield');
  assert.ok(Math.min(...third) > Math.max(...last), 'the lawns over the rough, long grass and fescue');
  assert.ok(Math.min(...last) > 0, 'the rough, long grass and fescue still shine');
  assert.equal(W.green, 1); assert.deepEqual(SHINE_GROUPS.map(g => g.key).sort(), Object.keys(W).sort());
});

test('every grass surface of painted-surfaces.json has a group; the textures the course, the lawns and the range lay find theirs', () => {
  const file = SURFACES as unknown as { surfaces: Record<string, { family: string }> };
  const sandy = new Set(['bunker', 'waste', 'water', 'growSoil', 'dirt', 'bank', 'mulch', 'river', 'swamp', 'field', 'lush', 'wallTurf', 'wallSand', 'wallBank']);
  for (const key of Object.keys(file.surfaces)) if (!sandy.has(key)) assert.ok(shineGroup(key), key);
  const cases: [string, string][] = [['preset:golf-green', 'green'], ['preset:fairway', 'fairway'], ['preset:fringe', 'fringe'], ['preset:first-cut', 'firstCut'], ['golfTee', 'tee'],
    ['preset:rough', 'rough'], ['lawn:0', 'lawn'], ['lawnBuilt', 'lawn'], ['grass', 'map'], ['preset:range-outfield', 'outfield'], ['pic:range-green', 'green'], ['preset:range-tee-turf', 'tee'], ['preset:fescue', 'fescue'], ['longGrass', 'longGrass']];
  for (const [t, g] of cases) assert.equal(shineGroup(t), g, t);
  for (const t of ['preset:sand', 'waterDark', 'preset:path-worn', 'dirt', 'asphalt']) assert.equal(shineGroup(t), null, t);
});

test('a weight: none for ground that is not grass (a town lawn wearing the desert), the town lawns\' for a grass of no known name', () => {
  assert.equal(shineWeight('preset:golf-green', 'grass'), SHINE_WEIGHTS.green);
  assert.equal(shineWeight('lawn:0', 'sand'), 0, 'the new town\'s block lawns wear the desert');
  assert.equal(shineWeight('preset:fairway', null), SHINE_WEIGHTS.fairway, 'a look with no painted family still shines by its name');
  assert.equal(shineWeight('some-new-grass', 'grass'), SHINE_WEIGHTS.lawn);
  assert.equal(shineWeight('some-new-sand', 'sand'), 0); assert.equal(shineWeight('preset:path-worn', null), 0);
  assert.equal(shineWeight('preset:rough', 'grass', { ...SHINE_WEIGHTS, rough: 1.5 }), 1.5, 'the knobs\' weights');
});

test('the look: on by default, clamped, remembered as JSON; the gloss size sets the exponent', () => {
  assert.equal(SHINE_LOOK.on, true);
  assert.deepEqual(clampShineLook(null), SHINE_LOOK);
  assert.deepEqual(clampShineLook(JSON.parse(JSON.stringify(SHINE_LOOK))), SHINE_LOOK);
  const c = clampShineLook({ on: false, strength: 99, size: -1, bump: Number.NaN, weights: { green: 9, rough: -1 } as never });
  assert.equal(c.on, false); assert.equal(c.strength, 4); assert.equal(c.size, 0.25); assert.equal(c.bump, SHINE_LOOK.bump);
  assert.equal(c.weights.green, 2); assert.equal(c.weights.rough, 0); assert.equal(c.weights.fairway, SHINE_WEIGHTS.fairway, 'a missing weight keeps its default');
  assert.equal(shineExponent({ size: 1 }), SHINE_GLOSS); assert.ok(shineExponent({ size: 2 }) < SHINE_GLOSS, 'a larger gloss is a lower exponent');
});

test('the gain: whole by day at the near zooms, faded after dusk and toward the district zoom, none when off', () => {
  assert.equal(shineGain(SHINE_LOOK, 0, 0.3), SHINE_LOOK.strength);
  assert.equal(shineGain(SHINE_LOOK, 0, 0.15), SHINE_LOOK.strength, '15%: whole');
  assert.equal(shineGain(SHINE_LOOK, 0, SHINE_ZOOM[0]), 0, 'gone by the district zoom');
  assert.ok(shineGain(SHINE_LOOK, 1, 0.3) < 0.2 * SHINE_LOOK.strength);
  assert.equal(shineGain({ ...SHINE_LOOK, on: false }, 0, 0.3), 0);
});

test('mask colours round-trip their weight; ground that is no grass is black', () => {
  for (const w of [0, 0.2, 0.65, 1, 2]) assert.ok(Math.abs(maskWeight(red(w)) - w) < 0.01, `${w}`);
  assert.equal(maskColour(null), '#000'); assert.equal(maskWeight(0), 0);
  assert.ok(red(0) >= 128, 'a shiny surface of weight 0 is still grass (no edge between it and its neighbours)');
});

test('the weight mask is inset from the grass\'s edges, never a flat wash up to them, and holds the weight over MASK_SCALE', () => {
  const W = 60, H = 30, tw = 8, half = (x: number) => x < 30;
  const out = shineMaskPixels(canvas(W, H, half, red(1)), W, H, tw);
  assert.equal(out[15 * W + 29], 0, 'the last texel before the edge takes none (within the first inset)');
  assert.equal(out[15 * W + 35], 0, 'outside: none');
  const deep = out[15 * W + 2]!; assert.ok(Math.abs(deep * MASK_SCALE / 255 - 1) < 0.02, `far inside: the whole weight (${deep})`);
  let prev = -1; for (let x = 29; x >= 0; x--) { const v = out[15 * W + x]!; assert.ok(v >= prev, `${x}: ${v} < ${prev}`); prev = v; }
  assert.ok(out[15 * W + 29 - (Math.ceil(SHINE_INSET[1] / tw) + 1)]! >= deep - 1);
  assert.ok(out[0 * W + 2]! >= deep - 1 && out[(H - 1) * W + 2]! >= deep - 1, 'past the mask\'s border counts as more of the same');
  assert.ok(Math.abs(insetAt(SHINE_INSET[0])) < 1e-9 && Math.abs(insetAt(SHINE_INSET[1]) - 1) < 1e-9);
  // a weight of 2 fits the byte
  assert.equal(shineMaskPixels(canvas(4, 4, () => true, red(2)), 4, 4, tw)[5], 255);
});

test('the margin: an edge just past the chunk insets the chunk; the output is the inner part', () => {
  const tw = 8, pad = maskPad(tw), w = 20, h = 10, W = w + 2 * pad, H = h + 2 * pad;
  const out = shineMaskPixels(canvas(W, H, x => x !== pad - 2, red(0.5)), W, H, tw, pad);
  assert.equal(out.length, w * h);
  assert.ok(out[5 * w]! < out[5 * w + w - 1]!, 'the chunk\'s left texels are inset by the edge in the margin');
  assert.ok(Math.abs(out[5 * w + w - 1]! * MASK_SCALE / 255 - 0.5) < 0.02, `half weight far from the edge (${out[5 * w + w - 1]})`);
});

test('the GLSL: one function, the sun and the tint as numbers, no flat wash (the blade tops and a grass key mask it)', () => {
  assert.match(GRASS_SHINE_GLSL, /vec3 grassShine\(vec3 c, float z, vec2 slope, float w, float k\)/);
  assert.ok(GRASS_SHINE_GLSL.includes(String(+SUN_SCREEN[0].toFixed(5))));
  assert.match(GRASS_SHINE_GLSL, /mix\(c \* c,/, 'T110: its own colour squared');
  assert.ok(!/NaN|undefined/.test(GRASS_SHINE_GLSL));
});
