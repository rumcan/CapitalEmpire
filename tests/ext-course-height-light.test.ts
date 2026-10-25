// Headless tests for the course height's light (T126, src/game/ext/course-height/light.ts): npm test.
// The Height tool's mounds and hollows lit like real slopes by the one sun at the screen's upper right (shadows at 145°): the slope facing the
// sun brighter, the slope facing away darker, flat ground left as it is; the highlight masked by the texture's luminance; cast shadows only
// past a slope threshold; the same light on both sides of a chunk seam.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CH_SIZE, CH_STEP, SUN_TILE_DIR } from '../src/game/ext/course-height';
import {
  CAST_SLOPE, HEIGHT_LIGHT_REACH, HEIGHT_LIGHT_STRENGTH, HL_STRIDE, LUMA_BLOCK, applyHeightLight, clampHeightLight, heightLightGrid, heightLightPictures,
  heightLightRect, liftMask, sampleHeightLight, specMask, splineHeight, type HeightLightGrid,
} from '../src/game/ext/course-height/light';

/** a field with h(x, y) (world tiles, metres) at every sample centre */
function field(fn: (x: number, y: number) => number): Float32Array {
  const h = new Float32Array(CH_SIZE * CH_SIZE);
  for (let j = 0; j < CH_SIZE; j++) for (let i = 0; i < CH_SIZE; i++) h[j * CH_SIZE + i] = fn((i + 0.5) * CH_STEP, (j + 0.5) * CH_STEP);
  return h;
}
/** a smooth cosine bump of height hm (metres; < 0 a hollow) and radius r tiles at (cx, cy) */
const bump = (cx: number, cy: number, hm: number, r: number) => (x: number, y: number) => {
  const d = Math.hypot(x - cx, y - cy); return d >= r ? 0 : hm * (0.5 + 0.5 * Math.cos(Math.PI * d / r));
};
const box = (cx: number, cy: number, r: number) => [cx - r, cy - r, cx + r, cy + r] as const;
const sun = (cx: number, cy: number, d: number) => [cx + SUN_TILE_DIR.x * d, cy + SUN_TILE_DIR.y * d] as const;

