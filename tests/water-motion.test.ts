// Headless tests for T248 (#718): water that moves (src/game/water-motion.ts: the per-chunk motion mask from T230's water field, the
// ripples, the rivers' flow, the waves lapping at the shore and the wet bank; the drawing is gl.ts FS_QUAD's waterMotion, its CPU twin
// motionPixel here; the look is checked in the browser by scripts/dev/water-motion-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HH, HW } from '../src/game/iso';
import { DEFAULT_WATER_LOOK, SITE, WaterField, fieldPad } from '../src/game/water-look';
import {
  BANK_REACH, FOAM, LAP, MOTION_RANGES, SD_RANGE, SUN_TILE, WATER_MOTION, WATER_MOTION_GLSL, ZOOM, bankAt, clampWaterMotion, decodeSd, encodeSd, foamAt,
  motionFrame, motionMask, motionPixel, noiseD, poolWeight, SWAMP_POOL, swampPixel, phasesAt, pondLap, riverLap, sampleOf, stepPhases, waterKey, type MotionFrame, type MotionMaskData,
} from '../src/game/water-motion';

/** the pond's and the lake's picture means (pond-concept-run, lake), the bank's (pond-bank-run) and a grass */
const POND = [30, 67, 66], LAKE = [11, 82, 99], BANK = [103, 92, 61], GRASS = [84, 112, 52];
const square = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s];
/** a field over tile box b (the chunk) with the motion's extras, a square pond marked, its distances made */
const pondField = (b: number[], pond: number[], res = 2) => { const f = WaterField.over(b, fieldPad(DEFAULT_WATER_LOOK), res).motion(); f.rings([pond], SITE.course, pondLap); f.shore(7); return f; };
/** a mask texel's sample at tile point (x, y) (nearest) */
const texel = (m: MotionMaskData, x: number, y: number) => {
  const u = Math.floor(((x - m.box[0]) / (m.box[2] - m.box[0])) * m.w), v = Math.floor(((y - m.box[1]) / (m.box[3] - m.box[1])) * m.h), o = 4 * (v * m.w + u);
  return { r: m.data[o]!, g: m.data[o + 1]!, b: m.data[o + 2]!, a: m.data[o + 3]!, s: sampleOf(m.data[o]!, m.data[o + 1]!, m.data[o + 2]!, m.data[o + 3]!) };
};
const frame = (over: Partial<MotionFrame> = {}): MotionFrame => ({ ...motionFrame(WATER_MOTION, 0.3, 0, 0.3, phasesAt(3.7, WATER_MOTION))!, ...over });

test('the signed distance survives the mask (a 30th of a tile a step) and is held to its range', () => {
  for (const sd of [-2, -0.5, 0, 0.25, 1, 3.3, 6]) assert.ok(Math.abs(decodeSd(encodeSd(sd)) - sd) <= (SD_RANGE[1] - SD_RANGE[0]) / 255 / 2 + 1e-9, `${sd}`);
  assert.equal(encodeSd(-9), 0); assert.equal(encodeSd(40), 255);
});

test('the bank distance: 0 on the water, growing out from it, the shore distance\'s twin', () => {
  const f = pondField([0, 0, 30, 30], square(10, 10, 10)), out = f.bank(3);
  const at = (x: number, y: number) => Math.floor((y - f.y0) * f.res) * f.W + Math.floor((x - f.x0) * f.res);
  assert.equal(out[at(15, 15)], 0);
  // a sample half a tile out from the pond's edge (x = 20) reads about half a tile, two tiles out about two, past the cap the cap
  assert.ok(Math.abs(out[at(20.25, 15.25)]! - 0) < 0.3, `${out[at(20.25, 15.25)]}`);
  assert.ok(Math.abs(out[at(22.25, 15.25)]! - 2) < 0.3, `${out[at(22.25, 15.25)]}`);
  assert.equal(out[at(28, 15)], 3);
  // and the shore distance inside is untouched by the motion's extras
  const plain = WaterField.over([0, 0, 30, 30], fieldPad(DEFAULT_WATER_LOOK), 2); plain.rings([square(10, 10, 10)], SITE.course); plain.shore(7);
  assert.deepEqual([...plain.site], [...f.site]); assert.deepEqual([...plain.d], [...f.d]);
});

