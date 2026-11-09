// T409 (#1105): the relief light and the slope materials (src/game/relief.ts). Pure maths: the normal rule of the video, the posterized light, the slope bands, the grid's seams,
// and the ground painter's layering (the slope materials lie under the water, the lots, the course's painted surfaces and the roads, which keep their own ground).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CH_SIZE, CH_STEP, SUN_TILE_DIR } from '../src/game/ext/course-height';
import { heightLightGrid, sampleHeightLight, type LightLand } from '../src/game/ext/course-height/light';
import {
  NORMAL_W, REL_MAX, REL_MIN, RELIEF_BANDS, RELIEF_BANDS_DEFAULT, RELIEF_DEFAULT, RELIEF_LOOK, RELIEF_RANGES, bandRel, bandsOf, clampRelief, flatBelow, reliefGrid, reliefMaxSlope, reliefModeOf, reliefPictures, sampleSlope,
  slopeMasks, slopeShares, tiltOneSided, type ReliefBands, type ReliefGrid,
} from '../src/game/relief';
import { clampSurfaces, SURFACES, HILLSIDE, MOUNTAIN, lookOfTex } from '../src/game/painted-surfaces';
import { familyById } from '../src/game/painted-families';
import { desertSurfaces } from '../src/game/desert-theme';
import { fbm, makeNoise } from '../src/game/terrain/noise';
import surfacesFile from '../src/game/painted-surfaces.json';

/** a field with h(x, y) (world tiles, metres) at every sample centre */
function field(fn: (x: number, y: number) => number): Float32Array {
  const h = new Float32Array(CH_SIZE * CH_SIZE);
  for (let j = 0; j < CH_SIZE; j++) for (let i = 0; i < CH_SIZE; i++) h[j * CH_SIZE + i] = fn((i + 0.5) * CH_STEP, (j + 0.5) * CH_STEP);
  return h;
}
/** the land layer of fn over the square of half-side `half` tiles about (cx, cy) */
function layer(fn: (x: number, y: number) => number, cx: number, cy: number, half: number): LightLand {
  const i0 = Math.floor((cx - half) / CH_STEP), i1 = Math.ceil((cx + half) / CH_STEP), j0 = Math.floor((cy - half) / CH_STEP), j1 = Math.ceil((cy + half) / CH_STEP), w = i1 - i0 + 1, h = j1 - j0 + 1, data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = fn((i0 + i + 0.5) * CH_STEP, (j0 + j + 0.5) * CH_STEP);
  return { i0, j0, w, h, data };
}
const box = (cx: number, cy: number, r: number) => [cx - r, cy - r, cx + r, cy + r] as const;
/** the distance (tiles) from (500, 500) toward the sun */
const toSun = (x: number, y: number) => (x - 500) * SUN_TILE_DIR.x + (y - 500) * SUN_TILE_DIR.y;
/** a plane of slope s (m per m) that falls toward the sun (it faces it: lit) or away from it (shaded); a tile is 2 m */
const plane = (s: number, facing: boolean) => (x: number, y: number) => (facing ? -1 : 1) * s * 2 * toSun(x, y);
/** a smooth dome of height `top` m and radius `r` tiles at (cx, cy) */
const dome = (cx: number, cy: number, r: number, top: number) => (x: number, y: number) => { const d = Math.hypot(x - cx, y - cy) / r; return d >= 1 ? 0 : top * (1 + Math.cos(Math.PI * d)) / 2; };
/** a lattice with height fn(i, j) (lattice units), for the tilt estimate */
function lattice(n: number, fn: (i: number, j: number) => number): Float32Array { const a = new Float32Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[j * n + i] = fn(i, j); return a; }

