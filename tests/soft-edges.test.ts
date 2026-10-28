// Headless tests for the soft dirt edges (T247, soft-edges.ts: the noisy band where dirt or desert meets grass, wider at the far levels): no
// DOM, no canvas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SOFT, easeWeights, simplifyRing, softAreaWidth, softCover, softDirt, softMaskImage, softNoise, softRes, softRingImages, softWidth, type SoftImage } from '../src/game/soft-edges';
import { ruggedRing } from '../src/game/rugged-edges';

/** an axis-aligned rectangle x0 y0 .. x1 y1 */
const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
/** a band image's value (0..1) at its px u, v and that px's tile centre */
const at = (img: SoftImage, u: number, v: number) => img.a[v * img.W + u]! / 255;
const centre = (img: SoftImage, u: number, v: number) => [img.x0 + (u + 0.5) / img.r, img.y0 + (v + 0.5) / img.r] as const;
/** the cache levels of the zoom bands: 30% (0.3), 15% (0.15), the district chunks at 8% (0.1) and 4% (0.05) */
const LEVELS = [0.6, 0.3, 0.15, 0.1, 0.05];

describe('soft-edges: the band widens at the far levels', () => {
  it('is wider in tiles at every farther level, and about SOFT.px cache px wide where it is not held', () => {
    for (let i = 1; i < LEVELS.length; i++) assert.ok(softWidth(LEVELS[i]!) >= softWidth(LEVELS[i - 1]!), `${LEVELS[i]} vs ${LEVELS[i - 1]}`);
    assert.ok(softWidth(0.05) > 2 * softWidth(0.3), 'far is much wider than near');
    const px = (L: number) => softWidth(L) * Math.hypot(64, 32) * L;
    for (const L of [0.3, 0.15, 0.1]) assert.ok(Math.abs(px(L) - SOFT.px) < 1e-6, `${L}: ${px(L)} px`);
    assert.equal(softWidth(5), SOFT.min); assert.equal(softWidth(0.001), SOFT.max);
  });
  it('keeps its images about SOFT.imgPx cache px a px, at most SOFT.resMax a tile', () => {
    for (const L of LEVELS) { const r = softRes(L); assert.ok(r > 0 && r <= SOFT.resMax); }
    assert.ok(softRes(0.05) < softRes(0.15));
  });
  it('holds a small area\'s band to a share of its size, a big one\'s as wide as the level gives', () => {
    for (const L of LEVELS) { assert.equal(softAreaWidth(L, 1e6), softWidth(L)); assert.ok(softAreaWidth(L, 100) <= SOFT.areaK * 10 + 1e-9 || softAreaWidth(L, 100) === SOFT.min); }
    assert.ok(softAreaWidth(0.05, 80) < softWidth(0.05)); assert.ok(softAreaWidth(0.05, 80) >= SOFT.min);
  });
});

describe('soft-edges: the dirt share across the band', () => {
  it('is whole past the inner edge, none past the outer edge, and continuous at both', () => {
    const w = 4;
    for (const n of [0, 0.01, 0.3, 0.5, 0.7, 0.99, 1]) {
      assert.equal(softCover(w / 2, w, n), 1); assert.equal(softCover(w, w, n), 1);
      assert.equal(softCover(-w / 2, w, n), 0); assert.equal(softCover(-w, w, n), 0);
      assert.ok(softCover(w / 2 - 1e-6, w, n) > 0.999, `inner edge, n ${n}`);
      assert.ok(softCover(-w / 2 + 1e-6, w, n) < 0.001, `outer edge, n ${n}`);
    }
  });
  it('falls as the point moves out, for any noise value', () => {
    for (const n of [0.1, 0.4, 0.6, 0.9]) { let last = 2; for (let d = 2; d >= -2; d -= 0.05) { const c = softCover(d, 4, n); assert.ok(c <= last + 1e-12); last = c; } }
  });
  it('w 0 is the hard outline', () => { assert.equal(softCover(0.01, 0, 0.5), 1); assert.equal(softCover(-0.01, 0, 0.5), 0); });
  it('the noise is world-anchored, in 0..1, about even and symmetric about 0.5', () => {
    const v: number[] = [];
    for (let i = 0; i < 4000; i++) { const x = (i * 7.31) % 211, y = (i * 3.17) % 197; const n = softNoise(x, y, 4, 6); assert.equal(n, softNoise(x, y, 4, 6)); assert.ok(n >= 0 && n <= 1); v.push(n); }
    v.sort((a, b) => a - b);
    const q = (f: number) => v[Math.floor(f * (v.length - 1))]!;
    assert.ok(Math.abs(q(0.5) - 0.5) < 0.05, `median ${q(0.5)}`);
    assert.ok(q(0.25) < 0.36 && q(0.75) > 0.64, `quartiles ${q(0.25)} ${q(0.75)}: spread across the band`);
  });
});