test('the mask over a pond: in on the water, out on the bank, still (no flow), the pond\'s waves, none far up the bank', () => {
  const f = pondField([0, 0, 30, 30], square(10, 10, 10)), m = motionMask(f)!;
  assert.ok(m && m.w > 0 && m.h > 0 && m.data.length === m.w * m.h * 4);
  const mid = texel(m, 15.1, 15.1), edge = texel(m, 10.4, 15.1), bank = texel(m, 9.6, 15.1), far = texel(m, 4, 4);
  assert.ok(mid.s.sd > 4, `${mid.s.sd}`); assert.ok(edge.s.sd > 0 && edge.s.sd < 0.6, `${edge.s.sd}`); assert.ok(bank.s.sd < 0 && bank.s.sd > -0.6, `${bank.s.sd}`);
  assert.ok(far.s.sd <= -1.9, `${far.s.sd}`); assert.equal(far.a, 0);
  for (const t of [mid, edge, bank]) { assert.equal(t.g, 128); assert.equal(t.b, 128); }
  // the waves' strength: a 100-tile pond laps gently (the least), carried out onto its bank
  assert.equal(mid.a, Math.round(255 * pondLap(100))); assert.equal(bank.a, mid.a);
  assert.equal(pondLap(100), LAP.pond[0]); assert.equal(pondLap(1e5), LAP.pond[1]); assert.ok(pondLap(2500) > pondLap(800));
  // the box covers the chunk's own samples
  assert.ok(m.box[0] <= 0 && m.box[1] <= 0 && m.box[2] >= 30 && m.box[3] >= 30);
  // no water near: no mask
  assert.equal(motionMask(pondField([0, 0, 30, 30], square(100, 100, 5))), null);
});

test('a river flows downstream along its spline, the waves by its width; a bridge and the swamp keep them away', () => {
  const pts = [{ x: 0, y: 15, w: 8 }, { x: 10, y: 15, w: 8 }, { x: 20, y: 15, w: 8 }, { x: 30, y: 15, w: 8 }, { x: 40, y: 15, w: 8 }];
  const mk = () => { const f = WaterField.over([5, 0, 35, 30], fieldPad(DEFAULT_WATER_LOOK), 2).motion(); f.waterway(pts, SITE.river, 1, riverLap); f.shore(7); return f; };
  const m = motionMask(mk())!;
  const mid = texel(m, 15.1, 15.1), bank = texel(m, 15.1, 19.6);
  assert.ok(mid.s.sd > 3); assert.equal(mid.g, 255); assert.equal(mid.b, 128); // (+x: downstream)
  assert.ok(bank.s.sd < 0); assert.equal(bank.g, 255, 'the bank carries the flow out to the swash');
  assert.equal(mid.a, Math.round(255 * riverLap(8))); assert.ok(riverLap(40) > riverLap(8));
  // a bridge across at x = 20 (half width 1.5): no waves on or beside its deck, nor under its shadow down the screen; whole away from it
  const mb = motionMask(mk(), { bridges: [{ pts: [{ x: 20, y: 5 }, { x: 20, y: 25 }], hw: 1.5 }] })!;
  assert.equal(texel(mb, 20.1, 12.1).a, 0); assert.equal(texel(mb, 21.6, 12.1).a, 0);
  const s = 66 / (2 * HH); assert.equal(texel(mb, 20.1 + s, 12.1 + s).a, 0, 'its shadow on the water');
  assert.equal(texel(mb, 12.1, 13.1).a, texel(m, 12.1, 13.1).a);
  // a swamp band over the north bank: no wet band there
  const W = 60, H = 60, data = new Uint8ClampedArray(W * H * 4); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (j < 22) data[(j * W + i) * 4 + 3] = 255;
  const ms = motionMask(mk(), { bands: [{ a: { data, W, H }, x0: 5, y0: 0, res: 2 }] })!;
  assert.equal(texel(ms, 15.1, 10.6).a, 0); assert.equal(texel(ms, 15.1, 19.6).a, texel(m, 15.1, 19.6).a);
});