describe('the normal rule: a pixel tilts only toward taller neighbours (the video)', () => {
  const n = 9, c = 4 * n + 4, s = 1; // the middle of a 9 x 9 lattice, a metre a step
  it('a plane of any orientation gives exactly its own slope: the weights are the least-squares gradient\'s', () => {
    for (const [gx, gy] of [[0.3, 0], [0, -0.45], [0.25, 0.25], [-0.6, 0.15], [0.07, -0.81], [1.2, 0.9]] as const) {
      const [tx, ty] = tiltOneSided(lattice(n, (i, j) => gx * i * s + gy * j * s), c, n, s);
      assert.ok(Math.abs(tx - gx) < 1e-5 && Math.abs(ty - gy) < 1e-5, `plane (${gx}, ${gy}) read as (${tx.toFixed(4)}, ${ty.toFixed(4)})`);
    }
    // the lattice step scales it: the same rise per step is half the slope when the step is two metres
    const [tx] = tiltOneSided(lattice(n, i => 0.5 * i), c, n, 2); assert.ok(Math.abs(tx - 0.25) < 1e-6);
  });
  it('a crest faces straight up: no neighbour is taller, so no tilt; a symmetric hollow\'s floor does not lean either', () => {
    const peak = lattice(n, (i, j) => 5 - Math.hypot(i - 4, j - 4)), pit = lattice(n, (i, j) => Math.hypot(i - 4, j - 4));
    assert.deepEqual(tiltOneSided(peak, c, n, s), [0, 0]);
    const [px, py] = tiltOneSided(pit, c, n, s); assert.ok(Math.abs(px) < 1e-9 && Math.abs(py) < 1e-9, `a hollow's floor leans (${px}, ${py})`);
    // a ridge line along y: its crest (the middle column) has no tilt, its flanks lean (away from the higher ground the normal tilts, the gradient estimate points up the flank)
    const ridge = lattice(n, i => 3 - Math.abs(i - 4));
    assert.deepEqual(tiltOneSided(ridge, c, n, s), [0, 0]);
    const [fx] = tiltOneSided(ridge, c - 1, n, s), [gx2] = tiltOneSided(ridge, c + 1, n, s);
    assert.ok(fx > 0.5 && gx2 < -0.5, `the flanks lean up toward the crest: ${fx.toFixed(2)}, ${gx2.toFixed(2)}`);
  });
  it('the four direct neighbours count more than the four diagonals', () => {
    assert.ok(NORMAL_W.direct > NORMAL_W.diagonal);
    // one taller neighbour of the same rise: the direct one tilts the estimate more than the diagonal one does (2 against 1 each along its own offset)
    const E = lattice(n, (i, j) => (i === 5 && j === 4 ? 1 : 0)), SE = lattice(n, (i, j) => (i === 5 && j === 5 ? 1 : 0));
    const [ex, ey] = tiltOneSided(E, c, n, s), [dx, dy] = tiltOneSided(SE, c, n, s);
    assert.ok(ex > 0 && Math.abs(ey) < 1e-12, 'the east neighbour tilts along x'); assert.ok(dx > 0 && dy > 0 && Math.abs(dx - dy) < 1e-12, 'the south-east one along both');
    assert.ok(Math.hypot(ex, ey) > Math.hypot(dx, dy), `direct ${Math.hypot(ex, ey).toFixed(3)} against diagonal ${Math.hypot(dx, dy).toFixed(3)}`);
  });
  it('only a taller neighbour counts: lowering the others changes nothing', () => {
    const base = lattice(n, (i, j) => (i === 5 && j === 4 ? 1 : 0)), lowered = lattice(n, (i, j) => (i === 5 && j === 4 ? 1 : (i + j) % 2 ? -3 : -1));
    assert.deepEqual(tiltOneSided(base, c, n, s), tiltOneSided(lowered.map((v, k) => (k === c ? 0 : v)) as unknown as Float32Array, c, n, s));
  });
});

