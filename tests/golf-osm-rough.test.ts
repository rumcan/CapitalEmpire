// T362 (#1017; the owner, 2026-11-08: "add a layer of rough around the edges of the fairway and greens for the imported course but leave the rest of the course the natural
// fescue or desert"): the ground of a map-data course. The boundary is the course's wild land (natural fescue, or the land's own desert ground in a desert game), a band of
// rough goes round every fairway, green and tee (its widths are data: golf/osm/types.ts OSM_ROUGH_BAND_M, a fixture's meta.roughBandM, the converter's roughBandM), and the
// first 3 m of the band play as the first cut. The rough is laid by the raster (raster.ts paintSpec), the converter only says what land and what widths. Pure: no network, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { osmCourseToSpec, specOf } from '../src/game/golf/osm';
import { roughBandOf } from '../src/game/golf/osm/convert';
import { paintSpec, type PaintOptions } from '../src/game/golf/osm/raster';
import { gridBuildCost, scratchOf } from '../src/game/golf/osm/placegrid';
import { RealPlacer, type RealHost } from '../src/game/golf/osm/placer';
import { planOsmGame } from '../src/game/golf/osm/start';
import { rotateSpec } from '../src/game/golf/osm/rotate';
import { OSM_CREDIT, OSM_ROUGH_BAND_M, OSM_ROUGH_BAND_MAX_M, type OsmCourseJson, type OsmCourseSpec } from '../src/game/golf/osm/types';
import { CELL_T, SURF, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { SURF_SURFACE } from '../src/game/ext/course-grid/areas';
import { FIRST_CUT_TILES, makeCourseView } from '../src/game/golf/play/courseview';
import type { Hole } from '../src/game/golf/holes';
import { TILE_M } from '../src/game/golf/types';

const ronde = rondeboschJson as unknown as OsmCourseJson, magnolia = magnoliaJson as unknown as OsmCourseJson, woodhill = woodhillJson as unknown as OsmCourseJson;
const NAMES = { place: '' };
const specR = specOf(ronde, { id: 'rondebosch', name: 'Rondebosch Golf Course', ...NAMES }), specM = specOf(magnolia, { id: 'magnolia-national', name: 'Magnolia National', ...NAMES });
const specWh = specOf(woodhill, { id: 'woodhill', name: 'Woodhill Country Club', ...NAMES });

// ---- a made-up one-hole course (metres, x east, y north): a tee, a 30 x 280 m fairway, a 20 x 20 m green, and the boundary a box round them ----
const sq = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const area = (outer: [number, number][], tags: Record<string, string> = {}) => ({ tags, polys: [{ outer, inner: [] as [number, number][][] }] });
function course(over: Partial<OsmCourseJson['features']> = {}, meta: OsmCourseJson['meta'] = {}, boundary: [number, number][] | null = sq(-45, -30, 90, 410)): OsmCourseJson {
  return {
    meta: { credit: OSM_CREDIT, ...meta },
    ...(boundary ? { boundary: area(boundary) } : {}),
    features: {
      hole: [{ tags: { golf: 'hole', ref: '1', par: '4' }, ref: 1, par: 4, line: [[0, 0], [0, 350]] }],
      tee: [area(sq(-5, -6, 10, 12))],
      fairway: [area(sq(-15, 40, 30, 280), { golf: 'fairway' })],
      green: [area(sq(-10, 340, 20, 20), { golf: 'green' })],
      ...over,
    },
  };
}

/** where the spec's frame lies on the test grid, tiles */
const ORG = 10;
/** a spec laid on a grid of its own (its frame at tile (ORG, ORG), ORG tiles of the grid round it), and `at(mx, my)`: the surface of the cell under the JSON's metre point */
function laid(spec: OsmCourseSpec, opt: PaintOptions = {}) {
  const g = makeGrid(0, 0, (spec.w + 2 * ORG) * 2, (spec.h + 2 * ORG) * 2);
  const counts = paintSpec(g, spec, ORG, ORG, opt);
  const tile = (mx: number, my: number) => ({ x: (mx - spec.originM[0]) / TILE_M + ORG, y: (spec.originM[1] - my) / TILE_M + ORG });
  const at = (mx: number, my: number): number => { const t = tile(mx, my), k = cellAt(g, t.x, t.y); return k >= 0 ? g.surf[k]! : -1; };
  return { g, at, tile, counts };
}
/** how many cells of rough lie in a row from metre x going east, the first cell being the one just past x (the cell centres at x + 0.5, x + 1.5, ...) */
function roughRun(at: (mx: number, my: number) => number, x: number, y: number, dir: 1 | -1 = 1): number {
  let n = 0;
  while (n < 80 && at(x + dir * (n + 0.5), y) === SURF.rough) n++;
  return n;
}
const count = (a: Uint8Array, v: number): number => { let c = 0; for (const x of a) if (x === v) c++; return c; };

describe('the band of rough round the fairways, greens and tees (T362)', () => {
  const spec = osmCourseToSpec(course(), { id: 't' });

  it('is the converter’s data: the spec says the widths, fairway 7 m, green 6 m, tee 5 m, each at least the 3 m the game plays as the first cut', () => {
    assert.deepEqual(spec.roughBand, { fairway: 7, green: 6, tee: 5 });
    assert.deepEqual(spec.roughBand, OSM_ROUGH_BAND_M);
    for (const k of ['fairway', 'green', 'tee'] as const) assert.ok(OSM_ROUGH_BAND_M[k] >= FIRST_CUT_TILES * TILE_M, `the ${k}'s band holds the first cut`);
  });

  it('lays each as wide as its width, to the cell, from the edge of the fairway, the tee and the green, and fescue past it', () => {
    const { at } = laid(spec);
    assert.equal(at(14.5, 180.5), SURF.fairway); assert.equal(at(4.5, 0.5), SURF.tee); assert.equal(at(9.5, 350.5), SURF.green);
    assert.equal(roughRun(at, 15, 180.5), 7, 'the fairway’s east edge');
    assert.equal(roughRun(at, -15, 180.5, -1), 7, 'and its west edge');
    assert.equal(roughRun(at, 10, 350.5), 6, 'the green');
    assert.equal(roughRun(at, 5, 0.5), 5, 'the tee');
    assert.equal(at(22.5, 180.5), SURF.fescue, 'past the fairway’s band: natural fescue');
    assert.equal(at(16.5, 350.5), SURF.fescue, 'past the green’s');
    assert.equal(at(10.5, 0.5), SURF.fescue, 'past the tee’s');
    // the ends of the fairway too (north is up the page, towards the green)
    let n = 0; while (at(0.5, 320 + n + 0.5) === SURF.rough && n < 40) n++;
    assert.equal(n, 7, 'the fairway’s far end');
  });

  it('rounds the corners: a cell off the fairway’s corner is in the band when its nearest point is within the width of the corner, as the true offset arc has it', () => {
    const { at } = laid(spec);
    // the north-east corner of the fairway is the point (15, 320). The cell centred (19.5, 324.5) reaches within 4.5 m east and 4.5 m north of it (6.4 m: in), the one at (20.5, 324.5) 5.5 and 4.5
    // (7.1 m: out), and the one at (19.5, 325.5) 4.5 and 5.5 (7.1 m: out); a staircase of the cells' centres would drop the first
    assert.equal(at(19.5, 324.5), SURF.rough);
    assert.equal(at(20.5, 324.5), SURF.fescue);
    assert.equal(at(19.5, 325.5), SURF.fescue);
    assert.equal(at(20.5, 325.5), SURF.fescue);
    assert.equal(at(21.5, 321.5), SURF.rough, 'and along the side, 6.5 m off');
  });

  it('leaves the other surfaces as they are: a bunker and a mapped rough area keep what they are, and the band goes on round them', () => {
    const s = osmCourseToSpec(course({ bunker: [area(sq(15, 100, 10, 10), { golf: 'bunker' })], rough: [area(sq(30, 100, 10, 10), { golf: 'rough' })] }), { id: 't' });
    const { at } = laid(s);
    assert.equal(at(16.5, 105.5), SURF.bunker, 'the bunker beside the fairway stays sand');
    assert.equal(at(16.5, 111.5), SURF.rough, 'and the band is there above it');
    assert.equal(at(35.5, 105.5), SURF.rough, 'a mapped rough area is rough');
    assert.equal(at(35.5, 120.5), SURF.fescue, 'and the land beside it fescue');
  });

  it('is the same in an old build’s way too: the `legacy` paint is T340’s, the whole boundary rough and no band', () => {
    const { at, counts, g } = laid(spec, { legacy: true });
    assert.equal(at(22.5, 180.5), SURF.rough); assert.equal(at(40.5, 180.5), SURF.rough);
    assert.equal(count(g.surf, SURF.fescue), 0);
    assert.ok(counts.wild > 0 && counts.rough === 0, JSON.stringify(counts));
  });

  it('lets the first 3 m of the band play as the first cut, the rest as rough, and the fescue past it as fescue (golf/play/courseview.ts)', () => {
    const { g, tile } = laid(spec);
    const hole: Hole = { n: 1, par: 4, lengthM: 350, memberLengthM: 330, line: [tile(0, 0), tile(0, 350)], warnings: [] };
    const view = makeCourseView([hole], (x, y) => { const k = cellAt(g, x, y); return k >= 0 ? SURF_SURFACE[g.surf[k]!] ?? null : null; });
    const kind = (d: number) => { const p = tile(15 + d, 180.5); return view.kindAt!(p.x, p.y); };
    assert.equal(kind(-1), 'fairway');
    for (const d of [0.5, 1.5, 2.5]) assert.equal(kind(d), 'firstcut', `${d} m out`);
    for (const d of [3.5, 4.5, 5.5, 6.5]) assert.equal(kind(d), 'rough', `${d} m out`);
    for (const d of [7.5, 9.5, 20.5]) assert.equal(kind(d), 'fescue', `${d} m out`);
  });
});

describe('the widths are data (T362)', () => {
  it('come from OSM_ROUGH_BAND_M, over it the fixture’s meta.roughBandM, over it the converter’s option; a bad width is ignored or kept in 0..20 m', () => {
    assert.deepEqual(roughBandOf(course()), OSM_ROUGH_BAND_M);
    const meta = { roughBandM: { green: 2, tee: 9 } };
    assert.deepEqual(roughBandOf(course({}, meta)), { fairway: 7, green: 2, tee: 9 });
    assert.deepEqual(roughBandOf(course({}, meta), { tee: 4, fairway: 12 }), { fairway: 12, green: 2, tee: 4 });
    assert.deepEqual(roughBandOf(course(), { fairway: NaN, green: -3, tee: 500 }), { fairway: 7, green: 0, tee: OSM_ROUGH_BAND_MAX_M });
  });

  it('are the ones the cells follow: a fixture’s 2 m for the greens and 9 m for the tees, the option’s 3 m for the fairways, and no band for a width of 0', () => {
    const s = osmCourseToSpec(course({}, { roughBandM: { green: 2, tee: 9 } }), { id: 't', roughBandM: { fairway: 3 } });
    assert.deepEqual(s.roughBand, { fairway: 3, green: 2, tee: 9 });
    const { at } = laid(s);
    assert.equal(roughRun(at, 15, 180.5), 3); assert.equal(roughRun(at, 10, 350.5), 2); assert.equal(roughRun(at, 5, 0.5), 9);
    const none = laid(osmCourseToSpec(course(), { id: 't', roughBandM: { fairway: 0, green: 0, tee: 0 } }));
    assert.equal(count(none.g.surf, SURF.rough), 0, 'no band at all');
    assert.equal(none.at(15.5, 180.5), SURF.fescue, 'the fescue runs to the fairway’s edge');
  });

  it('a spec made by hand with no widths has the defaults, and the same spec is the same every time', () => {
    const { roughBand: _gone, ...bare } = osmCourseToSpec(course(), { id: 't' });
    const a = laid(bare as OsmCourseSpec), b = laid(osmCourseToSpec(course(), { id: 't' }));
    assert.deepEqual(a.g.surf, b.g.surf);
    assert.deepEqual(osmCourseToSpec(course(), { id: 't' }), osmCourseToSpec(course(), { id: 't' }));
  });
});

describe('natural fescue, or the desert (T362)', () => {
  const spec = osmCourseToSpec(course(), { id: 't' });

  it('an autumn game’s land is fescue inside the boundary, and none outside it (the map’s own grass)', () => {
    const { at, g } = laid(spec);
    assert.equal(at(30.5, 180.5), SURF.fescue); assert.equal(at(-30.5, 100.5), SURF.fescue);
    assert.equal(at(50.5, 180.5), SURF.none, 'inside the land’s margin but outside the boundary');
    assert.ok(count(g.surf, SURF.fescue) > 10000);
  });

  it('a desert game’s land keeps the land’s own desert ground (the theme draws it): no fescue anywhere, the same rough band, fairways, tees and greens', () => {
    const a = laid(spec), d = laid(spec, { desert: true });
    assert.equal(count(d.g.surf, SURF.fescue), 0);
    assert.equal(d.at(30.5, 180.5), SURF.none); assert.equal(d.at(-30.5, 100.5), SURF.none);
    assert.equal(roughRun(d.at, 15, 180.5), 7); assert.equal(roughRun(d.at, 10, 350.5), 6); assert.equal(roughRun(d.at, 5, 0.5), 5);
    // every cell that is not fescue in the autumn game is the same in the desert one
    let same = 0, differ = 0;
    for (let i = 0; i < a.g.surf.length; i++) { if (a.g.surf[i] === SURF.fescue) continue; if (a.g.surf[i] === d.g.surf[i]) same++; else differ++; }
    assert.equal(differ, 0); assert.ok(same > 10000);
    assert.deepEqual(a.g.hole, d.g.hole, 'the holes of the cells are the same');
  });

  it('a mapped rough area stays rough in a desert game too', () => {
    const s = osmCourseToSpec(course({ rough: [area(sq(30, 100, 10, 10), { golf: 'rough' })] }), { id: 't' });
    assert.equal(laid(s, { desert: true }).at(35.5, 105.5), SURF.rough);
  });

  it('keeps the wild land inside the land (the spec’s frame): a boundary that runs far past the holes’ land is cut at it, where the land’s own margin ends', () => {
    const big = osmCourseToSpec(course({}, {}, sq(-300, -300, 600, 1000)), { id: 't' });
    const { at, g } = laid(big);
    assert.equal(at(50.5, 180.5), SURF.fescue, 'inside the frame (it reaches 55 m from the fairway’s middle)');
    assert.equal(at(60.5, 180.5), SURF.none, 'outside it, where the grid goes on');
    assert.equal(at(0.5, 408.5), SURF.none);
    let out = 0;
    for (let cy = 0; cy < g.h; cy++) for (let cx = 0; cx < g.w; cx++) {
      const x = g.x0 + (cx + 0.5) * CELL_T, y = g.y0 + (cy + 0.5) * CELL_T;
      if ((x < ORG || x >= ORG + big.w || y < ORG || y >= ORG + big.h) && g.surf[cy * g.w + cx]) out++;
    }
    assert.equal(out, 0, 'nothing is laid outside the frame');
  });

  it('lays a made-up fairway band over the course’s own land in a desert game too, and never outside the boundary', () => {
    const j = course({ fairway: [] }, {}, sq(-8, -30, 16, 410));
    const s = osmCourseToSpec(j, { id: 't' });
    assert.ok(s.areas.some(a => a.surf === 'fairway' && a.made && a.clip));
    for (const opt of [{}, { desert: true }, { legacy: true }] as PaintOptions[]) {
      const { at, g } = laid(s, opt);
      assert.equal(at(0.5, 180.5), SURF.fairway, JSON.stringify(opt));
      assert.notEqual(at(8.5, 180.5), SURF.fairway, `the band stops at the boundary ${JSON.stringify(opt)}`);
      assert.ok(count(g.surf, SURF.fairway) > 3000, JSON.stringify(opt));
    }
  });

  it('a course with only a boundary is all wild land: fescue (or the land’s own ground), no band, nothing else', () => {
    const s = osmCourseToSpec({ features: {}, boundary: area(sq(-100, -100, 200, 200)) } as OsmCourseJson, { id: 't' });
    assert.ok(s.areas.length === 1 && s.areas[0]!.surf === 'wild');
    assert.ok(count(laid(s).g.surf, SURF.fescue) > 30000);
    assert.equal(count(laid(s, { desert: true }).g.surf, SURF.none), laid(s, { desert: true }).g.surf.length);
  });
});

describe('the shipped courses’ ground (T362)', () => {
  for (const [name, spec] of [['Rondebosch', specR], ['Woodhill', specWh], ['Magnolia National', specM]] as const) {
    it(`${name}: the boundary is fescue past the bands, every fairway, tee and green is as it was, and no fescue lies within a band of one`, () => {
      const old = laid(spec, { legacy: true }), now = laid(spec), g = now.g;
      // the playing surfaces and the hazards are what they were
      let moved = 0;
      for (let i = 0; i < g.surf.length; i++) {
        const o = old.g.surf[i]!;
        if (o !== SURF.none && o !== SURF.rough && g.surf[i] !== o) moved++;
        if (o === SURF.none && g.surf[i] !== SURF.none && g.surf[i] !== SURF.rough) moved++;
      }
      assert.equal(moved, 0, 'only the natural ground changes');
      const fescue = count(g.surf, SURF.fescue), rough = count(g.surf, SURF.rough), oldRough = count(old.g.surf, SURF.rough);
      assert.ok(fescue > 20000, `${fescue} cells of fescue`);
      assert.ok(rough > 5000 && rough < oldRough, `${rough} cells of rough, ${oldRough} before`);
      // the wild land is the old rough land: no more than the band beyond the boundary is added
      assert.ok(fescue + rough >= oldRough * 0.97 && fescue + rough <= oldRough * 1.03, `${fescue + rough} against ${oldRough}`);
      // no cell of fescue within its band of a fairway, tee or green (the cells as squares: the nearest points of the two within the width)
      const R = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; R[SURF.fairway] = OSM_ROUGH_BAND_M.fairway; R[SURF.tee] = OSM_ROUGH_BAND_M.tee; R[SURF.green] = OSM_ROUGH_BAND_M.green;
      const gap = (d: number): number => Math.max(0, Math.abs(d) - 0.5);
      let near = 0, sampled = 0;
      for (let i = 0; i < g.surf.length; i += 53) {
        if (g.surf[i] !== SURF.fescue) continue;
        sampled++;
        const cx = i % g.w, cy = (i - cx) / g.w;
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
          const r = R[g.surf[y * g.w + x]!]!; if (r && gap(dx) ** 2 + gap(dy) ** 2 <= r * r) near++;
        }
      }
      assert.ok(sampled > 100, `${sampled} cells sampled`);
      assert.equal(near, 0, 'the band is whole');
    });
  }

  it('a legacy paint is T340’s: Rondebosch’s boundary rough is 286,702 cells, as before the band', () => {
    const { g } = laid(specR, { legacy: true });
    assert.equal(count(g.surf, SURF.rough), 286702);
    assert.equal(count(g.surf, SURF.fescue), 0);
  });

  it('a new game’s grid holds the natural ground inside the land only, fescue in an autumn game and none of it in a desert one', () => {
    for (const spec of [specR, specM, specWh]) {
      for (const desert of [false, true]) {
        const p = planOsmGame(spec, undefined, { desert })!, g = p.grid, [lx, ly, lw, lh] = p.land;
        let fescue = 0, out = 0;
        for (let cy = 0; cy < g.h; cy++) for (let cx = 0; cx < g.w; cx++) {
          if (g.surf[cy * g.w + cx] !== SURF.fescue) continue;
          fescue++;
          const x = g.x0 + (cx + 0.5) * CELL_T, y = g.y0 + (cy + 0.5) * CELL_T;
          if (x < lx || x >= lx + lw || y < ly || y >= ly + lh) out++;
        }
        assert.equal(out, 0, `${spec.id}: fescue outside the land`);
        if (desert) assert.equal(fescue, 0, `${spec.id}: a desert game paints no fescue`); else assert.ok(fescue > 20000, `${spec.id}: ${fescue} cells of fescue`);
      }
    }
  });

  it('the markers still stand on their surfaces: a pin on a green cell and a tee marker on a tee cell, in either game', () => {
    for (const desert of [false, true]) {
      const p = planOsmGame(specR, undefined, { desert })!, g = p.grid;
      for (const h of specR.holes) {
        const pin = h.pin, k = cellAt(g, pin.x + p.at.x, pin.y + p.at.y);
        assert.equal(g.surf[k], SURF.green, `hole ${h.n}`);
        for (const t of h.tees) assert.equal(g.surf[cellAt(g, t.x + p.at.x, t.y + p.at.y)], SURF.tee, `hole ${h.n}'s ${t.kind} tee`);
      }
    }
  });
});