describe('course height light: the direction of the light', () => {
  it('the sun lies at the upper right of the screen (shadows fall at 145°)', () => {
    const sx = (SUN_TILE_DIR.x - SUN_TILE_DIR.y) * 64, sy = (SUN_TILE_DIR.x + SUN_TILE_DIR.y) * 32;
    assert.ok(sx > 0 && sy < 0, 'toward the sun is up and right on screen');
    assert.ok(Math.abs(Math.atan2(-sy, -sx) * 180 / Math.PI - 145) < 1e-6, 'the shadow direction is 145°');
  });

  it('a mound: its upper-right (sunward) slope is lit, its lower-left slope shaded, its top and the flat ground around it untouched', () => {
    const h = field(bump(500, 500, 1.5, 12)), g = heightLightGrid(h, box(500, 500, 30), 2);
    assert.ok(g, 'a mound is lit');
    const lit = sampleHeightLight(g, ...sun(500, 500, 6)), shade = sampleHeightLight(g, ...sun(500, 500, -6));
    assert.ok(lit.lift > 0.2 && lit.dark === 0, `the sunward slope is brighter (lift ${lit.lift})`);
    assert.ok(shade.dark > 0.1 && shade.lift === 0, `the slope facing away is darker (dark ${shade.dark})`);
    assert.ok(shade.cast === 0, 'a gentle mound casts no shadow: its far side is form-shaded only');
    const top = sampleHeightLight(g, 500, 500);
    assert.ok(top.dark < 0.02 && top.lift < 0.05, 'its rounded top is near flat light');
    // flat ground well clear of the mound (but inside the grid) is not lit or shaded at all
    for (const [x, y] of [[530, 500], [500, 470], [470, 530]] as const) { const p = sampleHeightLight(g, x, y); assert.equal(p.dark + p.lift + p.spec, 0, `flat at ${x},${y}`); }
  });

  it('a hollow is the reverse: shaded on its upper-right inner wall, lit on its lower-left, with occlusion in its bottom', () => {
    const h = field(bump(500, 500, -1.5, 12)), g = heightLightGrid(h, box(500, 500, 30), 2)!;
    const wallUR = sampleHeightLight(g, ...sun(500, 500, 6)), wallLL = sampleHeightLight(g, ...sun(500, 500, -6));
    assert.ok(wallUR.dark > 0.1 && wallUR.lift === 0, 'the wall on the sun side faces away from it');
    assert.ok(wallLL.lift > 0.2 && wallLL.dark === 0, 'the wall away from the sun faces it');
    const bottom = sampleHeightLight(g, 500, 500), mound = sampleHeightLight(heightLightGrid(field(bump(500, 500, 1.5, 12)), box(500, 500, 30), 2)!, 500, 500);
    assert.ok(bottom.ao > 0.2 && bottom.dark > 0.05, `the bottom of the hollow is occluded (ao ${bottom.ao})`);
    assert.equal(mound.ao, 0, 'the top of a mound is open to the sky');
  });

  it('flat ground is left exactly as it is: no height, or a level plateau, gives no light at all', () => {
    assert.equal(heightLightGrid(new Float32Array(CH_SIZE * CH_SIZE), [0, 0, 2048, 2048], 1), null, 'never edited: nothing to light');
    const plateau = field((x, y) => (Math.max(Math.abs(x - 500), Math.abs(y - 500)) < 40 ? 2 : 0)), g = heightLightGrid(plateau, box(500, 500, 60), 2)!;
    const p = sampleHeightLight(g, 500, 500); assert.equal(p.dark + p.lift + p.spec + p.cast + p.ao, 0, 'the plateau top is flat light');
    // pixels on the plateau's top come out byte for byte
    const px = new Uint8ClampedArray(48 * 48 * 4); for (let k = 0; k < px.length; k += 4) { px[k] = (k * 7) & 255; px[k + 1] = (k * 13) & 255; px[k + 2] = (k * 3) & 255; px[k + 3] = 255; }
    const before = px.slice(); applyHeightLight(px, 48, 48, [0.1, 0, 0, 0.1, 495, 495], g, 1);
    assert.deepEqual(px, before);
  });

  it('the inset highlight starts a little way down the sunward slope, not at its top edge', () => {
    const h = field(bump(500, 500, 2, 14)), g = heightLightGrid(h, box(500, 500, 30), 2)!;
    let firstLift = -1, firstSpec = -1;
    for (let d = 0; d <= 14; d += 0.25) { const p = sampleHeightLight(g, ...sun(500, 500, d)); if (firstLift < 0 && p.lift > 0.01) firstLift = d; if (firstSpec < 0 && p.spec > 0.01) firstSpec = d; }
    assert.ok(firstLift >= 0 && firstSpec > firstLift + 0.5, `the light starts at ${firstLift} tiles from the top, its highlight further down at ${firstSpec}`);
  });
});