test('the knobs: clamped to their ranges, the default on; off or the district zoom makes no frame', () => {
  assert.deepEqual(clampWaterMotion(null), WATER_MOTION);
  assert.equal(WATER_MOTION.on, true);
  const c = clampWaterMotion({ on: false, flow: 99, ripple: -1, foam: 'x', sparkle: 2 });
  assert.equal(c.on, false); assert.equal(c.flow, MOTION_RANGES.flow[1]); assert.equal(c.ripple, 0); assert.equal(c.foam, 1); assert.equal(c.sparkle, 2);
  assert.equal(motionFrame({ ...WATER_MOTION, on: false }, 0.3, 0, 0.3, phasesAt(1, WATER_MOTION)), null);
  assert.equal(motionFrame(WATER_MOTION, ZOOM[0] - 0.01, 0, 0.09, phasesAt(1, WATER_MOTION)), null);
  const f = motionFrame(WATER_MOTION, 0.3, 1, 0.3, phasesAt(1, WATER_MOTION))!;
  assert.equal(f.gain, 1); assert.ok(f.sparkle < 0.2, 'the sparkle goes after dusk'); assert.equal(f.foam, 1);
  // the phases run with the speed and wrap at 256
  const p = stepPhases({ phase: 255.9, wave: 0, drift: [0, 0, 0, 0] }, 1, WATER_MOTION);
  assert.ok(p.phase >= 0 && p.phase < 256 && p.phase < 1); assert.ok(p.wave > 0);
  const still = phasesAt(5, { ...WATER_MOTION, flow: 0 }); assert.equal(still.phase, 0); assert.equal(still.wave, 0);
});

test('the noise\'s derivatives are its slope (the GLSL shares the formula), and it repeats every 256 cells', () => {
  for (const [x, y] of [[0.3, 0.7], [12.25, -3.6], [100.9, 55.1]]) {
    const [v, dx, dy] = noiseD(x, y), h = 1e-4, ex = (noiseD(x + h, y)[0] - noiseD(x - h, y)[0]) / (2 * h), ey = (noiseD(x, y + h)[0] - noiseD(x, y - h)[0]) / (2 * h);
    assert.ok(Math.abs(v) < 1); assert.ok(Math.abs(dx - ex) < 1e-3, `${dx} ${ex}`); assert.ok(Math.abs(dy - ey) < 1e-3, `${dy} ${ey}`);
    assert.ok(Math.abs(noiseD(x + 256, y)[0] - v) < 1e-4);
  }
});

test('the sun lies at the upper right of the screen', () => {
  const X = HW * (SUN_TILE[0] - SUN_TILE[1]), Y = HH * (SUN_TILE[0] + SUN_TILE[1]);
  assert.ok(X > 0 && Y < 0, `${X} ${Y}`);
});

test('the water key: the pond, the lake and their shaded water are water; the bank, the grass and a road are not', () => {
  for (const c of [POND, LAKE, [20, 54, 63], [62, 93, 85]]) assert.ok(waterKey(c[0]!, c[1]!, c[2]!) > 0.9, `${c}`);
  for (const c of [BANK, GRASS, [93, 89, 80], [96, 100, 104], [143, 137, 126]]) assert.ok(waterKey(c[0]!, c[1]!, c[2]!) < 0.05, `${c}`);
});

test('the motion is masked to the water: off is the identity, the far bank and the bank\'s own colour beyond the wet band are untouched', () => {
  const fr = frame(), water = { sd: 3, fx: 0, fy: 0, amp: 0.6 };
  assert.deepEqual(motionPixel(POND, 15, 15, water, null), POND, 'off');
  assert.deepEqual(motionPixel(POND, 15, 15, water, { ...fr, gain: 0 }), POND);
  assert.deepEqual(motionPixel(BANK, 5, 5, { sd: -2, fx: 0, fy: 0, amp: 0 }, fr), BANK, 'far up the bank');
  // the bank's own colour well past the wet band (its distance from the waterline read off the picture) and on the field's water side
  assert.deepEqual(motionPixel(BANK, 9.3, 15, { sd: -0.3, fx: 0, fy: 0, amp: 0.6 }, fr, 0.6).map(Math.round), BANK);
  assert.deepEqual(motionPixel(GRASS, 15, 15, water, fr).map(Math.round), GRASS, 'a non-water colour inside the field is never rippled');
  // the water itself moves: over a few seconds its pixel changes, and differs between two places at one time
  const seen = new Set<string>();
  for (let t = 0; t < 4; t += 0.5) seen.add(motionPixel(POND, 15, 15, water, frame(phasesAt(t, WATER_MOTION))).map(v => Math.round(v)).join());
  assert.ok(seen.size > 3, `${seen.size}`);
});

