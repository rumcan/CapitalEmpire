// T363 (#1018; the owner, 2026-11-08: "find the new default water settings attached. the water glint should be a much more oval shape. A LOT more oval. so stretch
// it vertically and make it so I can make it thinner"): the water's new defaults ("The default water") and the glint's oval, with its Oval / thinness slider.
// The glint (the camera specular: the lamp pools on the roads and the sky's glint on the water, lamp-reflect.ts) is a falloff round the screen's centre; it is
// narrower than tall by SpecLook.oval (1 round), on the CPU twin (specFalloff) and in the shader (CAMERA_DISTANCE_GLSL, gl.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CAMERA_DISTANCE_GLSL, SPEC_LOOK, SPEC_OVAL, clampSpecLook, specFalloff, specGain } from '../src/game/lamp-reflect';
import { glossGain } from '../src/game/swamp';
import { MOTION_RANGES, WATER_MOTION, clampWaterMotion } from '../src/game/water-motion';
import { NIGHT_DEFAULT } from '../src/game/night-light';
import { SHINE_LOOK } from '../src/game/grass-shine';
import { NightPanel } from '../src/ui/NightPanel';
import type { Game } from '../src/game/engine';

test('the default water: moving on, flow 2.29x, ripples 117%, foam 128%, sparkle 300% (the owner\'s settings)', () => {
  assert.deepEqual({ ...WATER_MOTION }, { on: true, flow: 2.29, ripple: 1.17, foam: 1.28, sparkle: 3 });
  assert.deepEqual(clampWaterMotion(null), WATER_MOTION, 'a look with nothing saved is the default water');
  // every knob inside its range, so the sliders can show them and the clamp keeps them as they are
  for (const k of ['flow', 'ripple', 'foam', 'sparkle'] as const) assert.ok(WATER_MOTION[k] >= MOTION_RANGES[k][0] && WATER_MOTION[k] <= MOTION_RANGES[k][1], k);
  assert.deepEqual(clampWaterMotion({ ...WATER_MOTION }), WATER_MOTION);
  // a bad knob falls back to the new default, a saved look keeps its own numbers
  assert.equal(clampWaterMotion({ foam: 'x' }).foam, 1.28);
  assert.deepEqual(clampWaterMotion({ on: true, flow: 1, ripple: 1, foam: 1, sparkle: 1 }), { on: true, flow: 1, ripple: 1, foam: 1, sparkle: 1 });
});

test('the glint\'s oval: round at 1, narrower than tall above it; on the screen\'s middle line the vertical reach is the old round one', () => {
  const W = 1600, H = 2400, inner = 0.15, outer = 1;
  // oval 1 is the old falloff, whatever the optional argument says
  for (const [x, y] of [[W / 2, H / 2], [W / 2 + 300, H / 2], [W / 2, H / 2 + 500], [100, 100], [W, 0]]) assert.equal(specFalloff(x!, y!, W, H, inner, outer, 1), specFalloff(x!, y!, W, H, inner, outer));
  assert.equal(specFalloff(W / 2, H / 2, W, H, inner, outer, 4), 1, 'whole at the centre');
  // a point o times farther sideways than another is as far from the centre as the other is above it: the same falloff
  for (const o of [2, 3, 5, 8]) {
    const up = 400, side = up / o;
    assert.ok(Math.abs(specFalloff(W / 2 + side, H / 2, W, H, inner, outer, o) - specFalloff(W / 2, H / 2 + up, W, H, inner, outer, 1)) < 1e-12, `oval ${o}`);
    // and the same pixel is dimmer the thinner the oval, never brighter
    assert.ok(specFalloff(W / 2 + 300, H / 2, W, H, inner, outer, o) <= specFalloff(W / 2 + 300, H / 2, W, H, inner, outer, 1) + 1e-12);
  }
  // straight above the centre the reach does not change with the oval (it narrows sideways only)
  for (const o of [1, 3, 8]) assert.equal(specFalloff(W / 2, H / 2 - 600, W, H, inner, outer, o), specFalloff(W / 2, H / 2 - 600, W, H, inner, outer, 1));
  // symmetric left and right, up and down
  assert.equal(specFalloff(W / 2 + 120, H / 2 + 200, W, H, inner, outer, 3), specFalloff(W / 2 - 120, H / 2 - 200, W, H, inner, outer, 3));
  // the shape: the contour of falloff 0.5 is a vertical ellipse o times taller than wide
  const o = 3, reach = (dx: number, dy: number) => specFalloff(W / 2 + dx, H / 2 + dy, W, H, inner, outer, o);
  let lo = 0, hi = 0.5 * H; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (reach(0, m) > 0.5) lo = m; else hi = m; }
  const tall = lo; lo = 0; hi = 0.5 * W; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (reach(m, 0) > 0.5) lo = m; else hi = m; }
  assert.ok(Math.abs(tall / lo - o) < 1e-6, `${(tall / lo).toFixed(4)} times taller than wide`);
});

