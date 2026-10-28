/** Tests for T253 (#735) Round off: a course surface's outline smoothed by a wider droplet kernel (course-blobs ROUND_*), saved with its look,
 * per owner (a hole's look rounds its own cells), and the lie test following the drawn shape (DrawnSurfaces). Pure, Node. Units: tiles of 2 m,
 * cells of 1 m; areas in m² (cells). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOB_STYLE, DrawnSurfaces, chunkOutlines, roundCornerM, roundRadius, type BlobStyle, type RoundOf, type SurfaceOutline } from '../src/game/ext/course-blobs/index.js';
import { makeGrid, SURF, type Grid } from '../src/game/ext/course-grid/index.js';
import { roundOfLooks, roundReach } from '../src/game/ext/course-grid/patch.js';
import { clampStyle, BRUSH_PRESETS } from '../src/game/paint.js';
import { courseLookSet, lookChanged, roundOfStyle } from '../src/game/course-look.js';
import { normalizeBook } from '../src/game/golf/looks.js';

const { rough: ROUGH, fairway: FAIRWAY, bunker: BUNKER, green: GREEN } = SURF;
/** the styles with no collars (the shape alone) */
const BARE: readonly BlobStyle[] = BLOB_STYLE.map(st => ({ close: st.close, relax: st.relax }));
const put = (g: Grid, i0: number, j0: number, i1: number, j1: number, s: number) => { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.surf[j * g.w + i] = s; };
const disc = (g: Grid, cx: number, cy: number, r: number, s: number) => { for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) g.surf[j * g.w + i] = s; };
/** the signed shoelace area of a flat ring */
const ringArea = (p: number[]) => { let a = 0; const m = p.length / 2; for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!; } return a / 2; };
/** a surface's drawn area in m² (tiles² x 4) in chunk (0, 0) */
const areaOf = (o: SurfaceOutline | undefined) => (o ? o.fill.reduce((s, r) => s + ringArea(r), 0) * 4 : 0);
/** every cell of surface s rounded at Smoothness sm */
const roundAll = (s: number, sm: number): RoundOf => { const r = roundRadius(sm); return t => (t === s ? () => r : null); };
const outline = (g: Grid, s: number, round: RoundOf | null, cx = 0, cy = 0, styles = BARE) => chunkOutlines(g, cx, cy, 64, styles, false, round).find(o => o.surf === s);

/** the painted shapes: a kidney of three round-brush dabs, discs, a square, a large rectangle */
const SHAPES: [string, (g: Grid) => void][] = [
  ['kidney (three round dabs)', g => { disc(g, 50, 60, 5, BUNKER); disc(g, 58, 57, 4, BUNKER); disc(g, 64, 62, 4.5, BUNKER); }],
  ['a 12 m disc', g => disc(g, 64, 64, 6, BUNKER)],
  ['a 6 m disc', g => disc(g, 64, 64, 3, BUNKER)],
  ['a 10 m square', g => put(g, 40, 40, 49, 49, BUNKER)],
  ['a 40 x 30 m block', g => put(g, 30, 30, 69, 59, BUNKER)],
];

test('Round off keeps a painted shape\'s size within 5% of its droplet outline at every Smoothness, and a 3 m bunker survives', () => {
  for (const [name, paint] of SHAPES) {
    const g = makeGrid(0, 0, 128, 128); paint(g);
    const a0 = areaOf(outline(g, BUNKER, null));
    for (const sm of [0, 0.5, 1]) {
      const a = areaOf(outline(g, BUNKER, roundAll(BUNKER, sm))), d = a / a0 - 1;
      console.log(`  ${name}: Smoothness ${sm}: ${(100 * d).toFixed(1)}% (${a.toFixed(1)} of ${a0.toFixed(1)} m²)`);
      assert.ok(Math.abs(d) <= 0.05, `${name} at ${sm}: ${(100 * d).toFixed(1)}%`);
    }
  }
  const g = makeGrid(0, 0, 128, 128); put(g, 40, 40, 42, 42, BUNKER);
  const a0 = areaOf(outline(g, BUNKER, null)), a = areaOf(outline(g, BUNKER, roundAll(BUNKER, 1)));
  assert.ok(a > 0.8 * a0, `a 3 x 3 m bunker at full Smoothness keeps ${(100 * a / a0).toFixed(0)}%`);
  const s = makeGrid(0, 0, 128, 128); put(s, 40, 40, 59, 40, BUNKER);
  assert.ok(areaOf(outline(s, BUNKER, roundAll(BUNKER, 1))) > 0.8 * areaOf(outline(s, BUNKER, null)), 'a one-cell strip stays');
});