describe('course height light: cast shadows', () => {
  /** a long rise facing away from the sun: a plateau of hm metres toward the sun, a straight ramp of slope s (m per m) down to 0 */
  const rise = (s: number, hm = 2.5) => field((x, y) => { const t = -((x - 500) * SUN_TILE_DIR.x + (y - 500) * SUN_TILE_DIR.y) * 2; return Math.max(0, Math.min(hm, -s * t)); });
  const maxCast = (g: HeightLightGrid) => { let m = 0; for (let k = 3; k < g.v.length; k += HL_STRIDE) m = Math.max(m, g.v[k]!); return m; };
  it('a rise gentler than the sun casts none (its far side is only form-shaded)', () => {
    const g = heightLightGrid(rise(0.85 * CAST_SLOPE), box(500, 500, 20), 2)!;
    assert.equal(maxCast(g), 0);
    assert.ok(sampleHeightLight(g, 500, 500).dark > 0.1, 'the slope facing away is still darker');
  });
  it('a rise steeper than the sun casts a short soft shadow onto the flat ground at its foot, away from the sun (145°)', () => {
    assert.ok(CAST_SLOPE > 0.4 && CAST_SLOPE < 0.55, `the threshold is a steep slope (${CAST_SLOPE.toFixed(2)} m per m)`);
    // the ramp meets the flat at tile (500, 500); the flat lies away from the sun
    const g = heightLightGrid(rise(2 * CAST_SLOPE, 3), box(500, 500, 24), 2)!;
    const near = sampleHeightLight(g, ...sun(500, 500, -0.5)), far = sampleHeightLight(g, ...sun(500, 500, -14));
    assert.ok(near.cast > 0.3, `the flat just beyond the foot is in the rise's shadow (cast ${near.cast})`);
    assert.equal(far.cast, 0, 'the shadow is short');
    const top = sampleHeightLight(g, ...sun(500, 500, 12));
    assert.equal(top.cast, 0, 'the plateau toward the sun is in the sun');
    // soft: it fades out over distance, never a hard step
    let prev = 1; for (let d = 0.5; d <= 10; d += 0.25) { const c = sampleHeightLight(g, ...sun(500, 500, -d)).cast; assert.ok(c <= prev + 1e-6, 'the shadow lightens with distance'); prev = c; }
  });
});