test('the oval knob: the game starts at a much more oval glint (3x), the slider runs from round (1) to 8, a bad value falls back', () => {
  assert.equal(SPEC_LOOK.oval, 3); assert.ok(SPEC_LOOK.oval >= 2.5, 'a LOT more oval than round');
  assert.deepEqual([SPEC_OVAL.min, SPEC_OVAL.max], [1, 8]);
  assert.deepEqual(clampSpecLook(null), SPEC_LOOK);
  assert.equal(clampSpecLook({ oval: 0.2 }).oval, 1); assert.equal(clampSpecLook({ oval: 99 }).oval, 8); assert.equal(clampSpecLook({ oval: 5.25 }).oval, 5.25);
  assert.equal(clampSpecLook({ oval: NaN }).oval, 3); assert.equal(clampSpecLook({ oval: 'x' as unknown as number }).oval, 3);
  // the other knobs are as they were (inner, outer, strength, by day) and the gains do not read the oval
  const k = clampSpecLook({ inner: 0.8, outer: 0.2, strength: 9, day: -1, oval: 2 });
  assert.equal(k.inner, 0.8); assert.ok(k.outer > k.inner); assert.equal(k.strength, 3); assert.equal(k.day, 0);
  const round = { ...SPEC_LOOK, oval: 1 }, thin = { ...SPEC_LOOK, oval: 8 };
  assert.equal(specGain(round, 0.4), specGain(thin, 0.4)); assert.equal(glossGain(round, 1), glossGain(thin, 1));
});

test('the shader\'s distance takes the oval the same way (x scaled before the length, over half the longer side)', () => {
  assert.match(CAMERA_DISTANCE_GLSL, /float camD\(float oval\)/);
  assert.match(CAMERA_DISTANCE_GLSL, /gl_FragCoord\.xy - 0\.5 \* uScreen/);
  assert.match(CAMERA_DISTANCE_GLSL, /length\(vec2\(q\.x \* oval, q\.y\)\) \/ \(0\.5 \* max\(uScreen\.x, uScreen\.y\)\)/);
});

test('the Night panel: the glint\'s Oval / thinness slider (1 to 8, at the game\'s own oval) and the water\'s default button', () => {
  const noop = () => {};
  const game = { golfMode: false, night: { ...NIGHT_DEFAULT, mode: 'off' }, specCam: true, spec: { ...SPEC_LOOK }, shine: { ...SHINE_LOOK }, waterLook: { ...WATER_MOTION }, setSpec: noop, setWaterMotion: noop } as unknown as Game;
  const html = renderToStaticMarkup(createElement(NightPanel, { game, bump: noop }));
  const row = html.match(/<label[^>]*>(?:(?!<\/label>).)*Oval \/ thinness(?:(?!<\/label>).)*<\/label>/)?.[0] ?? '';
  assert.ok(row, 'the row is there');
  assert.match(row, /type="range"/); assert.match(row, /min="1"/); assert.match(row, /max="8"/); assert.match(row, /value="3"/); assert.match(row, />3\.0x</);
  assert.ok(html.indexOf('Oval / thinness') > html.indexOf('Lamp reflections and water glint') && html.indexOf('Oval / thinness') < html.indexOf('Grass shine'), 'in the glint\'s own section');
  assert.match(html, />The default water</);
  // the water section shows the new defaults
  assert.match(html, /2\.29x/); assert.match(html, />117%</); assert.match(html, />128%</); assert.match(html, />300%</);
});
