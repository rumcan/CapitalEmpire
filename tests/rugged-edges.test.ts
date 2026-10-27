// Headless tests for the rugged grass edges (T204, rugged-edges.ts: the rounded, wobbled outlines and the tall grass's spill): no DOM, no canvas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskContours, openNoise, openPatch, OPEN_PATCH_AT } from '../src/game/living-ground';
import { RUGGED, SPILL, inPoly, roundedRing, ruggedKind, ruggedRing, signedArea, spillBlades, spillClump, spillScale, warpLine, warpTriples, wobbleAt } from '../src/game/rugged-edges';

/** an axis-aligned rectangle x0 y0 .. x1 y1, counter-clockwise or clockwise */
const rect = (x0: number, y0: number, x1: number, y1: number, cw = false) => cw ? [x0, y0, x0, y1, x1, y1, x1, y0] : [x0, y0, x1, y0, x1, y1, x0, y1];
/** the turn (radians, 0..pi) at each point of a closed ring */
const turns = (r: readonly number[]) => {
  const n = r.length >> 1, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n, j = (i + 1) % n, ax = r[2 * i]! - r[2 * h]!, ay = r[2 * i + 1]! - r[2 * h + 1]!, bx = r[2 * j]! - r[2 * i]!, by = r[2 * j + 1]! - r[2 * i + 1]!;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    out.push(la > 1e-9 && lb > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : 0);
  }
  return out;
};
/** the longest straight run of a closed ring: consecutive points all within tol of the chord from the run's first to its last, tiles */
const longestStraight = (r: readonly number[], tol = 0.02) => {
  const n = r.length >> 1; let best = 0;
  for (let i = 0; i < n; i++) {
    for (let m = 2; m < n; m++) {
      const j = (i + m) % n, ax = r[2 * i]!, ay = r[2 * i + 1]!, dx = r[2 * j]! - ax, dy = r[2 * j + 1]! - ay, l = Math.hypot(dx, dy);
      let ok = l > 0;
      for (let q = 1; q < m && ok; q++) { const k = (i + q) % n, ex = r[2 * k]! - ax, ey = r[2 * k + 1]! - ay; if (Math.abs(ex * dy - ey * dx) / l > tol) ok = false; }
      if (!ok) break;
      best = Math.max(best, l);
    }
  }
  return best;
};

describe('the wobble (T204)', () => {
  it('is the same wherever it is asked for, bounded, and smooth', () => {
    const a = wobbleAt(1036.25, 1049.5), b = wobbleAt(1036.25, 1049.5);
    assert.deepEqual([...a], [...b]);
    let maxM = 0, maxStep = 0, sum = 0;
    for (let k = 0; k < 4000; k++) {
      const x = 900 + k * 0.137, y = 1100 - k * 0.071, o = wobbleAt(x, y), p = wobbleAt(x + 0.01, y);
      maxM = Math.max(maxM, Math.hypot(o[0]!, o[1]!)); sum += Math.hypot(o[0]!, o[1]!);
      maxStep = Math.max(maxStep, Math.hypot(p[0]! - o[0]!, p[1]! - o[1]!) / 0.01);
    }
    assert.ok(maxM <= RUGGED.limit + 1e-9, `at most ${RUGGED.limit} tiles (${maxM})`);
    assert.ok(sum / 4000 > 0.12, `a visible wobble on average (${(sum / 4000).toFixed(3)} tiles)`);
    // its slope stays well under 1, so the outlines it moves never fold over themselves
    assert.ok(maxStep < 0.8, `slope ${maxStep.toFixed(2)}`);
  });
  it('never repeats along an edge (no period of the grass pictures or its own waves)', () => {
    // the offset along a long straight line, against the same line shifted by each wave's length and by the grass pictures' periods
    for (const shift of [5.2, 10.4, 2.5, 1.2, 24, 48, 96]) {
      let diff = 0;
      for (let k = 0; k < 200; k++) { const x = 500 + k * 0.5, o = wobbleAt(x, 777), p = wobbleAt(x + shift, 777); diff += Math.hypot(o[0]! - p[0]!, o[1]! - p[1]!); }
      assert.ok(diff / 200 > 0.05, `shift ${shift}: ${(diff / 200).toFixed(3)}`);
    }
  });
});

