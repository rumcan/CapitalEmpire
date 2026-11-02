import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BunkerController } from '../src/game/ext/bunker-look/controller';
import { DEFAULT_BUNKER_SETTINGS } from '../src/game/ext/bunker-look/settings';
import { makeGrid, paintDisc, SURF } from '../src/game/ext/course-grid';
import { PaintTool } from '../src/game/paint-tool';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';

function setup() {
  const grid = makeGrid(0, 0, 48, 24); paintDisc(grid, 5, 5, 2, SURF.bunker, 1, 0); paintDisc(grid, 15, 5, 2, SURF.bunker, 1, 0);
  let paint!: PaintTool;
  const bunkers = new BunkerController({ transaction: (label, mutate) => paint.recordBunkerEdit(label, mutate) });
  bunkers.reconcile(grid);
  paint = new PaintTool({ setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    grid: () => grid, golfMode: () => true, gridChanged: () => { bunkers.reconcile(grid); }, bunkerState: () => bunkers.serialize(), setBunkerState: state => bunkers.load(state, grid) });
  return { grid, paint, bunkers };
}

test('modern connected-grid Default/Custom/global edits share the real course undo/redo journal', () => {
  const { bunkers, paint } = setup(); bunkers.selectAt({ x: 5, y: 5 });
  bunkers.setSelectedSettings({ depth: 0.7, wall: 0.2 });
  assert.equal(bunkers.selection?.mode, 'custom'); assert.equal(paint.topUndo, 'bunker settings');
  paint.undoTop(); assert.equal(bunkers.componentAt({ x: 5, y: 5 })?.mode, 'default');
  paint.redoTop(); assert.equal(bunkers.componentAt({ x: 5, y: 5 })?.settings.depth, 0.7);
  bunkers.setDefaults({ depth: 0.4 }); assert.equal(bunkers.componentAt({ x: 15, y: 5 })?.settings.depth, 0.4);
  assert.equal(bunkers.componentAt({ x: 5, y: 5 })?.settings.depth, 0.7);
  paint.undoTop(); assert.equal(bunkers.defaults.depth, DEFAULT_BUNKER_SETTINGS.depth);
  paint.redoTop(); assert.equal(bunkers.defaults.depth, 0.4);
  bunkers.selectAt({ x: 5, y: 5 }); bunkers.setMode('default'); paint.undoTop();
  assert.equal(bunkers.componentAt({ x: 5, y: 5 })?.mode, 'custom');
});

test('modern GolfSave stores default/custom component metadata without relying on legacy PaintArea tuples', () => {
  const { bunkers, grid } = setup(); bunkers.setDefaults({ depth: 0.4 }); bunkers.selectAt({ x: 5, y: 5 }); bunkers.setSelectedSettings({ depth: 1 });
  const golf: GolfSave = { v: 1, tier: 1, rep: 0, town: { x: 1, y: 1 }, course: [0, 0, 24, 12], parcel: [0, 0, 24, 12], dir: 0, tees: [], pins: [], aims: [], clubhouse: { x: 1, y: 1 }, bunkers: bunkers.serialize() };
  const normalized = normalizeGolfSave(JSON.parse(JSON.stringify(golf)))!;
  const loaded = new BunkerController(); loaded.load(normalized.bunkers, grid);
  assert.equal(loaded.defaults.depth, 0.4); assert.equal(loaded.componentAt({ x: 5, y: 5 })?.settings.depth, 1);
  assert.equal(loaded.componentAt({ x: 15, y: 5 })?.mode, 'default');
  loaded.load(undefined, grid); assert.equal(loaded.defaults.depth, DEFAULT_BUNKER_SETTINGS.depth);
});
