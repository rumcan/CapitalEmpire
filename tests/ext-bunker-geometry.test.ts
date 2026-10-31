import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CoursePatch } from '../src/game/ground-protocol';
import { BunkerController, type BunkerComponent } from '../src/game/ext/bunker-look/controller';
import { buildBunkerGeometry } from '../src/game/ext/bunker-look/geometry';
import { bunkerAppearance, clampBunkerSettings } from '../src/game/ext/bunker-look/settings';
import { buildBakeRequest } from '../src/game/ext/bunker-look/package/runtime/capital-empire-adapter.js';
import { makeGrid, paintCells, SURF } from '../src/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { RUGGED, warpLine } from '../src/game/rugged-edges';

const ring = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
function patch(cx: number, cy: number, edges: number[][], surface: number = SURF.bunker): CoursePatch {
  return { cx, cy, size: 64, z: 0, layers: [{ s: surface, e: 'sunken', tex: 'bunkerSand', sc: 1, a: 0,
    fill: [Float32Array.from(ring(0, 0, 1, 1))], edges: edges.map(edge => Float32Array.from(edge)) }] };
}
function component(x: number, y: number, id = `bunker:${x}:${y}`): BunkerComponent {
  return { id, seed: [x, y], cells: [[x, y]], boundsTiles: [x * 0.5, y * 0.5, (x + 1) * 0.5, (y + 1) * 0.5], mode: 'default', settings: clampBunkerSettings(undefined) };
}
const flat = { geometryRevision: 1, ready: true, rugged: false };

test('complete true edges stitch across course chunks while clipped fill polygons are ignored', () => {
  const patches = [patch(0, 0, [[63, 10, 64, 10], [64, 12, 63, 12, 63, 10]]), patch(1, 0, [[64, 10, 65, 10, 65, 12, 64, 12]])];
  const source = patches[0].layers[0].edges[0].slice();
  const batch = buildBunkerGeometry(patches, [component(126, 20)], flat);
  assert.equal(batch.complete, true);
  assert.equal(batch.inputs.length, 1);
  assert.equal(batch.inputs[0].ringsTiles.length, 1);
  const points = Array.from(batch.inputs[0].ringsTiles[0]);
  assert.equal(Math.min(...points.filter((_, i) => !(i % 2))), 63);
  assert.equal(Math.max(...points.filter((_, i) => !(i % 2))), 65);
  assert.deepEqual(batch.inputs[0].sourcePatchKeys, ['cg:0:0', 'cg:1:0']);
  assert.deepEqual(patches[0].layers[0].edges[0], source);
});

test('real current-main course patches preserve a hole and close their rounded boundary across the 64-tile seam', () => {
  const grid = makeGrid(58, 10, 24, 20), cells: number[] = [];
  for (let y = 4; y < 16; y++) for (let x = 4; x < 20; x++) if (!(x >= 10 && x < 14 && y >= 8 && y < 12)) cells.push(y * grid.w + x);
  paintCells(grid, cells, cells.length, SURF.bunker, 1, 0);
  const controller = new BunkerController(); controller.reconcile(grid);
  const texture = { tex: 'bunkerSand', sc: 1, a: 0 };
  const looks: CourseLooks = { surf: Array.from({ length: 10 }, (_, s) => s === SURF.bunker ? texture : undefined),
    collar: { 'first-cut': texture, fringe: texture, lip: texture, bank: texture } };
  const patches = [coursePatch(grid, 0, 0, looks, 0)!.course!, coursePatch(grid, 1, 0, looks, 0)!.course!];
  const batch = buildBunkerGeometry(patches, controller.components, flat);
  assert.equal(batch.complete, true, batch.issues.join('; '));
  assert.equal(batch.inputs.length, 1);
  assert.equal(batch.inputs[0].ringsTiles.length, 2);
});

test('open edges, unready generations, duplicate snapshots and mixed generation tokens retain native fallback', () => {
  const open = patch(0, 0, [[10, 10, 12, 10, 12, 12]]);
  assert.equal(buildBunkerGeometry([open], [component(20, 20)], flat).complete, false);
  const closed = patch(0, 0, [ring(10, 10, 12, 12)]);
  assert.deepEqual(buildBunkerGeometry([closed], [component(20, 20)], { ...flat, ready: false }).inputs, []);
  assert.match(buildBunkerGeometry([closed, closed], [component(20, 20)], flat).issues[0], /Duplicate/);
  assert.match(buildBunkerGeometry([closed], [component(20, 20)], { ...flat, patchRevision: () => 0 }).issues[0], /different geometry generation/);
  assert.equal(buildBunkerGeometry([patch(0, 0, [])], [component(20, 20)], flat).complete, false);
});

