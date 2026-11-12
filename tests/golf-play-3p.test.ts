// The bridge to the view from behind the golfer (T413, docs/CINDERLINKS-PORT.md): the protocol's frame and guards (src/game/golf/play/protocol3p.ts)
// and the features export (src/game/golf/play/features3p.ts): a made-up course with one path, a clubhouse turned 30 degrees and a tent comes out in
// the right metres, turn and y south; an empty course gives an empty list; two exports of the same input match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { fromView, isHostMsg, isViewMsg, toView } from '../src/game/golf/play/protocol3p';
import { exportFeatures3p, gatherFeatures3p, type BuildingFeature, type FeaturesInput, type PathFeature } from '../src/game/golf/play/features3p';

const centre = { x: 1000, y: 1000 };

test('toView: metres from the centre, x east, y south; fromView undoes it', () => {
  assert.deepEqual(toView({ x: 1010, y: 990 }, centre), [10 * TILE_M, -10 * TILE_M]); // 10 tiles east and 10 north: y below 0
  assert.deepEqual(toView({ x: 1000, y: 1005 }, centre), [0, 5 * TILE_M]); // south: y above 0
  assert.deepEqual(fromView(toView({ x: 1234.5, y: 987.25 }, centre), centre), { x: 1234.5, y: 987.25 });
});

test('the guards take this version and these types only', () => {
  assert.ok(isHostMsg({ v: 1, t: 'turn' }));
  assert.ok(isHostMsg({ v: 1, t: 'leave' }));
  assert.ok(isViewMsg({ v: 1, t: 'input', input: {} }));
  assert.ok(isViewMsg({ v: 1, t: 'holeDone', holeIdx: 0 }));
  assert.ok(!isHostMsg({ v: 2, t: 'turn' }), 'a wrong version');
  assert.ok(!isHostMsg({ t: 'turn' }), 'no version');
  assert.ok(!isHostMsg({ v: 1, t: 'input' }), 'a view message is not a host message');
  assert.ok(!isViewMsg({ v: 1, t: 'course' }), 'a host message is not a view message');
  assert.ok(!isViewMsg({ v: 1, t: 'hello' }), 'an unknown type');
  for (const bad of [null, undefined, 1, 'turn', [], { v: '1', t: 'ready' }]) { assert.ok(!isHostMsg(bad)); assert.ok(!isViewMsg(bad)); }
});

const course: FeaturesInput = {
  course: 'test',
  paths: [ // one cart path laid as two stretches, given out of order and one reversed: chained into one
    { a: { x: 1020, y: 1000 }, b: { x: 1010, y: 1000 }, surface: 'concrete', width: 3, name: 'Paved cart path' },
    { a: { x: 1000, y: 1000 }, b: { x: 1010, y: 1000 }, surface: 'concrete', width: 3, name: 'Paved cart path' },
  ],
  buildings: [
    { key: 'clubhouse:1', use: 'clubhouse', name: 'Clubhouse', at: { x: 990, y: 1010 }, w: 40, d: 24, rot: 30 },
    { key: 'event:7', use: 'tent', name: 'Food tent', at: { x: 1005, y: 980 }, w: 8, d: 6, rot: 0 },
  ],
  trees: [],
};

test('a course with a path, a clubhouse turned 30 degrees and a tent', () => {
  const f = exportFeatures3p(course, centre);
  assert.equal(f.v, 1); assert.equal(f.course, 'test');
  const paths = f.features.filter((x): x is PathFeature => x.kind === 'path');
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0]!.pts, [[0, 0], [20, 0], [40, 0]]);
  assert.equal(paths[0]!.surface, 'concrete'); assert.equal(paths[0]!.width, 3);
  const b = f.features.filter((x): x is BuildingFeature => x.kind === 'building');
  const club = b.find(x => x.use === 'clubhouse')!, tent = b.find(x => x.use === 'tent')!;
  assert.deepEqual(club.at, [-20, 20], 'the clubhouse: 10 tiles west, 10 south (y > 0)');
  assert.equal(club.rot, 30); assert.equal(club.w, 40); assert.equal(club.d, 24);
  assert.equal(club.roof, 'hip'); assert.ok(/^#[0-9a-f]{6}$/.test(club.wall) && /^#[0-9a-f]{6}$/.test(club.roofColour));
  assert.deepEqual(tent.at, [10, -40], 'the tent: 5 tiles east, 20 north (y < 0)');
  assert.equal(tent.name, 'Food tent'); assert.equal(tent.rot, 0);
});

test('an empty course gives an empty list', () => {
  assert.deepEqual(exportFeatures3p({ course: 'none', paths: [], buildings: [], trees: [] }, centre), { course: 'none', v: 1, features: [] });
  const g = gatherFeatures3p({ course: 'none', segs: [], bizDefs: [], structures: [], lots: [], props: [], library: [] });
  assert.deepEqual(exportFeatures3p(g, centre).features, []);
});

test('ids are stable between two exports of the same input, whatever its order', () => {
  const a = exportFeatures3p(course, centre);
  const b = exportFeatures3p({ ...course, paths: [...course.paths].reverse(), buildings: [...course.buildings].reverse() }, centre);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.features.map(x => x.id), ['p1', 'b:clubhouse:1', 'b:event:7']);
});

test('the adapter: cart paths, a clubhouse site, an event tent, a built house and a planted tree', () => {
  const cls = { base: 'cart-dirt', family: 'cart', h: 0.5, name: 'Dirt path' };
  const g = gatherFeatures3p({
    course: 'c',
    segs: [{ a: { x: 1000, y: 1000 }, b: { x: 1010, y: 1000 }, cls }, { a: { x: 5000, y: 5000 }, b: { x: 5010, y: 5000 }, cls: { base: 'street', family: 'small', h: 2, name: 'Street' } }],
    bizDefs: [{ id: 3, type: 'clubhouse', x: 980, y: 990, w: 20, h: 12 }, { id: 4, type: 'diner', x: 0, y: 0, w: 4, h: 4 }],
    structures: [{ id: 9, typeId: 'standS', x: 1000, y: 1000, mode: 'rent' }],
    lots: [{ id: 2, o: { x: 1100, y: 1000 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, w: 10, d: 20, st: 3, at: 0, after: Infinity, seed: 5, price: 1 }],
    props: [{ item: 0, x: 1001, y: 1002, scale: 1 }, { item: 1, x: 1, y: 1, scale: 1 }],
    library: [{ kind: 'tree', h: 640, name: 'oak' }, { kind: 'bench', h: 50, name: 'bench' }],
    box: [990, 990, 1030, 1030],
  });
  assert.equal(g.paths.length, 1, 'the far town street is left out');
  assert.equal(g.paths[0]!.surface, 'dirt'); assert.equal(g.paths[0]!.width, 2);
  assert.equal(g.buildings.filter(b => b.use === 'clubhouse').length, 1);
  assert.deepEqual(g.buildings.find(b => b.use === 'clubhouse')!.at, { x: 990, y: 996 });
  assert.ok(!g.buildings.some(b => b.key.startsWith('diner')), 'a town business is not the course\'s');
  const house = g.buildings.find(b => b.use === 'house')!;
  assert.equal(house.rot, 90, 'a street running south: the house turned a quarter clockwise');
  assert.deepEqual(house.at, { x: 1090, y: 1005 });
  assert.equal(g.trees.length, 1); assert.equal(g.trees[0]!.size, 10);
});
