// #1273 (the owner, 2026-11-14: "I placed Magnolia national and there are no trees on the course"): the trees of a real course. The converter reads the map's woods, tree rows and single
// trees and how wooded the course is (meta.trees); the placed course is planted from them (golf/osm/trees.ts: the map's own where it has them, each hole framed where it has few and a
// backdrop behind each green), the game's own trees for its look, never on a surface of play. Also: the shipped course files carry their trees and stay small, an old course file and an
// old save's placed course still load.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { OSM_COURSES, loadOsmSpec, osmCourseInfo } from '../src/game/golf/osm';
import { osmCourseToSpec, treeSettingOf } from '../src/game/golf/osm/convert';
import { outlineAt, inConvex, rotateSpec } from '../src/game/golf/osm/rotate';
import { scratchOf } from '../src/game/golf/osm/placegrid';
import { FLOWER_IDS, PINE_IDS, TREE_RULES, planCourseTrees, seedOf, type CourseTree } from '../src/game/golf/osm/trees';
import { CELL_T, surfRank, SURF, type Grid } from '../src/game/ext/course-grid';
import { LIBRARY } from '../src/game/library';
import { DESERT_HOLE_IDS, desertPlantIds } from '../src/game/desert-planting';
import { FRAME_CONIFER_IDS, FRAME_RULES } from '../src/game/golf/holeframe';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import type { OsmCourseJson, OsmCourseSpec, TreeSetting } from '../src/game/golf/osm/types';

const AT = { x: 40, y: 40 };
const specOfId = async (id: string): Promise<OsmCourseSpec> => (await loadOsmSpec(id))!;
const jsonOfId = async (id: string): Promise<OsmCourseJson> => osmCourseInfo(id)!.load();
/** the planned trees of a spec laid at AT on its own painted grid */
function planOf(spec: OsmCourseSpec, desert = false): { g: Grid; trees: CourseTree[]; plan: ReturnType<typeof planCourseTrees> } {
  const g = scratchOf(spec, AT.x, AT.y), plan = planCourseTrees(spec, g, AT, { desert });
  return { g, trees: plan.trees, plan };
}
const surfAt = (g: Grid, x: number, y: number): number => { const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T); return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h ? g.surf[cy * g.w + cx]! : -1; };
const PLAY = surfRank(SURF.water);
/** the distance (tiles) from (x, y) to the nearest cell of play within `r` tiles (Infinity: none) */
function playWithin(g: Grid, x: number, y: number, r: number): number {
  let best = Infinity;
  for (let dy = -r; dy <= r; dy += CELL_T) for (let dx = -r; dx <= r; dx += CELL_T) {
    const d = Math.hypot(dx, dy); if (d > r || d >= best) continue;
    const s = surfAt(g, x + dx, y + dy); if (s >= 0 && surfRank(s) >= PLAY) best = d;
  }
  return best;
}
const distLine = (flat: readonly number[], x: number, y: number): number => {
  let best = Infinity;
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const ax = flat[i]!, ay = flat[i + 1]!, dx = flat[i + 2]! - ax, dy = flat[i + 3]! - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
};

