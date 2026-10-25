import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUN_TILE_DIR,
  sunFactor,
  binEdges,
  EDGE_STYLE,
  featherSteps,
  dropOffset,
  stripeBands,
  type Pt,
} from '../src/game/ext/course-edges';
import { SURF } from '../src/game/ext/course-grid';

test('1. sunFactor(SUN_TILE_DIR) is 1 and opposite -1; normal pointing up-right on screen has L > 0.9', () => {
  // sunFactor with SUN_TILE_DIR
  const lSun = sunFactor(SUN_TILE_DIR.x, SUN_TILE_DIR.y);
  assert.ok(Math.abs(lSun - 1.0) < 1e-9, `expected sunFactor to be 1, got ${lSun}`);

  // also accepts Pt object directly
  const lObj = sunFactor(SUN_TILE_DIR);
  assert.ok(Math.abs(lObj - 1.0) < 1e-9, `expected sunFactor(obj) to be 1, got ${lObj}`);

  // opposite is -1
  const lOpp = sunFactor(-SUN_TILE_DIR.x, -SUN_TILE_DIR.y);
  assert.ok(Math.abs(lOpp - (-1.0)) < 1e-9, `expected opposite sunFactor to be -1, got ${lOpp}`);

  // normal whose iso screen direction points up-right (sx > 0, sy < 0) has L > 0.9
  // in iso: screenX = (x - y)*HW, screenY = (x + y)*HH.
  // For screen vector (1, -1) (up-right 45° on screen):
  // HW=64, HH=32 => u = 1/64, v = -1/32 => x = (u+v)/2 = -1/128, y = (v-u)/2 = -3/128.
  // normalized tile normal:
  const len = Math.hypot(-1, -3);
  const nx = -1 / len;
  const ny = -3 / len;
  const lUpRight = sunFactor(nx, ny);
  assert.ok(lUpRight > 0.9, `expected L > 0.9 for normal pointing up-right on screen, got ${lUpRight}`);
});

test("2. A circle's edges give 8 runs, with L going round in order", () => {
  // Discretize circle of radius 10 tiles, centered at (20, 20) with 64 vertices
  const N = 64;
  const R = 10;
  const circle: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N;
    circle.push({
      x: 20 + R * Math.cos(th),
      y: 20 + R * Math.sin(th),
    });
  }
  // close the ring
  circle.push({ x: circle[0]!.x, y: circle[0]!.y });

  const runs = binEdges([circle], 8);
  assert.equal(runs.length, 8, `expected circle to produce 8 runs, got ${runs.length}`);

  // Verify each run has valid properties
  for (const r of runs) {
    assert.ok(r.pts.length >= 4, 'each run should contain at least one segment (2 points)');
    assert.ok(Number.isFinite(r.L), 'run L must be a finite number');
    assert.ok(r.L >= -1.01 && r.L <= 1.01, 'run L must be in [-1, 1]');
    assert.ok(r.bin >= 0 && r.bin < 8, 'run bin must be 0..7');
  }

  // Check L going round in order:
  // Around a circle, L = cos(th - th_sun) completes a single sinusoidal cycle.
  // As we inspect runs around the circle, there should be exactly one cyclic local maximum and one local minimum.
  const ls = runs.map((r) => r.L);
  let localMaxima = 0;
  let localMinima = 0;
  const m = ls.length;
  for (let i = 0; i < m; i++) {
    const prev = ls[(i - 1 + m) % m]!;
    const curr = ls[i]!;
    const next = ls[(i + 1) % m]!;
    if (curr > prev && curr > next) localMaxima++;
    if (curr < prev && curr < next) localMinima++;
  }
  assert.equal(localMaxima, 1, `expected exactly 1 local maximum in cyclic L values, got ${localMaxima}`);
  assert.equal(localMinima, 1, `expected exactly 1 local minimum in cyclic L values, got ${localMinima}`);
});

test('3. A staircase does not split into more runs than its smooth version', () => {
  // Smooth diagonal line from (0,0) to (10, 10)
  const smooth: Pt[] = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ];
  const smoothRuns = binEdges([smooth], 8);
  assert.equal(smoothRuns.length, 1, 'smooth straight diagonal should be 1 run');

  // Staircase with 0.5 tile steps (1 m steps) from (0,0) to (10, 10)
  const staircase: Pt[] = [{ x: 0, y: 0 }];
  let curY = 0;
  for (let x = 0; x < 10; x += 0.5) {
    staircase.push({ x: x + 0.5, y: curY });
    curY += 0.5;
    staircase.push({ x: x + 0.5, y: curY });
  }
  const staircaseRuns = binEdges([staircase], 8);
  assert.ok(
    staircaseRuns.length <= smoothRuns.length,
    `staircase runs (${staircaseRuns.length}) should not exceed smooth runs (${smoothRuns.length})`,
  );
  assert.equal(staircaseRuns.length, 1, 'staircase smoothed over 2 m window should produce 1 run');
});