test('the steps go: a 1:2 staircase edge lies within 6 cm of a straight line rounded, the droplet wobbles more', () => {
  const g = makeGrid(0, 0, 128, 128);
  // a wide band whose lower edge is a 1:2 staircase (two cells across, one down)
  for (let k = 0; k < 30; k++) put(g, 10 + 2 * k, 10, 11 + 2 * k, 20 + k, BUNKER);
  const dev = (o: SurfaceOutline) => {
    // the lower edge between x = 30 and 60 cells, sampled every 0.1 cell (its lowest crossing of a vertical line), against the fitted line
    const pts: [number, number][] = [];
    for (let x = 30; x <= 60; x += 0.1) {
      let lo = -Infinity;
      for (const r of o.fill) for (let k = 0, m = r.length / 2; k < m; k++) {
        const q = (k + 1) % m, ax = r[2 * k]! * 2, ay = r[2 * k + 1]! * 2, bx = r[2 * q]! * 2, by = r[2 * q + 1]! * 2;
        if ((ax <= x) !== (bx <= x)) lo = Math.max(lo, ay + ((x - ax) / (bx - ax)) * (by - ay));
      }
      pts.push([x, lo]);
    }
    const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return Math.max(...pts.map(p => Math.abs(p[1] - (my + b * (p[0] - mx))) / Math.hypot(1, b)));
  };
  const d0 = dev(outline(g, BUNKER, null)!), d1 = dev(outline(g, BUNKER, roundAll(BUNKER, 0.5))!);
  console.log(`  1:2 staircase: droplet ${(100 * d0).toFixed(1)} cm, rounded ${(100 * d1).toFixed(1)} cm off a straight line`);
  assert.ok(d1 <= 0.06, `rounded ${d1}`);
  assert.ok(d1 < d0 / 2, `rounded ${d1} vs droplet ${d0}`);
});

test('Smoothness sets the corner: a square\'s corner rounds by more as it rises (1.5 m to 3.7 m, as the slider reads)', () => {
  const g = makeGrid(0, 0, 128, 128); put(g, 30, 30, 69, 69, BUNKER);
  let last = 0;
  for (const sm of [0, 0.5, 1]) {
    const o = outline(g, BUNKER, roundAll(BUNKER, sm))!;
    // the outline's point on the corner's diagonal (the corner is cell (30, 30), tile (15, 15))
    let best = Infinity, d = 0;
    for (const r of o.fill) for (let k = 0; k < r.length; k += 2) { const x = r[k]!, y = r[k + 1]!; if (x < 20 && y < 20 && Math.abs(x - y) < best) { best = Math.abs(x - y); d = Math.hypot(x - 15, y - 15) * 2; } }
    const rad = d / (Math.SQRT2 - 1);
    console.log(`  Smoothness ${sm}: corner radius ${rad.toFixed(2)} m (the slider says ${roundCornerM(sm).toFixed(1)} m)`);
    assert.ok(Math.abs(rad - roundCornerM(sm)) < 0.5, `corner ${rad} vs ${roundCornerM(sm)}`);
    assert.ok(rad > last); last = rad;
  }
});

test('deterministic, and a rounded blob across a chunk border meets itself exactly on the seam', () => {
  const g = makeGrid(0, 0, 260, 100);
  disc(g, 128, 50, 9, BUNKER); disc(g, 136, 44, 6, BUNKER); put(g, 120, 30, 135, 34, BUNKER);
  const round = roundAll(BUNKER, 0.8);
  const A = outline(g, BUNKER, round, 0, 0)!, B = outline(g, BUNKER, round, 1, 0)!;
  assert.deepEqual(outline(g, BUNKER, round, 0, 0), A, 'the same twice');
  const ends = (o: SurfaceOutline) => o.edges.flatMap(p => [0, p.length - 2].filter(k => Math.abs(p[k]! - 64) < 1e-9).map(k => [p[k]!, p[k + 1]!]));
  const ea = ends(A), eb = ends(B);
  assert.ok(ea.length > 0 && ea.length === eb.length, `${ea.length} ends and ${eb.length}`);
  let worst = 0;
  for (const [x, y] of ea) worst = Math.max(worst, Math.min(...eb.map(([u, v]) => Math.hypot(u! - x!, v! - y!))));
  assert.ok(worst <= 1e-6, `the seam's ends miss by ${worst} tiles`);
});