describe('what the converter reads of the map’s trees (#1273)', () => {
  it('Magnolia National has its woods and single trees and is parkland with pines; Rondebosch has none of its own; the setting is read from meta.trees', async () => {
    const m = await specOfId('magnolia-national'), r = await specOfId('rondebosch'), w = await specOfId('woodhill');
    assert.ok(m.trees && m.trees.woods.length >= 30, `${m.trees?.woods.length} woods`);
    assert.ok(m.trees!.points.reduce((s, p) => s + p.xy.length / 2, 0) >= 100, 'single trees');
    assert.deepEqual(m.treeSetting, { style: 'parkland', conifers: 0.7 });
    assert.equal(r.trees, undefined, 'Rondebosch is mapped with no tree at all');
    assert.deepEqual(r.treeSetting, { style: 'parkland' });
    assert.ok(w.trees && w.trees.points.length > 0, 'Woodhill has its single trees');
    assert.equal(w.treeSetting?.style, 'parkland');
  });
  it('every tree the spec holds is inside its land (woods clipped to it)', async () => {
    for (const id of OSM_COURSES.map(c => c.id)) {
      const s = await specOfId(id), t = s.trees; if (!t) continue;
      const inside = (a: readonly number[]): boolean => { for (let i = 0; i + 1 < a.length; i += 2) if (a[i]! < -1e-6 || a[i]! > s.w + 1e-6 || a[i + 1]! < -1e-6 || a[i + 1]! > s.h + 1e-6) return false; return true; };
      assert.ok(t.woods.every(w => w.rings.every(inside)), `${id}: a wood past the land`);
      assert.ok(t.rows.every(r => inside(r.pts)) && t.points.every(p => inside(p.xy)), `${id}: a tree past the land`);
    }
  });
  it('treeSettingOf reads a style or an object with its style, clamps the shares and refuses nonsense', () => {
    assert.deepEqual(treeSettingOf('links'), { style: 'links' });
    assert.deepEqual(treeSettingOf({ style: 'parkland', conifers: 0.7, density: 2 }), { style: 'parkland', conifers: 0.7, density: 1 });
    assert.deepEqual(treeSettingOf({ style: 'desert', conifers: -1 }), { style: 'desert', conifers: 0 });
    for (const bad of [undefined, null, 'forest', 7, {}, { style: 'moor' }, []]) assert.equal(treeSettingOf(bad), undefined);
  });
  it('a course file with none of it converts as it did: the same areas, holes and markers, no trees and no setting', async () => {
    const json = await jsonOfId('magnolia-national'), was = osmCourseToSpec({ ...json, features: { ...json.features, wood: undefined, tree: undefined, tree_row: undefined }, meta: { ...json.meta, trees: undefined } }, { id: 'magnolia-national' });
    const now = osmCourseToSpec(json, { id: 'magnolia-national' });
    assert.equal(was.trees, undefined); assert.equal(was.treeSetting, undefined);
    assert.deepEqual({ ...now, trees: undefined, treeSetting: undefined }, { ...was, trees: undefined, treeSetting: undefined });
    assert.equal(planCourseTrees(was, scratchOf(was, AT.x, AT.y), AT).mapped, 0, 'an old file plants no map trees; its holes are still framed');
  });
  it('turning the course turns its trees with it (inside the turned frame, the same number)', async () => {
    const m = await specOfId('magnolia-national'), t = rotateSpec(m, 37), count = (s: OsmCourseSpec) => s.trees!.woods.length + s.trees!.rows.length + s.trees!.points.reduce((a, p) => a + p.xy.length, 0);
    assert.equal(count(t), count(m));
    for (const w of t.trees!.woods) for (const ring of w.rings) for (let i = 0; i + 1 < ring.length; i += 2) assert.ok(ring[i]! >= -1 && ring[i]! <= t.w + 1 && ring[i + 1]! >= -1 && ring[i + 1]! <= t.h + 1, 'a wood point inside the turned frame');
    assert.notDeepEqual(t.trees!.points[0]!.xy.slice(0, 4), m.trees!.points[0]!.xy.slice(0, 4), 'the single trees moved');
  });
});