describe('the posterized light (the video\'s "posterize the gradient")', () => {
  const span = REL_MAX - REL_MIN;
  it('flat ground is exactly flat, whatever the bands; fewer than two bands is the smooth light', () => {
    for (const n of [0, 1, 3, 4, 5]) assert.equal(bandRel(0, n), 0);
    for (const r of [-0.6, -0.3, -0.07, 0.03, 0.2]) { assert.equal(bandRel(r, 0), r); assert.equal(bandRel(r, 1), r); }
  });
  it('is a staircase: rises with the light, never moves it by more than half a step, lies on whole steps between its edges', () => {
    for (const n of [3, 4, 5]) {
      let prev = -Infinity; const st = span / n, levels = new Set<number>();
      for (let r = REL_MIN - 0.05; r <= REL_MAX + 1e-9; r += 0.0005) { const b = bandRel(r, n); assert.ok(b >= prev - 1e-12, `monotonic at ${r}`); prev = b; assert.ok(Math.abs(b - r) <= st * 0.5 + 1e-9, `${r} -> ${b} moved more than half a step`); if (Math.abs(Math.round(b / st) * st - b) < 1e-6) levels.add(Math.round(b / st)); }
      assert.ok(levels.size >= n - 1 && levels.size <= n + 2, `${n} bands gave ${levels.size} flat levels`);
    }
    // the flat step has room: a tilt that changes the light by a few per cent leaves the ground as it is
    assert.equal(bandRel(0.04, 4), 0); assert.equal(bandRel(-0.04, 4), 0); assert.ok(bandRel(-0.14, 4) < 0 && bandRel(-0.14, 4) > -span / 4);
  });
  it('a plateau holds its level over most of its step and the edge between two is soft (never a jump)', () => {
    const st = span / 4, at = (k: number, f: number) => bandRel((k + f) * st, 4);
    assert.ok(Math.abs(at(1, 0.2) - st) < 1e-9 && Math.abs(at(1, 0.3) - st) < 1e-9, 'level 1 holds up to 0.35 of the way on');
    assert.ok(at(1, 0.5) > st && at(1, 0.5) < 2 * st, 'between the levels in the middle of the edge');
    let maxJump = 0; for (let r = REL_MIN; r < REL_MAX; r += 0.001) maxJump = Math.max(maxJump, Math.abs(bandRel(r + 0.001, 4) - bandRel(r, 4)));
    assert.ok(maxJump < 0.01, `the steepest edge moves ${maxJump.toFixed(4)} a thousandth of light`);
  });
  it('the modes: old, smooth, bands (4)', () => {
    assert.equal(reliefModeOf('old'), 'old'); assert.equal(reliefModeOf('bands'), 'bands'); assert.equal(reliefModeOf('smooth'), 'smooth'); assert.equal(reliefModeOf('x'), null); assert.equal(reliefModeOf(null), null);
    assert.equal(bandsOf('old'), 0); assert.equal(bandsOf('smooth'), 0); assert.equal(bandsOf('bands'), RELIEF_BANDS); assert.ok(RELIEF_BANDS >= 3 && RELIEF_BANDS <= 5);
  });
});