test('holes remain with their outer boundary and nested sand islands retain their own existing owner', () => {
  const native = patch(0, 0, [ring(10, 10, 22, 22), ring(12, 12, 20, 20), ring(14, 14, 16, 16)]);
  const batch = buildBunkerGeometry([native], [component(20, 20, 'outer'), component(28, 28, 'island')], flat);
  assert.equal(batch.complete, true);
  assert.deepEqual(batch.joins, []);
  assert.equal(batch.inputs.find(input => input.id === 'outer')?.ringsTiles.length, 2);
  assert.equal(batch.inputs.find(input => input.id === 'island')?.ringsTiles.length, 1);
});

test('native gap closing becomes one visible controller selection before any mixed-profile bake is emitted', () => {
  const grid = makeGrid(10, 10, 10, 2);
  paintCells(grid, [0, 8], 2, SURF.bunker, 1, 0);
  const controller = new BunkerController(); controller.reconcile(grid);
  controller.selectAt({ x: 14.25, y: 10.25 }); controller.setSelectedSettings({ depth: 3 });
  controller.selectAt({ x: 10.25, y: 10.25 }); controller.setSelectedSettings({ depth: 0.4 });
  const native = patch(0, 0, [ring(10, 10, 15, 11)]);
  const first = buildBunkerGeometry([native], controller.components, { ...flat, geometryRevision: grid.rev });
  assert.equal(first.complete, true);
  assert.equal(first.joins.length, 1);
  assert.deepEqual(first.inputs, [], 'the host resolves the visible joined profile before creating requests');
  controller.setRenderedJoins(first.joins, grid.rev);
  const resolved = buildBunkerGeometry([native], controller.components, { ...flat, geometryRevision: grid.rev });
  assert.deepEqual(resolved.joins, []);
  assert.equal(resolved.inputs.length, 1);
  assert.equal(resolved.inputs[0].settings.depth, 0.4);
});

test('overlapping grass collars alone do not join separate true sand contours', () => {
  const native = patch(0, 0, [ring(10, 10, 11, 11), ring(12, 10, 13, 11)]);
  native.layers[0].collar = { n: 'lip', tex: 'golfRough', sc: 1, a: 0, fill: [Float32Array.from(ring(8, 8, 15, 15))], edges: [] };
  const batch = buildBunkerGeometry([native], [component(20, 20), component(24, 20)], flat);
  assert.deepEqual(batch.joins, []);
  assert.equal(batch.inputs.length, 2);
});

test('rugged exact rings use the native shared warp once, after authoritative ownership association', () => {
  const native = patch(0, 0, [ring(10, 10, 13, 12)]), owners = [component(20, 20)];
  const original = native.layers[0].edges[0].slice();
  const unwarped = buildBunkerGeometry([native], owners, flat);
  const warped = buildBunkerGeometry([native], owners, { ...flat, rugged: true });
  assert.deepEqual(warped.inputs[0].ringsTiles[0], Float64Array.from(warpLine(unwarped.inputs[0].ringsTiles[0], true, RUGGED.courseStep)));
  assert.notEqual(warped.inputs[0].revision, unwarped.inputs[0].revision);
  assert.deepEqual(native.layers[0].edges[0], original);
});

test('whole-generation revisions and unrelated patches never invalidate unchanged per-feature bake keys', () => {
  const native = patch(0, 0, [ring(10, 10, 13, 12)]), owners = [component(20, 20)];
  const first = buildBunkerGeometry([native], owners, flat).inputs[0];
  const next = buildBunkerGeometry([native, patch(20, 20, [], SURF.rough)], owners, { ...flat, geometryRevision: 999 }).inputs[0];
  const key = (input: typeof first) => buildBakeRequest({ id: input.id, revision: input.revision, ringsTiles: input.ringsTiles, appearance: bunkerAppearance(input.settings), maxEdge: 512 }).key;
  assert.equal(key(first), key(next));
  assert.ok(Object.isFrozen(first.settings));
});

test('source scoping includes interior chunks and neighbouring ground reached by the complete appearance', () => {
  const native = patch(0, 0, [ring(20, 20, 180, 180)]);
  const interior = patch(1, 1, []), neighbour = patch(3, 1, [], SURF.rough);
  const deep = { ...component(160, 160), settings: clampBunkerSettings({ depth: 1.5, wall: 1.94 }) };
  const batch = buildBunkerGeometry([native, interior, neighbour], [deep], flat);
  assert.equal(batch.complete, true);
  assert.ok(batch.inputs[0].sourcePatchKeys.includes('cg:1:1'));
  assert.ok(batch.inputs[0].sourcePatchKeys.includes('cg:3:1'));
});

