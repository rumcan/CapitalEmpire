/** The course grid wired into the game (T078 review fixes): a golf save's grid at load (an old save migrates, a second load restores the
 * same grid, a corrupt grid fails the load), the trees a stroke clears staying in its undo step, rub out keeping to its hole, and the
 * course looks re-sent only when a look changes (pure, Node: the engine's load path and a PaintTool with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, encodeGrid, makeGrid, paintDisc, type Grid, type GridDiff } from '../src/game/ext/course-grid';
import { isCourseArea, loadCourseGrid, migrateAreas } from '../src/game/ext/course-grid/migrate';
import { PaintTool, type PaintHost, type PropJournal } from '../src/game/paint-tool';
import { BRUSH_PRESETS, DEFAULT_STYLE, clampStyle, fromTuples, toTuple, type PaintArea, type PaintTuple } from '../src/game/paint';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';

/** an old golf save's paints: a fairway and a green tagged with hole 1, the green's fringe band, a seeded tee, and a worn path */
function oldPaints(): PaintTuple[] {
  const st = (tex: string, extra: Partial<PaintArea> = {}): PaintArea => ({ id: 0, ...clampStyle({ ...DEFAULT_STYLE, tex: tex as PaintArea['tex'] }), pts: [], ...extra });
  return [
    toTuple({ ...st('golfFairway', { hole: 1, kind: 'fairway' }), pts: [100, 100, 140, 100, 140, 120, 100, 120] }),
    toTuple({ ...st('golfFringe'), pts: [138, 98, 152, 98, 152, 122, 138, 122] }),
    toTuple({ ...st('golfGreen', { hole: 1, kind: 'green' }), pts: [140, 100, 150, 100, 150, 120, 140, 120] }),
    toTuple({ ...st('golfTee', { hole: 1, kind: 'tee', plantKind: 'seed', plantedMonth: 3 }), pts: [90, 105, 96, 105, 96, 115, 90, 115] }),
    toTuple({ ...st('spectatorPath'), pts: [100, 130, 150, 130, 150, 132, 100, 132] }),
  ];
}
const golfSave = (grid?: unknown): GolfSave => normalizeGolfSave({ v: 1, tier: 1, rep: 30, town: { x: 0, y: 0 }, course: [80, 80, 100, 80], parcel: [80, 80, 100, 80], dir: 0, tees: [], pins: [], aims: [], clubhouse: { x: 90, y: 90 }, ...(grid !== undefined ? { grid: grid as GolfSave['grid'] } : {}) })!;

test('1. load: an old save migrates, a second load restores the same grid, a corrupt grid fails the load', () => {
  // first load of an old save: no grid, so its course areas move into a new one (the path stays painted, the fringe band is dropped)
  const save1 = golfSave();
  assert.equal(loadCourseGrid(save1.grid), 'migrate');
  const areas = fromTuples(oldPaints());
  const g = makeGrid(48, 48, 2 * 164, 2 * 164);
  const gone = migrateAreas(g, areas);
  assert.deepEqual(gone.map(a => a.tex).sort(), ['golfFairway', 'golfFringe', 'golfGreen', 'golfTee'].sort());
  assert.ok(!isCourseArea(areas.find(a => a.tex === 'spectatorPath')!), 'the path stays a painted area');
  const at = (x: number, y: number) => { const i = Math.floor((y - g.y0) / 0.5) * g.w + Math.floor((x - g.x0) / 0.5); return [g.surf[i], g.hole[i], g.month[i]]; };
  assert.deepEqual(at(120, 110), [SURF.fairway, 1, 0]);
  assert.deepEqual(at(145, 110), [SURF.green, 1, 0], 'the green drawn after the fairway wins, and the fringe band left no cells');
  assert.deepEqual(at(151, 110), [SURF.none, 0, 0], 'fringe and first-cut bands are dropped (collars are automatic)');
  assert.deepEqual(at(93, 110), [SURF.tee, 1, 3 + 64], 'seeded: its month');
  // the save the game writes, and the second load
  const save2 = golfSave(JSON.parse(JSON.stringify(encodeGrid(g))));
  const g2 = loadCourseGrid(save2.grid);
  assert.ok(typeof g2 === 'object');
  assert.deepEqual([g2.x0, g2.y0, g2.w, g2.h], [g.x0, g.y0, g.w, g.h]);
  assert.deepEqual(g2.surf, g.surf); assert.deepEqual(g2.hole, g.hole); assert.deepEqual(g2.month, g.month);
  // a truncated or corrupt grid: the load fails (the engine returns false from load, T042 backs the slot up and says so)
  const bad = JSON.parse(JSON.stringify(encodeGrid(g)));
  assert.equal(loadCourseGrid({ ...bad, s: bad.s.slice(0, bad.s.length - 8) }), 'bad', 'truncated');
  assert.equal(loadCourseGrid({ ...bad, w: bad.w + 1 }), 'bad', 'runs that do not fill the grid');
  assert.equal(loadCourseGrid({ ...bad, v: 2 }), 'bad', 'a future version');
  assert.equal(loadCourseGrid('nonsense'), 'bad');
});