test('the waves only near the shore: the foam crests start inside their reach, fade as they arrive, and break up; none at no strength', () => {
  const fr = frame(), R = (A: number) => FOAM.reach[0] + (FOAM.reach[1] - FOAM.reach[0]) * A;
  let maxNear = 0, maxFar = 0, zeros = 0, n = 0;
  for (let t = 0; t < 8; t += 0.05) {
    const f = frame(phasesAt(t, WATER_MOTION));
    for (const sd of [0.3, 0.6, 0.9, 1.2]) { const v = foamAt(sd, 1, 0.8, f, 0, 0.3, false); maxNear = Math.max(maxNear, v); n++; if (v === 0) zeros++; }
    maxFar = Math.max(maxFar, foamAt(R(0.8) + 0.01, 3, 0.8, f, 0, 0.3, false), foamAt(5, 3, 0.8, f, 0, 0.3, false));
  }
  assert.ok(maxNear > 0.15, `${maxNear}`); assert.equal(maxFar, 0); assert.ok(zeros > n / 3, 'thin crests: most of the time a point has none');
  assert.equal(foamAt(0.5, 1, 0, fr, 0, 0.3, false), 0, 'no strength (a bridge, the swamp): no foam');
  assert.ok(foamAt(0.5, 1, 0.8, fr, 0, -0.5, false) === 0, 'broken where the breakup layer is low');
  // arriving: at the picture's waterline the crest is gone
  for (let t = 0; t < 4; t += 0.05) assert.equal(foamAt(0.6, 0, 0.8, frame(phasesAt(t, WATER_MOTION)), 0, 0.3, false), 0);
  // the bank: the wet band near the waterline, none past its reach, none where the waves are kept away
  let wetNear = 0, wetFar = 0;
  for (let t = 0; t < 8; t += 0.1) { const f = frame(phasesAt(t, WATER_MOTION)); wetNear = Math.max(wetNear, bankAt(0.03, 0.8, f, 0, 0).wet); wetFar = Math.max(wetFar, bankAt(BANK_REACH, 0.8, f, 0, 0.5).wet); }
  assert.ok(wetNear > 0.9); assert.equal(wetFar, 0); assert.equal(bankAt(0.03, 0, fr, 0, 0).wet, 0);
});

test('the shader carries the same numbers', () => {
  for (const k of ['uWaterTex', 'uWaterBox', 'uWaterT', 'uWaterDrift', 'vec3 waterMotion(vec3 c, vec2 p)', 'textureLod(uShadeLayer']) assert.ok(WATER_MOTION_GLSL.includes(k), k);
  assert.ok(!/NaN|undefined/.test(WATER_MOTION_GLSL));
});

test('2026-11-01: the motion reaches the district zoom (it fades out only toward the planner map), and a creek\'s own water moves through its swamp band', () => {
  assert.ok(ZOOM[0] <= 0.035 + 1e-9 && ZOOM[1] < 0.1, `the fade sits below the district zoom (10%): ${ZOOM}`);
  const f = WaterField.over([0, 0, 20, 20], 2, 2); f.motion();
  f.waterway([{ x: 0, y: 10, w: 2 }, { x: 20, y: 10, w: 2 }], SITE.creek, 1, () => 0.3);
  f.shore(3);
  // the swamp band over the whole box (alpha 1 everywhere): the bank is still, the creek's water is not
  const band = { a: { data: new Uint8ClampedArray(40 * 40 * 4).fill(255), W: 40, H: 40 }, x0: -10, y0: -10, res: 1 };
  const m = motionMask(f, { bands: [band as never] })!;
  assert.ok(m, 'a mask');
  const at = (x: number, y: number) => { const u = Math.floor((x - m.box[0]) / (m.box[2] - m.box[0]) * m.w), v = Math.floor((y - m.box[1]) / (m.box[3] - m.box[1]) * m.h); return m.data[4 * (v * m.w + u) + 3]!; };
  assert.ok(at(10, 10) > 0, 'the creek\'s water moves');
  // T343: the swamp past its bank: no waves from the creek, but its own pools' weight (the band's cover), the signed distance far out
  const t = texel(m, 10.1, 15.1);
  assert.equal(t.a, 255, "the swamp past its bank carries its pools' weight"); assert.ok(t.s.sd <= SWAMP_POOL.far[0], 'far past the open water');
  assert.equal(t.g, 128); assert.equal(t.b, 128, 'still: no flow');
  assert.equal(poolWeight(t.s), 1);
  assert.equal(poolWeight(texel(m, 10.1, 11.1).s), 0, "none on the creek's own bank (its waves are kept off it as before)");
});