describe('placing a course into a game under way (T362)', () => {
  it('lays the same ground and prices it as the game’s theme says: the desert’s natural ground costs nothing, fescue less than the rough it replaces', () => {
    const autumn = gridBuildCost(scratchOf(specR, 0, 0)), desert = gridBuildCost(scratchOf(specR, 0, 0, { desert: true })), old = gridBuildCost(scratchOf(specR, 0, 0, { legacy: true }));
    assert.ok(desert < autumn && autumn < old, `desert ${desert} < autumn ${autumn} < before ${old}`);
    assert.equal(count(scratchOf(specR, 0, 0, { desert: true }).surf, SURF.fescue), 0);
    // a turned course has the band all round it too (the price is the same, to the rim of the rasteriser)
    const turned = gridBuildCost(scratchOf(rotateSpec(specR, 90), 0, 0));
    assert.ok(Math.abs(turned - autumn) <= autumn * 0.01, `turned ${turned}, unturned ${autumn}`);
  });

  it('the placing mode prices it with the host’s paint (the game’s theme): a desert game’s course is cheaper than an autumn game’s', async () => {
    const price = async (paint?: RealHost['paint']): Promise<number> => {
      const h: RealHost = {
        map: 1024, revision: () => '0', centre: () => ({ x: 512, y: 512 }), toast: () => {}, emit: () => {}, enter: () => {}, holes: () => 0, lay: () => true, ...(paint ? { paint } : {}),
        world: () => ({
          map: 1024, owned: [], river: () => false, lots: [], farms: [], segs: [], pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: 1e12, roundLive: false,
          segsNear: () => [], isCourseRoad: () => false, valuePerTile: () => 10, compensation: () => 0,
        }),
      };
      const r = new RealPlacer(h);
      assert.equal(await r.start('rondebosch'), true);
      r.move({ x: 512, y: 512 });
      return r.plan()!.build;
    };
    const a = await price(), d = await price(() => ({ desert: true })), same = await price(() => ({}));
    assert.ok(d < a, `desert ${d}, autumn ${a}`);
    assert.equal(same, a, 'no theme given: the autumn game’s price');
  });
});