describe('soft-edges: an area\'s band (softRingImages)', () => {
  const ring = rect(10, 10, 40, 30), box = [0, 0, 50, 40] as const;
  it('is deterministic', () => {
    const a = softRingImages(ring, null, box, 4, 4)!, b = softRingImages(ring, null, box, 4, 4)!;
    assert.deepEqual(a.a.a, b.a.a); assert.deepEqual(a.p.a, b.p.a);
  });
  it('keeps the shape: whole deep inside, none far outside, the outline its 50% line and the dirt\'s area the area\'s', () => {
    // a big area, so the outline crosses many of the noise's clumps (its mean share is a sample of them)
    const big = rect(10, 10, 170, 130), A = 160 * 120;
    for (const L of [0.3, 0.15, 0.05]) {
      const w = softWidth(L), r = Math.min(softRes(L), 3), { a } = softRingImages(big, null, [0, 0, 180, 140], w, r)!;
      let sum = 0, onSum = 0, onN = 0;
      for (let v = 0; v < a.H; v++) for (let u = 0; u < a.W; u++) {
        const [x, y] = centre(a, u, v), c = at(a, u, v); sum += c / (r * r);
        const d = Math.min(x - 10, 170 - x, y - 10, 130 - y); // signed distance to the rectangle (inside +), exact away from its corners
        if (d > w / 2 + 0.01) assert.equal(c, 1);
        if (d < -w / 2 - 0.01 && x > 10 && x < 170) assert.equal(c, 0);
        if (Math.abs(d) < 0.5 / r && x > 10 + w && x < 170 - w && y > 10 + w && y < 130 - w || (Math.abs(d) < 0.5 / r && (y < 10 + w || y > 130 - w) && x > 10 + w && x < 170 - w)) { onSum += c; onN++; }
      }
      assert.ok(Math.abs(onSum / onN - 0.5) < 0.1, `L ${L}: the outline's mean share ${onSum / onN}`);
      assert.ok(Math.abs(sum - A) / A < 0.01, `L ${L}: the dirt's area ${sum} of ${A} tiles²`);
    }
  });
  it('is wider in tiles at the far levels: the mixed px reach further from the outline', () => {
    const reach = (L: number) => {
      const w = softWidth(L), r = softRes(L), { a } = softRingImages(ring, null, box, w, r)!;
      let far = 0;
      for (let v = 0; v < a.H; v++) for (let u = 0; u < a.W; u++) { const [x, y] = centre(a, u, v), c = at(a, u, v); if (x < 12 || x > 38) continue; const d = Math.abs(y - 10); if (c > 0.02 && c < 0.98 || (y < 10 && c > 0.5) || (y > 10 && y < 20 && c < 0.5)) far = Math.max(far, d); }
      return far;
    };
    const r30 = reach(0.3), r15 = reach(0.15), r4 = reach(0.05);
    assert.ok(r15 > r30 && r4 > r15, `reach 30% ${r30}, 15% ${r15}, 4% ${r4}`);
  });
  it('is tufts, not a gradient: most of the band is one or the other, and both show across it', () => {
    const w = softWidth(0.15), r = softRes(0.15), { a } = softRingImages(ring, null, box, w, r)!;
    let band = 0, mid = 0, dirtOut = 0, grassIn = 0;
    for (let v = 0; v < a.H; v++) for (let u = 0; u < a.W; u++) {
      const [x, y] = centre(a, u, v), c = at(a, u, v); if (x < 10 + w || x > 40 - w) continue;
      const d = y - 10; if (Math.abs(d) >= w / 2) continue;
      band++; if (c > 0.15 && c < 0.85) mid++;
      if (d < -w / 8 && c > 0.5) dirtOut++; if (d > w / 8 && c < 0.5) grassIn++;
    }
    assert.ok(mid / band < 0.3, `${mid} of ${band} band px are in between`);
    assert.ok(dirtOut > band * 0.04 && grassIn > band * 0.04, `dirt out ${dirtOut}, grass in ${grassIn} of ${band}`);
  });
  it('a side weighted 0 keeps its hard outline (no band laid there), easing in along the outline', () => {
    const wts = new Float32Array([0, 0, 1, 1]); // the side from (10,10) to (40,10) weighted 0 at both ends; (40,30)-(10,30) 1
    const out = softRingImages(ring, wts, box, 4, 4)!;
    assert.equal(out.full, false); assert.equal(softRingImages(ring, null, box, 4, 4)!.full, true);
    for (let v = 0; v < out.p.H; v++) for (let u = 0; u < out.p.W; u++) {
      const [x, y] = centre(out.p, u, v); if (x < 12 || x > 38) continue;
      if (Math.abs(y - 10) < 1.5) assert.equal(out.p.a[v * out.p.W + u], 0, `p at ${x},${y}`);
      if (Math.abs(y - 30) < 1) assert.equal(out.p.a[v * out.p.W + u], 255, `p at ${x},${y}`);
    }
    const e = easeWeights(ring, [0, 1, 1, 1], 1.5);
    assert.equal(e[0], 0); assert.equal(e[1], 1); assert.deepEqual([...easeWeights(ring, [1, 1, 1, 1], 1.5)], [1, 1, 1, 1]);
  });
  it('no band reaches a box it does not touch', () => { assert.equal(softRingImages(ring, null, [100, 100, 120, 120], 4, 4), null); });
  it('merges a rugged outline\'s short sides within the tolerance, keeping every 0 weight', () => {
    const rr = ruggedRing([10, -40, 80, -40, 80, 83, 10, 83], 0) as number[], n = rr.length >> 1, wts = new Array(n).fill(1);
    wts[17] = 0; wts[400] = 0;
    const s = simplifyRing(rr, wts, 0.1);
    assert.ok(s.pts.length < rr.length / 2, `${s.pts.length / 2} of ${n} points`);
    assert.equal(s.wts!.filter(v => v === 0).length >= 1, true);
    // every original point within the tolerance of the merged outline
    const m = s.pts.length >> 1;
    for (let i = 0; i < n; i++) {
      const x = rr[2 * i]!, y = rr[2 * i + 1]!; let best = Infinity;
      for (let k = 0; k < m; k++) { const ax = s.pts[2 * k]!, ay = s.pts[2 * k + 1]!, bx = s.pts[2 * ((k + 1) % m)]!, by = s.pts[2 * ((k + 1) % m) + 1]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0; best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y)); }
      assert.ok(best <= 0.1 + 1e-9, `point ${i} is ${best} off`);
    }
  });
});