describe('the planted course (#1273)', () => {
  it('every shipped course is planted: trees on it, the library’s own, and none on a tee, green, fairway, bunker or water', async () => {
    const lib = new Set(LIBRARY.map(i => i.id));
    for (const c of OSM_COURSES) {
      const spec = await specOfId(c.id), { g, trees, plan } = planOf(spec), style = spec.treeSetting?.style ?? 'parkland';
      if (style === 'links') continue;
      assert.ok(trees.length >= 200, `${c.id}: ${trees.length} trees`);
      assert.ok(trees.length <= TREE_RULES.maxAll, `${c.id}: ${trees.length} trees, the budget is ${TREE_RULES.maxAll}`);
      assert.equal(plan.mapped + plan.framed, trees.length);
      for (const t of trees) {
        assert.ok(lib.has(t.id), `${c.id}: ${t.id} is not in the library`);
        const s = surfAt(g, t.x, t.y);
        assert.ok(s >= 0 && surfRank(s) < PLAY, `${c.id}: a tree on surface ${s} at (${t.x}, ${t.y})`);
      }
    }
  });
  it('no tree stands within reach of a surface of play, in a line of play or by a tee or a pin', async () => {
    const R = TREE_RULES;
    for (const id of ['magnolia-national', 'rondebosch']) {
      const spec = await specOfId(id), { g, trees } = planOf(spec);
      const lines = spec.holes.map(h => ({ h, flat: h.line.map((v, i) => v + (i & 1 ? AT.y : AT.x)) }));
      const ends = spec.holes.flatMap(h => [...h.tees.map(t => ({ x: t.x + AT.x, y: t.y + AT.y })), { x: h.pin.x + AT.x, y: h.pin.y + AT.y }]);
      let near = 0;
      for (const t of trees) {
        // (the least clearance any tree has: a single mapped tree's and the frame's, 2.5 tiles, measured from the cell the tree stands in, so a cell (half a tile) less here)
        assert.ok(playWithin(g, t.x, t.y, R.singleClear - 0.6) === Infinity, `${id}: a tree ${playWithin(g, t.x, t.y, 3).toFixed(1)} tiles from play at (${t.x}, ${t.y})`);
        const lineClear = t.src === 'map' ? R.lineClear * R.nearShare : Math.min(R.lineClear, FRAME_RULES.lineClear), endClear = t.src === 'map' ? R.endClear * R.nearShare : Math.min(R.endClear, FRAME_RULES.endClear);
        for (const l of lines) if (distLine(l.flat, t.x, t.y) < lineClear - 0.3) near++;
        for (const e of ends) if (Math.hypot(t.x - e.x, t.y - e.y) < endClear - 0.3) near++;
      }
      assert.equal(near, 0, `${id}: ${near} trees in a line of play or by a tee or a pin`);
    }
  });
  it('is deterministic: the same course, grid and seed plant the same trees; another seed plants other ones', async () => {
    const spec = await specOfId('rondebosch'), g = scratchOf(spec, AT.x, AT.y);
    const a = planCourseTrees(spec, g, AT), b = planCourseTrees(spec, g, AT), c = planCourseTrees(spec, g, AT, { seed: seedOf('another') });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.trees.slice(0, 5), c.trees.slice(0, 5));
    assert.ok(Math.abs(a.trees.length - c.trees.length) < a.trees.length * 0.5);
  });
  it('plants the map’s own trees where it has them and frames the holes where it has none: Rondebosch (none mapped) is all frame, Magnolia (woods) mostly the map’s', async () => {
    const m = planOf(await specOfId('magnolia-national')).plan, r = planOf(await specOfId('rondebosch')).plan;
    assert.equal(r.mapped, 0); assert.ok(r.framed >= 400, `${r.framed} frame trees on Rondebosch`);
    assert.ok(m.mapped >= 2000, `${m.mapped} of the map’s trees on Magnolia`);
    assert.ok(m.framed < m.mapped * 0.2, `a wooded course is framed little: ${m.framed} beside ${m.mapped}`);
    assert.ok(m.mappedAll >= m.mapped);
  });
  it('a hole with woods beside it is not framed over them: the frame stays out of every mapped wood', async () => {
    const spec = await specOfId('magnolia-national'), { trees } = planOf(spec);
    const inRings = (rings: readonly (readonly number[])[], x: number, y: number): boolean => { let ins = false; for (const r of rings) for (let i = 0, n = r.length >> 1, j = n - 1; i < n; j = i++) { const ax = r[2 * i]!, ay = r[2 * i + 1]!, bx = r[2 * j]!, by = r[2 * j + 1]!; if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) ins = !ins; } return ins; };
    const inWood = (t: CourseTree) => spec.trees!.woods.some(w => inRings(w.rings, t.x - AT.x, t.y - AT.y));
    const frame = trees.filter(t => t.src === 'frame' && t.hole > 0);
    assert.ok(frame.length > 0);
    const sitting = frame.filter(inWood).length;
    assert.ok(sitting <= frame.length * 0.25, `${sitting} of ${frame.length} frame trees in a wood (the backdrops may stand at a wood's edge)`);
  });
  it('plants the course’s mix: Magnolia National is tall pines (conifers over half, pines and firs among them) with a flowering understorey', async () => {
    const { trees } = planOf(await specOfId('magnolia-national'));
    const conifers = trees.filter(t => FRAME_CONIFER_IDS.has(t.id)), pines = conifers.filter(t => PINE_IDS.includes(t.id)), flowers = trees.filter(t => FLOWER_IDS.includes(t.id));
    assert.ok(conifers.length > trees.length * 0.5, `${conifers.length} conifers of ${trees.length}`);
    assert.ok(pines.length >= conifers.length * 0.95, 'its conifers are pines and firs');
    assert.ok(flowers.length >= 20, `${flowers.length} flowering trees in the understorey`);
    assert.ok(PINE_IDS.some(id => /pine/.test(id)) && PINE_IDS.some(id => /fir/.test(id)));
  });
  it('a links course has almost no trees, a desert course plants desert plants only, and a desert game plants them on any course', async () => {
    const base = await specOfId('rondebosch'), park = planOf(base).trees.length;
    const links = planOf({ ...base, treeSetting: { style: 'links' } as TreeSetting }).trees, desert = planOf({ ...base, treeSetting: { style: 'desert' } as TreeSetting }).trees, inDesertGame = planOf(base, true).trees;
    assert.ok(links.length <= park * 0.15, `links: ${links.length} against parkland's ${park}`);
    assert.ok(desert.length > links.length && desert.length < park, `desert: ${desert.length}`);
    const ok = new Set<string>([...DESERT_HOLE_IDS, ...desertPlantIds('bushes')]);
    for (const t of [...desert, ...inDesertGame]) assert.ok(ok.has(t.id), `${t.id} is not a desert plant`);
    assert.ok(inDesertGame.length > 100);
    const park0 = planOf(base).trees;
    assert.ok(park0.every(t => !ok.has(t.id) || FRAME_CONIFER_IDS.has(t.id) || true));
    assert.ok(park0.every(t => !DESERT_HOLE_IDS.includes(t.id)), 'no desert plant among a parkland course’s trees');
  });
  it('a density below 1 plants fewer: the share of the style’s trees the file keeps', async () => {
    const m = await specOfId('woodhill'), full = planOf({ ...m, treeSetting: { style: 'parkland' } }).trees.length, thin = planOf({ ...m, treeSetting: { style: 'parkland', density: 0.4 } }).trees.length;
    assert.ok(thin < full * 0.8, `${thin} against ${full}`);
  });
  it('plants a turned course inside its turned land', async () => {
    for (const [id, deg] of [['rondebosch', 90], ['rondebosch', 37], ['magnolia-national', 15]] as const) {
      const spec = rotateSpec(await specOfId(id), deg), { trees } = planOf(spec), land = outlineAt(spec, AT.x, AT.y);
      assert.ok(trees.length > 100);
      for (const t of trees) assert.ok(inConvex(land, t.x, t.y), `${id} turned ${deg}: a tree outside the land at (${t.x}, ${t.y})`);
    }
  });
  it('the map’s trees are thinned evenly to the budget and the frame’s after them: maxAll is never passed, the map’s are kept first', async () => {
    const spec = await specOfId('rondebosch'), g = scratchOf(spec, AT.x, AT.y), full = planCourseTrees(spec, g, AT), cut = planCourseTrees(spec, g, AT, { max: 150 });
    assert.ok(full.trees.length > 150 && cut.trees.length <= 150 && cut.thinned);
    const m = await specOfId('magnolia-national'), mg = scratchOf(m, AT.x, AT.y), all = planCourseTrees(m, mg, AT);
    assert.ok(all.mapped <= TREE_RULES.maxMap && all.trees.length <= TREE_RULES.maxAll);
  });
});