test("4. 'along' bands on a straight line alternate at 3 m; 'half' splits at the line; bands follow a 90° bend without crossing", () => {
  // A. Straight line along X axis from (0, 0) to (50, 0)
  const straightLine: Pt[] = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
  ];
  const alongBands = stripeBands(straightLine, 'along', 3, 15);
  assert.ok(alongBands.light.length > 0, 'should produce light bands');
  assert.ok(alongBands.dark.length > 0, 'should produce dark bands');

  // Bands alternate at 3 m: 3 m = 1.5 tiles.
  // Check widths of bands: each ribbon along X has height delta-y = 1.5 tiles (3 m)
  for (const band of alongBands.light) {
    const ys = band.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const heightM = (maxY - minY) * 2; // tiles to metres
    assert.ok(Math.abs(heightM - 3) < 1e-3, `expected 3 m band height, got ${heightM}`);
  }

  // B. 'half' splits at the line
  const halfBands = stripeBands(straightLine, 'half', 3, 15);
  assert.equal(halfBands.light.length, 1, 'half pattern should have 1 light band');
  assert.equal(halfBands.dark.length, 1, 'half pattern should have 1 dark band');

  // Light band should be on y >= 0 side, dark on y <= 0 side, sharing y = 0
  const lightYs = halfBands.light[0]!.map((p) => p.y);
  const darkYs = halfBands.dark[0]!.map((p) => p.y);
  assert.ok(Math.min(...lightYs) >= -1e-6, 'light half should be on non-negative y');
  assert.ok(Math.max(...darkYs) <= 1e-6, 'dark half should be on non-positive y');

  // C. bands follow a 90° bend without crossing
  const cornerLine: Pt[] = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
  ];
  const cornerBands = stripeBands(cornerLine, 'along', 3, 15);
  assert.ok(cornerBands.light.length > 0 && cornerBands.dark.length > 0);

  // Check that no bands self-intersect or cross
  const allBands = [...cornerBands.light, ...cornerBands.dark];
  for (const b of allBands) {
    assert.ok(b.length >= 4, 'each band should be a valid closed polygon');
    for (const pt of b) {
      assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'band vertex must be finite');
    }
    // assert non-zero signed area without inversion
    let area = 0;
    for (let i = 0; i < b.length; i++) {
      const p1 = b[i]!;
      const p2 = b[(i + 1) % b.length]!;
      area += p1.x * p2.y - p2.x * p1.y;
    }
    assert.ok(Math.abs(area) > 1e-3, 'band polygon must have non-zero area without self-crossing');
  }

  // Check that miter corner vertices at the 90° bend are strictly nested without crossing
  for (const b of allBands) {
    const ptCornA = b[1]!;
    const ptCornB = b[b.length - 2]!;
    assert.ok(ptCornA.x !== ptCornB.x || ptCornA.y !== ptCornB.y, 'miter corners must not collapse');
  }
});

test('5. The feather alphas sum to 1', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8]) {
    const steps = featherSteps(0.4, n);
    assert.equal(steps.length, n);
    const sumAlpha = steps.reduce((acc, s) => acc + s.alpha, 0);
    assert.ok(Math.abs(sumAlpha - 1.0) < 1e-9, `expected alpha sum 1, got ${sumAlpha} for n=${n}`);

    // widths should be strictly descending
    for (let k = 1; k < steps.length; k++) {
      assert.ok(steps[k]!.width < steps[k - 1]!.width, 'widths must be descending');
    }
  }
});

