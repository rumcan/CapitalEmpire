// T363 (#1018; the owner, 2026-11-08: "find the new default water settings attached. the water glint should be a much more oval shape. A LOT more oval. so stretch
// it vertically and make it so I can make it thinner"): the water's new defaults ("The default water") and the glint's oval, with its Oval / thinness slider.
// The glint (the camera specular: the lamp pools on the roads and the sky's glint on the water, lamp-reflect.ts) is a falloff round the screen's centre; it is
// narrower than tall by SpecLook.oval (1 round), on the CPU twin (specFalloff) and in the shader (CAMERA_DISTANCE_GLSL, gl.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CAMERA_FALLOFF_GLSL, SPEC_LOOK, SPEC_OVAL, clampSpecLook, specFalloff, specGain } from '../src/game/lamp-reflect';
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

test('the glint\'s oval: round at 1 (the old falloff), a vertical oval above it with its sides feathered; the middle line and the height are the round glint\'s', () => {
  const W = 1600, H = 2400, inner = 0.15, outer = 1, R = 0.5 * Math.max(W, H);
  /** the round falloff as it was before the oval: 1 within inner, 0 past outer, a smoothstep between */
  const old = (x: number, y: number, i = inner, o = outer) => { const d = Math.hypot(x - W / 2, y - H / 2) / R, t = Math.min(1, Math.max(0, (d - i) / (o - i))); return 1 - t * t * (3 - 2 * t); };
  for (const [x, y] of [[W / 2, H / 2], [W / 2 + 300, H / 2], [W / 2, H / 2 + 500], [100, 100], [W, 0], [W / 2 - 220, H / 2 + 90]]) {
    assert.ok(Math.abs(specFalloff(x!, y!, W, H, inner, outer, 1) - old(x!, y!)) < 1e-12 && Math.abs(specFalloff(x!, y!, W, H, inner, outer) - old(x!, y!)) < 1e-12, `oval 1 at ${x},${y}`);
  }
  assert.equal(specFalloff(W / 2, H / 2, W, H, inner, outer, 4), 1, 'whole at the centre');
  // straight up and down the middle line the reach is the round glint's, whatever the oval: the oval narrows it sideways only
  for (const o of [1, 1.5, 2, 3, 8]) for (const dy of [0, 200, 600, 1000]) assert.equal(specFalloff(W / 2, H / 2 - dy, W, H, inner, outer, o), old(W / 2, H / 2 - dy), `oval ${o}, ${dy} px up`);
  // symmetric left and right, up and down; never brighter than the round one, falling away from the middle line
  assert.equal(specFalloff(W / 2 + 120, H / 2 + 200, W, H, inner, outer, 3), specFalloff(W / 2 - 120, H / 2 - 200, W, H, inner, outer, 3));
  for (const o of [2, 3, 5, 8]) { let prev = 1; for (let x = W / 2; x < W; x += 5) { const f = specFalloff(x, H / 2 + 80, W, H, inner, outer, o); assert.ok(f <= prev + 1e-12 && f <= old(x, H / 2 + 80) + 1e-12, `oval ${o} at ${x}`); prev = f; } }
  // the sides are feathered (the lead's review of the first stripe: "hard-sided", "no flat colour washes"): even a hard Inner / Outer gap (0.30 to 0.31, the owner's strong
  // glint) makes no crisp edge from oval 2 on: the biggest step of the falloff between neighbouring pixels along the middle row is small, where the round glint's is a cliff
  const step = (o: number, i = 0.3, ou = 0.31) => { let m = 0, prev = 1; for (let x = W / 2; x < W; x++) { const f = specFalloff(x, H / 2, W, H, i, ou, o); m = Math.max(m, Math.abs(f - prev)); prev = f; } return m; };
  assert.ok(step(1) > 0.1, `oval 1 keeps its crisp edge as it was: ${step(1).toFixed(3)} a pixel`);
  for (const o of [2, 3, 5, 8]) assert.ok(step(o) < 0.05, `oval ${o}: the biggest step between pixels is ${step(o).toFixed(3)}`);
  let last = Infinity; for (const o of [1, 1.25, 1.5, 1.75, 2]) { const v = step(o); assert.ok(v <= last + 1e-9, `the feather comes in from oval 1 to 2: ${o} ${v.toFixed(3)}`); last = v; }
  // and with the game's own Inner / Outer the oval is a soft bell: the glint is half-strong a good way in from the middle line, a third of the round one's reach at oval 3
  const half = (o: number) => { let x = W / 2; while (x < W && specFalloff(x, H / 2, W, H, inner, outer, o) > 0.5) x += 0.25; return x - W / 2; };
  assert.ok(half(3) < half(1) / 3 * 1.05 && half(3) > half(1) / 3 * 0.5, `half strength at ${half(3)} px against the round glint\'s ${half(1)}`);
  assert.ok(half(8) < half(3) && half(5) < half(3));
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

test('the shader\'s falloff is the same: the sideways distance stretched by the oval, the sides feathered, over half the longer side', () => {
  assert.match(CAMERA_FALLOFF_GLSL, /float camFall\(vec4 u\)/);
  assert.match(CAMERA_FALLOFF_GLSL, /gl_FragCoord\.xy - 0\.5 \* uScreen/);
  assert.match(CAMERA_FALLOFF_GLSL, /R = 0\.5 \* max\(uScreen\.x, uScreen\.y\), e = abs\(q\.x\) \* u\.w \/ R, d = length\(vec2\(e, q\.y \/ R\)\)/);
  assert.match(CAMERA_FALLOFF_GLSL, /side = 1\.0 - smoothstep\(0\.0, u\.y, e\)/);
  assert.match(CAMERA_FALLOFF_GLSL, /\(1\.0 - smoothstep\(u\.x, u\.y, d\)\) \* mix\(1\.0, side, clamp\(u\.w - 1\.0, 0\.0, 1\.0\)\)/);
  // gl.ts builds it into the chunk shader and the lamp pools and the water glint both ask it (the grass shine keeps its own round falloff)
  const gl = readFileSync('src/game/gl.ts', 'utf8');
  assert.match(gl, /\$\{CAMERA_FALLOFF_GLSL\}/); assert.match(gl, /camFall\(uSpec\) \* uSpec\.z/); assert.match(gl, /camFall\(uGloss\) \* uGloss\.z/);
  assert.match(gl, /length\(gl_FragCoord\.xy - 0\.5 \* uScreen\) \/ \(0\.5 \* max\(uScreen\.x, uScreen\.y\)\), k = \(1\.0 - smoothstep\(uShine\.x/, 'the shine is round, as it was');
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
