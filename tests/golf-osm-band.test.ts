// T445 (src/game/golf/osm/band.ts): a downloaded course's rough is a band beside its play, not a blanket. On a made-up course (one fairway square and a
// hole line, inside a boundary of rough): rough beside the fairway, long grass only in the band's outer metres, the land's own ground beyond; the edge
// wobbles; a land with no holes keeps its rough. Woodhill: most of its blanket rough goes back to the land.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { makeGrid, SURF, CELL_T } from '../src/game/ext/course-grid';
import { osmCourseToSpec } from '../src/game/golf/osm/convert';
import { paintSpec } from '../src/game/golf/osm/raster';
import { EDGE_WOBBLE_M, LONG_M, ROUGH_M } from '../src/game/golf/osm/band';
import type { OsmCourseJson, OsmCourseSpec } from '../src/game/golf/osm/types';

const sqr = (x: number, y: number, s: number) => [x, y, x + s, y, x + s, y + s, x, y + s];
const count = (a: Uint8Array, v: number): number => { let c = 0; for (const x of a) if (x === v) c++; return c; };
/** a 200 x 200 tile land: a boundary of rough over all of it, a fairway square of 20 tiles (40 m) at (90, 90), and a hole line north from it */
function made(holes = true): OsmCourseSpec {
  const spec = osmCourseToSpec(woodhillJson as unknown as OsmCourseJson, { id: 'woodhill' });
  return { ...spec, w: 200, h: 200, areas: [{ surf: 'rough', hole: 0, rings: [sqr(0, 0, 200)] }, { surf: 'fairway', hole: 1, rings: [sqr(90, 90, 20)] }],
    holes: holes ? [{ ...spec.holes[0]!, line: [100, 90, 100, 30] }] : [] };
}
/** the surface of the cell metres m east of the fairway's east edge, on its middle row */
const eastOf = (g: ReturnType<typeof makeGrid>, m: number) => g.surf[Math.floor(100 / CELL_T) * g.w + Math.floor(110 / CELL_T) + Math.floor(m)]!;

describe('the rough band (T445)', () => {
  const g = makeGrid(0, 0, 400, 400);
  paintSpec(g, made(), 0, 0);
  it('is rough beside the fairway, long grass in its outer metres, and the land beyond', () => {
    for (let m = 0; m < ROUGH_M - EDGE_WOBBLE_M; m++) assert.equal(eastOf(g, m), SURF.rough, `${m} m out`);
    for (let m = ROUGH_M + LONG_M + EDGE_WOBBLE_M + 1; m < 60; m++) assert.equal(eastOf(g, m), SURF.none, `${m} m out`);
    let long = 0; for (let m = 0; m < 40; m++) if (eastOf(g, m) === SURF.longGrass) long++;
    assert.ok(long >= LONG_M - 2 * EDGE_WOBBLE_M && long <= LONG_M + 2 * EDGE_WOBBLE_M + 1, `${long} m of long grass`);
  });
  it('runs along the hole line too, and its edge is not a ruler line', () => {
    // across the hole line, 80 m north of the fairway: rough at the line, none far off
    const row = Math.floor(50 / CELL_T) * g.w, at = (xm: number) => g.surf[row + Math.floor(100 / CELL_T) + xm]!;
    assert.equal(at(0), SURF.rough); assert.equal(at(5), SURF.rough); assert.equal(at(40), SURF.none);
    // the band's outer edge along the line: where the long grass ends, row by row, is not the same everywhere
    const ends = new Set<number>();
    for (let y = 40; y < 160; y += 4) { const r = y * g.w + Math.floor(100 / CELL_T); let e = 0; for (let x = 0; x < 40; x++) if (g.surf[r + x] === SURF.longGrass) e = x; ends.add(e); }
    assert.ok(ends.size >= 3, `the edge wanders (${[...ends].join(', ')})`);
  });
  it('keeps the fairway, and a land with no holes keeps its rough', () => {
    assert.equal(count(g.surf, SURF.fairway), 40 * 40);
    const h = makeGrid(0, 0, 400, 400); paintSpec(h, made(false), 0, 0);
    assert.equal(count(h.surf, SURF.longGrass), 0); assert.ok(count(h.surf, SURF.rough) > 150000);
  });
  it('is the same every time', () => {
    const h = makeGrid(0, 0, 400, 400); paintSpec(h, made(), 0, 0);
    assert.deepEqual(h.surf, g.surf);
  });
  it('Woodhill: the blanket goes, a band stays beside every fairway', () => {
    const spec = osmCourseToSpec(woodhillJson as unknown as OsmCourseJson, { id: 'woodhill' }), w = makeGrid(0, 0, spec.w * 2, spec.h * 2);
    const laid = paintSpec(w, spec, 0, 0), fair = count(w.surf, SURF.fairway), rough = count(w.surf, SURF.rough), long = count(w.surf, SURF.longGrass);
    assert.equal(laid.rough, rough);
    assert.ok(rough + long < 0.3 * w.surf.length * 0.5, `rough ${rough} and long grass ${long} of ${w.surf.length} cells`);
    assert.ok(rough > fair && long > 0.2 * rough * 0.5, 'a band, with long grass at its edge');
  });
});
