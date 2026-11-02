import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, applyDiff, makeGrid, paintCells, type Grid } from '../src/game/ext/course-grid';
import { BunkerController, type BunkerState } from '../src/game/ext/bunker-look/controller';
import { DEFAULT_BUNKER_SETTINGS, clampBunkerSettings } from '../src/game/ext/bunker-look/settings';

const paint = (g: Grid, cells: [number, number][], surface: number = SURF.bunker, hole = 1) =>
  paintCells(g, cells.map(([x, y]) => y * g.w + x), cells.length, surface, hole, 0);
const at = (g: Grid, x: number, y: number) => ({ x: g.x0 + (x + 0.5) * CELL_T, y: g.y0 + (y + 0.5) * CELL_T });
function copyGrid(g: Grid, x0 = g.x0, y0 = g.y0, w = g.w, h = g.h): Grid {
  const out = makeGrid(x0, y0, w, h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const nx = Math.round((g.x0 - x0) / CELL_T) + x, ny = Math.round((g.y0 - y0) / CELL_T) + y;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const from = y * g.w + x, to = ny * w + nx;
    out.surf[to] = g.surf[from]; out.hole[to] = g.hole[from]; out.month[to] = g.month[from];
  }
  out.rev = g.rev + 1;
  return out;
}

test('real 1 m sand cells connect across shared edges and hole owners, never diagonally or across a row wrap', () => {
  const grid = makeGrid(10, 20, 8, 4);
  paint(grid, [[0, 0]], SURF.bunker, 1); paint(grid, [[1, 0]], SURF.bunker, 2);
  paint(grid, [[2, 1]], SURF.bunker, 1); paint(grid, [[7, 2], [0, 3]]);
  const controller = new BunkerController(); controller.reconcile(grid);
  assert.deepEqual(controller.components.map(component => component.cells.length), [2, 1, 1, 1]);
  const joined = controller.componentAt(at(grid, 1, 0))!;
  assert.deepEqual(joined.seed, [20, 40]);
  assert.equal(joined.id, 'bunker:20:40');
  assert.deepEqual(joined.boundsTiles, [10, 20, 11, 20.5]);
  assert.equal(controller.selectAt(at(grid, 2, 1)), true);
  assert.equal(controller.selection?.cells.length, 1);
  assert.equal(controller.selectAt({ x: NaN, y: 1 }), false);
  assert.equal(controller.selection, null);
});

test('cached frame/UI reads and profile changes do not rescan or copy component cell arrays', () => {
  const grid = makeGrid(0, 0, 10, 4); paint(grid, [[1, 1], [2, 1], [8, 1]]);
  let saved = 0, changed = 0;
  const controller = new BunkerController({ save: () => { saved++; }, changed: () => { changed++; } });
  controller.reconcile(grid);
  const components = controller.components, cells = components[0].cells;
  for (let n = 0; n < 100; n++) { assert.equal(controller.reconcile(grid), false); void controller.components; void controller.selection; controller.serialize(); }
  assert.equal(controller.components, components);
  assert.equal(controller.stats.gridScans, 1);
  controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ wall: 0.4 }); controller.setDefaults({ depth: 2 });
  assert.equal(controller.stats.gridScans, 1);
  assert.equal(controller.components[0].cells, cells);
  assert.equal(saved, 2);
  assert.equal(changed, 3);
});