describe('soft-edges: the living ground\'s region (softMaskImage)', () => {
  // a disc of radius 40 tiles round (50, 50), as a mask at 1 sample a tile: alpha falling linearly out from the centre, 0.4 of 255 at r 40
  const res = 1, W = 100, H = 100, x0 = 0, y0 = 0, R = 40, C = 50, mask = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = x0 + (i + 0.5) / res, y = y0 + (j + 0.5) / res, r = Math.hypot(x - C, y - C); mask[(j * W + i) * 4 + 3] = Math.max(0, Math.min(255, 255 * (0.4 + (R - r) * 0.04))); }
  it('is deterministic, whole deep inside, none far outside, the contour its 50% line', () => {
    for (const L of [0.3, 0.15, 0.05]) {
      const w = softWidth(L), r = Math.min(softRes(L), 3), img = softMaskImage(mask, W, H, x0, y0, res, 0.4, w, r, [0, 0, 100, 100])!;
      assert.deepEqual(img.a, softMaskImage(mask, W, H, x0, y0, res, 0.4, w, r, [0, 0, 100, 100])!.a);
      let on = 0, onN = 0, area = 0;
      for (let v = 0; v < img.H; v++) for (let u = 0; u < img.W; u++) {
        const [x, y] = centre(img, u, v), c = at(img, u, v), d = R - Math.hypot(x - C, y - C); area += c / (r * r);
        if (d > w / 2 + 0.3) assert.equal(c, 1, `L ${L} at ${x},${y}`);
        if (d < -w / 2 - 0.3) assert.equal(c, 0, `L ${L} at ${x},${y}`);
        if (Math.abs(d) < 0.5 / r) { on += c; onN++; }
      }
      assert.ok(Math.abs(on / onN - 0.5) < 0.1, `L ${L}: the contour's mean share ${on / onN}`);
      assert.ok(Math.abs(area - Math.PI * R * R) / (Math.PI * R * R) < 0.02, `L ${L}: area ${area}`);
    }
  });
  it('null when the region misses the clip box', () => { assert.equal(softMaskImage(mask, W, H, x0, y0, res, 0.4, 4, 4, [95, 0, 100, 5]), null); });
});

describe('soft-edges: which ground takes the soft edge', () => {
  it('dirt and desert by their painted family, else by the photo texture; grass, sand traps, water and paving never', () => {
    assert.ok(softDirt('dirt', 'dirt-run')); assert.ok(softDirt('preset:range-outfield-desert', 'desert-run')); assert.ok(softDirt('lawn:0', 'desert-run'));
    assert.ok(softDirt('dirt', null)); assert.ok(softDirt('wasteSand', null)); assert.ok(softDirt('field', null));
    assert.ok(!softDirt('dirt', 'golden-fescue')); assert.ok(!softDirt('grass', null)); assert.ok(!softDirt('bunkerSand', null)); assert.ok(!softDirt('waterDark', null)); assert.ok(!softDirt('pad', null));
    assert.ok(!softDirt('preset:range-tee-turf', 'green-concept-run'));
  });
});