describe('the relief grid: the light of the ground (T126, T388) read with the video\'s normals', () => {
  it('flat ground gives no grid; the same ground twice gives the same grid (deterministic)', () => {
    assert.equal(reliefGrid({ course: field(() => 0), land: null }, box(500, 500, 20), 2), null);
    const f = field(dome(500, 500, 14, 3)), a = reliefGrid({ course: f, land: null }, box(500, 500, 20), 2, 4)!, b = reliefGrid({ course: f, land: null }, box(500, 500, 20), 2, 4)!;
    assert.deepEqual(Array.from(a.v), Array.from(b.v)); assert.deepEqual(Array.from(a.slope), Array.from(b.slope)); assert.deepEqual(a.nz, b.nz);
  });
  it('a slope facing the sun is lit and one facing away is shaded; a crest and a hollow floor are as flat as flat ground', () => {
    const at = (fn: (x: number, y: number) => number, x: number, y: number, bands = 0) => sampleHeightLight(reliefGrid({ course: field(fn), land: null }, box(500, 500, 24), 2, bands)!, x, y);
    const lit = at(plane(0.2, true), 500, 500), shade = at(plane(0.2, false), 500, 500);
    assert.ok(lit.lift > 0.3 && lit.dark === 0, `facing the sun: lift ${lit.lift.toFixed(2)} dark ${lit.dark.toFixed(2)}`); assert.ok(shade.dark > 0.2 && shade.lift === 0, `facing away: dark ${shade.dark.toFixed(2)} lift ${shade.lift.toFixed(2)}`);
    // the dome's top: no taller neighbour, no tilt (the hollows' and the crests' own terms stay)
    const top = at(dome(500, 500, 16, 3), 500, 500); assert.ok(top.dark < 1e-6 && top.lift < 1e-6, `the top of a dome is lit ${top.lift} shaded ${top.dark}`);
    // its flank toward the sun is lit, away from it shaded (the sun sits at SUN_TILE_DIR)
    const f = dome(500, 500, 16, 3), sx = 500 + 9 * SUN_TILE_DIR.x, sy = 500 + 9 * SUN_TILE_DIR.y, ax = 500 - 9 * SUN_TILE_DIR.x, ay = 500 - 9 * SUN_TILE_DIR.y;
    assert.ok(at(f, sx, sy).lift > 0.3 && at(f, ax, ay).dark > 0.2, 'a dome\'s sun side is lit and its far side shaded');
  });
  it('the slope is the angle of the surface\'s normal from straight up', () => {
    for (const s of [0.05, 0.176, 0.364, 0.577]) { // 2.9, 10, 20, 30 degrees
      const g = reliefGrid({ course: field(plane(s, true)), land: null }, box(500, 500, 24), 2)!, deg = sampleSlope(g, 500, 500), want = Math.atan(s) * 180 / Math.PI;
      assert.ok(Math.abs(deg - want) < 0.6, `slope ${s}: ${deg.toFixed(2)} degrees, wanted ${want.toFixed(2)}`);
    }
    const g = reliefGrid({ course: field(() => 0), land: layer(plane(0.2, false), 500, 500, 60) }, box(500, 500, 24), 2)!; // the land alone, the same
    assert.ok(Math.abs(sampleSlope(g, 500, 500) - Math.atan(0.2) * 180 / Math.PI) < 0.6);
  });
  it('there is no seam: two chunks that meet agree on every grid point they share, and on the masks of the pixels either side', () => {
    const f = field((x, y) => dome(500, 500, 18, 3)(x, y) + dome(540, 520, 12, -2)(x, y)), inp = { course: f, land: null };
    for (const [res, bands] of [[2, 0], [2, 4], [1, 4], [0.25, 0]] as const) {
      const A = reliefGrid(inp, [470, 470, 520, 520], res, bands)!, B = reliefGrid(inp, [520, 470, 570, 520], res, bands)!;
      // the lattice is the world's: point (i, j) of a grid sits at (x0 + (i + .5) / res, ...); compare each shared point
      let shared = 0;
      for (let j = 0; j < A.h; j++) for (let i = 0; i < A.w; i++) {
        const x = A.x0 + (i + 0.5) / res, y = A.y0 + (j + 0.5) / res, u = Math.round((x - B.x0) * res - 0.5), v = Math.round((y - B.y0) * res - 0.5);
        if (u < 0 || v < 0 || u >= B.w || v >= B.h) continue;
        shared++;
        const ka = (j * A.w + i) * 5, kb = (v * B.w + u) * 5;
        for (let q = 0; q < 5; q++) assert.ok(Math.abs(A.v[ka + q]! - B.v[kb + q]!) < 1e-5, `res ${res} bands ${bands}: point (${x}, ${y}) channel ${q}: ${A.v[ka + q]} against ${B.v[kb + q]}`);
        assert.ok(Math.abs(A.slope[j * A.w + i]! - B.slope[v * B.w + u]!) < 1e-4, 'the slope');
      }
      assert.ok(shared > 10, `the two grids share ${shared} points`);
    }
    // the masks are a function of the world's tiles: the same pixel from the two boxes is the same alpha
    const b = clampRelief(null), noise = makeNoise(7), gA = reliefGrid(inp, [470, 470, 520, 520], 2)!, gB = reliefGrid(inp, [500, 470, 550, 520], 2)!;
    const mA = slopeMasks(gA, null, 470, 470, 50, 50, 4, noise, { ...b, hillAt: 4, rockAt: 12 })!, mB = slopeMasks(gB, null, 500, 470, 50, 50, 4, noise, { ...b, hillAt: 4, rockAt: 12 })!;
    let seen = 0; for (let v = 0; v < mA.hill!.H; v++) for (let u = 0; u < mA.hill!.W; u++) { const x = 470 + (u + 0.5) / 4; if (x < 500 || x > 520) continue; const ub = Math.round((x - 500) * 4 - 0.5); const a = mA.hill!.data[(v * mA.hill!.W + u) * 4 + 3]!, c = mB.hill!.data[(v * mB.hill!.W + ub) * 4 + 3]!; assert.ok(Math.abs(a - c) <= 1, `mask at (${x}, ${470 + (v + 0.5) / 4}): ${a} against ${c}`); seen++; }
    assert.ok(seen > 100);
  });
  it('the old light is untouched by the new one, and the new one is the old one\'s kin: the same sun side, the same flat ground', () => {
    const f = field(dome(500, 500, 16, 3)), neu = reliefGrid({ course: f, land: null }, box(500, 500, 24), 2)!, old = heightLightGrid(f, box(500, 500, 24), 2)!;
    // flat ground far from the dome is flat in both (and the flat ground of a chunk the dome does not reach is no grid at all)
    assert.equal(reliefGrid({ course: f, land: null }, box(100, 100, 20), 2), null); assert.equal(heightLightGrid(f, box(100, 100, 20), 2), null);
    const sun = [500 + 9 * SUN_TILE_DIR.x, 500 + 9 * SUN_TILE_DIR.y] as const;
    assert.ok(sampleHeightLight(neu, sun[0], sun[1]).lift > 0 && sampleHeightLight(old, sun[0], sun[1]).lift > 0);
  });
  it('banding quantizes the light: a dome\'s grid sits on a handful of shade levels where the smooth one has a continuum', () => {
    const f = field(dome(500, 500, 18, 3));
    // the share of the lit or shaded points that have one of the five commonest (dark, lift) pairs
    const top5 = (g: ReliefGrid) => { const m = new Map<string, number>(); let n = 0; for (let p = 0; p < g.w * g.h; p++) { const d = g.v[p * 5]!, l = g.v[p * 5 + 1]!; if (d === 0 && l === 0) continue; const k = `${d.toFixed(5)}|${l.toFixed(5)}`; m.set(k, (m.get(k) ?? 0) + 1); n++; } return [...m.values()].sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0) / n; };
    const smooth = reliefGrid({ course: f, land: null }, box(500, 500, 30), 2, 0)!, banded = reliefGrid({ course: f, land: null }, box(500, 500, 30), 2, 4)!;
    assert.ok(top5(smooth) < 0.2, `smooth: the five commonest levels hold ${(100 * top5(smooth)).toFixed(0)}% of the points`); assert.ok(top5(banded) > 0.45, `banded: ${(100 * top5(banded)).toFixed(0)}%`);
    // flat ground far from the dome is nothing in both
    assert.equal(banded.v[0], 0); assert.equal(smooth.v[0], 0);
  });
  it('a cast shadow falls down-left of a steep rise (145 degrees) and the pictures keep the texture: never black', () => {
    // a wall 3 m high, 3 tiles thick across the sun's direction
    const wall = field((x, y) => (Math.abs(toSun(x, y)) < 1.5 && Math.abs((y - 500) * SUN_TILE_DIR.x - (x - 500) * SUN_TILE_DIR.y) < 12 ? 3 : 0));
    const g = reliefGrid({ course: wall, land: null }, box(500, 500, 30), 2, 0)!, away = sampleHeightLight(g, 500 - 3 * SUN_TILE_DIR.x, 500 - 3 * SUN_TILE_DIR.y), sunward = sampleHeightLight(g, 500 + 4 * SUN_TILE_DIR.x, 500 + 4 * SUN_TILE_DIR.y);
    assert.ok(away.cast > 0.3, `behind the wall (away from the sun): cast ${away.cast.toFixed(2)}`); assert.ok(sunward.cast < 0.05, `in front of it: cast ${sunward.cast.toFixed(2)}`);
    // the shade picture never reaches black: even the deepest shade keeps a third of the texel in every channel
    const p = reliefPictures({ ...g, v: new Float32Array(g.v.length).fill(1) }, 2, RELIEF_LOOK);
    for (let c = 0; c < 3; c++) assert.ok(p.shade[c]! >= 0.3 * 255, `channel ${c} of the deepest shade is ${p.shade[c]}`);
    assert.ok(p.shade[2]! > p.shade[0]!, 'the shade is a little cooler: blue darkens least');
  });
  it('the land and the course height light together, their tilts added (T388)', () => {
    const only = (inp: { course: Float32Array; land: LightLand | null }) => sampleSlope(reliefGrid(inp, box(500, 500, 24), 2)!, 500, 500);
    const s1 = only({ course: field(plane(0.1, true)), land: null }), s2 = only({ course: field(() => 0), land: layer(plane(0.1, true), 500, 500, 60) }), s3 = only({ course: field(plane(0.1, true)), land: layer(plane(0.1, true), 500, 500, 60) });
    assert.ok(Math.abs(s1 - s2) < 0.2, 'the same slope in either layer'); assert.ok(Math.abs(s3 - Math.atan(0.2) * 180 / Math.PI) < 0.8, `both together: ${s3.toFixed(2)} degrees`);
  });
});

