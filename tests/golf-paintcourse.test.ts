// The golf course's Paint areas (golf/paintcourse.ts): the clip to a box, the old nine cut into cells, the surfaces' textures and paint order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, clipToBox, courseAreas, SURFACE_TEX } from '../src/game/golf/paintcourse';
import { generateOldNine } from '../src/game/golf/coursegen';
import { checkArea, polyArea, polyBox } from '../src/game/paint';
import { surfacePreset } from '../src/game/paint-presets';
/** the texture the course paints a surface with: the owner's preset for it when there is one (paint-presets surfacePreset), else its own */
const texOf = (s: keyof typeof SURFACE_TEX) => surfacePreset(s) ?? SURFACE_TEX[s].tex;

/** a 300 x 450 tile site (600 x 900 m), away from the origin */
const SITE = { x0: 1000, y0: 1000, x1: 1300, y1: 1450 };
/** a 240 x 360 tile site, offset to (500, 500) */
const SMALL = { x0: 500, y0: 500, x1: 740, y1: 860 };

/** the sum of |polyArea| over the outlines */
function areaSum(ps: { pts: number[] }[]): number {
  return ps.reduce((s, p) => s + Math.abs(polyArea(p.pts)), 0);
}

/** the (tex, radius) of each area with equal neighbours merged: the surfaces' order and styles */
function runs(ss: { tex: string; radius: number }[]): string[] {
  const out: string[] = [];
  for (const s of ss) { const k = `${s.tex}/${s.radius}`; if (out[out.length - 1] !== k) out.push(k); }
  return out;
}

/** every area passes checkArea and fits in one cell */
function assertValid(areas: { pts: number[] }[]) {
  for (const a of areas) {
    assert.equal(checkArea(a.pts), '', `invalid outline ${a.pts.join(' ')}`);
    const b = polyBox(a.pts);
    assert.ok(b[2] - b[0] <= CELL && b[3] - b[1] <= CELL, `box ${b.join(' ')}`);
  }
}

test('clipToBox: a square half outside is cut to its inside half; fully outside gives []; fully inside is unchanged', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.deepEqual(clipToBox(sq, 5, -5, 20, 20), [5, 0, 10, 0, 10, 10, 5, 10]);
  assert.deepEqual(clipToBox(sq, 20, 20, 30, 30), []);
  assert.deepEqual(clipToBox(sq, -5, -5, 20, 20), sq);
  // a diagonal edge crosses the box's top and right sides: the triangle's part inside the 5 x 5 box is the box itself
  assert.equal(Math.abs(polyArea(clipToBox([0, 0, 10, 0, 0, 10], 0, 0, 5, 5))), 25);
});

test('courseAreas on the old nine: all valid and at most CELL, the rough tiles the site, surfaces in paint order', () => {
  const lay = generateOldNine(SITE, 7);
  const stats = { dropped: 0 };
  const areas = courseAreas(lay, stats);
  assertValid(areas);
  assert.equal(stats.dropped, 0);
  // the rough is the whole site: 2 x 3 cells, row by row, and its area is the site's
  const rough = areas.filter(a => a.tex === texOf('rough'));
  assert.equal(rough.length, 6);
  assert.ok(Math.abs(areaSum(rough) - 300 * 450) <= 0.01 * 300 * 450, `rough ${areaSum(rough)}`);
  assert.deepEqual(polyBox(rough[0].pts), [1000, 1000, 1200, 1200]);
  assert.deepEqual(polyBox(rough[1].pts), [1200, 1000, 1300, 1200]);
  // all rough pieces come first
  assert.ok(areas.slice(0, rough.length).every(a => a.tex === texOf('rough')));
  // the same surfaces, in the same order, with the same textures and radii as the layout
  // a surface the owner has a texture preset for is painted with it (paint-presets surfacePreset), the others with their own texture
  assert.deepEqual(runs(areas), runs(lay.areas.map(a => ({ ...SURFACE_TEX[a.surface], tex: surfacePreset(a.surface) ?? SURFACE_TEX[a.surface].tex }))));
  // each green comes after its fringe
  let fr = 0, gr = 0;
  for (const a of areas) {
    if (a.tex === texOf('fringe')) fr++;
    else if (a.tex === texOf('green')) { gr++; assert.ok(fr >= gr, `green ${gr} before its fringe`); }
  }
  assert.equal(gr, 9);
});

test('seeds 1 to 5 on the old nine and on a 240 x 360 site: all areas valid, none dropped, the rough tiles the site', () => {
  for (const site of [SITE, SMALL]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const stats = { dropped: 0 };
      const areas = courseAreas(generateOldNine(site, seed), stats);
      assertValid(areas);
      assert.equal(stats.dropped, 0, `seed ${seed}`);
      const rough = areas.filter(a => a.tex === texOf('rough'));
      const want = (site.x1 - site.x0) * (site.y1 - site.y0);
      assert.ok(Math.abs(areaSum(rough) - want) <= 0.01 * want, `seed ${seed} rough ${areaSum(rough)}`);
    }
  }
});