test('old looks are not rounded: no round field, no Round off; the outlines are the droplets\' exactly', () => {
  const g = makeGrid(0, 0, 128, 128); put(g, 40, 40, 49, 49, BUNKER); disc(g, 70, 70, 8, GREEN); put(g, 10, 10, 100, 30, FAIRWAY);
  // a look saved before T253 (no round, no smooth) stays without them
  // (the bunker's preset is rounded by default since 2026-10-29: the old look is it without the two fields)
  const old = { ...BRUSH_PRESETS.find(b => b.kind === 'bunker')!.style }; delete old.round; delete old.smooth;
  assert.equal(clampStyle({ ...old }).round, undefined);
  assert.equal(roundOfStyle(clampStyle({ ...old })), undefined);
  const book = normalizeBook({ h1: { bunker: { ...old } } })!;
  // a hole's bunker look saved without Round off takes the bunker's default since 2026-10-29 (normalizeBook fills it from the preset)
  assert.equal(book.h1!.bunker!.round, true);
  // unticked, it stays off: the look keeps round: false, so the default does not tick it again on a load
  const off = normalizeBook({ h1: { bunker: clampStyle({ ...old, round: false }) } })!;
  assert.equal(off.h1!.bunker!.round, false);
  assert.equal(roundOfStyle(off.h1!.bunker!), undefined);
  const set = courseLookSet({ bunker: { style: clampStyle({ ...old }) } }, (_s, o) => ({ tex: o, sc: 1, a: 0 }));
  assert.equal(set.round, undefined, 'a look set with no Round off carries no round');
  assert.equal(roundOfLooks(g, { round: set.round }), null);
  assert.equal(roundReach({}), 0);
  // the outlines with no Round off are those of the droplet code path, bit for bit
  assert.deepEqual(chunkOutlines(g, 0, 0, 64, BLOB_STYLE, true), chunkOutlines(g, 0, 0, 64, BLOB_STYLE, true, null));
  assert.deepEqual(chunkOutlines(g, 0, 0, 64, BLOB_STYLE, false), chunkOutlines(g, 0, 0, 64, BLOB_STYLE, false, () => null));
});

test('Round off is saved with the look: ticked and its Smoothness kept, unticked keeps the slider, and a change redraws', () => {
  const b = BRUSH_PRESETS.find(p => p.kind === 'bunker')!.style;
  const on = clampStyle({ ...b, round: true, smooth: 0.734 });
  assert.equal(on.round, true); assert.equal(on.smooth, 0.73);
  assert.equal(roundOfStyle(on), 0.73);
  const off = clampStyle({ ...on, round: false });
  assert.equal(off.round, false, 'unticked is kept (the bunker's default would tick it again)'); assert.equal(off.smooth, 0.73, 'the slider is kept');
  assert.equal(roundOfStyle(off), undefined);
  assert.ok(lookChanged(on, off) && lookChanged(on, { ...on, smooth: 0.2 }), 'a change to either redraws the course');
  const saved = normalizeBook(JSON.parse(JSON.stringify({ h3: { bunker: on } })))!;
  assert.equal(saved.h3!.bunker!.round, true); assert.equal(saved.h3!.bunker!.smooth, 0.73);
  const set = courseLookSet({ bunker: { style: on }, green: { style: clampStyle({ ...BRUSH_PRESETS.find(p => p.kind === 'green')!.style, round: true }) } }, (_s, o) => ({ tex: o, sc: 1, a: 0 }));
  assert.equal(set.round?.[BUNKER], 0.73); assert.equal(set.round?.[GREEN], 0.5, 'the default Smoothness'); assert.equal(set.round?.[FAIRWAY], undefined);
});