describe('a painted area\'s outline (T204)', () => {
  it('rounds every corner and leaves no long straight side', () => {
    const yard = rect(1036, 1049, 1049, 1061.4), r = ruggedRing(yard);
    assert.notEqual(r, yard);
    assert.deepEqual(yard, rect(1036, 1049, 1049, 1061.4), 'the patch (gameplay) is never changed');
    // no point turns anything near a square corner, and no stretch is straight for more than a couple of tiles
    assert.ok(Math.max(...turns(r as number[])) < 0.6, `largest turn ${Math.max(...turns(r as number[])).toFixed(2)} rad`);
    const s = longestStraight(r as number[]);
    assert.ok(s < 6, `longest straight run ${s.toFixed(2)} tiles (each side was 13)`);
    // it stays close to the true rectangle (the drawing moves, the cell does not): within the wobble's limit plus a rounded corner's cut
    for (let k = 0; k < r.length; k += 2) {
      const x = r[k]!, y = r[k + 1]!, dx = Math.max(1036 - x, 0, x - 1049), dy = Math.max(1049 - y, 0, y - 1061.4);
      assert.ok(Math.hypot(dx, dy) <= RUGGED.limit + 1e-6, `point ${x},${y} past the wobble`);
    }
    assert.ok(Math.abs(Math.abs(signedArea(r)) - 13 * 12.4) < 0.08 * 13 * 12.4, 'about the same area');
  });
  it('rounds the corners of the bare outline by a radius scaled to the area', () => {
    const small = roundedRing(rect(0, 0, 4, 4), 0.6, 0.35), big = roundedRing(rect(0, 0, 60, 60), 1.5, 0.35);
    // the corner at (0, 0) is cut: no point of the ring lies nearer it than the curve's middle (r (1 - 1/sqrt 2) x ~1 for a quadratic)
    const near = (q: number[], R: number) => Math.min(...Array.from({ length: q.length / 2 }, (_, i) => Math.hypot(q[2 * i]!, q[2 * i + 1]!))) > 0.25 * R;
    assert.ok(near(small, 0.6) && near(big, 1.5));
    assert.ok(Math.max(...turns(small)) < 0.8 && Math.max(...turns(big)) < 0.5);
  });
  it('keeps a small area (a hitting mat) and a seam as they are', () => {
    const mat = rect(10, 10, 11.3, 11.4);
    assert.equal(ruggedRing(mat), mat);
    // an area cut along a 200-tile cell line: the seam side's ends stay exactly put
    const cut = [190, 10, 200, 10, 200, 30, 190, 30], r = ruggedRing(cut, 200);
    const has = (x: number, y: number) => { for (let k = 0; k < r.length; k += 2) if (r[k] === x && r[k + 1] === y) return true; return false; };
    assert.ok(has(200, 10) && has(200, 30), 'the seam\'s ends');
    for (let k = 0; k < r.length; k += 2) if (r[k]! > 199.999) assert.ok(r[k] === 200, 'nothing crosses the seam');
  });
  it('is the same whichever way it winds and wherever it is drawn from', () => {
    const a = ruggedRing(rect(20, 20, 32, 29)), b = ruggedRing(rect(20, 20, 32, 29));
    assert.deepEqual(a, b);
    const c = ruggedRing(rect(20, 20, 32, 29, true));
    assert.ok(Math.abs(Math.abs(signedArea(a)) - Math.abs(signedArea(c))) < 0.05, 'both windings draw the same shape');
  });
});

describe('the course\'s lines (T204)', () => {
  it('meet across a chunk border: a line cut at the border moves as the uncut one does', () => {
    const whole = [40, 10, 64, 10, 90, 12], left = [40, 10, 64, 10], right = [64, 10, 90, 12];
    const W = warpLine(whole), A = warpLine(left), B = warpLine(right);
    // the border point is where both pieces end and start
    assert.equal(A[A.length - 2], B[0]); assert.equal(A[A.length - 1], B[1]);
    // and every point of the pieces is a point of the whole line
    const inW = (x: number, y: number) => { for (let k = 0; k < W.length; k += 2) if (Math.abs(W[k]! - x) < 1e-5 && Math.abs(W[k + 1]! - y) < 1e-5) return true; return false; };
    for (const P of [A, B]) for (let k = 0; k < P.length; k += 2) assert.ok(inW(P[k]!, P[k + 1]!), `piece point ${P[k]},${P[k + 1]}`);
  });
  it('moves a fill ring, an edge and a wall drawn from one side alike, either way round', () => {
    const ring = warpLine([0, 0, 10, 0, 10, 10, 0, 10], true), edge = warpLine([10, 10, 10, 0]), wall = warpTriples([10, 0, 0.6, 10, 10, 0.6]);
    const inRing = (x: number, y: number) => { for (let k = 0; k < ring.length; k += 2) if (Math.abs(ring[k]! - x) < 1e-5 && Math.abs(ring[k + 1]! - y) < 1e-5) return true; return false; };
    for (let k = 0; k < edge.length; k += 2) assert.ok(inRing(edge[k]!, edge[k + 1]!), 'edge point on the ring');
    for (let k = 0; k < wall.length; k += 3) { assert.ok(inRing(wall[k]!, wall[k + 1]!), 'wall point on the ring'); assert.equal(wall[k + 2], Float32Array.of(0.6)[0]); }
    // the ring's straight sides waver now
    assert.ok(longestStraight(Array.from(ring)) < 6);
  });
});