test('global defaults update inherited components while Custom holds a full snapshot and Default follows again', () => {
  const grid = makeGrid(0, 0, 10, 3); paint(grid, [[1, 1], [7, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 1, 1));
  controller.setSelectedSettings({ wall: 0.25 });
  assert.equal(controller.selection?.mode, 'custom');
  controller.setDefaults({ depth: 4, wall: 2 });
  assert.equal(controller.selection?.settings.depth, DEFAULT_BUNKER_SETTINGS.depth);
  assert.equal(controller.selection?.settings.wall, 0.25);
  assert.equal(controller.componentAt(at(grid, 7, 1))?.settings.depth, 4);
  controller.setMode('default');
  assert.equal(controller.selection?.settings.depth, 4);
  assert.equal(controller.selection?.mode, 'default');
  controller.setMode('custom'); controller.setDefaults({ depth: 2 });
  assert.equal(controller.selection?.settings.depth, 4);
});

test('erasing a bridge splits custom sand into independent custom components; joining chooses the lower previous custom seed', () => {
  const grid = makeGrid(0, 0, 9, 3); paint(grid, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ depth: 0.5 });
  const originalId = controller.selection!.id;
  paint(grid, [[3, 1]], SURF.none); controller.reconcile(grid);
  assert.equal(controller.components.length, 2);
  assert.equal(controller.components[0].id, originalId);
  assert.deepEqual(controller.components.map(component => component.settings.depth), [0.5, 0.5]);
  assert.ok(controller.components.every(component => component.mode === 'custom'));
  controller.selectAt(at(grid, 5, 1)); controller.setSelectedSettings({ depth: 3 });
  paint(grid, [[3, 1]]); controller.reconcile(grid);
  assert.equal(controller.components.length, 1);
  assert.equal(controller.selection?.id, originalId);
  assert.equal(controller.selection?.settings.depth, 0.5);
});

test('erased seeds reanchor and remap selection through surviving sand; completely removed customs never resurrect', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1], [2, 1], [3, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ wall: 0.2 });
  paint(grid, [[1, 1]], SURF.none); controller.reconcile(grid);
  assert.deepEqual(controller.selection?.seed, [2, 1]);
  assert.equal(controller.selection?.settings.wall, 0.2);
  assert.deepEqual(controller.serialize().custom[0].seed, [2, 1]);
  paint(grid, [[2, 1], [3, 1]], SURF.none); controller.reconcile(grid);
  assert.equal(controller.selection, null);
  assert.deepEqual(controller.serialize().custom, []);
  paint(grid, [[1, 1]]); controller.reconcile(grid);
  assert.equal(controller.components[0].mode, 'default');
});

test('a merge prioritizes existing custom seeds over lower default seeds, then picks the lowest custom seed deterministically', () => {
  const grid = makeGrid(0, 0, 12, 3); paint(grid, [[0, 1], [4, 1], [8, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid);
  controller.selectAt(at(grid, 8, 1)); controller.setSelectedSettings({ depth: 3 });
  controller.selectAt(at(grid, 4, 1)); controller.setSelectedSettings({ depth: 1 });
  paint(grid, [[1, 1], [2, 1], [3, 1], [5, 1], [6, 1], [7, 1]]); controller.reconcile(grid);
  assert.equal(controller.components.length, 1);
  assert.deepEqual(controller.components[0].seed, [4, 1]);
  assert.equal(controller.components[0].settings.depth, 1);
});

test('world-cell identities and profiles survive grid growth and origin shifts', () => {
  const grid = makeGrid(10, 20, 6, 3); paint(grid, [[2, 1], [3, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 2, 1)); controller.setSelectedSettings({ depth: 0.2 });
  const id = controller.selection!.id;
  const grown = copyGrid(grid, 8, 19, 14, 8); controller.reconcile(grown);
  assert.equal(controller.selection?.id, id);
  assert.equal(controller.selection?.settings.depth, 0.2);
  assert.deepEqual(controller.selection?.seed, [22, 41]);
});

test('compact saves contain only full custom anchor snapshots and restore a preserved non-minimum anchor', () => {
  const grid = makeGrid(0, 0, 12, 3); paint(grid, [[3, 1], [4, 1], [9, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 3, 1)); controller.setSelectedSettings({ wall: 0.35 });
  paint(grid, [[1, 1], [2, 1]]); controller.reconcile(grid);
  const id = controller.selection!.id, saved = JSON.parse(JSON.stringify(controller.serialize())) as BunkerState;
  assert.deepEqual(saved.custom.map(mark => mark.seed), [[3, 1]]);
  assert.equal('cells' in saved.custom[0], false);
  const restored = new BunkerController(); restored.load(saved, copyGrid(grid));
  assert.equal(restored.components[0].id, id);
  assert.equal(restored.componentAt(at(grid, 1, 1))?.settings.wall, 0.35);
  assert.equal(restored.componentAt(at(grid, 9, 1))?.mode, 'default');
  saved.custom[0].settings.wall = 3;
  assert.equal(restored.components[0].settings.wall, 0.35);
});

test('saved custom marks load before geometry, reject corrupt data, and resolve merged marks by world seed', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1], [2, 1], [3, 1], [4, 1]]);
  const controller = new BunkerController();
  controller.load({ version: 1, defaults: { depth: 2 }, custom: [
    { seed: [4, 1], settings: clampBunkerSettings({ depth: 4 }) },
    { seed: [1, 1], settings: clampBunkerSettings({ depth: 1 }) },
    { seed: [NaN, 1], settings: {} }, { seed: [2, 1], settings: { version: 2, depth: 6 } },
  ] }, null);
  assert.equal(controller.components.length, 0);
  assert.equal(controller.serialize().custom.length, 2);
  controller.reconcile(grid);
  assert.equal(controller.components[0].settings.depth, 1);
  assert.equal(controller.defaults.depth, 2);
  assert.deepEqual(controller.serialize().custom.map(mark => mark.seed), [[1, 1]]);
  controller.load({ version: 99, defaults: { depth: 5 }, custom: [] }, grid);
  assert.deepEqual(controller.defaults, DEFAULT_BUNKER_SETTINGS);
  assert.equal(controller.components[0].mode, 'default');
});