test('each owner\'s look rounds its own cells: hole 1\'s bunkers rounded, hole 2\'s not', () => {
  const g = makeGrid(0, 0, 128, 128);
  put(g, 20, 20, 29, 29, BUNKER); put(g, 80, 20, 89, 29, BUNKER);
  for (let j = 20; j <= 29; j++) for (let i = 20; i <= 29; i++) g.hole[j * g.w + i] = 1;
  for (let j = 20; j <= 29; j++) for (let i = 80; i <= 89; i++) g.hole[j * g.w + i] = 2;
  const own = { looks: [{ surf: [], collar: {} as never, band: [], round: [undefined, undefined, undefined, undefined, undefined, undefined, 1] }], hole: [-1, 0, -1] };
  const round = roundOfLooks(g, { own })!;
  assert.ok(round, 'some look rounds');
  const r = round(BUNKER)!;
  assert.equal(r(25 * g.w + 25), roundRadius(1)); assert.equal(r(25 * g.w + 85), 0);
  assert.equal(round(GREEN), null, 'no look rounds a green');
  // hole 1's square has lost its stepped corner, hole 2's still has its droplet corner
  const o = outline(g, BUNKER, round)!, d = outline(g, BUNKER, null)!;
  const near = (rings: number[][], x: number, y: number) => Math.min(...rings.flatMap(q => { const out: number[] = []; for (let k = 0; k < q.length; k += 2) out.push(Math.hypot(q[k]! - x, q[k + 1]! - y)); return out; }));
  assert.ok(near(o.fill, 10, 10) > near(d.fill, 10, 10) + 0.2, 'hole 1 rounder');
  assert.ok(Math.abs(near(o.fill, 40, 10) - near(d.fill, 40, 10)) < 1e-9, 'hole 2 as before');
});

test('the lie follows the drawn shape: a rounded bunker\'s cut corner plays as the rough around it, its inside and the course far off as their cells', () => {
  const g = makeGrid(0, 0, 128, 128);
  put(g, 0, 0, 127, 127, ROUGH); put(g, 40, 40, 59, 59, BUNKER); put(g, 90, 40, 99, 49, BUNKER);
  const ds = new DrawnSurfaces(g, BLOB_STYLE, s => (s === BUNKER ? (c => (c % g.w < 70 ? roundRadius(1) : 0)) : null));
  const T = (i: number, j: number) => [g.x0 + i * 0.5, g.y0 + j * 0.5] as const;
  assert.equal(ds.at(...T(50, 50)), BUNKER, 'the middle of the bunker');
  assert.equal(ds.at(...T(40.2, 40.2)), ROUGH, 'the corner Round off cut away plays as the rough drawn there');
  assert.equal(ds.at(...T(10, 10)), ROUGH, 'far off: the cell');
  assert.equal(ds.at(...T(40.5, 50)), BUNKER, 'a straight edge stays where the cells are');
  assert.equal(ds.at(...T(90.2, 40.2)), BUNKER, 'the unrounded bunker\'s corner cell is its cell, as before');
  assert.equal(ds.at(...T(89.5, 45)), ROUGH);
  // every point well inside a cell away from the rounded bunker reads its cell
  for (let j = 0; j < 128; j += 7) for (let i = 0; i < 128; i += 7) if (i < 30 || i > 70 || j < 30 || j > 70) assert.equal(ds.at(...T(i + 0.5, j + 0.5)), g.surf[j * g.w + i], `cell ${i}, ${j}`);
});

test('speed: a rounded chunk (a fairway with bunkers and a green, all rounded) contours within a few times the droplets\' (logged)', () => {
  const g = makeGrid(0, 0, 160, 160);
  put(g, 0, 0, 159, 159, ROUGH); put(g, 10, 30, 150, 110, FAIRWAY); disc(g, 120, 70, 16, GREEN);
  for (let k = 0; k < 8; k++) disc(g, 30 + 14 * k, 25 + (k % 2) * 90, 4 + (k % 3), BUNKER);
  const all: RoundOf = s => (s ? () => roundRadius(0.6) : null);
  const time = (round: RoundOf | null) => { chunkOutlines(g, 0, 0, 64, BLOB_STYLE, true, round); const t0 = performance.now(); for (let i = 0; i < 3; i++) chunkOutlines(g, 0, 0, 64, BLOB_STYLE, true, round); return (performance.now() - t0) / 3; };
  const t0 = time(null), t1 = time(all);
  console.log(`  a chunk: droplets ${t0.toFixed(1)} ms, every surface rounded at 60% ${t1.toFixed(1)} ms`);
  assert.ok(t1 < 400, `${t1} ms`);
});
