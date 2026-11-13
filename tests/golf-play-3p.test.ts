// The bridge to the view from behind the golfer (T413, docs/CINDERLINKS-PORT.md): the protocol's frame and guards (src/game/golf/play/protocol3p.ts)
// and the features export (src/game/golf/play/features3p.ts): a made-up course with one path, a clubhouse turned 30 degrees and a tent comes out in
// the right metres, turn and y south; an empty course gives an empty list; two exports of the same input match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { fromView, isHostMsg, isViewMsg, toView } from '../src/game/golf/play/protocol3p';
import { MARGIN_T, MAX_TREES, exportFeatures3p, gatherFeatures3p, treeLook, type BuildingFeature, type FeaturesInput, type PathFeature, type TreeIn } from '../src/game/golf/play/features3p';

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

// ---- T451: the course's trees, packed for the view

test('T451: the form and leaf colour of a species from its library id', () => {
  assert.equal(treeLook('capital:tree-pine-open').form, 0);
  assert.equal(treeLook('gen:tree-fir-tall:ne').form, 0);
  assert.equal(treeLook('world:tree_pine_0').form, 0);
  assert.equal(treeLook('gen:tree-aspen-young:se').form, 2);
  assert.equal(treeLook('capital:tree-oak-moderate').form, 1);
  assert.equal(treeLook('palm-tall').form, 3);
  assert.equal(treeLook('dead-snag-1').form, 4);
  assert.ok(treeLook('gen:tree-maple-scarlet:ne').hue > 0.85, 'a scarlet maple is red');
  assert.ok(treeLook('gen:tree-oak-amber:ne').hue > 0.7 && treeLook('gen:tree-oak-amber:ne').hue < 0.85, 'an amber oak is ember');
  assert.equal(treeLook('my-odd-tree', new Set(['my-odd-tree'])).form, 0, 'the own conifer list of the game wins');
});

test('T451: the trees go packed, in view metres, with species, form, height, crown and the box', () => {
  const trees: TreeIn[] = [
    { at: { x: 1010, y: 990 }, size: 12, crown: 7, sp: 'capital:tree-oak-open' },
    { at: { x: 995, y: 1005 }, size: 18, crown: 6, sp: 'capital:tree-pine-open' },
    { at: { x: 1002, y: 1001 }, size: 9, crown: 5, sp: 'capital:tree-oak-open' },
  ];
  const inp: FeaturesInput = { course: 'c', paths: [], buildings: [], trees, treeBox: [900, 900, 1100, 1100] };
  const f = exportFeatures3p(inp, centre), T = f.trees!;
  assert.ok(T, 'a trees pack');
  assert.deepEqual(T.box, [-200, -200, 200, 200]);
  assert.equal(T.t.length, 15);
  assert.deepEqual(T.sp, ['capital:tree-pine-open', 'capital:tree-oak-open'], 'species in the order first met, the trees sorted west to east');
  assert.deepEqual(T.form, [0, 1]);
  assert.deepEqual(T.t.slice(0, 5), [-10, 10, 18, 6, 0], 'the pine: 5 tiles west and 5 south (y > 0), 18 m tall, 6 m crown');
  assert.deepEqual(T.t.slice(10, 15), [20, -20, 12, 7, 1], 'the oak 10 tiles east, 10 north');
  const g = exportFeatures3p({ ...inp, trees: [...trees].reverse() }, centre);
  assert.equal(JSON.stringify(g), JSON.stringify(f), 'the same whatever the order');
  assert.equal(exportFeatures3p({ ...inp, trees: [] }, centre).trees, undefined, 'no trees: no pack');
});

test('T451: past MAX_TREES the trees outside the own box of the course are thinned, those of the course kept', () => {
  const trees: TreeIn[] = [];
  for (let i = 0; i < 1000; i++) trees.push({ at: { x: 1000 + (i % 40), y: 1000 + Math.floor(i / 40) }, size: 10, sp: 'a' });   // the course: 1000
  for (let i = 0; i < MAX_TREES * 2; i++) trees.push({ at: { x: 2000 + (i % 200) * 0.3, y: 900 + Math.floor(i / 200) * 0.3 }, size: 10, sp: 'b' });   // round it
  const box: [number, number, number, number] = [1000 - MARGIN_T, 1000 - MARGIN_T, 1100 + MARGIN_T, 1100 + MARGIN_T];
  const T = exportFeatures3p({ course: 'c', paths: [], buildings: [], trees, treeBox: box }, centre).trees!;
  const n = T.t.length / 5; assert.ok(n <= MAX_TREES && n > MAX_TREES - 50, `${n} trees`);
  let course = 0; for (let k = 0; k < T.t.length; k += 5) if (T.sp[T.t[k + 4]!] === 'a') course++;
  assert.equal(course, 1000, 'every tree of the course itself is kept');
});

test('T451: the adapter takes the trees the game plants and the trees among the props in the box, sized by their pictures, with the pictures', () => {
  const oak = { kind: 'tree', id: 'capital:tree-oak-open', name: 'oak', w: 400, h: 520, ax: 200, ay: 512, tex: [1, 0.1, 0.2, 0.3, 0.4], quad: [40, 32, 360, 512] };
  const g = gatherFeatures3p({
    course: 'c', segs: [], bizDefs: [], structures: [], lots: [],
    props: [{ item: 0, x: 1000, y: 1000, scale: 1, auto: 'median' }],
    library: [oak, { kind: 'bench', h: 40, name: 'bench' }],
    courseBox: [990, 990, 1010, 1010],
    trees: [{ id: 'capital:tree-oak-open', x: 1050, y: 1000, scale: 0.5 }, { id: 'capital:tree-oak-open', x: 1200, y: 1000, scale: 1 }, { id: 'nope', x: 1000, y: 1000, scale: 1 }],
    pages: [['p0.webp'], ['p1.webp']],
  });
  assert.equal(g.trees.length, 2, 'the network tree and the near wood tree; the one 190 tiles off and the unknown id are left out');
  assert.equal(g.trees[0]!.size, (512 - 32) / 128 * TILE_M, 'the height: from the top of the trimmed picture down to its ground point');
  assert.equal(g.trees[1]!.size, (512 - 32) / 128 * TILE_M * 0.5);
  assert.ok(Math.abs(g.trees[0]!.crown! - 320 / 128 * TILE_M * 0.92) < 1e-9);
  assert.deepEqual(g.treeBox, [990 - MARGIN_T, 990 - MARGIN_T, 1010 + MARGIN_T, 1010 + MARGIN_T]);
  assert.deepEqual(g.pics!['capital:tree-oak-open'], { url: 'p1.webp', uv: [0.1, 0.2, 0.3, 0.4], w: 400, h: 520, ax: 200, ay: 512, quad: [40, 32, 360, 512] });
  const T = exportFeatures3p(g, centre).trees!;
  assert.equal(T.pic[0]!.url, 'p1.webp');
});