describe('the tall grass\'s spill (T204)', () => {
  it('lays blades rooted on the tall side and reaching over the short side, ragged and clumpy', () => {
    // a line along x with the tall side up (side -1: (dy, -dx) of a piece along +x is (0, -1), so 1 is the side y < 0)
    const line = [0, 0, 40, 0], tall = spillBlades(line, 1);
    assert.ok(tall.length / 6 > 40 / SPILL.spacing * 0.8, `${tall.length / 6} blades`);
    const tips: number[] = [];
    for (let k = 0; k < tall.length; k += 6) {
      // the root's corners on the tall side (y < 0), the tip on the short side (y > 0), never past the longest reach
      assert.ok(tall[k + 1]! < 0 && tall[k + 3]! < 0, 'root on the tall side');
      assert.ok(tall[k + 5]! > 0 && tall[k + 5]! <= SPILL.max + 1e-6, `tip ${tall[k + 5]}`);
      tips.push(tall[k + 5]!);
    }
    // ragged: lengths spread from short to long, and long tufts and bare stretches both occur
    const sorted = [...tips].sort((a, b) => a - b), q = (f: number) => sorted[Math.floor(f * (sorted.length - 1))]!;
    assert.ok(q(0.9) > 0.3 && q(0.1) < 0.15, `tips 10% ${q(0.1).toFixed(2)}, 90% ${q(0.9).toFixed(2)}`);
    // the other side flips them
    const other = spillBlades(line, -1);
    for (let k = 0; k < other.length; k += 6) assert.ok(other[k + 5]! < 0);
    // the same blades every time
    assert.deepEqual(spillBlades(line, 1), tall);
  });
  it('a hard edge keeps its line: only a few short tufts', () => {
    const line = [0, 0, 40, 0], full = spillBlades(line, 1), sparse = spillBlades(line, 1, 1, true);
    assert.ok(sparse.length < 0.5 * full.length, `${sparse.length / 6} of ${full.length / 6}`);
    for (let k = 0; k < sparse.length; k += 6) assert.ok(sparse[k + 5]! <= SPILL.max * SPILL.sparseLen + 1e-6);
  });
  it('fewer, wider blades at far levels', () => {
    assert.equal(spillScale(0.6, 71.55), 1); assert.equal(spillScale(0.3, 71.55), 1); assert.ok(spillScale(0.15, 71.55) >= 2); assert.equal(spillScale(0.07, 71.55), 4);
    assert.ok(spillBlades([0, 0, 40, 0], 1, 4).length < 0.35 * spillBlades([0, 0, 40, 0], 1, 1).length);
  });
  it('clumps are world-space noise in 0..1', () => {
    let lo = 1, hi = 0;
    for (let k = 0; k < 2000; k++) { const c = spillClump(k * 0.173, 50 + k * 0.031); lo = Math.min(lo, c); hi = Math.max(hi, c); }
    assert.ok(lo >= 0 && hi <= 1 && lo < 0.1 && hi > 0.9);
    assert.equal(spillClump(12.5, 7.25), spillClump(12.5, 7.25));
  });
});

describe('which surfaces take part (T204)', () => {
  it('sorts textures into hard, tall, short and soft', () => {
    for (const t of ['pad', 'asphaltDark', 'paving', 'slabs', 'concrete', 'gravel', 'preset:path-worn', 'spectatorPath']) assert.equal(ruggedKind(t), 'hard', t);
    for (const t of ['grassDry', 'preset:fescue', 'preset:rough', 'golfRough', 'meadow']) assert.equal(ruggedKind(t), 'tall', t);
    for (const t of ['dirt', 'preset:first-cut', 'preset:range-outfield', 'preset:fringe', 'preset:lawns', 'lawnLush', 'field']) assert.equal(ruggedKind(t), 'short', t);
    for (const t of ['waterDark', 'bunkerSand']) assert.equal(ruggedKind(t), 'soft', t);
    assert.equal(ruggedKind('preset:lawns', 'kerb'), 'hard', 'a kerb border keeps its line');
  });
  it('point in polygon', () => {
    const r = rect(0, 0, 4, 4);
    assert.ok(inPoly(r, 2, 2)); assert.ok(!inPoly(r, 5, 2)); assert.ok(!inPoly(r, -0.1, 2));
  });
});