describe('course height light: the texture keeps its darks (T110)', () => {
  /** a 4 x 4 grid at 1 point per tile from (0, 0), every point the same */
  const flatGrid = (dark: number, lift: number, spec: number): HeightLightGrid => {
    const v = new Float32Array(16 * HL_STRIDE); for (let k = 0; k < 16; k++) { v[k * HL_STRIDE] = dark; v[k * HL_STRIDE + 1] = lift; v[k * HL_STRIDE + 2] = spec; }
    return { x0: 0, y0: 0, res: 1, w: 4, h: 4, v, nz: [0, 0, 3, 3] };
  };
  // grass: dark gaps, mid-tones and lit tips in turn
  const GAP = [22, 34, 14], MID = [92, 132, 52], TIP = [150, 192, 92];
  const texture = (W: number, H: number) => { const px = new Uint8ClampedArray(W * H * 4); for (let p = 0; p < W * H; p++) { const c = [GAP, MID, TIP][(p + ((p / W) | 0)) % 3]!; px.set([...c, 255], p * 4); } return px; };
  const toTile = [0.02, 0, 0, 0.02, 1, 1]; // the pixels lie well inside the grid

  it('the light leaves the dark gaps dark and lands on the mid-tones, the highlight on the lit tips', () => {
    const W = 48, H = 48, px = texture(W, H), before = px.slice();
    applyHeightLight(px, W, H, toTile, flatGrid(0, 1, 1), 1);
    let gaps = 0, mids = 0, tips = 0, midGain = 0, tipGain = 0;
    for (let p = 0; p < W * H; p++) {
      const o = p * 4, c = before[o + 1]!;
      if (c === GAP[1]) { gaps++; for (let k = 0; k < 3; k++) assert.ok(Math.abs(px[o + k]! - before[o + k]!) <= 1, 'a dark gap stays dark'); }
      else if (c === MID[1]) { mids++; midGain = px[o + 1]! - c; assert.ok(px[o + 1]! >= c * 1.15, 'a mid-tone catches the light'); }
      else { tips++; tipGain = px[o + 1]! - c; assert.ok(px[o + 2]! - before[o + 2]! > 25, 'a lit tip takes the highlight: paler'); }
    }
    assert.ok(gaps > 0 && mids > 0 && tips > 0);
    assert.ok(tipGain > midGain, 'the tips catch it most');
    // the masks themselves: none in the gaps, the lift from just under the mean, the highlight only above it
    assert.equal(liftMask(0.4), 0); assert.equal(liftMask(1), 1); assert.ok(liftMask(0.7) > 0.3 && liftMask(0.7) < 0.7);
    assert.equal(specMask(1), 0); assert.equal(specMask(1.3), 1); assert.ok(specMask(1.1) > 0);
  });

  it('the pictures the renderer composites: white shade, black light where flat; a cool shade and a warm highlight', () => {
    const v = new Float32Array(3 * HL_STRIDE); v[0] = 0.8; v[HL_STRIDE * 2 + 1] = 1; v[HL_STRIDE * 2 + 2] = 1; // point 0 shaded, 1 flat, 2 lit
    const p = heightLightPictures({ x0: 0, y0: 0, res: 1, w: 3, h: 1, v, nz: [0, 0, 2, 0] }, 1);
    assert.deepEqual([...p.shade.subarray(4, 8)], [255, 255, 255, 255], 'flat: the multiply is white');
    assert.deepEqual([...p.lift.subarray(4, 8)], [0, 0, 0, 255], 'flat: no lift');
    assert.deepEqual([...p.spec.subarray(4, 8)], [0, 0, 0, 255], 'flat: no highlight');
    assert.ok(p.shade[2]! > p.shade[1]! && p.shade[1]! > p.shade[0]! && p.shade[0]! < 255, 'the shade is cool: blue keeps the most');
    assert.ok(p.spec[8]! > p.spec[9]! && p.spec[9]! > p.spec[10]! && p.spec[10]! > 0, 'the highlight is warm sunlight');
    assert.ok(p.lift[8]! >= p.lift[9]! && p.lift[9]! > p.lift[10]!, 'the lift is a little warm');
    const off = heightLightPictures({ x0: 0, y0: 0, res: 1, w: 3, h: 1, v, nz: [0, 0, 2, 0] }, 0);
    assert.deepEqual([...off.shade.subarray(0, 4)], [255, 255, 255, 255], 'strength 0: no shade');
  });

  it('the shade is a cool multiply: every texel darker by the same share, so the texture shows through; blue the least', () => {
    const W = 48, H = 48, px = texture(W, H), before = px.slice();
    applyHeightLight(px, W, H, toTile, flatGrid(0.5, 0, 0), 1);
    const ratio = (o: number, k: number) => px[o + k]! / before[o + k]!;
    for (let p = 0; p < W * H; p += 7) {
      const o = p * 4;
      assert.ok(ratio(o, 1) > 0.55 && ratio(o, 1) < 0.85, 'darker, never a flat colour');
      assert.ok(ratio(o, 2) > ratio(o, 0), 'cool: blue keeps more than red');
    }
    // gap : tip contrast kept (within rounding)
    const g0 = before[1]!, t0 = before[9]!, g1 = px[1]!, t1 = px[9]!;
    assert.ok(Math.abs(g1 / t1 - g0 / t0) < 0.02, 'the texture keeps its contrast in the shade');
  });

  it('strength 0 is off; the strength is held to 0..2 and light.json gives 1', () => {
    const px = texture(24, 24), before = px.slice();
    applyHeightLight(px, 24, 24, toTile, flatGrid(1, 1, 1), 0);
    assert.deepEqual(px, before);
    assert.equal(clampHeightLight(Number.NaN), 1); assert.equal(clampHeightLight(5), 2); assert.equal(clampHeightLight(-1), 0);
    assert.equal(HEIGHT_LIGHT_STRENGTH, 1);
  });
});