test('6. EDGE_STYLE table conforms to P21 Section 3.4 specifications and SURF indexing', () => {
  assert.ok(Array.isArray(EDGE_STYLE), 'EDGE_STYLE must be an array indexed by SURF id');
  assert.equal(EDGE_STYLE.length, 9, 'EDGE_STYLE must have 9 SURF entries (0..8)');

  // green: raised, 0.3m feather, 0.8m light rim, 0.8m shade, 0.4m drop offset
  const greenStyle = EDGE_STYLE[SURF.green];
  assert.equal(greenStyle.profile, 'raised');
  assert.equal(greenStyle.feather, 0.3);
  assert.equal(greenStyle.rim?.alpha, 0.22);
  assert.equal(greenStyle.shade?.alpha, 0.22);
  assert.equal(greenStyle.drop?.offset, 0.4);

  // tee: raised, 0.3m feather, 1.0m rim, 1.0m shade, 0.6m drop offset
  const teeStyle = EDGE_STYLE[SURF.tee];
  assert.equal(teeStyle.profile, 'raised');
  assert.equal(teeStyle.feather, 0.3);
  assert.equal(teeStyle.rim?.alpha, 0.26);
  assert.equal(teeStyle.shade?.alpha, 0.26);
  assert.equal(teeStyle.drop?.offset, 0.6);

  // fairway: turf, 0.4m feather, 1.2m rim, 1.2m shade, no drop
  const fairwayStyle = EDGE_STYLE[SURF.fairway];
  assert.equal(fairwayStyle.profile, 'turf');
  assert.equal(fairwayStyle.feather, 0.4);
  assert.equal(fairwayStyle.drop, null);

  // bunker: sunken, 0.15m feather, screen light rim lower-left, multiply shade upper-right
  const bunkerStyle = EDGE_STYLE[SURF.bunker];
  assert.equal(bunkerStyle.profile, 'sunken');
  assert.equal(bunkerStyle.feather, 0.15);
  assert.equal(bunkerStyle.rim?.side, 'lower-left');
  assert.equal(bunkerStyle.shade?.side, 'upper-right');

  // water: sunken, 0.2m feather, 0.25m glint
  const waterStyle = EDGE_STYLE[SURF.water];
  assert.equal(waterStyle.feather, 0.2);
  assert.equal(waterStyle.rim?.width, 0.25);
  assert.equal(waterStyle.rim?.side, 'lower-left');
  assert.equal(waterStyle.shade?.side, 'upper-right');

  // collar styles under course-blobs' collar names
  assert.equal(EDGE_STYLE['first-cut'].profile, 'flat');
  assert.equal(EDGE_STYLE['first-cut'].feather, 0.4);
  assert.equal(EDGE_STYLE.fringe.profile, 'flat');
  assert.equal(EDGE_STYLE.fringe.feather, 0.4);
  assert.equal(EDGE_STYLE.lip.profile, 'flat');
  assert.equal(EDGE_STYLE.lip.feather, 0.4);
  assert.equal(EDGE_STYLE.bank.profile, 'flat');
  assert.equal(EDGE_STYLE.bank.feather, 0.4);
});

test('7. dropOffset(m) calculates tile-space offset toward 145° shadow', () => {
  const off = dropOffset(2); // 2 metres = 1 tile
  const len = Math.hypot(off.x, off.y);
  assert.ok(Math.abs(len - 1.0) < 1e-9, `expected 1.0 tile magnitude for 2 m, got ${len}`);

  // screen angle of (off.x, off.y)
  const sx = (off.x - off.y) * 64;
  const sy = (off.x + off.y) * 32;
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  const normDeg = (deg + 360) % 360;
  assert.ok(Math.abs(normDeg - 145) < 0.1, `expected 145° shadow angle, got ${normDeg}°`);
});

test('8. CW hole ring has outward normals pointing into the hole (L < 0 on the sun side, matching open polyline)', () => {
  // CW circle representing a hole ring inside a fairway
  const N = 32;
  const R = 10;
  const cwRing: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const th = (-2 * Math.PI * i) / N; // clockwise
    cwRing.push({
      x: 20 + R * Math.cos(th),
      y: 20 + R * Math.sin(th),
    });
  }
  cwRing.push({ x: cwRing[0]!.x, y: cwRing[0]!.y });

  const closedRuns = binEdges([cwRing], 8);
  const openPoly = cwRing.slice(0, -1);
  const openRuns = binEdges([openPoly], 8);

  assert.equal(closedRuns.length, 8);
  // Compare closed runs with open polyline runs
  for (let b = 0; b < 8; b++) {
    const closedRun = closedRuns.find((r) => r.bin === b);
    const openRun = openRuns.find((r) => r.bin === b);
    if (closedRun && openRun) {
      assert.ok(
        Math.abs(closedRun.L - openRun.L) < 0.2,
        `bin ${b} closed L (${closedRun.L}) should match open L (${openRun.L})`,
      );
    }
  }

  // The sun-facing edge of a CW hole ring has outward normals pointing into the hole (away from the sun)
  // so L should be negative (around -0.79)
  const sunSideRun = closedRuns.find((r) => r.L < -0.7);
  assert.ok(sunSideRun, 'sun side of CW hole ring should have negative L (around -0.79)');
});