/** a stand-in engine: the grid, a prop journal, and a "tree" that the chunk flush clears off a new playing surface (as clearTreesOnGrid) */
function world() {
  const g: Grid = makeGrid(0, 0, 200, 200);
  const trees = new Set<string>(['t1']), log: { journal: PropJournal | null; flushes: number; looks: number; undone: unknown[] } = { journal: null, flushes: 0, looks: 0, undone: [] };
  let pending: GridDiff | null = null;
  const flush = () => { log.flushes++; if (pending && trees.has('t1')) { trees.delete('t1'); log.journal?.removed.push('t1'); } pending = null; };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 0, money: () => 1e9, spend() {},
    journal: { begin: () => { log.journal = { added: [], removed: [] }; }, end: () => { const j = log.journal; log.journal = null; return j && (j.added.length || j.removed.length) ? j : null; }, undo: j => { for (const t of j.removed) { trees.add(t as string); log.undone.push(t); } return { added: j.removed, removed: [] }; }, redo: j => j },
    grid: () => g,
    gridChanged: (d, now) => { if (d && d.n) pending = d; if (now) flush(); }, // the engine flushes within 120 ms; here only when told to
    courseLook: () => { log.looks++; },
  };
  return { g, trees, log, tool: new PaintTool(host) };
}

test('2. the trees a stroke clears are in its undo step, even when the last chunks go out at its end', () => {
  const { trees, log, tool } = world();
  tool.enterCourse(); tool.setBrush('fairway'); tool.setBrushR(3);
  tool.pointerDown({ x: 50, y: 50 }, 0, 0); tool.pointerMove({ x: 56, y: 50 }, 0, 0); tool.pointerUp(0.5);
  assert.equal(log.flushes, 1, 'the stroke flushed once, at its end');
  assert.ok(!trees.has('t1'), 'the tree on the new fairway went');
  tool.undo();
  assert.ok(trees.has('t1'), 'undo brings the tree back');
  assert.deepEqual(log.undone, ['t1']);
});

test('3. rub out keeps to the current hole', () => {
  const { g, tool } = world();
  paintDisc(g, 50, 50, 4, SURF.fairway, 1, 0); paintDisc(g, 58, 50, 4, SURF.fairway, 2, 0);
  tool.enterCourse(); tool.setBrush('fairway'); tool.setHole(1); tool.rubOut = true; tool.setBrushR(10);
  tool.pointerDown({ x: 54, y: 50 }, 0, 0); tool.pointerUp(0.5);
  const at = (x: number, y: number) => { const i = Math.floor(y / 0.5) * g.w + Math.floor(x / 0.5); return [g.surf[i], g.hole[i]]; };
  assert.deepEqual(at(48, 50), [SURF.rough, 1], "hole 1's fairway rubbed to rough");
  assert.deepEqual(at(60, 50), [SURF.fairway, 2], "hole 2's fairway untouched");
});

test('4. the course is re-sent only when a look (texture, scale, angle) changes, not for a tone or tint', () => {
  const { log, tool } = world();
  tool.enterCourse(); tool.setBrush('green');
  tool.setStyle({ toneAmt: 0.5 }); tool.setStyle({ tint: '#336699' });
  assert.equal(log.looks, 0, 'tone and tint: nothing re-sent');
  tool.setStyle({ scale: 1.5 });
  assert.equal(log.looks, 1, 'scale: re-sent');
  const other = BRUSH_PRESETS.find(b => b.kind === 'fairway')!.style.tex;
  tool.setStyle({ tex: other }); tool.setStyle({ angle: 30 });
  assert.equal(log.looks, 3);
});