describe('course height light: chunks agree', () => {
  it('two chunks that meet sample the same light along their seam', () => {
    const h = field(bump(500, 500, 2, 10));
    const A = heightLightGrid(h, [470, 470, 500, 530], 2)!, B = heightLightGrid(h, [500, 470, 530, 530], 2)!;
    for (let y = 480; y <= 520; y += 0.37) for (const x of [499.8, 500, 500.2]) {
      const a = sampleHeightLight(A, x, y), b = sampleHeightLight(B, x, y);
      for (const k of ['dark', 'lift', 'spec', 'cast', 'ao'] as const) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${k} at ${x},${y}: ${a[k]} vs ${b[k]}`);
    }
    // and the district chunks' coarser grid (1 point per tile) agrees with itself the same way
    const C = heightLightGrid(h, [470, 470, 500, 530], 1)!, D = heightLightGrid(h, [500, 470, 530, 530], 1)!;
    for (let y = 480; y <= 520; y += 0.5) { const c = sampleHeightLight(C, 500, y), d = sampleHeightLight(D, 500, y); assert.ok(Math.abs(c.dark - d.dark) + Math.abs(c.lift - d.lift) < 1e-6); }
  });

  it('a texture lit in two halves comes out as when lit whole (the pixels depend on the world, not the chunk)', () => {
    const h = field(bump(500, 500, 2, 10)), g = heightLightGrid(h, box(500, 500, 30), 2)!;
    const W = 4 * LUMA_BLOCK, H = 2 * LUMA_BLOCK, M = [0.2, 0.05, -0.05, 0.2, 490, 492]; // pixel -> tile
    const whole = new Uint8ClampedArray(W * H * 4).fill(255); for (let k = 0; k < whole.length; k += 4) { whole[k] = 96; whole[k + 1] = 140; whole[k + 2] = 60; }
    const half = (x0: number) => { const p = new Uint8ClampedArray((W / 2) * H * 4); for (let y = 0; y < H; y++) p.set(whole.subarray((y * W + x0) * 4, (y * W + x0 + W / 2) * 4), y * (W / 2) * 4); return p; };
    const L = half(0), R = half(W / 2);
    applyHeightLight(whole, W, H, M, g, 1);
    applyHeightLight(L, W / 2, H, M, g, 1);
    applyHeightLight(R, W / 2, H, [M[0]!, M[1]!, M[2]!, M[3]!, M[4]! + M[0]! * W / 2, M[5]! + M[1]! * W / 2], g, 1);
    let changed = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, src = x < W / 2 ? L : R, so = (y * (W / 2) + (x % (W / 2))) * 4;
      for (let k = 0; k < 4; k++) assert.equal(whole[o + k], src[so + k], `pixel ${x},${y}`);
      if (whole[o + 1] !== 140) changed++;
    }
    assert.ok(changed > 0, 'the mound lit some of them');
  });

  it('a height change lights no further than HEIGHT_LIGHT_REACH (the chunks re-baked after an edit are enough)', () => {
    const base = bump(500, 500, 2, 8), far = bump(500 + 30 + HEIGHT_LIGHT_REACH + 4, 500, 2.5, 4);
    const g1 = heightLightGrid(field(base), box(500, 500, 30), 2)!, g2 = heightLightGrid(field((x, y) => base(x, y) + far(x, y)), box(500, 500, 30), 2)!;
    for (let y = 471; y < 530; y += 1.3) for (let x = 471; x < 530; x += 1.3) { const a = sampleHeightLight(g1, x, y), b = sampleHeightLight(g2, x, y); assert.ok(Math.abs(a.dark - b.dark) + Math.abs(a.lift - b.lift) < 1e-6); }
  });

  it('the height surface is smooth and passes through the samples; the lit rect lies inside the picture', () => {
    const h = field(bump(500, 500, 2, 10));
    assert.ok(Math.abs(splineHeight(h, 501, 501) - h[250 * CH_SIZE + 250]!) < 1e-5, 'through the sample at (501, 501)');
    let jump = 0; for (let x = 490; x < 510; x += 0.05) jump = Math.max(jump, Math.abs(splineHeight(h, x + 0.05, 500) - splineHeight(h, x, 500)));
    assert.ok(jump < 0.02, 'no steps between samples');
    const g = heightLightGrid(h, box(500, 500, 30), 2)!, M = { a: 19.2, b: 9.6, c: -19.2, d: 9.6, e: 200, f: -9400 }, r = heightLightRect(g, M, 1200, 600);
    assert.ok(r); const [x0, y0, x1, y1] = r;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 1200 && y1 <= 600 && x1 > x0 && y1 > y0);
    assert.equal(heightLightRect(g, { ...M, e: 99999 }, 1200, 600), null, 'off the picture: nothing to read');
  });
});