test('transaction snapshots restore default/custom changes without rescanning cells or losing the current selection', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1]]);
  const snapshots: { label: string; before: BunkerState; after: BunkerState }[] = [];
  let controller!: BunkerController;
  controller = new BunkerController({ transaction: (label, mutate) => { const before = controller.serialize(); mutate(); snapshots.push({ label, before, after: controller.serialize() }); } });
  controller.reconcile(grid); controller.selectAt(at(grid, 1, 1));
  controller.setSelectedSettings({ depth: 0.3 }); controller.setDefaults({ depth: 2 });
  assert.equal(controller.stats.gridScans, 1);
  assert.equal(snapshots.length, 2);
  controller.load(snapshots[0].before, grid);
  assert.equal(controller.selection?.mode, 'default');
  controller.load(snapshots[0].after, grid);
  assert.equal(controller.selection?.mode, 'custom');
  assert.equal(controller.selection?.settings.depth, 0.3);
  controller.load(snapshots[1].after, grid);
  assert.equal(controller.defaults.depth, 2);
  assert.equal(controller.selection?.settings.depth, 0.3);
});

test('host grid undo/redo plus serialized metadata restores split topology and custom anchors exactly', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1], [2, 1], [3, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ depth: 0.2 });
  const before = controller.serialize(), diff = paint(grid, [[1, 1]], SURF.none);
  controller.reconcile(grid); const after = controller.serialize();
  assert.deepEqual(after.custom[0].seed, [2, 1]);
  applyDiff(grid, diff, true); controller.load(before, grid);
  assert.deepEqual(controller.serialize(), before);
  applyDiff(grid, diff, false); controller.load(after, grid);
  assert.deepEqual(controller.serialize(), after);
  assert.deepEqual(controller.selection?.seed, [2, 1]);
  assert.equal(controller.selection?.settings.depth, 0.2);
});

test('independent loaded games do not inherit resident custom settings and profiles never mutate the grid', () => {
  const grid = makeGrid(0, 0, 5, 3); paint(grid, [[1, 1]]);
  const original = grid.surf.slice(), rev = grid.rev;
  const controller = new BunkerController(); controller.reconcile(grid); controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ wall: 0.25 });
  controller.setDefaults({ collar: 1 }); controller.setMode('default'); controller.setMode('custom');
  assert.deepEqual(grid.surf, original); assert.equal(grid.rev, rev);
  controller.load(undefined, copyGrid(grid));
  assert.equal(controller.components[0].mode, 'default');
  assert.deepEqual(controller.defaults, DEFAULT_BUNKER_SETTINGS);
});