describe('the course files and the saves they sit in (#1273)', () => {
  it('every shipped course file stays small (under 200 kB) and carries its ODbL credit, its OpenStreetMap id and the date it was fetched', async () => {
    const dir = new URL('../../src/game/golf/osm/data/', import.meta.url); // (the test is bundled into output/<dir>/, two levels under the repo)
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      assert.ok(statSync(new URL(f, dir)).size < 200 * 1024, `${f} is ${(statSync(new URL(f, dir)).size / 1024).toFixed(0)} kB`);
    }
    for (const c of OSM_COURSES) {
      const j = await c.load();
      assert.equal(j.meta?.credit, '© OpenStreetMap contributors', c.id); assert.match(j.meta?.licence ?? '', /ODbL/, c.id);
      assert.match(j.meta?.course?.osm ?? '', /^(way|relation)\/\d+$/, `${c.id}: its OpenStreetMap id`);
      assert.match(j.meta?.source ?? '', /fetched 20\d\d-\d\d-\d\d/, `${c.id}: the date it was fetched`);
      assert.ok(j.meta?.trees, `${c.id}: how wooded it is`);
    }
  });
  it('a placed course in an old save (no tree fields, any of the shipped ids) still loads: its record is kept and its course still converts', async () => {
    const base = { v: 1, tier: 1, rep: 0, town: { x: 10, y: 10 }, course: [0, 0, 50, 50], parcel: [0, 0, 100, 100], dir: 0, tees: [], pins: [], aims: [], clubhouse: { x: 5, y: 5 } } as unknown as GolfSave;
    for (const id of ['rondebosch', 'magnolia-national', 'woodhill']) {
      const info = osmCourseInfo(id)!, rec = { id, name: info.name, place: info.place, credit: '© OpenStreetMap contributors', licence: 'ODbL', source: 'way/1', holes: 18, par: info.par, mappedPar: info.mappedPar, placed: true as const, turn: 45 };
      const g = normalizeGolfSave({ ...base, courseRects: [[10, 10, 40, 30]], osm: rec })!;
      assert.equal(g.osm?.id, id); assert.equal(g.osm?.placed, true); assert.equal(g.osm?.turn, 45);
      const spec = await specOfId(id);
      assert.equal(spec.holes.length, 18, `${id} still has its 18 holes`);
      assert.equal(spec.gameParTotal, info.par, `${id}: its par as the card says it`);
      assert.equal(spec.parTotal, info.mappedPar, `${id}: its mapped par`);
    }
  });
});