describe('the living ground\'s variants with a rugged edge (T204 d)', () => {
  /** a mask (RGBA, alpha the channel) of a disc of radius r tiles at (cx, cy), with a hole of radius h, over W x H samples at res a tile from (0, 0) */
  const disc = (W: number, H: number, res: number, cx: number, cy: number, r: number, h = 0) => {
    const a = new Uint8ClampedArray(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = Math.hypot((i + 0.5) / res - cx, (j + 0.5) / res - cy); a[(j * W + i) * 4 + 3] = d < r && d >= h ? 255 : 0; }
    return a;
  };
  it('outlines a mask where it passes its level, closed, holes included, the same wherever the grid starts', () => {
    const rings = maskContours(disc(40, 40, 2, 10, 10, 6), 40, 40, 0, 0, 2, 0.5);
    assert.equal(rings.length, 1);
    const r = rings[0]!;
    for (let k = 0; k < r.length; k += 2) { const d = Math.hypot(r[k]! - 10, r[k + 1]! - 10); assert.ok(Math.abs(d - 6) < 0.6, `on the disc's rim: ${d.toFixed(2)}`); }
    assert.ok(Math.abs(Math.abs(signedArea(r)) - Math.PI * 36) < 0.1 * Math.PI * 36, 'about the disc\'s area');
    // a ring (disc with a hole): an outer and an inner outline, wound opposite ways
    const two = maskContours(disc(40, 40, 2, 10, 10, 8, 3), 40, 40, 0, 0, 2, 0.5);
    assert.equal(two.length, 2);
    assert.ok(Math.sign(signedArea(two[0]!)) !== Math.sign(signedArea(two[1]!)), 'a hole runs the other way');
    // a mask touching the grid's edge still closes (the outside counts as below)
    const edge = maskContours(disc(20, 20, 2, 0, 5, 4), 20, 20, 0, 0, 2, 0.5);
    assert.equal(edge.length, 1);
  });
  it('its tufts root inside the variant and reach out over the ground round it', () => {
    const W = 40, a = disc(W, W, 2, 10, 10, 6), rings = maskContours(a, W, W, 0, 0, 2, 0.5), r = rings[0]!;
    const t = spillBlades([...r, r[0]!, r[1]!], 1, 2);
    assert.ok(t.length > 0);
    let out = 0;
    for (let k = 0; k < t.length; k += 6) {
      const rx = (t[k]! + t[k + 2]!) / 2, ry = (t[k + 1]! + t[k + 3]!) / 2, tx = t[k + 4]!, ty = t[k + 5]!;
      // (the outline lies within half a sample, 0.25 tiles, of the disc's rim)
      assert.ok(Math.hypot(rx - 10, ry - 10) < 6.25 - SPILL.root / 2, 'the root inside');
      if (Math.hypot(tx - 10, ty - 10) > Math.hypot(rx - 10, ry - 10)) out++;
    }
    assert.ok(out > 0.9 * (t.length / 6), `tips outside: ${out} of ${t.length / 6}`);
  });
  it('the open ground\'s patches are fewer and larger than before', () => {
    // the share of open ground past the lush crest, and the patches' size: a run along a line in and out of them
    let inPatch = 0, runs = 0, prev = false; const N = 4000;
    for (let k = 0; k < N; k++) { const x = k * 0.5, on = openPatch(x, 333) > OPEN_PATCH_AT[0]; if (on) inPatch++; if (on && !prev) runs++; prev = on; }
    let inOld = 0, runsOld = 0; prev = false;
    for (let k = 0; k < N; k++) { const x = k * 0.5, on = openNoise(x, 333) > 0.12; if (on) inOld++; if (on && !prev) runsOld++; prev = on; }
    assert.ok(inPatch < 0.6 * inOld, `share ${inPatch / N} vs ${inOld / N}`);
    assert.ok(runs < runsOld, `patches ${runs} vs ${runsOld}`);
    assert.ok(inPatch / Math.max(1, runs) > inOld / Math.max(1, runsOld), 'each patch longer');
  });
});