// ---------- T343 (#973): the swamp's pools get the water's motion, gently ----------
/** the swamp tiles' pool water (dark teal: swamp.ts swampKey whole), their mud and their reeds */
const POOL = [38, 72, 74], MUD = [92, 80, 52], REED = [96, 110, 50];
const bandOf = (W: number, H: number, x0: number, y0: number, res: number, cover: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data[(j * W + i) * 4 + 3] = Math.round(255 * cover(x0 + (i + 0.5) / res, y0 + (j + 0.5) / res));
  return { a: { data, W, H }, x0, y0, res };
};

test("T343: a swamp with no open water near still gets a mask, its pools' weight from the band's cover; none without swamp", () => {
  const f = () => WaterField.over([0, 0, 20, 20], BANK_REACH + 2, 2).motion();
  assert.equal(motionMask(f()), null, 'no water, no swamp: no mask');
  const half = bandOf(60, 60, -10, -10, 2, x => (x < 10 ? 1 : 0));
  const m = motionMask(f(), { bands: [half] })!;
  assert.ok(m, 'the swamp alone makes a mask');
  assert.equal(poolWeight(texel(m, 4.1, 8.1).s), 1, 'in the swamp: whole');
  assert.equal(poolWeight(texel(m, 15.1, 8.1).s), 0, 'past the swamp: none');
  // a bridge over the swamp keeps its pools still beneath it
  const mb = motionMask(f(), { bands: [half], bridges: [{ pts: [{ x: 4, y: -5 }, { x: 4, y: 25 }], hw: 1.5 }] })!;
  assert.equal(texel(mb, 4.1, 8.1).a, 0); assert.equal(texel(mb, 0.1, 2.1).a, texel(m, 0.1, 2.1).a);
  // the swamp band far from the chunk: no mask
  assert.equal(motionMask(f(), { bands: [bandOf(10, 10, 100, 100, 2, () => 1)] }), null);
});

test('T343: the swamp mask feeds the motion pass: the pools ripple, glint and lap at their edges, gently; the mud and reeds stay', () => {
  const fr = frame(), sw = sampleOf(0, 128, 128, 255);
  // the pool water moves (over a patch, some pixels lighter, some darker), the swamp's own colour kept (no wash: a multiply and small)
  let lighter = 0, darker = 0, most = 0, sum = 0;
  for (let i = 0; i < 400; i++) {
    const x = 3 + (i % 20) * 0.37, y = 5 + Math.floor(i / 20) * 0.41, o = motionPixel(POOL, x, y, sw, fr), r = swampPixel(POOL, x, y, 1, frame({ sparkle: 0, foam: 0 }));
    const d = r[1]! - POOL[1]!; if (d > 0.5) lighter++; if (d < -0.5) darker++; most = Math.max(most, Math.abs(d)); sum += Math.abs(d);
    // (the same as the twin itself)
    assert.deepEqual(o, swampPixel(POOL, x, y, 1, fr));
  }
  assert.ok(lighter > 40 && darker > 40, `ripples both ways: ${lighter} ${darker}`);
  assert.ok(sum / 400 < 0.08 * POOL[1]! && most < 0.4 * POOL[1]!, `the ripples' light gentle (a multiply): mean ${sum / 400}, at most ${most}`);
  // the mud and the reeds between the pools are untouched
  for (const c of [MUD, REED, GRASS]) assert.deepEqual(motionPixel(c, 4.3, 6.1, sw, fr), c);
  // no swamp weight there (the open water's far bank, as before): untouched
  assert.deepEqual(motionPixel(POOL, 4.3, 6.1, sampleOf(0, 128, 128, 0), fr), POOL);
  // the ripples move: the same pixel at another moment differs
  const later = frame({ drift: phasesAt(9.1, WATER_MOTION).drift, wave: phasesAt(9.1, WATER_MOTION).wave });
  let moved = 0; for (let i = 0; i < 50; i++) { const x = 2 + i * 0.29, y = 7.3; if (Math.abs(motionPixel(POOL, x, y, sw, fr)[1]! - motionPixel(POOL, x, y, sw, later)[1]!) > 0.3) moved++; }
  assert.ok(moved > 20, `moved ${moved}`);
  assert.ok(SWAMP_POOL.scale > 1 && SWAMP_POOL.slow < 1, 'finer and slower');
  // the pool's edge (mud on a side: near 0) gets a soft pale rim, the open middle none
  let rim = 0; for (let i = 0; i < 100; i++) { const x = 1 + i * 0.21; const e = swampPixel(POOL, x, 3, 1, fr, 0, 0), m = swampPixel(POOL, x, 3, 1, fr, 1, 0); rim = Math.max(rim, e[0]! - m[0]!); }
  assert.ok(rim > 1 && rim < 30, `a gentle rim: ${rim}`);
  // the motion off (no frame): untouched
  assert.deepEqual(motionPixel(POOL, 4.3, 6.1, sw, null), POOL);
});