test('exact native contour joins group separate raw components without scanning or joining collars implicitly', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1], [3, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid);
  const ids = controller.components.map(component => component.id);
  assert.equal(controller.components.length, 2);
  assert.equal(controller.setRenderedJoins([ids], grid.rev - 1), false);
  assert.equal(controller.components.length, 2);
  assert.equal(controller.setRenderedJoins([ids], grid.rev), true);
  assert.equal(controller.stats.gridScans, 1);
  assert.equal(controller.components.length, 1);
  controller.selectAt(at(grid, 3, 1));
  assert.equal(controller.selection?.cells.length, 2);
  assert.equal(controller.setRenderedJoins([[...ids].reverse()], grid.rev), false);
});

test('visible merged custom profiles choose the lowest prior custom seed and remain stable across unrelated grid edits', () => {
  const grid = makeGrid(0, 0, 10, 3); paint(grid, [[0, 1], [4, 1], [6, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid);
  controller.selectAt(at(grid, 6, 1)); controller.setSelectedSettings({ depth: 3 });
  controller.selectAt(at(grid, 4, 1)); controller.setSelectedSettings({ depth: 0.4 });
  controller.setRenderedJoins([controller.components.map(component => component.id).reverse()], grid.rev);
  assert.deepEqual(controller.selection?.seed, [4, 1]);
  assert.equal(controller.selection?.settings.depth, 0.4);
  assert.equal(controller.serialize().custom.length, 1);
  const id = controller.selection!.id;
  paint(grid, [[9, 2]], SURF.rough); controller.reconcile(grid);
  assert.equal(controller.components.length, 3, 'a new grid revision awaits its fresh drawn contours');
  assert.ok(controller.components.every(component => component.settings.depth === 0.4));
  controller.setRenderedJoins([controller.components.map(component => component.id)], grid.rev);
  assert.equal(controller.selection?.id, id);
  assert.equal(controller.selection?.settings.depth, 0.4);
});

test('editing a visible joined bunker updates every piece; a later cut retains the shared custom snapshot', () => {
  const grid = makeGrid(0, 0, 10, 3); paint(grid, [[1, 1], [2, 1], [4, 1], [5, 1]]);
  const controller = new BunkerController(); controller.reconcile(grid);
  controller.setRenderedJoins([controller.components.map(component => component.id)], grid.rev);
  controller.selectAt(at(grid, 5, 1)); controller.setSelectedSettings({ wall: 0.15, depth: 0.2 });
  assert.equal(controller.serialize().custom.length, 1);
  paint(grid, [[2, 1]], SURF.none); controller.reconcile(grid);
  controller.setRenderedJoins([], grid.rev);
  assert.equal(controller.components.length, 2);
  assert.ok(controller.components.every(component => component.mode === 'custom' && component.settings.wall === 0.15 && component.settings.depth === 0.2));
  assert.equal(controller.serialize().custom.length, 2);
});

test('native contour joins and splits save changed custom anchors even when numeric profiles are identical', () => {
  const grid = makeGrid(0, 0, 8, 3); paint(grid, [[1, 1], [3, 1]]);
  let saves = 0;
  const controller = new BunkerController({ save: () => { saves++; } }); controller.reconcile(grid);
  controller.selectAt(at(grid, 1, 1)); controller.setSelectedSettings({ depth: 0.2 });
  controller.selectAt(at(grid, 3, 1)); controller.setSelectedSettings({ depth: 0.2 });
  saves = 0;
  controller.setRenderedJoins([controller.components.map(component => component.id)], grid.rev);
  assert.equal(controller.serialize().custom.length, 1);
  assert.equal(saves, 1, 'joining identical custom profiles still changes persisted anchors');
  controller.setRenderedJoins([], grid.rev);
  const split = controller.serialize();
  assert.equal(split.custom.length, 2);
  assert.equal(saves, 2, 'a later split schedules a fresh save after its asynchronous contours arrive');
  const restored = new BunkerController(); restored.load(JSON.parse(JSON.stringify(split)), grid);
  assert.ok(restored.components.every(component => component.mode === 'custom' && component.settings.depth === 0.2));
});