test('multiple drawn parts of one existing cell owner use distinct world-cell cache anchors', () => {
  const owner: BunkerComponent = { ...component(20, 20), cells: [[20, 20], [21, 20], [22, 20], [23, 20], [24, 20]], boundsTiles: [10, 10, 12.5, 10.5] };
  const native = patch(0, 0, [ring(10, 10, 10.5, 10.5), ring(12, 10, 12.5, 10.5)]);
  const batch = buildBunkerGeometry([native], [owner], flat);
  assert.equal(batch.complete, true);
  assert.deepEqual(batch.joins, []);
  assert.equal(new Set(batch.inputs.map(input => input.id)).size, 2);
  assert.ok(batch.inputs.every(input => input.id.startsWith(owner.id + '/part:')));
  assert.deepEqual(batch.inputs[0].settings, batch.inputs[1].settings);
});

test('unowned contours never activate a replacement, while a genuinely empty grid can clear the bridge', () => {
  const invalid = buildBunkerGeometry([patch(0, 0, [ring(10, 10, 12, 12)])], [component(200, 200)], flat);
  assert.equal(invalid.complete, false);
  assert.deepEqual(invalid.inputs, []);
  const empty = buildBunkerGeometry([], [], flat);
  assert.equal(empty.complete, true);
  assert.deepEqual(empty.inputs, []);
});

test('the course look\'s Shadow (Edges) scales the picture\'s shadow: its default keeps the card\'s strength', () => {
  const at = (sh?: number) => {
    const p = patch(0, 0, [ring(10, 10, 12, 12)]); if (sh !== undefined) p.sh = [0, 0, 0, 0, 0, 0, sh];
    return buildBunkerGeometry([p], [component(21, 21)], flat).inputs[0].settings.shadow;
  };
  const own = clampBunkerSettings(undefined).shadow;
  assert.equal(at(), own); assert.equal(at(0.3), own); assert.equal(at(0), 0);
  assert.ok(Math.abs(at(0.15) - own / 2) < 1e-9); assert.equal(at(1), 3);
});

test('a bunker carries the green rings right beside it (its tall face), none from a green far off', () => {
  const sand = patch(0, 0, [ring(10, 10, 14, 12)]);
  const green = patch(0, 0, [], SURF.green); green.layers[0].fill = [Float32Array.from(ring(15, 10, 20, 12))];
  sand.layers.push(green.layers[0]);
  const near = buildBunkerGeometry([sand], [component(22, 22)], flat).inputs[0].greens!;
  assert.equal(near.length, 1); assert.equal(near[0][0], 15);
  assert.equal(buildBunkerGeometry([patch(0, 0, [ring(10, 10, 14, 12)])], [component(22, 22)], flat).inputs[0].greens, undefined);
  const far = patch(0, 0, [ring(10, 10, 14, 12)]), away = patch(0, 0, [], SURF.green); away.layers[0].fill = [Float32Array.from(ring(30, 10, 34, 12))]; far.layers.push(away.layers[0]);
  assert.equal(buildBunkerGeometry([far], [component(22, 22)], flat).inputs[0].greens, undefined, 'a green 32 m off stands behind none of its walls');
});

test('the sand wears the My looks texture of the owner whose share holds the bunker', () => {
  const p = patch(0, 0, [ring(10, 10, 14, 12)]); p.layers[0].tex = 'preset:bunker';
  assert.equal(buildBunkerGeometry([p], [component(22, 22)], flat).inputs[0].lookTex, 'preset:bunker');
  p.layers[0].alts = [{ look: { tex: 'preset:hole3', sc: 1, a: 0 }, runs: Float32Array.from([8, 8, 16, 16]) }];
  assert.equal(buildBunkerGeometry([p], [component(22, 22)], flat).inputs[0].lookTex, 'preset:hole3');
});

test('each bunker bakes with its owner’s look (settingsAt), its rim always flat', () => {
  const p = patch(0, 0, [ring(10, 10, 14, 12)]), seen: number[][] = [];
  const settingsAt = (cell: readonly [number, number]) => { seen.push([...cell]); return clampBunkerSettings({ depth: 2.2, wall: 0.7, rim: 1 }); };
  const input = buildBunkerGeometry([p], [component(22, 22)], { ...flat, settingsAt }).inputs[0];
  assert.deepEqual(seen, [[22, 22]]); assert.equal(input.settings.depth, 2.2); assert.equal(input.settings.wall, 0.7); assert.equal(input.settings.rim, 0);
});