test("T343: the swamp pools' glint: fewer and softer than a pond's, none in a shadow", () => {
  assert.ok(SWAMP_POOL.exp < 220, 'softer: a lower exponent than the open water');
  // (the glint alone: no ripples' light, no rim; four moments over the same water, the pond's sparkle beside)
  const count = (over: Partial<MotionFrame> = {}, shade = 0) => {
    let sw = 0, pond = 0;
    for (const t of [1.1, 3.7, 7.9, 12.3]) {
      const fr = frame({ ...phasesAt(t, WATER_MOTION), ripple: 0, foam: 0, ...over });
      for (let i = 0; i < 40000; i++) {
        const x = (i % 200) * 0.05, y = Math.floor(i / 200) * 0.05;
        if (swampPixel(POOL, x, y, 1, fr, 1, 1, shade)[0]! - POOL[0]! > 15) sw++;
        if (motionPixel(LAKE, x, y, { sd: 3, fx: 0, fy: 0, amp: 0.4 }, fr, 1, shade)[0]! - LAKE[0]! > 15) pond++;
      }
    }
    return { sw, pond };
  };
  const c = count(); assert.ok(c.sw > 0 && c.sw < c.pond, `a glint here and there, fewer than a pond's: ${c.sw} < ${c.pond}`);
  assert.equal(count({}, 1).sw, 0, 'none in a shadow');
});

test('T343: the river is unchanged: its water and bank texels as before with the swamp laid, and its pixels drawn as before', () => {
  const pts = [{ x: 0, y: 15, w: 8 }, { x: 40, y: 15, w: 8 }];
  const mk = () => { const f = WaterField.over([5, 0, 35, 30], fieldPad(DEFAULT_WATER_LOOK), 2).motion(); f.waterway(pts, SITE.river, 1, riverLap); f.shore(7); return f; };
  const m = motionMask(mk())!, ms = motionMask(mk(), { bands: [bandOf(80, 80, -5, -10, 2, (_x, y) => (y < 9 ? 1 : 0))] })!;
  // every texel on the water or within the bank's reach is the same byte for byte; only the swamp past the reach (no waves before) differs
  let diff = 0;
  for (let k = 0; k < m.w * m.h; k++) {
    const sd = decodeSd(m.data[4 * k]!);
    if (sd > -BANK_REACH) { for (let c = 0; c < 4; c++) assert.equal(ms.data[4 * k + c], m.data[4 * k + c]); }
    else if (ms.data[4 * k + 3] !== m.data[4 * k + 3]) { diff++; assert.equal(m.data[4 * k + 3], 0); }
  }
  assert.ok(diff > 0, 'the swamp past the reach carries its weight');
  // the open water's pixels (sd over -0.7) never take the swamp's branch
  const fr = frame();
  for (const sd of [-0.6, 0, 1, 3]) {
    const s = { sd, fx: 1, fy: 0, amp: 0.4 };
    assert.equal(poolWeight(s), 0);
    // (a pool-coloured pixel on the open water is drawn by the open water's effects, not the swamp's)
    if (sd > 0) assert.notDeepEqual(motionPixel(POOL, 12.3, 14.1, s, fr), swampPixel(POOL, 12.3, 14.1, 1, fr));
  }
  assert.ok(WATER_MOTION_GLSL.includes('vec3 swampPool(vec3 c, vec2 p, float wgt)') && WATER_MOTION_GLSL.includes('swampPool(c, p, pw)'), 'the shader runs the pools');
});