describe('the slope bands pick the ground\'s material (the owner, 2026-11-09)', () => {
  const b: ReliefBands = { hillAt: 10, rockAt: 27, blend: 5, noise: 3, grain: 12 };
  it('flat and gentle ground keeps the ground; moderate ground wears the hillside; steep ground the rock, the rock over the hillside', () => {
    for (const d of [0, 2, 5, 7]) { const s = slopeShares(d, 0, b); assert.equal(s.hill, 0, `${d} degrees`); assert.equal(s.rock, 0); }
    const mid = slopeShares(10, 0, b); assert.ok(Math.abs(mid.hill - 0.5) < 1e-9 && mid.rock === 0, 'half and half at the first angle');
    for (const d of [13, 15, 20, 24]) { const s = slopeShares(d, 0, b); assert.equal(s.hill, 1, `${d} degrees`); assert.equal(s.rock, 0); }
    const r = slopeShares(27, 0, b); assert.equal(r.hill, 1); assert.ok(Math.abs(r.rock - 0.5) < 1e-9);
    for (const d of [30, 40, 60]) { const s = slopeShares(d, 0, b); assert.equal(s.rock, 1); assert.equal(s.hill, 1); }
    for (let d = 0; d <= 60; d += 0.25) { const s = slopeShares(d, 0.3, b); assert.ok(s.rock <= s.hill + 1e-12, `the rock never leads the hillside at ${d}`); }
  });
  it('each edge blends over `blend` degrees, whole at half of it either side, monotonic with the slope', () => {
    let ph = 0, pr = 0; for (let d = 0; d <= 60; d += 0.05) { const s = slopeShares(d, 0, b); assert.ok(s.hill >= ph - 1e-12 && s.rock >= pr - 1e-12); ph = s.hill; pr = s.rock; }
    assert.equal(slopeShares(10 - 2.5, 0, b).hill, 0); assert.equal(slopeShares(10 + 2.5, 0, b).hill, 1); assert.equal(slopeShares(27 - 2.5, 0, b).rock, 0); assert.equal(slopeShares(27 + 2.5, 0, b).rock, 1);
  });
  it('noise breaks the edge by up to its own degrees: below flatBelow nothing shows whatever the noise, a noisy point blends in earlier on the steeper side of the noise', () => {
    assert.equal(flatBelow(b), 10 - 2.5 - 3);
    for (const n of [-1, -0.4, 0, 0.7, 1]) assert.equal(slopeShares(flatBelow(b) - 0.01, n, b).hill, 0);
    assert.ok(slopeShares(8, 1, b).hill > slopeShares(8, 0, b).hill && slopeShares(8, -1, b).hill < slopeShares(8, 0, b).hill, 'the noise moves the edge both ways');
    assert.ok(slopeShares(8, 1, b).hill > 0 && slopeShares(8, -1, b).hill === 0);
  });
  it('the mask of a real surface follows the thresholds: a slope under the first angle has no mask, one between the two the hillside, one over the second the rock too', () => {
    const noise = makeNoise(7), still = { ...b, noise: 0 }; // (no noise: the bands exactly)
    const gOf = (s: number) => reliefGrid({ course: field(plane(s, true)), land: null }, box(500, 500, 24), 2)!;
    const mask = (g: ReliefGrid) => slopeMasks(g, null, 488, 488, 24, 24, 4, noise, still);
    assert.equal(mask(gOf(Math.tan(6 * Math.PI / 180))), null, '6 degrees: gentle ground keeps the ground');
    const hill = mask(gOf(Math.tan(18 * Math.PI / 180)))!; assert.ok(hill.hill && !hill.rock, '18 degrees: the hillside only'); assert.equal(hill.hill!.data[(48 * hill.hill!.W + 48) * 4 + 3], 255);
    const rock = mask(gOf(Math.tan(33 * Math.PI / 180)))!; assert.ok(rock.hill && rock.rock, '33 degrees: the rock over the hillside'); assert.equal(rock.rock!.data[(48 * rock.rock!.W + 48) * 4 + 3], 255);
    // the natural terrain's own slope field counts too (the map ships flat, a terrain with hills gets the materials): a field of 0.5 m per m everywhere is 26.6 degrees
    const nat = new Float32Array(128 * 128).fill(0.5), nm = slopeMasks(null, nat, 100, 100, 16, 16, 4, noise, still)!; assert.ok(nm.hill && nm.rock, 'the natural slope picks the materials'); assert.ok(nm.hill!.data[(32 * nm.hill!.W + 32) * 4 + 3]! === 255);
  });
  it('the noise is real noise over the steeper patches: the same slope shows in blotches, the share varies and is the same wherever the point is asked from', () => {
    const noise = makeNoise(7), shares = new Set<number>(); let lo = 1, hi = 0;
    for (let k = 0; k < 400; k++) { const x = 300 + k * 0.37, y = 200 + k * 0.91, n = fbm(noise, x / b.grain, y / b.grain, 3), s = slopeShares(10, n, b).hill; shares.add(Math.round(s * 50)); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    assert.ok(shares.size > 15 && lo < 0.25 && hi > 0.75, `${shares.size} different shares between ${lo.toFixed(2)} and ${hi.toFixed(2)}`);
  });
  it('reliefMaxSlope tells a chunk with hills from flat ground and never reads less than the surface has', () => {
    const f = field(plane(0.4, true)), flat = field(() => 0), land = layer(plane(0.4, false), 500, 500, 80);
    assert.ok(reliefMaxSlope({ course: flat, land: null }, box(500, 500, 30)) <= 1 + 1e-9, 'flat ground: at most the margin');
    const deg = Math.atan(0.4) * 180 / Math.PI; assert.ok(reliefMaxSlope({ course: f, land: null }, box(500, 500, 30)) >= deg - 0.01); assert.ok(reliefMaxSlope({ course: flat, land }, box(500, 500, 30)) >= deg - 0.01);
    assert.ok(reliefMaxSlope({ course: null, land: null }, box(500, 500, 30)) === 0);
  });
  it('the surfaces file\'s numbers are held to their ranges, the rock never below the hillside, and missing ones are the defaults', () => {
    assert.deepEqual(clampRelief(null), RELIEF_BANDS_DEFAULT); assert.deepEqual(clampRelief({}), RELIEF_BANDS_DEFAULT); assert.deepEqual(clampRelief('x'), RELIEF_BANDS_DEFAULT);
    const c = clampRelief({ hillAt: 500, rockAt: -3, blend: 0, noise: 99, grain: 'x' });
    assert.equal(c.hillAt, RELIEF_RANGES.hillAt[1]); assert.ok(c.rockAt >= c.hillAt + 1); assert.equal(c.blend, RELIEF_RANGES.blend[0]); assert.equal(c.noise, RELIEF_RANGES.noise[1]); assert.equal(c.grain, RELIEF_BANDS_DEFAULT.grain);
    assert.deepEqual(clampRelief({ hillAt: 12, rockAt: 30, blend: 4, noise: 2, grain: 9 }), { hillAt: 12, rockAt: 30, blend: 4, noise: 2, grain: 9 });
    // the file the game ships names them, and they pass as they are (the owner tunes them there)
    assert.deepEqual(clampSurfaces(surfacesFile).relief, clampRelief((surfacesFile as { relief?: unknown }).relief)); assert.deepEqual((surfacesFile as { relief: ReliefBands }).relief, { ...RELIEF_BANDS_DEFAULT });
    assert.equal(clampSurfaces({}).relief, undefined, 'a file without them stays without (the defaults then)');
  });
});

describe('the Hillside and Mountain rock surfaces (art slots with stand-ins)', () => {
  it('are surfaces of the Map group with their own texture ids, listed once, and the studio files them as art slots', () => {
    const h = SURFACES.find(s => s.key === 'hillside')!, m = SURFACES.find(s => s.key === 'mountain')!;
    assert.deepEqual([h.tex, h.group, h.slot], [[HILLSIDE], 'Map', true]); assert.deepEqual([m.tex, m.group, m.slot], [[MOUNTAIN], 'Map', true]);
    assert.equal(SURFACES.filter(s => s.tex.includes(HILLSIDE) || s.tex.includes(MOUNTAIN)).length, 2);
    const f = clampSurfaces(surfacesFile);
    assert.equal(lookOfTex(HILLSIDE, f)!.family, 'dirt-run'); assert.ok(familyById(lookOfTex(MOUNTAIN, f)!.family), 'the rock stand-in names a family the game has');
  });
  it('every stand-in names a family the game has (the surfaces file\'s looks, and the desert theme\'s)', () => {
    const f = clampSurfaces(surfacesFile), d = desertSurfaces(f);
    for (const file of [f, d]) for (const k of ['hillside', 'mountain']) { const l = file.surfaces[k]; assert.ok(l, `${k} has a look`); assert.ok(familyById(l!.family), `${k}: ${l!.family}`); }
    assert.equal(d.surfaces.hillside!.family, 'dirt-run', 'the desert\'s hillside is the dirt tiles (crisp), over the open sand');
    assert.notDeepEqual(d.surfaces.mountain, f.surfaces.mountain, 'sandstone, redder than the autumn\'s pale rock');
  });
  it('the course, the farms and the golf surfaces are not touched by the desert\'s slope looks', () => {
    const f = clampSurfaces(surfacesFile), d = desertSurfaces(f);
    for (const k of ['green', 'fairway', 'rough', 'bunker', 'water', 'fieldPloughed']) assert.deepEqual(d.surfaces[k], f.surfaces[k]);
  });
});

describe('the ground painter lays the slope materials under everything that keeps its own ground (the owner: water, the course\'s surfaces, roads, lots and farms only the natural ground)', () => {
  const src = readFileSync(resolve('src/game/renderer.ts'), 'utf8').replace(/\r\n/g, '\n');
  const at = (needle: string, from = 0) => { const i = src.indexOf(needle, from); assert.ok(i >= 0, `renderer.ts has "${needle}"`); return i; };
  const paintAt = at('  paint(i: number, j: number, L: number, lite = false): Cnv {');
  it('in paint: the Hillside and the Mountain rock go down after the map grass, the meadow and the woods, before the rivers\' banks and water, the lots, the painted areas and the roads', () => {
    const slopes = at("slopeLayer(sm?.hill, HILLSIDE); slopeLayer(sm?.rock, MOUNTAIN);", paintAt);
    assert.ok(slopes > at("const woods = classAlpha(this.terrain, TC.HILL", paintAt), 'after the woods');
    for (const later of ["layer('water', g => shore(g, rivers, 0, 0.3), water)", "const drawLots = (list: LotPatch[]) =>", "this.drawPaints(ctx, paints, L", "// ---- 2. verges (gravel) and sidewalks", "// ---- 5. asphalt"]) assert.ok(slopes < at(later, paintAt), `before ${later}`);
  });
  it('the relief light lies over the lots and the painted areas (the course keeps its surfaces and gains the light) and under the roads, as the course height\'s light does', () => {
    const light = at("else { const rg = relief(); if (rg) this.heightLightOnMap(ctx, rg, M, W, H, L, box, RELIEF_LOOK); }", paintAt);
    assert.ok(light > at("this.drawPaints(ctx, paints, L", paintAt) && light < at("// ---- 1a''''. the living ground", paintAt) && light < at("// ---- 2. verges (gravel) and sidewalks", paintAt));
  });
  it('the old look is the old code: ?relief=old lays the rock and the T126 light exactly as before, and a game with no relief mode asks for no slope picture', () => {
    assert.ok(src.includes("this.relief === 'old') { const hl = heightLightGrid(this.courseH, box, lite ? 1 : 2, this.landL, this.landClassic)"));
    assert.ok(src.includes("else { const ra = rockAlpha(this.slope, tx0, ty0, bw, bh, cres, this.edgeNoise); if (ra) layer('rock', g => overlay(g, ra, cres)); }"));
    assert.ok(src.includes("if (this.relief === 'old' || !this.tex.paintedOn) return { hill: false, rock: false };"));
  });
  it('the worker asks for the slope pictures only where a slope reaches them', () => {
    const w = readFileSync(resolve('src/game/ground.worker.ts'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(w.includes('const rn = painter.reliefNeeds(box); if (rn.hill) need.add(HILLSIDE); if (rn.rock) need.add(MOUNTAIN);'));
  });
});

describe('the plumbing: the look of the hills reaches every worker (the gear menu, ?relief=, the cache, the worker, the painter)', () => {
  const read = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');
  it('the engine keeps the mode (saved, and the dev server\'s ?relief= for the A/B), tells the cache, and the gear menu has the select', () => {
    const e = read('src/game/engine.ts'), a = read('src/App.tsx');
    assert.ok(e.includes("localStorage.getItem('capitalempire.relief')") && e.includes("localStorage.setItem('capitalempire.relief', m)"), 'saved across reloads');
    assert.ok(e.includes("get('relief'))") && e.includes('import.meta.env.DEV && v) this.reliefMode = v'), '?relief= on the dev server only');
    assert.ok(e.includes('this.ground.relief = this.reliefMode;') && e.includes('this.ground.setRelief(m); this.emit();'));
    assert.ok(a.includes('data-testid="hill-relief"') && a.includes('game.setRelief(e.target.value'), 'the gear menu\'s Hill relief');
    for (const m of ['bands', 'smooth', 'old']) assert.ok(a.includes(`<option value="${m}">`), `the select offers ${m}`);
  });
  it('the cache sends it with init and on a change (every chunk baked again), the worker passes it to its painter, the protocol types it', () => {
    const c = read('src/game/ground-cache.ts'), w = read('src/game/ground.worker.ts'), p = read('src/game/ground-protocol.ts');
    assert.ok(c.includes("this.broadcast({ t: 'relief', mode: this.relief })"), 'sent with init');
    assert.ok(/setRelief\(m: ReliefMode\) \{ if \(m === this\.relief\) return; this\.relief = m; this\.broadcast\(\{ t: 'relief', mode: m \}\); this\.invalidateAll\(\); \}/.test(c), 'a change bakes every chunk again');
    assert.ok(w.includes("case 'relief': painter.relief = m.mode; break;")); assert.ok(p.includes("| { t: 'relief'; mode: ReliefMode }"));
  });
  it('the default look is the smooth one (the A/B shots: 4 bands turn a broad gentle slope into a spotlight blob), bands and old one select away, and every mode is a ReliefMode', () => {
    for (const m of ['old', 'smooth', 'bands'] as const) assert.equal(reliefModeOf(m), m);
    assert.equal(RELIEF_DEFAULT, 'smooth'); assert.ok(bandsOf('bands') > 0 && bandsOf('smooth') === 0 && bandsOf('old') === 0);
  });
});
